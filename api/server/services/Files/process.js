const fs = require('fs');
const path = require('path');
const mime = require('mime');
const { v4 } = require('uuid');
const {
  isUUID,
  megabyte,
  FileContext,
  FileSources,
  imageExtRegex,
  EModelEndpoint,
  EToolResources,
  mergeFileConfig,
  AgentCapabilities,
  checkOpenAIStorage,
  removeNullishValues,
  isAssistantsEndpoint,
  bedrockNativeDocumentMimeTypes,
  retrievalMimeTypesList,
  textMimeTypes,
  applicationMimeTypes,
} = require('librechat-data-provider');
const { EnvVar } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');

// Log para verificar que bedrockNativeDocumentMimeTypes se importó correctamente
logger.info('[BEDROCK-NATIVE] Module loaded:', {
  hasBedrockNativeDocumentMimeTypes: !!bedrockNativeDocumentMimeTypes,
  bedrockNativeDocumentMimeTypesLength: bedrockNativeDocumentMimeTypes ? bedrockNativeDocumentMimeTypes.length : 0,
  bedrockNativeDocumentMimeTypesType: typeof bedrockNativeDocumentMimeTypes,
  isArray: Array.isArray(bedrockNativeDocumentMimeTypes)
});
const { sanitizeFilename, parseText, processAudioFile } = require('@librechat/api');
const {
  convertImage,
  resizeAndConvert,
  resizeImageBuffer,
} = require('~/server/services/Files/images');
const { addResourceFileId, deleteResourceFileId } = require('~/server/controllers/assistants/v2');
const { addAgentResourceFile, removeAgentResourceFiles } = require('~/models/Agent');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { createFile, updateFileUsage, deleteFiles } = require('~/models/File');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { checkCapability } = require('~/server/services/Config');
const { LB_QueueAsyncCall } = require('~/server/utils/queue');
const { getStrategyFunctions } = require('./strategies');
const { determineFileType } = require('~/server/utils');
const { STTService } = require('./Audio/STTService');

/**
 * FunciÃ³n especÃ­fica para sanitizar nombres de archivo para Bedrock
 */
function sanitizeBedrockFilename(filename) {
  if (!filename) return 'document';

  const lastDotIndex = filename.lastIndexOf('.');
  let name = filename;
  let extension = '';

  if (lastDotIndex > 0) {
    name = filename.substring(0, lastDotIndex);
    extension = filename.substring(lastDotIndex);
  }

  let sanitizedName = name
  .replace(/[^a-zA-Z0-9\s\-\(\)\[\]]/g, '-')  // Solo caracteres permitidos por Bedrock
  .replace(/\s+/g, ' ')                        // Espacios mÃºltiples â†’ espacio Ãºnico
  .replace(/-+/g, '-')                         // Guiones mÃºltiples â†’ guiÃ³n Ãºnico
  .trim()                                      // Eliminar espacios al inicio/final
  || 'document';

  if (extension) {
    extension = extension.replace(/[^a-zA-Z0-9.]/g, '');
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
  }

  const finalName = sanitizedName + extension;

  logger.info('[BEDROCK-SANITIZE]', {
    original: filename,
    sanitized: finalName
  });

  return finalName;
}

/**
 * Checks if a file can be processed natively by Bedrock Converse (without OCR)
 * @param {string} mimetype - The file's MIME type
 * @returns {boolean} - True if the file can be processed natively by Bedrock
 */
function isBedrockNativeDocument(mimetype) {
  logger.debug('[BEDROCK-NATIVE] Checking if document can be processed natively:', {
    mimetype: mimetype,
    hasBedrockTypes: !!bedrockNativeDocumentMimeTypes,
    bedrockTypesLength: bedrockNativeDocumentMimeTypes ? bedrockNativeDocumentMimeTypes.length : 0
  });

  if (!mimetype) {
    logger.warn('[BEDROCK-NATIVE] No mimetype provided');
    return false;
  }

  // Guard de seguridad: si bedrockNativeDocumentMimeTypes no está disponible, usar fallback
  if (!bedrockNativeDocumentMimeTypes || !Array.isArray(bedrockNativeDocumentMimeTypes)) {
    logger.error('[BEDROCK-NATIVE] bedrockNativeDocumentMimeTypes not available or not array, using PDF fallback', {
      typeofBedrockTypes: typeof bedrockNativeDocumentMimeTypes,
      isArray: Array.isArray(bedrockNativeDocumentMimeTypes)
    });
    return /^application\/pdf$/.test(mimetype);
  }
  
  try {
    const isNative = bedrockNativeDocumentMimeTypes.some(regex => {
      if (!(regex instanceof RegExp)) {
        logger.warn('[BEDROCK-NATIVE] Invalid regex pattern found:', regex);
        return false;
      }
      return regex.test(mimetype);
    });
    
    logger.info('[BEDROCK-NATIVE] Document type check result:', {
      mimetype: mimetype,
      isNative: isNative
    });
    
    return isNative;
  } catch (error) {
    logger.error('[BEDROCK-NATIVE] Error checking document type:', {
      error: error.message,
      stack: error.stack,
      mimetype: mimetype
    });
    // Fallback to PDF check on error
    return /^application\/pdf$/.test(mimetype);
  }
}

/**
 * Creates a modular file upload wrapper that ensures filename sanitization
 * across all storage strategies. This prevents storage-specific implementations
 * from having to handle sanitization individually.
 *
 * @param {Function} uploadFunction - The storage strategy's upload function
 * @returns {Function} - Wrapped upload function with sanitization
 */
const createSanitizedUploadWrapper = (uploadFunction) => {
  return async (params) => {
    const { req, file, file_id, endpoint, ...restParams } = params;

    // Detectar si es para Bedrock
    const isBedrock = endpoint === EModelEndpoint.bedrock ||
    req.body?.endpoint === EModelEndpoint.bedrock ||
    req.body?.agent?.provider === 'bedrock';

    const isPDF = file.mimetype === 'application/pdf';

    let sanitizedOriginalName;
    const isBedrockNative = isBedrock && isBedrockNativeDocument(file.mimetype);
    if (isBedrockNative) {
      // Usar sanitizaciÃ³n especÃ­fica para Bedrock
      sanitizedOriginalName = sanitizeBedrockFilename(file.originalname);
      logger.info('[BEDROCK-NATIVE] Applied Bedrock-specific sanitization:', {
        original: file.originalname,
        sanitized: sanitizedOriginalName,
        mimetype: file.mimetype
      });
    } else {
      // Usar sanitizaciÃ³n general
      sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    }

    const sanitizedFile = {
      ...file,
      originalname: sanitizedOriginalName,
    };

    return uploadFunction({ req, file: sanitizedFile, file_id, endpoint, ...restParams });
  };
};

