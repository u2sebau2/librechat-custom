const { z } = require('zod');
const axios = require('axios');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { generateShortLivedToken } = require('@librechat/api');
const { Tools, EToolResources } = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { getFiles } = require('~/models/File');

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId] - The agent ID for file access control
 * @returns {Promise<{
 *   files: Array<{ file_id: string; filename: string }>,
 *   toolContext: string
 * }>}
 */
const primeFiles = async (options) => {
  const { tool_resources, req, agentId } = options;
  const file_ids = tool_resources?.[EToolResources.file_search]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.file_search]?.files ?? [];

  // Get all files first
  const allFiles = (await getFiles({ file_id: { $in: file_ids } }, null, { text: 0 })) ?? [];

  // Filter by access if user and agent are provided
  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  } else {
    dbFiles = allFiles;
  }

  dbFiles = dbFiles.concat(resourceFiles);

  // Updated message to mention hybrid search capability
  let toolContext = `- Note: Semantic and hybrid search is available through the ${Tools.file_search} tool but no files are currently loaded. Request the user to upload documents to search through.`;

  const files = [];
  for (let i = 0; i < dbFiles.length; i++) {
    const file = dbFiles[i];
    if (!file) {
      continue;
    }
    if (i === 0) {
      toolContext = `- Note: Use the ${Tools.file_search} tool to find relevant information within:`;
    }
    toolContext += `\n\t- ${file.filename}${
      agentResourceIds.has(file.file_id) ? '' : ' (just attached by user)'
    }`;
    files.push({
      file_id: file.file_id,
      filename: file.filename,
    });
  }

  return { files, toolContext };
};

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Array<{ file_id: string; filename: string }>} options.files
 * @param {string} [options.entity_id]
 * @returns
 */
