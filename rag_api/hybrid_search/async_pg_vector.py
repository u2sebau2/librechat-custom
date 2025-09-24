# app/services/vector_store/async_pg_vector.py
from typing import Optional, List, Tuple, Dict, Any
import asyncio
import logging
from langchain_core.documents import Document
from langchain_core.runnables.config import run_in_executor
from .extended_pg_vector import ExtendedPgVector

logger = logging.getLogger(__name__)


class AsyncPgVector(ExtendedPgVector):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._thread_pool = None

    def _get_thread_pool(self):
        if self._thread_pool is None:
            try:
                # Try to get the thread pool from FastAPI app state
                import contextvars
                from fastapi import Request
                # This is a fallback - in practice, we'll pass the executor explicitly
                loop = asyncio.get_running_loop()
                self._thread_pool = getattr(loop, '_default_executor', None)
            except:
                pass
        return self._thread_pool

    def _convert_filter_to_pgvector(self, filter: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Convert MongoDB-style filters to PGVector-compatible format.

        Converts {"file_id": {"$in": [...]}} to a format that PGVector can handle.
        """
        if not filter:
            return filter

        converted_filter = {}

        for key, value in filter.items():
            if isinstance(value, dict):
                # Check if it's a MongoDB-style operator
                if "$in" in value:
                    # For now, we'll need to work around this by doing multiple queries
                    # or converting to a different format
                    # This is a limitation of the current PGVector implementation

                    # Option 1: Use the first value only (not ideal)
                    # converted_filter[key] = value["$in"][0] if value["$in"] else None

                    # Option 2: Return the filter as-is and handle it in a custom way
                    # We'll need to override the similarity search method
                    converted_filter[key] = value

                elif "$eq" in value:
                    converted_filter[key] = value["$eq"]

                elif "$ne" in value:
                    # PGVector doesn't support $ne directly
                    logger.warning(f"$ne operator not supported, ignoring filter for {key}")

                else:
                    # Other operators - pass through
                    converted_filter[key] = value
            else:
                # Simple equality filter
                converted_filter[key] = value

        return converted_filter

    async def asimilarity_search_with_score_by_vector(
        self,
        embedding: List[float],
        k: int = 4,
        filter: Optional[Dict[str, Any]] = None,
        executor=None
    ) -> List[Tuple[Document, float]]:
        """
        Async version of similarity_search_with_score_by_vector with improved filter handling.
        """
        executor = executor or self._get_thread_pool()

        # Check if we have a complex filter with $in operator
        if filter and any(isinstance(v, dict) and "$in" in v for v in filter.values()):
            # Handle $in operator specially
            all_results = []

            for key, value in filter.items():
                if isinstance(value, dict) and "$in" in value:
                    # Run multiple queries, one for each value in the $in list
                    file_ids = value["$in"]

                    if not file_ids:
                        return []

                    # For efficiency, we'll run queries in parallel
                    tasks = []
                    for file_id in file_ids:
                        # Create a simple filter for each file_id
                        simple_filter = {key: file_id}

                        # Add any other filters that might exist
                        for other_key, other_value in filter.items():
                            if other_key != key:
                                simple_filter[other_key] = other_value

                        # Create async task
                        task = run_in_executor(
                            executor,
                            super().similarity_search_with_score_by_vector,
                            embedding,
                            k * 2,  # Get more results per file to ensure we have enough
                            simple_filter
                        )
                        tasks.append(task)

                    # Wait for all queries to complete
                    results_per_file = await asyncio.gather(*tasks)

                    # Combine all results
                    for results in results_per_file:
                        all_results.extend(results)

                    # Sort by score (distance) and take top k
                    all_results.sort(key=lambda x: x[1])

                    # Ensure unique documents (in case of duplicates)
                    seen_docs = set()
                    unique_results = []
                    for doc, score in all_results:
                        doc_key = (doc.page_content, doc.metadata.get('file_id'), doc.metadata.get('chunk_index'))
                        if doc_key not in seen_docs:
                            seen_docs.add(doc_key)
                            unique_results.append((doc, score))
                            if len(unique_results) >= k:
                                break

                    logger.info(f"AsyncPgVector: Found {len(unique_results)} results after filtering with $in operator")

                    return unique_results[:k]

        # For simple filters, use the parent implementation
        results = await run_in_executor(
            executor,
            super().similarity_search_with_score_by_vector,
            embedding,
            k,
            filter
        )

        # Ensure consistent IDs in metadata
        for doc, score in results:
            if 'custom_id' not in doc.metadata and '_id' in doc.metadata:
                doc.metadata['custom_id'] = doc.metadata['_id']
            elif 'custom_id' in doc.metadata and '_id' not in doc.metadata:
                doc.metadata['_id'] = doc.metadata['custom_id']

        return results

    async def get_all_ids(self, executor=None) -> list[str]:
        executor = executor or self._get_thread_pool()
        return await run_in_executor(executor, super().get_all_ids)

    async def get_filtered_ids(self, ids: list[str], executor=None) -> list[str]:
        executor = executor or self._get_thread_pool()
        return await run_in_executor(executor, super().get_filtered_ids, ids)

    async def get_documents_by_ids(self, ids: list[str], executor=None) -> list[Document]:
        executor = executor or self._get_thread_pool()
        return await run_in_executor(executor, super().get_documents_by_ids, ids)

    async def delete(
        self, ids: Optional[list[str]] = None, collection_only: bool = False, executor=None
    ) -> None:
        executor = executor or self._get_thread_pool()
        await run_in_executor(executor, self._delete_multiple, ids, collection_only)

    async def aadd_documents(
        self,
        documents: List[Document],
        ids: Optional[List[str]] = None,
        executor=None,
        **kwargs
    ) -> List[str]:
        """Async version of add_documents"""
        executor = executor or self._get_thread_pool()
        return await run_in_executor(
            executor,
            super().add_documents,
            documents,
            ids=ids,
            **kwargs
        )