/**
 *
 * @param {Array<MongoFile>} files
 * @param {Array<string>} [fileIds]
 * @returns
 */
const processFiles = async (files, fileIds) => {
  const promises = [];
  const seen = new Set();

  for (let file of files) {
    const { file_id } = file;
    if (seen.has(file_id)) {
      continue;
    }
    seen.add(file_id);
    promises.push(updateFileUsage({ file_id }));
  }

  if (!fileIds) {
    const results = await Promise.all(promises);
    // Filter out null results from failed updateFileUsage calls
    return results.filter((result) => result != null);
  }

  for (let file_id of fileIds) {
    if (seen.has(file_id)) {
      continue;
    }
    seen.add(file_id);
    promises.push(updateFileUsage({ file_id }));
  }

  // TODO: calculate token cost when image is first uploaded
  const results = await Promise.all(promises);
  // Filter out null results from failed updateFileUsage calls
  return results.filter((result) => result != null);
};

/**
 * Enqueues the delete operation to the leaky bucket queue if necessary, or adds it directly to promises.
 *
 * @param {object} params - The passed parameters.
 * @param {ServerRequest} params.req - The express request object.
 * @param {MongoFile} params.file - The file object to delete.
 * @param {Function} params.deleteFile - The delete file function.
 * @param {Promise[]} params.promises - The array of promises to await.
 * @param {string[]} params.resolvedFileIds - The array of promises to await.
 * @param {OpenAI | undefined} [params.openai] - If an OpenAI file, the initialized OpenAI client.
 */
function enqueueDeleteOperation({ req, file, deleteFile, promises, resolvedFileIds, openai }) {
  if (checkOpenAIStorage(file.source)) {
    // Enqueue to leaky bucket
    promises.push(
      new Promise((resolve, reject) => {
        LB_QueueAsyncCall(
          () => deleteFile(req, file, openai),
                          [],
                          (err, result) => {
                            if (err) {
                              logger.error('Error deleting file from OpenAI source', err);
                              reject(err);
                            } else {
                              resolvedFileIds.push(file.file_id);
                              resolve(result);
                            }
                          },
        );
      }),
    );
  } else {
    // Add directly to promises
    promises.push(
      deleteFile(req, file)
      .then(() => resolvedFileIds.push(file.file_id))
      .catch((err) => {
        logger.error('Error deleting file', err);
        return Promise.reject(err);
      }),
    );
  }
}

/**
 * FunciÃ³n especÃ­fica para sanitizar nombres de archivo para Bedrock
 */
function sanitizeBedrockFilename(filename) {
  if (!filename) return 'document';

  const lastDotIndex = filename.lastIndexOf('.');
  let name = filename;
  let extension = '';

  if (lastDotIndex > 0) {
    name = filename.substring(0, lastDotIndex);
    extension = filename.substring(lastDotIndex);
  }

  let sanitizedName = name
  .replace(/[^a-zA-Z0-9\s\-\(\)\[\]]/g, '-')  // Solo caracteres permitidos por Bedrock
  .replace(/\s+/g, ' ')                        // Espacios mÃºltiples â†’ espacio Ãºnico
  .replace(/-+/g, '-')                         // Guiones mÃºltiples â†’ guiÃ³n Ãºnico
  .trim()                                      // Eliminar espacios al inicio/final
  || 'document';

  if (extension) {
    extension = extension.replace(/[^a-zA-Z0-9.]/g, '');
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
  }

  const finalName = sanitizedName + extension;

  logger.info('[BEDROCK-SANITIZE]', {
    original: filename,
    sanitized: finalName
  });

  return finalName;
}

// TODO: refactor as currently only image files can be deleted this way
// as other filetypes will not reside in public path
/**
 * Deletes a list of files from the server filesystem and the database.
 *
 * @param {Object} params - The params object.
 * @param {MongoFile[]} params.files - The file objects to delete.
 * @param {ServerRequest} params.req - The express request object.
 * @param {DeleteFilesBody} params.req.body - The request body.
 * @param {string} [params.req.body.agent_id] - The agent ID if file uploaded is associated to an agent.
 * @param {string} [params.req.body.assistant_id] - The assistant ID if file uploaded is associated to an assistant.
 * @param {string} [params.req.body.tool_resource] - The tool resource if assistant file uploaded is associated to a tool resource.
 *
 * @returns {Promise<void>}
 */
const processDeleteRequest = async ({ req, files }) => {
  const appConfig = req.config;
  const resolvedFileIds = [];
  const deletionMethods = {};
  const promises = [];

  /** @type {Record<string, OpenAI | undefined>} */
  const client = { [FileSources.openai]: undefined, [FileSources.azure]: undefined };
  const initializeClients = async () => {
    if (appConfig.endpoints?.[EModelEndpoint.assistants]) {
      const openAIClient = await getOpenAIClient({
        req,
        overrideEndpoint: EModelEndpoint.assistants,
      });
      client[FileSources.openai] = openAIClient.openai;
    }

    if (!appConfig.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
      return;
    }

    const azureClient = await getOpenAIClient({
      req,
      overrideEndpoint: EModelEndpoint.azureAssistants,
    });
    client[FileSources.azure] = azureClient.openai;
  };

  if (req.body.assistant_id !== undefined) {
    await initializeClients();
  }

  const agentFiles = [];

  for (const file of files) {
    const source = file.source ?? FileSources.local;
    if (req.body.agent_id && req.body.tool_resource) {
      agentFiles.push({
        tool_resource: req.body.tool_resource,
        file_id: file.file_id,
      });
    }

    if (source === FileSources.text) {
      resolvedFileIds.push(file.file_id);
      continue;
    }

    if (checkOpenAIStorage(source) && !client[source]) {
      await initializeClients();
    }

    const openai = client[source];

    if (req.body.assistant_id && req.body.tool_resource) {
      promises.push(
        deleteResourceFileId({
          req,
          openai,
          file_id: file.file_id,
          assistant_id: req.body.assistant_id,
          tool_resource: req.body.tool_resource,
        }),
      );
    } else if (req.body.assistant_id) {
      promises.push(openai.beta.assistants.files.del(req.body.assistant_id, file.file_id));
    }

    if (deletionMethods[source]) {
      enqueueDeleteOperation({
        req,
        file,
        deleteFile: deletionMethods[source],
        promises,
        resolvedFileIds,
        openai,
      });
      continue;
    }

    const { deleteFile } = getStrategyFunctions(source);
    if (!deleteFile) {
      throw new Error(`Delete function not implemented for ${source}`);
    }

    deletionMethods[source] = deleteFile;
    enqueueDeleteOperation({ req, file, deleteFile, promises, resolvedFileIds, openai });
  }

  if (agentFiles.length > 0) {
    promises.push(
      removeAgentResourceFiles({
        agent_id: req.body.agent_id,
        files: agentFiles,
      }),
    );
  }

  await Promise.allSettled(promises);
  await deleteFiles(resolvedFileIds);
};