const createFileSearchTool = async ({ req, files, entity_id }) => {
  return tool(
    async ({ query, search_type = 'hybrid', semantic_weight = 0.9 }) => {
      if (files.length === 0) {
        return 'No files to search. Instruct the user to add files for the search.';
      }
      const jwtToken = generateShortLivedToken(req.user.id);
      if (!jwtToken) {
        return 'There was an error authenticating the file search request.';
      }

      // Extract file_ids from the files array
      const file_ids = files.map(file => file.file_id);

      // Create a map for quick filename lookup
      const fileIdToNameMap = {};
      files.forEach(file => {
        fileIdToNameMap[file.file_id] = file.filename;
      });

      // Use query_multiple endpoint for multi-file search
      const queryBody = {
        query,
        file_ids,
        k: 50, // This will be the TOTAL number of results across ALL files
        search_type: search_type || 'hybrid',
        semantic_weight: semantic_weight || 0.7,
      };

      if (entity_id) {
        queryBody.entity_id = entity_id;
      }

      logger.debug(`[${Tools.file_search}] RAG API /query_multiple body (hybrid search enabled)`, queryBody);

      try {
        const result = await axios.post(
          `${process.env.RAG_API_URL}/query_multiple`,
          queryBody,
          {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!result.data || result.data.length === 0) {
          return 'No results found while searching the files.';
        }

        // Helper function to clean metadata for model consumption
        const cleanMetadataForModel = (metadata) => {
          // Only keep essential fields that the model might need
          const essentialFields = {
            file_id: metadata.file_id,
            filename: metadata.filename || fileIdToNameMap[metadata.file_id] || 'Unknown file',
            page: metadata.page || null,
            chunk_index: metadata.chunk_index || null,
            total_chunks: metadata.total_chunks || null,
            // Preserve these important fields when they exist
            last_modified: metadata.last_modified || null,
            page_url: metadata.page_url || null,
            source: metadata.source || null,
          };

          // Only add search-specific metadata if doing hybrid search
          if (search_type === 'hybrid' && metadata.fusion_score !== undefined) {
            essentialFields.fusion_score = metadata.fusion_score;
            essentialFields.semantic_rank = metadata.semantic_rank;
            essentialFields.bm25_rank = metadata.bm25_rank;
          }

          // Remove null values
          return Object.fromEntries(
            Object.entries(essentialFields).filter(([_, v]) => v !== null)
          );
        };

        // Format results - result.data is already an array of [docInfo, distance] tuples
        const formattedResults = result.data
        .map(([docInfo, distance]) => {
          const file_id = docInfo.metadata.file_id;
          const filename = fileIdToNameMap[file_id] ||
          docInfo.metadata.source?.split('/').pop() ||
          'Unknown file';

          // Clean metadata before using it
          const cleanedMetadata = cleanMetadataForModel(docInfo.metadata);

          return {
            filename,
            content: docInfo.page_content,
            distance,
            file_id,
            page: cleanedMetadata.page || null,
            chunk_index: cleanedMetadata.chunk_index || null,
            total_chunks: cleanedMetadata.total_chunks || null,
            // Include only cleaned metadata
            metadata: cleanedMetadata,
            // Include fusion metadata if available (from hybrid search)
            fusion_score: cleanedMetadata.fusion_score || null,
            semantic_rank: cleanedMetadata.semantic_rank || null,
            bm25_rank: cleanedMetadata.bm25_rank || null,
          };
        });

        // Create file mapping for consistent numbering (each unique file gets one number)
        const uniqueFiles = [...new Set(formattedResults.map(result => result.filename))];
        const fileIndexMap = {};
        uniqueFiles.forEach((filename, index) => {
          fileIndexMap[filename] = index;
        });

        // Format the response string for display
        const formattedString = formattedResults
        .map((result) => {
          const fileIndex = fileIndexMap[result.filename]; // Use file-based index, not result index
          
          let searchInfo = '';
          if (result.fusion_score !== null) {
            searchInfo = `\nSearch Type: Hybrid (Fusion Score: ${result.fusion_score.toFixed(4)})`;
          } else {
            searchInfo = `\nSearch Type: ${search_type}`;
          }

          let chunkInfo = '';
          if (result.chunk_index !== null && result.total_chunks !== null) {
            chunkInfo = `\nChunk: ${parseInt(result.chunk_index) + 1} of ${result.total_chunks}`;
          }

          // Add last_modified and page_url if they exist
          let additionalInfo = '';
          if (result.metadata.last_modified) {
            additionalInfo += `\nLast Modified: ${result.metadata.last_modified}`;
          }
          if (result.metadata.page_url) {
            additionalInfo += `\nSource URL: ${result.metadata.page_url}`;
          }

          return `File: ${result.filename}\nAnchor: \\ue202turn0file${fileIndex} (${result.filename})\nRelevance: ${(1.0 - result.distance).toFixed(4)}${searchInfo}${chunkInfo}${additionalInfo}\nContent: ${result.content}\n`;
        })
        .join('\n---\n');

        // Create optimized sources for the artifact - ORGANIZED BY FILE INDEX
        // First, create sources grouped by unique file to match the anchor numbering
        const sourcesByFile = {};
        
        // Group results by filename
        formattedResults.forEach((result) => {
          const fileIndex = fileIndexMap[result.filename];
          if (!sourcesByFile[fileIndex]) {
            sourcesByFile[fileIndex] = [];
          }
          sourcesByFile[fileIndex].push({
            type: 'file',
            fileId: result.file_id,
            content: result.content,
            fileName: result.filename,
            relevance: 1.0 - result.distance,
            pages: result.page ? [result.page] : [],
            pageRelevance: result.page ? { [result.page]: 1.0 - result.distance } : {},
            // Only include essential metadata
            metadata: {
              chunk_index: result.chunk_index,
              total_chunks: result.total_chunks,
              // Only add these if they exist
              ...(result.metadata.last_modified && { last_modified: result.metadata.last_modified }),
              ...(result.metadata.page_url && { page_url: result.metadata.page_url }),
              ...(result.metadata.source && { source: result.metadata.source }),
            },
            // Only include search-specific data for hybrid search
            ...(search_type === 'hybrid' && {
              searchType: search_type,
              fusionScore: result.fusion_score,
              semanticRank: result.semantic_rank,
              bm25Rank: result.bm25_rank,
            }),
          });
        });
        
        // Convert to flat array ordered by file index (turn0file0 = sources[0], turn0file1 = sources[1], etc.)
        const sources = [];
        for (let i = 0; i < uniqueFiles.length; i++) {
          if (sourcesByFile[i]) {
            sources.push(...sourcesByFile[i]);
          }
        }

        logger.debug(`[${Tools.file_search}] Found ${formattedResults.length} results across ${file_ids.length} files`);

        return [formattedString, { [Tools.file_search]: { sources } }];
      } catch (error) {
        logger.error('Error encountered in `file_search` while querying files:', error);

        // Provide more specific error messages
        if (error.response?.status === 504) {
          return 'Search operation timed out. Try with a simpler query or fewer files.';
        } else if (error.response?.status === 400 && error.response?.data?.detail?.includes('not available')) {
          return `The requested search type "${search_type}" is not available. Please use "semantic" search instead.`;
        } else if (error.response?.data?.detail) {
          return `Search error: ${error.response.data.detail}`;
        } else {
          return 'An error occurred while searching the files. Please try again.';
        }
      }
    },
    {
      name: Tools.file_search,
      responseFormat: 'content_and_artifact',
      description: `Performs semantic and hybrid search across attached "${Tools.file_search}" documents using natural language queries. This tool analyzes the content of uploaded files using both semantic similarity and keyword matching to find relevant information, quotes, and passages that best match your query. Use this to extract specific information or find relevant sections within the available documents.

      **SEARCH MODES:**
      - **hybrid** (default): Combines semantic and keyword search for best results
      - **semantic**: Uses embedding-based similarity search
      - **bm25**: Uses keyword-based search with BM25 algorithm

      **CITE FILE SEARCH RESULTS:**
      Use anchor markers immediately after statements derived from file content. Reference the filename in your text:
      - File citation: "The document.pdf states that... \\ue202turn0file0"
      - Page reference: "According to report.docx... \\ue202turn0file1"
      - Multi-file: "Multiple sources confirm... \\ue200\\ue202turn0file0\\ue202turn0file1\\ue201"

      **ALWAYS mention the filename in your text before the citation marker. NEVER use markdown links or footnotes.**`,
      schema: z.object({
        query: z
        .string()
        .describe(
          "A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you're looking for. The query will be used for semantic similarity matching and keyword search against the file contents.",
        ),
        search_type: z
        .enum(['semantic', 'bm25', 'hybrid'])
        .optional()
        .default('hybrid')
        .describe(
          "Type of search to perform: 'semantic' for embedding-based similarity, 'bm25' for keyword-based search, 'hybrid' for combined approach (recommended).",
        ),
        semantic_weight: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.7)
        .describe(
          "Weight for semantic search in hybrid mode (0.0-1.0). Higher values favor semantic similarity, lower values favor keyword matching. Default: 0.7",
        ),
      }),
    },
  );
};

module.exports = { createFileSearchTool, primeFiles };
