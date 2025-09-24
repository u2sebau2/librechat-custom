# -*- coding: utf-8 -*-
# app/services/hybrid_search.py
import asyncio
import logging
import hashlib
import time
import json
import re
from typing import List, Dict, Optional, Tuple
from sqlalchemy import text
from langchain_core.documents import Document
import asyncpg

logger = logging.getLogger(__name__)

class HybridSearchService:
    """Service for hybrid search combining semantic and BM25 search"""

    def __init__(self):
        self.logger = logger
        self._initialized = False
        self._dsn = None
        self._pool = None
        self._pool_lock = asyncio.Lock()

        # Performance metrics
        self.metrics = {
            'bm25_searches': 0,
            'bm25_total_time': 0,
            'fusion_operations': 0
        }

    def _get_dsn(self):
        """Get DSN lazily to avoid circular imports"""
        if self._dsn is None:
            from app.config import DSN
            self._dsn = DSN
        return self._dsn

    async def get_pool(self):
        """Get or create connection pool with thread safety"""
        if self._pool is None:
            async with self._pool_lock:
                if self._pool is None:  # Double-check pattern
                    dsn = self._get_dsn()
                    self._pool = await asyncpg.create_pool(
                        dsn=dsn,
                        min_size=2,
                        max_size=10,
                        max_inactive_connection_lifetime=300,
                        command_timeout=60
                    )
                    self.logger.info("Created persistent connection pool for hybrid search")
        return self._pool

    async def initialize(self):
        """Initialize full-text search capabilities in PostgreSQL"""
        if self._initialized:
            return

        try:
            pool = await self.get_pool()
            async with pool.acquire() as conn:
                # Add text search column if not exists
                await conn.execute("""
                    ALTER TABLE langchain_pg_embedding
                    ADD COLUMN IF NOT EXISTS search_text TEXT;
                """)

                # Create tsvector column for efficient search (using Spanish)
                await conn.execute("""
                    ALTER TABLE langchain_pg_embedding
                    ADD COLUMN IF NOT EXISTS search_vector tsvector
                    GENERATED ALWAYS AS (
                        to_tsvector('spanish',
                            COALESCE(document, '') || ' ' ||
                            COALESCE(search_text, '') || ' ' ||
                            COALESCE(cmetadata->>'source', '')
                        )
                    ) STORED;
                """)

                # Create GIN index for fast full-text search
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_search_vector
                    ON langchain_pg_embedding USING GIN (search_vector);
                """)

                # Create index on file_id for faster filtering
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_file_id
                    ON langchain_pg_embedding ((cmetadata->>'file_id'));
                """)

                # Create helper function for OR queries
                await conn.execute("""
                    CREATE OR REPLACE FUNCTION text_to_or_tsquery(query_text text)
                    RETURNS tsquery AS $$
                    DECLARE
                        words text[];
                        result text;
                    BEGIN
                        -- Clean and split into words
                        words := string_to_array(
                            regexp_replace(
                                lower(query_text),
                                '[^a-z0-9áéíóúñüç ]',
                                ' ',
                                'g'
                            ),
                            ' '
                        );

                        -- Remove empty strings
                        words := array_remove(words, '');

                        -- If no words, return a dummy query
                        IF array_length(words, 1) IS NULL THEN
                            RETURN to_tsquery('spanish', 'dummy');
                        END IF;

                        -- Join with OR operator
                        result := array_to_string(words, ' | ');

                        RETURN to_tsquery('spanish', result);
                    END;
                    $$ LANGUAGE plpgsql IMMUTABLE;
                """)

                # Update existing rows to populate search_text from document
                affected = await conn.execute("""
                    UPDATE langchain_pg_embedding
                    SET search_text = document
                    WHERE search_text IS NULL;
                """)

                self.logger.info(f"Updated {affected} existing rows with search_text")

            self._initialized = True
            self.logger.info("Hybrid search initialized successfully with Spanish language support")

        except Exception as e:
            self.logger.error(f"Failed to initialize hybrid search: {e}")
            raise

    def clean_query_text(self, query: str) -> str:
        """Clean query text ensuring proper Spanish character handling"""
        # Ensure UTF-8
        if isinstance(query, bytes):
            query = query.decode('utf-8', errors='ignore')

        # Fix common encoding issues first
        query = query.encode('utf-8', errors='ignore').decode('utf-8')

        # Keep Spanish characters - use proper UTF-8 characters
        cleaned = re.sub(r'[^a-zA-Z0-9áéíóúñüçÁÉÍÓÚÑÜÇ\s]', ' ', query)
        cleaned = ' '.join(cleaned.split())
        return cleaned.lower()

    async def bm25_search(
        self,
        query: str,
        k: int = 5,
        filter_dict: Optional[Dict] = None,
        use_or_operator: bool = True
    ) -> List[Tuple[Document, float]]:
        """
        Perform BM25 search using PostgreSQL's full-text search
        """
        start_time = time.time()

        try:
            pool = await self.get_pool()

            # Clean the query text
            cleaned_query = self.clean_query_text(query)

            async with pool.acquire() as conn:
                # DEBUG logging
                self.logger.info(f"=== BM25 DEBUG ===")
                self.logger.info(f"Original query: '{query}'")
                self.logger.info(f"Cleaned query: '{cleaned_query}'")
                self.logger.info(f"Filter dict: {filter_dict}")
                self.logger.info(f"use_or_operator: {use_or_operator}")

                # Only run debug queries if we have a simple single file_id filter
                if filter_dict and 'file_id' in filter_dict and isinstance(filter_dict['file_id'], str):
                    # Single file_id case - safe to run debug queries
                    result1 = await conn.fetchval(
                        "SELECT text_to_or_tsquery($1)::text",
                        cleaned_query
                    )
                    result2 = await conn.fetchval(
                        "SELECT plainto_tsquery('spanish', $1)::text",
                        query.replace('_', ' ')
                    )

                    self.logger.info(f"text_to_or_tsquery('{cleaned_query}'): {result1}")
                    self.logger.info(f"plainto_tsquery('{query.replace('_', ' ')}'): {result2}")

                    count1 = await conn.fetchval("""
                        SELECT COUNT(*) FROM langchain_pg_embedding
                        WHERE search_vector @@ text_to_or_tsquery($1)
                        AND cmetadata->>'file_id' = $2
                    """, cleaned_query, filter_dict['file_id'])

                    count2 = await conn.fetchval("""
                        SELECT COUNT(*) FROM langchain_pg_embedding
                        WHERE search_vector @@ plainto_tsquery('spanish', $1)
                        AND cmetadata->>'file_id' = $2
                    """, query.replace('_', ' '), filter_dict['file_id'])

                    self.logger.info(f"Matches con text_to_or_tsquery: {count1}")
                    self.logger.info(f"Matches con plainto_tsquery: {count2}")
                elif filter_dict and 'file_id' in filter_dict and isinstance(filter_dict['file_id'], dict):
                    # Multiple file_ids case
                    file_ids = filter_dict['file_id'].get('$in', [])
                    self.logger.info(f"Multiple file_ids search: {len(file_ids)} files")

                self.logger.info(f"=================")

                # Build filter conditions
                conditions = []
                param_values = [cleaned_query, k]

                if filter_dict:
                    if "file_id" in filter_dict:
                        if isinstance(filter_dict["file_id"], str):
                            # Single file_id
                            conditions.append("cmetadata->>'file_id' = $3")
                            param_values.append(filter_dict["file_id"])
                        elif isinstance(filter_dict["file_id"], dict) and "$in" in filter_dict["file_id"]:
                            # Multiple file_ids
                            file_ids = filter_dict["file_id"]["$in"]
                            if file_ids:
                                placeholders = []
                                for i, fid in enumerate(file_ids):
                                    param_idx = len(param_values) + 1
                                    placeholders.append(f"${param_idx}")
                                    param_values.append(fid)
                                conditions.append(
                                    f"cmetadata->>'file_id' IN ({','.join(placeholders)})"
                                )

                where_clause = ""
                if conditions:
                    where_clause = "AND " + " AND ".join(conditions)

                # Choose query function based on operator preference
                query_function = "text_to_or_tsquery" if use_or_operator else "plainto_tsquery"
                query_lang = "" if use_or_operator else "'spanish', "

                # Simplified query without document statistics
                query_sql = f"""
                    SELECT
                        document,
                        cmetadata,
                        custom_id,
                        ts_rank_cd(search_vector, {query_function}({query_lang}$1), 32) AS rank
                    FROM
                        langchain_pg_embedding
                    WHERE
                        search_vector @@ {query_function}({query_lang}$1)
                        {where_clause}
                    ORDER BY rank DESC
                    LIMIT $2
                """

                self.logger.debug(f"BM25 query (OR={use_or_operator}): {query_sql}")
                self.logger.debug(f"BM25 parameters: {param_values}")

                rows = await conn.fetch(query_sql, *param_values)

                documents = []
                for row in rows:
                    metadata = row['cmetadata']
                    if isinstance(metadata, str):
                        try:
                            metadata = json.loads(metadata)
                        except json.JSONDecodeError:
                            metadata = {}
                    elif metadata is None:
                        metadata = {}

                    if not isinstance(metadata, dict):
                        metadata = {}

                    # Ensure ID consistency
                    custom_id = row['custom_id']
                    metadata['custom_id'] = custom_id
                    metadata['_bm25_score'] = float(row['rank'])

                    doc = Document(
                        page_content=row['document'],
                        metadata=metadata
                    )
                    score = float(row['rank'])
                    documents.append((doc, score))

                elapsed = time.time() - start_time
                self.metrics['bm25_searches'] += 1
                self.metrics['bm25_total_time'] += elapsed

                self.logger.info(
                    f"BM25 search completed in {elapsed:.3f}s | "
                    f"Query: {query[:50]}... | Found: {len(documents)} documents | "
                    f"OR: {use_or_operator}"
                )

                return documents

        except Exception as e:
            self.logger.error(f"Error in BM25 search: {e}")
            self.logger.error(f"Query: {query}, Filter: {filter_dict}")
            raise

    def get_document_key(self, doc: Document) -> str:
        """
        Generate consistent key using file_id + chunk_index
        """
        file_id = doc.metadata.get('file_id', 'unknown')
        chunk_index = doc.metadata.get('chunk_index', 'unknown')
        return f"{file_id}_{chunk_index}"

    def reciprocal_rank_fusion(
        self,
        semantic_results: List[Tuple[Document, float]],
        bm25_results: List[Tuple[Document, float]],
        k: int = 60,
        semantic_weight: float = 0.7
    ) -> List[Tuple[Document, float]]:
        """
        Combine results using Reciprocal Rank Fusion
        """
        doc_scores = {}

        self.logger.info(f"=== RRF WEIGHTS ===")
        self.logger.info(f"Semantic weight: {semantic_weight} ({semantic_weight*100:.0f}%)")
        self.logger.info(f"BM25 weight: {1-semantic_weight} ({(1-semantic_weight)*100:.0f}%)")
        self.logger.info(f"==================")

        try:
            # Process semantic results
            for rank, (doc, orig_score) in enumerate(semantic_results):
                key = self.get_document_key(doc)
                if key not in doc_scores:
                    doc_scores[key] = {
                        'doc': doc,
                        'score': 0,
                        'semantic_score': orig_score,
                        'semantic_rank': rank,
                        'bm25_score': 0,
                        'bm25_rank': -1
                    }
                # Calculate contribution
                contribution = semantic_weight / (k + rank + 1)
                doc_scores[key]['score'] += contribution

                if rank < 3:
                    self.logger.debug(f"Semantic doc {rank}: contribution={contribution:.6f}")

            self.logger.info(f"Sample semantic keys: {list(doc_scores.keys())[:3]}")

            # Process BM25 results
            for rank, (doc, orig_score) in enumerate(bm25_results):
                key = self.get_document_key(doc)
                if key not in doc_scores:
                    doc_scores[key] = {
                        'doc': doc,
                        'score': 0,
                        'semantic_score': 0,
                        'semantic_rank': -1,
                        'bm25_score': orig_score,
                        'bm25_rank': rank
                    }
                doc_scores[key]['score'] += (1 - semantic_weight) / (k + rank + 1)
                doc_scores[key]['bm25_score'] = orig_score
                doc_scores[key]['bm25_rank'] = rank

            self.logger.info(f"Sample BM25 keys (first 3): {[self.get_document_key(doc) for doc, _ in bm25_results[:3]]}")

            # Sort by combined score
            sorted_results = sorted(
                doc_scores.values(),
                key=lambda x: x['score'],
                reverse=True
            )

            self.metrics['fusion_operations'] += 1
            semantic_only = sum(1 for r in sorted_results if r['bm25_rank'] == -1)
            bm25_only = sum(1 for r in sorted_results if r['semantic_rank'] == -1)
            both = len(sorted_results) - semantic_only - bm25_only

            self.logger.debug(
                f"RRF fusion: {len(semantic_results)} semantic + {len(bm25_results)} BM25 = "
                f"{len(sorted_results)} results (semantic_only: {semantic_only}, "
                f"bm25_only: {bm25_only}, both: {both})"
            )

            # Add fusion metadata to documents
            for item in sorted_results:
                item['doc'].metadata['_fusion_score'] = item['score']
                item['doc'].metadata['_semantic_rank'] = item['semantic_rank']
                item['doc'].metadata['_bm25_rank'] = item['bm25_rank']

            return [(item['doc'], item['score']) for item in sorted_results]

        except Exception as e:
            self.logger.error(f"Error in reciprocal rank fusion: {e}")
            return semantic_results

    async def update_search_text_batch(
        self,
        documents: List[Document],
        file_id: str,
        chunk_ids: List[str],
        max_retries: int = 3
    ) -> bool:
        """
        Update search_text for a batch of documents with retry logic
        """
        retry_count = 0
        backoff_base = 0.5

        while retry_count < max_retries:
            try:
                pool = await self.get_pool()
                async with pool.acquire() as conn:
                    async with conn.transaction():
                        updated_count = 0
                        for i, (doc, chunk_id) in enumerate(zip(documents, chunk_ids)):
                            # Cast cmetadata to jsonb for proper || operator usage
                            result = await conn.fetchval("""
                                UPDATE langchain_pg_embedding
                                SET search_text = $1,
                                    cmetadata = (cmetadata::jsonb ||
                                        jsonb_build_object(
                                            'chunk_index', $4::text,
                                            'total_chunks', $5::text
                                        ))::json
                                WHERE custom_id = $2
                                AND cmetadata->>'file_id' = $3
                                RETURNING custom_id
                            """,
                            doc.page_content,
                            chunk_id,
                            file_id,
                            str(i),
                            str(len(documents))
                            )

                            if result:
                                updated_count += 1
                            else:
                                self.logger.warning(
                                    f"Document not found: chunk_id={chunk_id}, file_id={file_id}"
                                )

                        self.logger.info(
                            f"Updated search_text for {updated_count}/{len(documents)} documents"
                        )
                        return updated_count > 0  # Return True if at least one was updated

            except Exception as e:
                retry_count += 1
                if retry_count >= max_retries:
                    self.logger.error(
                        f"Failed to update search_text after {max_retries} attempts: {e}"
                    )
                    return False

                wait_time = backoff_base * (2 ** retry_count)
                self.logger.warning(
                    f"Failed to update search_text (attempt {retry_count}/{max_retries}): {e}. "
                    f"Retrying in {wait_time}s..."
                )
                await asyncio.sleep(wait_time)

        return False

    async def cleanup(self):
        """Cleanup resources"""
        if self._pool:
            await self._pool.close()
            self._pool = None
            self._initialized = False
            self.logger.info("Hybrid search service cleaned up")

    def get_metrics(self) -> Dict:
        """Return performance metrics"""
        avg_bm25_time = (
            self.metrics['bm25_total_time'] / self.metrics['bm25_searches']
            if self.metrics['bm25_searches'] > 0 else 0
        )

        return {
            'bm25_searches': self.metrics['bm25_searches'],
            'avg_bm25_time': avg_bm25_time,
            'fusion_operations': self.metrics['fusion_operations']
        }

# Global instance
hybrid_search_service = HybridSearchService()