/**
 * Processes a file URL using a specified file handling strategy. This function accepts a strategy name,
 * fetches the corresponding file processing functions (for saving and retrieving file URLs), and then
 * executes these functions in sequence. It first saves the file using the provided URL and then retrieves
 * the URL of the saved file. If any error occurs during this process, it logs the error and throws an
 * exception with an appropriate message.
 *
 * @param {Object} params - The parameters object.
 * @param {FileSources} params.fileStrategy - The file handling strategy to use.
 * Must be a value from the `FileSources` enum, which defines different file
 * handling strategies (like saving to Firebase, local storage, etc.).
 * @param {string} params.userId - The user's unique identifier. Used for creating user-specific paths or
 * references in the file handling process.
 * @param {string} params.URL - The URL of the file to be processed.
 * @param {string} params.fileName - The name that will be used to save the file (including extension)
 * @param {string} params.basePath - The base path or directory where the file will be saved or retrieved from.
 * @param {FileContext} params.context - The context of the file (e.g., 'avatar', 'image_generation', etc.)
 * @returns {Promise<MongoFile>} A promise that resolves to the DB representation (MongoFile)
 *  of the processed file. It throws an error if the file processing fails at any stage.
 */
const processFileURL = async ({ fileStrategy, userId, URL, fileName, basePath, context }) => {
  const { saveURL, getFileURL } = getStrategyFunctions(fileStrategy);
  try {
    const {
      bytes = 0,
      type = '',
      dimensions = {},
    } = (await saveURL({ userId, URL, fileName, basePath })) || {};
    const filepath = await getFileURL({ fileName: `${userId}/${fileName}`, basePath });
    return await createFile(
      {
        user: userId,
        file_id: v4(),
                            bytes,
                            filepath,
                            filename: fileName,
                            source: fileStrategy,
                            type,
                            context,
                            width: dimensions.width,
                            height: dimensions.height,
      },
      true,
    );
  } catch (error) {
    logger.error(`Error while processing the image with ${fileStrategy}:`, error);
    throw new Error(`Failed to process the image with ${fileStrategy}. ${error.message}`);
  }
};

/**
 * Applies the current strategy for image uploads.
 * Saves file metadata to the database with an expiry TTL.
 *
 * @param {Object} params - The parameters object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} [params.res] - The Express response object.
 * @param {ImageMetadata} params.metadata - Additional metadata for the file.
 * @param {boolean} params.returnFile - Whether to return the file metadata or return response as normal.
 * @returns {Promise<void>}
 */
const processImageFile = async ({ req, res, metadata, returnFile = false }) => {
  const { file } = req;
  const appConfig = req.config;
  const source = getFileStrategy(appConfig, { isImage: true });
  const { handleImageUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id, endpoint } = metadata;

  const { filepath, bytes, width, height } = await handleImageUpload({
    req,
    file,
    file_id,
    endpoint,
  });

  const result = await createFile(
    {
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: file.originalname,
      context: FileContext.message_attachment,
      source,
      type: `image/${appConfig.imageOutputType}`,
      width,
      height,
    },
    true,
  );

  if (returnFile) {
    return result;
  }
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

/**
 * Applies the current strategy for image uploads and
 * returns minimal file metadata, without saving to the database.
 *
 * @param {Object} params - The parameters object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {FileContext} params.context - The context of the file (e.g., 'avatar', 'image_generation', etc.)
 * @param {boolean} [params.resize=true] - Whether to resize and convert the image to target format. Default is `true`.
 * @param {{ buffer: Buffer, width: number, height: number, bytes: number, filename: string, type: string, file_id: string }} [params.metadata] - Required metadata for the file if resize is false.
 * @returns {Promise<{ filepath: string, filename: string, source: string, type: string}>}
 */
const uploadImageBuffer = async ({ req, context, metadata = {}, resize = true }) => {
  const appConfig = req.config;
  const source = getFileStrategy(appConfig, { isImage: true });
  const { saveBuffer } = getStrategyFunctions(source);
  let { buffer, width, height, bytes, filename, file_id, type } = metadata;
  if (resize) {
    file_id = v4();
    type = `image/${appConfig.imageOutputType}`;
    ({ buffer, width, height, bytes } = await resizeAndConvert({
      inputBuffer: buffer,
      desiredFormat: appConfig.imageOutputType,
    }));
    filename = `${path.basename(req.file.originalname, path.extname(req.file.originalname))}.${
      appConfig.imageOutputType
    }`;
  }
  const fileName = `${file_id}-${filename}`;
  const filepath = await saveBuffer({ userId: req.user.id, fileName, buffer });
  return await createFile(
    {
      user: req.user.id,
      file_id,
      bytes,
      filepath,
      filename,
      context,
      source,
      type,
      width,
      height,
    },
    true,
  );
};

/**
 * Applies the current strategy for file uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {FileMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const processFileUpload = async ({ req, res, metadata }) => {
  const { file } = req;
  
  logger.info('[PROCESS-FILE] Starting file upload processing:', {
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    endpoint: metadata.endpoint,
    fileId: metadata.file_id
  });

  // INTERCEPTAR DOCUMENTOS NATIVOS DE BEDROCK ANTES DEL PROCESAMIENTO NORMAL
  const isBedrock = metadata.endpoint === EModelEndpoint.bedrock;
  const isNativeDocument = isBedrockNativeDocument(file.mimetype);
  
  logger.debug('[PROCESS-FILE] Bedrock native check:', {
    isBedrock: isBedrock,
    isNativeDocument: isNativeDocument,
    shouldBypassOCR: (isBedrock && isNativeDocument)
  });

  if (isBedrock && isNativeDocument) {
    logger.info('[PROCESS-FILE] Processing Bedrock native document directly:', {
      mimetype: file.mimetype,
      filename: file.originalname
    });
    
    // Procesar como documento nativo para Bedrock
    const appConfig = req.config;
    const source = appConfig.fileStrategy || 'local';
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
    const { file_id, temp_file_id = null } = metadata;

    try {
      const result = await sanitizedUploadFn({
        req,
        file,
        file_id,
        basePath: 'documents',
        endpoint: metadata.endpoint
      });

      const fileType = file.mimetype.split('/')[1] || 'document';
      const fileInfo = {
        user: req.user.id,
        file_id,
        temp_file_id,
        bytes: result.bytes,
        filepath: result.filepath,
        filename: file.originalname,
        context: FileContext.message_attachment,
        type: file.mimetype,
        source,
        metadata: {
          processedAs: `native_${fileType}`,
          skippedOCR: true,
          isNativeBedrock: true,
          originalFileId: file_id,
          absolutePath: result.filepath,
          originalSize: result.bytes,
          uploadTimestamp: Date.now(),
          nativeDocumentType: file.mimetype
        }
      };

      const savedFile = await createFile(fileInfo, true);
      
      logger.info('[PROCESS-FILE] Bedrock native document processed successfully:', {
        fileType: fileType,
        fileName: file.originalname,
        fileId: file_id
      });

      return res.status(200).json({
        message: `${fileType.toUpperCase()} processed as native Bedrock document`,
        ...savedFile
      });
    } catch (error) {
      logger.error('[PROCESS-FILE] Error processing Bedrock native document:', {
        error: error.message,
        mimetype: file.mimetype
      });
      throw error;
    }
  }

  // FLUJO NORMAL PARA OTROS CASOS
  const appConfig = req.config;
  const isAssistantUpload = isAssistantsEndpoint(metadata.endpoint);
  const assistantSource =
  metadata.endpoint === EModelEndpoint.azureAssistants ? FileSources.azure : FileSources.openai;
  // Use the configured file strategy for regular file uploads (not vectordb)
  const source = isAssistantUpload ? assistantSource : appConfig.fileStrategy;
  const { handleFileUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id = null } = metadata;

  /** @type {OpenAI | undefined} */
  let openai;
  if (checkOpenAIStorage(source)) {
    ({ openai } = await getOpenAIClient({ req }));
  }

  const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
  const {
    id,
    bytes,
    filename,
    filepath: _filepath,
    embedded,
    height,
    width,
  } = await sanitizedUploadFn({
    req,
    file,
    file_id,
    openai,
  });

  if (isAssistantUpload && !metadata.message_file && !metadata.tool_resource) {
    await openai.beta.assistants.files.create(metadata.assistant_id, {
      file_id: id,
    });
  } else if (isAssistantUpload && !metadata.message_file) {
    await addResourceFileId({
      req,
      openai,
      file_id: id,
      assistant_id: metadata.assistant_id,
      tool_resource: metadata.tool_resource,
    });
  }

  let filepath = isAssistantUpload ? `${openai.baseURL}/files/${id}` : _filepath;
  if (isAssistantUpload && file.mimetype.startsWith('image')) {
    const result = await processImageFile({
      req,
      file,
      metadata: { file_id: v4() },
                                          returnFile: true,
    });
    filepath = result.filepath;
  }

  const result = await createFile(
    {
      user: req.user.id,
      file_id: id ?? file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: filename ?? sanitizeFilename(file.originalname),
                                  context: isAssistantUpload ? FileContext.assistants : FileContext.message_attachment,
                                  model: isAssistantUpload ? req.body.model : undefined,
                                  type: file.mimetype,
                                  embedded,
                                  source,
                                  height,
                                  width,
    },
    true,
  );
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

/**
 * Applies the current strategy for file uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {FileMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */


// En processAgentFileUpload, al INICIO de la funciÃƒÂ³n

const processAgentFileUpload = async ({ req, res, metadata }) => {
  const { file } = req;

  logger.info('[PROCESS-AGENT-FILE] Starting agent file upload processing:', {
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    endpoint: metadata.endpoint,
    agentProvider: req.body?.agent?.provider,
    toolResource: metadata.tool_resource,
    fileId: metadata.file_id,
    agentId: metadata.agent_id
  });

  try {
    // Aplicar sanitizaciÃ³n temprana para documentos nativos de Bedrock
  const isBedrock = metadata.endpoint === EModelEndpoint.bedrock ||
  req.body?.agent?.provider === 'bedrock';
  const fileIsPDF = file.mimetype === 'application/pdf';  // â† MANTENER PARA COMPATIBILIDAD
  const isBedrockNativeDoc = isBedrockNativeDocument(file.mimetype);

  logger.info('[PROCESS-AGENT-FILE] File classification complete:', {
    isBedrock: isBedrock,
    isBedrockNativeDoc: isBedrockNativeDoc,
    fileIsPDF: fileIsPDF,
    mimetype: file.mimetype,
    willApplySanitization: (isBedrock && isBedrockNativeDoc)
  });  // â† CAMBIAR NOMBRE PARA EVITAR CONFLICTO

  if (isBedrock && isBedrockNativeDoc) {
    // Asegurar que el filename estÃ¡ correctamente sanitizado
    file.originalname = sanitizeBedrockFilename(file.originalname);
    logger.info('[BEDROCK-NATIVE] Early sanitization applied:', {
      sanitized: file.originalname,
      mimetype: file.mimetype
    });
  }

  // Si es imagen, usar flujo específico para agentes
  if (file.mimetype.startsWith('image/')) {
    logger.info('[PROCESS-DEBUG] Image detected for agent, using agent-specific image flow');
    
    // Procesamos la imagen con el file_id original del metadata
    const result = await processImageFile({ req, res, metadata, returnFile: true });
    
    // Si no es message attachment y tiene tool_resource, asociar con el agente
    if (!metadata.message_file && metadata.tool_resource) {
      await addAgentResourceFile({
        req,
        file_id: metadata.file_id,
        agent_id: metadata.agent_id,
        tool_resource: metadata.tool_resource,
      });
    }
    
    // Enviar respuesta exitosa al frontend
    return res.status(200).json({ 
      message: 'Agent image uploaded and processed successfully', 
      ...result 
    });
  }

  const appConfig = req.config;
  const { agent_id, tool_resource, file_id, temp_file_id = null } = metadata;

  // INTERCEPCIÃ"N TEMPRANA: Si es documento nativo de Bedrock y tool_resource es OCR, procesarlo como nativo
  const isNativeDocument = isBedrockNativeDocument(file.mimetype);
  
  logger.debug('[BEDROCK-NATIVE] Interception check:', {
    isNativeDocument: isNativeDocument,
    toolResource: tool_resource,
    shouldIntercept: (isNativeDocument && tool_resource === 'ocr'),
    mimetype: file.mimetype,
    filename: file.originalname
  });
  if (isNativeDocument && tool_resource === 'ocr') {  // â† USAR LA VARIABLE RENOMBRADA
    const fileType = file.mimetype.split('/')[1] || 'document';
    logger.info(`[BEDROCK-NATIVE] Intercepting ${fileType.toUpperCase()} from OCR, processing as native document`, {
      mimetype: file.mimetype,
      filename: file.originalname,
      isBedrock: isBedrock,
      fileType: fileType,
      strategy: appConfig.fileStrategy || 'local'
    });

    const source = appConfig.fileStrategy || 'local';
    logger.debug('[BEDROCK-NATIVE] File upload strategy:', { source });
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);

    try {
      logger.debug('[BEDROCK-NATIVE] Starting file upload:', {
        fileId: file_id,
        basePath: 'documents',
        endpoint: metadata.endpoint
      });

      const result = await sanitizedUploadFn({
        req,
        file,
        file_id,
        basePath: 'documents',
        endpoint: metadata.endpoint
      });

      logger.info('[BEDROCK-NATIVE] File upload successful:', {
        bytes: result.bytes,
        filepath: result.filepath,
        fileId: file_id
      });

      const finalFilename = file.originalname;

      const fileInfo = {
        user: req.user.id,
        file_id,
        temp_file_id,
        bytes: result.bytes,
        filepath: result.filepath,
        filename: finalFilename,
        context: metadata.message_file ? FileContext.message_attachment : FileContext.agents,
        type: file.mimetype,
        source,
        metadata: {
          processedAs: `native_${fileType}`,
          skippedOCR: true,
          isNativeBedrock: isBedrock,
          originalFileId: file_id,
          absolutePath: result.filepath,
          originalSize: result.bytes,
          uploadTimestamp: Date.now(),
          toolResource: tool_resource,
          originalFilename: req.files?.[0]?.originalname || file.originalname,
          sanitizedFor: isBedrock ? 'bedrock' : 'general',
          nativeDocumentType: file.mimetype
        }
      };

      logger.debug('[BEDROCK-NATIVE] Creating file record in database:', { fileInfo });
      const savedFile = await createFile(fileInfo, true);
      logger.info('[BEDROCK-NATIVE] File record created successfully:', { fileId: savedFile.file_id });

      const messageAttachment = !!metadata.message_file;
      if (!messageAttachment && tool_resource && agent_id) {
        logger.debug('[BEDROCK-NATIVE] Adding agent resource file association:', { agent_id, tool_resource });
        await addAgentResourceFile({
          req,
          file_id,
          agent_id,
          tool_resource,
        });
        logger.info('[BEDROCK-NATIVE] Agent resource file association completed');
      }

      const response = {
        message: `${fileType.toUpperCase()} processed as native document ${isBedrock ? '(Bedrock-compatible)' : '(OCR bypassed)'}`,
        ...savedFile
      };

      logger.info('[BEDROCK-NATIVE] Native document processing completed successfully:', {
        fileType: fileType,
        fileName: finalFilename,
        fileId: file_id,
        responseMessage: response.message
      });

      return res.status(200).json(response);
    } catch (error) {
      logger.error('[BEDROCK-NATIVE] Error:', error);
      throw error;
    }
  }

  // Variables para el resto del flujo - VERIFICAR QUE NO HAYA CONFLICTOS
  const isBedrockEndpoint = metadata.endpoint === EModelEndpoint.bedrock;
  const pdfFile = fileIsPDF;  // â† USAR VARIABLE CONSISTENTE
  const messageAttachment = !!metadata.message_file;

  // SecciÃ³n existente de Bedrock (si existe en tu cÃ³digo original)
  if (isBedrockEndpoint && pdfFile && tool_resource === EToolResources.ocr) {
    const { file_id, temp_file_id = null } = metadata;
    const source = getFileStrategy(appConfig, { isImage: false });
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);

    const result = await sanitizedUploadFn({
      req,
      file,
      file_id,
      basePath: 'documents',
      entity_id: messageAttachment === true ? undefined : agent_id,
      endpoint: metadata.endpoint
    });

    const fileInfo = removeNullishValues({
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes: result.bytes,
      filepath: result.filepath,
      filename: sanitizeFilename(file.originalname),
                                         context: messageAttachment ? FileContext.message_attachment : FileContext.agents,
                                         model: messageAttachment ? undefined : req.body.model,
                                         type: file.mimetype,
                                         source,
                                         metadata: {
                                           isNativeDocument: true,
                                           supportsCitations: true,
                                           endpoint: EModelEndpoint.bedrock,
                                           absolutePath: result.filepath,
                                           originalSize: result.bytes,
                                           uploadTimestamp: Date.now()
                                         }
    });

    if (!messageAttachment && tool_resource) {
      await addAgentResourceFile({
        req,
        file_id,
        agent_id,
        tool_resource,
      });
    }

    const savedFile = await createFile(fileInfo, true);
    return res.status(200).json({
      message: 'PDF uploaded for native Bedrock processing',
      ...savedFile
    });
  }
  else if (tool_resource === EToolResources.ocr) {
    const { file_id, temp_file_id = null } = metadata;
    let messageAttachment = !!metadata.message_file;

    /**
     * @param {object} params
     * @param {string} params.text
     * @param {number} params.bytes
     * @param {string} params.filepath
     * @param {string} params.type
     * @return {Promise<void>}
     */
    const createTextFile = async ({ text, bytes, filepath, type = 'text/plain' }) => {
      const fileInfo = removeNullishValues({
        text,
        bytes,
        file_id,
        temp_file_id,
        user: req.user.id,
        type,
        filepath: filepath ?? file.path,
        source: FileSources.text,
        filename: file.originalname,
        model: messageAttachment ? undefined : req.body.model,
        context: messageAttachment ? FileContext.message_attachment : FileContext.agents,
      });

      if (!messageAttachment && tool_resource) {
        await addAgentResourceFile({
          req,
          file_id,
          agent_id,
          tool_resource,
        });
      }
      const result = await createFile(fileInfo, true);
      return res
      .status(200)
      .json({ message: 'Agent file uploaded and processed successfully', ...result });
    };

    const fileConfig = mergeFileConfig(appConfig.fileConfig);

    const shouldUseOCR = fileConfig.checkType(
      file.mimetype,
      fileConfig.ocr?.supportedMimeTypes || [],
    );

    if (shouldUseOCR && !(await checkCapability(req, AgentCapabilities.ocr))) {
      throw new Error('OCR capability is not enabled for Agents');
    } else if (shouldUseOCR) {
      const { handleFileUpload: uploadOCR } = getStrategyFunctions(
        appConfig?.ocr?.strategy ?? FileSources.mistral_ocr,
      );
      const { text, bytes, filepath: ocrFileURL } = await uploadOCR({ req, file, loadAuthValues });
      return await createTextFile({ text, bytes, filepath: ocrFileURL });
    }

    const shouldUseSTT = fileConfig.checkType(
      file.mimetype,
      fileConfig.stt?.supportedMimeTypes || [],
    );

    if (shouldUseSTT) {
      const sttService = await STTService.getInstance();
      const { text, bytes } = await processAudioFile({ req, file, sttService });
      return await createTextFile({ text, bytes });
    }

    const shouldUseText = fileConfig.checkType(
      file.mimetype,
      fileConfig.text?.supportedMimeTypes || [],
    );

    if (!shouldUseText) {
      throw new Error(`File type ${file.mimetype} is not supported for OCR or text parsing`);
    }

    const { text, bytes } = await parseText({ req, file, file_id });
    return await createTextFile({ text, bytes, type: file.mimetype });
  }

  // Dual storage pattern for RAG files: Storage + Vector DB
  let storageResult, embeddingResult;
  const isImageFile = file.mimetype.startsWith('image');
  const isImage = isImageFile;
  const source = getFileStrategy(appConfig, { isImage: isImageFile });
  const basePath = 'files';
  const entity_id = messageAttachment === true ? undefined : agent_id;
  let fileInfoMetadata = {};

  if (tool_resource === EToolResources.file_search) {
    // FIRST: Upload to Storage for permanent backup (S3/local/etc.)
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
    storageResult = await sanitizedUploadFn({
      req,
      file,
      file_id,
      basePath,
      entity_id,
    });

    // SECOND: Upload to Vector DB
    const { uploadVectors } = require('./VectorDB/crud');

    embeddingResult = await uploadVectors({
      req,
      file,
      file_id,
      entity_id,
    });

    // Vector status will be stored at root level, no need for metadata
    fileInfoMetadata = {};
  } else {
    // Standard single storage for non-RAG files
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
    storageResult = await sanitizedUploadFn({
      req,
      file,
      file_id,
      basePath,
      entity_id,
    });
  }

  let { bytes, filename, filepath: _filepath, height, width } = storageResult;
  // For RAG files, use embedding result; for others, use storage result
  let embedded = storageResult.embedded;
  if (tool_resource === EToolResources.file_search) {
    embedded = embeddingResult?.embedded;
    filename = embeddingResult?.filename || filename;
  }

  let filepath = _filepath;

  if (!messageAttachment && tool_resource) {
    await addAgentResourceFile({
      req,
      file_id,
      agent_id,
      tool_resource,
    });
  }

  // Bloque de procesamiento de imágenes eliminado para evitar duplicación
  // Las imágenes ya se procesan en el return temprano al inicio de la función

  const fileInfo = removeNullishValues({
    user: req.user.id,
    file_id,
    temp_file_id,
    bytes,
    filepath,
    filename: filename ?? sanitizeFilename(file.originalname),
                                       context: messageAttachment ? FileContext.message_attachment : FileContext.agents,
                                       model: messageAttachment ? undefined : req.body.model,
                                       metadata: fileInfoMetadata,
                                       type: file.mimetype,
                                       embedded,
                                       source,
                                       height,
                                       width,
  });

  const result = await createFile(fileInfo, true);

  res.status(200).json({ message: 'Agent file uploaded and processed successfully', ...result });
  
  } catch (error) {
    logger.error('[PROCESS-AGENT-FILE] Unexpected error during file processing:', {
      error: error.message,
      stack: error.stack,
      filename: file?.originalname,
      mimetype: file?.mimetype,
      fileId: metadata?.file_id,
      agentId: metadata?.agent_id,
      endpoint: metadata?.endpoint,
      toolResource: metadata?.tool_resource
    });
    
    // Re-throw the error to be handled by the upper layer
    throw error;
  }
};

/**
 * @param {object} params - The params object.
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {string} params.file_id - The ID of the file to retrieve.
 * @param {string} params.userId - The user ID.
 * @param {string} [params.filename] - The name of the file. `undefined` for `file_citation` annotations.
 * @param {boolean} [params.saveFile=false] - Whether to save the file metadata to the database.
 * @param {boolean} [params.updateUsage=false] - Whether to update file usage in database.
 */
const processOpenAIFile = async ({
  openai,
  file_id,
  userId,
  filename,
  saveFile = false,
  updateUsage = false,
}) => {
  const _file = await openai.files.retrieve(file_id);
  const originalName = filename ?? (_file.filename ? path.basename(_file.filename) : undefined);
  const filepath = `${openai.baseURL}/files/${userId}/${file_id}${
    originalName ? `/${originalName}` : ''
  }`;
  const type = mime.getType(originalName ?? file_id);
  const source =
  openai.req.body.endpoint === EModelEndpoint.azureAssistants
  ? FileSources.azure
  : FileSources.openai;
  const file = {
    ..._file,
    type,
    file_id,
    filepath,
    usage: 1,
    user: userId,
    context: _file.purpose,
    source,
    model: openai.req.body.model,
    filename: originalName ?? file_id,
  };

  if (saveFile) {
    await createFile(file, true);
  } else if (updateUsage) {
    try {
      await updateFileUsage({ file_id });
    } catch (error) {
      logger.error('Error updating file usage', error);
    }
  }

  return file;
};

/**
 * Process OpenAI image files, convert to target format, save and return file metadata.
 * @param {object} params - The params object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Buffer} params.buffer - The image buffer.
 * @param {string} params.file_id - The file ID.
 * @param {string} params.filename - The filename.
 * @param {string} params.fileExt - The file extension.
 * @returns {Promise<MongoFile>} The file metadata.
 */
const processOpenAIImageOutput = async ({ req, buffer, file_id, filename, fileExt }) => {
  const currentDate = new Date();
  const formattedDate = currentDate.toISOString();
  const appConfig = req.config;
  const _file = await convertImage(req, buffer, undefined, `${file_id}${fileExt}`);

  // Create only one file record with the correct information
  const file = {
    ..._file,
    usage: 1,
    user: req.user.id,
    type: mime.getType(fileExt),
    createdAt: formattedDate,
    updatedAt: formattedDate,
    source: getFileStrategy(appConfig, { isImage: true }),
    context: FileContext.assistants_output,
    file_id,
    filename,
  };
  createFile(file, true);
  return file;
};

/**
 * Retrieves and processes an OpenAI file based on its type.
 *
 * @param {Object} params - The params passed to the function.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {RunClient} params.client - The LibreChat client instance: either refers to `openai` or `streamRunManager`.
 * @param {string} params.file_id - The ID of the file to retrieve.
 * @param {string} [params.basename] - The basename of the file (if image); e.g., 'image.jpg'. `undefined` for `file_citation` annotations.
 * @param {boolean} [params.unknownType] - Whether the file type is unknown.
 * @returns {Promise<{file_id: string, filepath: string, source: string, bytes?: number, width?: number, height?: number} | null>}
 * - Returns null if `file_id` is not defined; else, the file metadata if successfully retrieved and processed.
 */
async function retrieveAndProcessFile({
  openai,
  client,
  file_id,
  basename: _basename,
  unknownType,
}) {
  if (!file_id) {
    return null;
  }

  let basename = _basename;
  const processArgs = { openai, file_id, filename: basename, userId: client.req.user.id };

  // If no basename provided, return only the file metadata
  if (!basename) {
    return await processOpenAIFile({ ...processArgs, saveFile: true });
  }

  const fileExt = path.extname(basename);
  if (client.attachedFileIds?.has(file_id) || client.processedFileIds?.has(file_id)) {
    return processOpenAIFile({ ...processArgs, updateUsage: true });
  }

  /**
   * @returns {Promise<Buffer>} The file data buffer.
   */
  const getDataBuffer = async () => {
    const response = await openai.files.content(file_id);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  let dataBuffer;
  if (unknownType || !fileExt || imageExtRegex.test(basename)) {
    try {
      dataBuffer = await getDataBuffer();
    } catch (error) {
      logger.error('Error downloading file from OpenAI:', error);
      dataBuffer = null;
    }
  }

  if (!dataBuffer) {
    return await processOpenAIFile({ ...processArgs, saveFile: true });
  }

  // If the filetype is unknown, inspect the file
  if (dataBuffer && (unknownType || !fileExt)) {
    const detectedExt = await determineFileType(dataBuffer);
    const isImageOutput = detectedExt && imageExtRegex.test('.' + detectedExt);

    if (!isImageOutput) {
      return await processOpenAIFile({ ...processArgs, saveFile: true });
    }

    return await processOpenAIImageOutput({
      file_id,
      req: client.req,
      buffer: dataBuffer,
      filename: basename,
      fileExt: detectedExt,
    });
  } else if (dataBuffer && imageExtRegex.test(basename)) {
    return await processOpenAIImageOutput({
      file_id,
      req: client.req,
      buffer: dataBuffer,
      filename: basename,
      fileExt,
    });
  } else {
    logger.debug(`[retrieveAndProcessFile] Non-image file type detected: ${basename}`);
    return await processOpenAIFile({ ...processArgs, saveFile: true });
  }
}

/**
 * Converts a base64 string to a buffer.
 * @param {string} base64String
 * @returns {Buffer<ArrayBufferLike>}
 */
function base64ToBuffer(base64String) {
  try {
    const typeMatch = base64String.match(/^data:([A-Za-z-+/]+);base64,/);
    const type = typeMatch ? typeMatch[1] : '';

    const base64Data = base64String.replace(/^data:([A-Za-z-+/]+);base64,/, '');

    if (!base64Data) {
      throw new Error('Invalid base64 string');
    }

    return {
      buffer: Buffer.from(base64Data, 'base64'),
      type,
    };
  } catch (error) {
    throw new Error(`Failed to convert base64 to buffer: ${error.message}`);
  }
}

async function saveBase64Image(
  url,
  { req, file_id: _file_id, filename: _filename, endpoint, context, resolution },
) {
  const appConfig = req.config;
  const effectiveResolution = resolution ?? appConfig.fileConfig?.imageGeneration ?? 'high';
  const file_id = _file_id ?? v4();
  let filename = `${file_id}-${_filename}`;
  const { buffer: inputBuffer, type } = base64ToBuffer(url);
  if (!path.extname(_filename)) {
    const extension = mime.getExtension(type);
    if (extension) {
      filename += `.${extension}`;
    } else {
      throw new Error(`Could not determine file extension from MIME type: ${type}`);
    }
  }

  const image = await resizeImageBuffer(inputBuffer, effectiveResolution, endpoint);
  const source = getFileStrategy(appConfig, { isImage: true });
  const { saveBuffer } = getStrategyFunctions(source);
  const filepath = await saveBuffer({
    userId: req.user.id,
    fileName: filename,
    buffer: image.buffer,
  });
  return await createFile(
    {
      type,
      source,
      context,
      file_id,
      filepath,
      filename,
      user: req.user.id,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
    },
    true,
  );
}

/**
 * Filters a file based on its size and the endpoint origin.
 *
 * @param {Object} params - The parameters for the function.
 * @param {ServerRequest} params.req - The request object from Express.
 * @param {string} [params.req.endpoint]
 * @param {string} [params.req.file_id]
 * @param {number} [params.req.width]
 * @param {number} [params.req.height]
 * @param {number} [params.req.version]
 * @param {boolean} [params.image] - Whether the file expected is an image.
 * @param {boolean} [params.isAvatar] - Whether the file expected is a user or entity avatar.
 * @returns {void}
 *
 * @throws {Error} If a file exception is caught (invalid file size or type, lack of metadata).
 */
function filterFile({ req, image, isAvatar }) {
  const { file } = req;
  const { endpoint, file_id, width, height, tool_resource } = req.body;

  if (!file_id && !isAvatar) {
    throw new Error('No file_id provided');
  }

  if (file.size === 0) {
    throw new Error('Empty file uploaded');
  }

  /* parse to validate api call, throws error on fail */
  if (!isAvatar) {
    isUUID.parse(file_id);
  }

  if (!endpoint && !isAvatar) {
    throw new Error('No endpoint provided');
  }

  const appConfig = req.config;
  const fileConfig = mergeFileConfig(appConfig.fileConfig);

  const { fileSizeLimit: sizeLimit, supportedMimeTypes } =
  fileConfig.endpoints[endpoint] ?? fileConfig.endpoints.default;
  
  // Dynamic size limits based on tool_resource
  let fileSizeLimit;
  if (isAvatar === true) {
    fileSizeLimit = fileConfig.avatarSizeLimit;
  } else if (tool_resource === 'file_search') {
    // File search: 50MB per file
    fileSizeLimit = 50 * megabyte;
  } else if (tool_resource === 'ocr' || !tool_resource) {
    // Images and OCR documents: 3MB per file
    fileSizeLimit = 3 * megabyte;
  } else {
    fileSizeLimit = sizeLimit;
  }

  if (file.size > fileSizeLimit) {
    const limitMB = fileSizeLimit / megabyte;
    let limitType = isAvatar ? 'avatar upload' : `${endpoint} endpoint`;
    
    if (!isAvatar) {
      limitType = tool_resource === 'file_search' ? 'document search' : 
                   tool_resource === 'ocr' ? 'text processing' : 'image upload';
    }
    
    throw new Error(
      `File size limit of ${limitMB} MB exceeded for ${limitType}. File: ${file.originalname} (${(file.size / megabyte).toFixed(1)} MB)`,
    );
  }

  // Validación específica para tool_resource
  let typesToCheck = supportedMimeTypes;
  
  if (tool_resource === 'file_search') {
    // Para file_search (search document), SOLO permitir documentos que naturalmente son de texto
    // NO permitir PDFs, DOCx, XLSx, CSV u otros formatos binarios (CSV ahora es procesado nativamente por Bedrock)
    const fileSearchMimeTypes = [
      textMimeTypes, // SOLO tipos de texto plano (txt, md, html, css, js, etc.)
      /^application\/(json|typescript|xml|x-yaml|x-sh)$/, // Archivos de texto que se reportan como application/*
    ];
    typesToCheck = fileSearchMimeTypes;
    
    logger.debug('[FILTER-FILE] Using file_search validation (text-only documents):', {
      mimetype: file.mimetype,
      tool_resource,
      fileSearchMimeTypesCount: fileSearchMimeTypes.length
    });
  } else if (tool_resource === 'ocr' && !image) {
    // Para OCR en endpoint /api/files (upload text), solo documentos de texto + documentos nativos de Bedrock
    // NO permitir PowerPoint, EPUB u otros documentos que requieren OCR complejo
    const textOCRMimeTypes = [
      textMimeTypes, // tipos de texto (txt, md, html, css, js, etc.)
      /^application\/(json|typescript|xml|x-yaml|x-sh)$/, // Archivos de texto que se reportan como application/*
      ...bedrockNativeDocumentMimeTypes // documentos nativos de Bedrock (PDF, Word, Excel, CSV)
    ];
    typesToCheck = textOCRMimeTypes;
    
    logger.debug('[FILTER-FILE] Using OCR text validation (documents only):', {
      mimetype: file.mimetype,
      tool_resource,
      image,
      textOCRMimeTypesCount: textOCRMimeTypes.length
    });
  }
  // Nota: Para tool_resource === 'ocr' && image === true (endpoint /api/files/images),
  // se usa la validación estándar que ya permite imágenes para OCR

  const isSupportedMimeType = fileConfig.checkType(file.mimetype, typesToCheck);

  if (!isSupportedMimeType) {
    let errorMsg = 'Unsupported file type';
    
    if (tool_resource === 'file_search') {
      errorMsg = `Unsupported file type for document search: ${file.mimetype}. Only plain text files are allowed (txt, md, json, html, css, js, ts, xml, yml, sh, etc.). PDFs, CSV and other binary documents are not supported.`;
    } else if (tool_resource === 'ocr' && !image) {
      errorMsg = `Unsupported file type for text processing: ${file.mimetype}. Only plain text files (txt, md, json, html, css, js, ts, xml, yml, sh, etc.) and Bedrock-native documents (PDF, Word, Excel, CSV) are allowed.`;
    }
    
    throw new Error(errorMsg);
  }

  if (!image || isAvatar === true) {
    return;
  }

  if (!width) {
    throw new Error('No width provided');
  }

  if (!height) {
    throw new Error('No height provided');
  }
}

module.exports = {
  filterFile,
  processFiles,
  processFileURL,
  saveBase64Image,
  processImageFile,
  uploadImageBuffer,
  processFileUpload,
  processDeleteRequest,
  processAgentFileUpload,
  retrieveAndProcessFile,
};
