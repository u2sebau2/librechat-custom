# app/routes/document_routes.py
import os
import hashlib
import traceback
import asyncio
import aiofiles
import aiofiles.os
import uuid
import json
from datetime import datetime
from shutil import copyfileobj
from typing import List, Iterable
from fastapi import (
    APIRouter,
    Request,
    UploadFile,
    HTTPException,
    File,
    Form,
    Body,
    Query,
    status,
)
from langchain_core.documents import Document
from langchain_core.runnables import run_in_executor
from langchain_text_splitters import RecursiveCharacterTextSplitter
from functools import lru_cache

from app.config import (
    logger,
    vector_store,
    RAG_UPLOAD_DIR,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    ENABLE_HYBRID_SEARCH,
    DEFAULT_SEARCH_TYPE,
    DEFAULT_SEMANTIC_WEIGHT,
    HYBRID_FUSION_K,
    HYBRID_EXPANSION_FACTOR,
    HYBRID_MAX_RETRIES,
    HYBRID_SEARCH_TIMEOUT
)
from app.constants import ERROR_MESSAGES
from app.models import (
    StoreDocument,
    QueryRequestBody,
    DocumentResponse,
    QueryMultipleBody,
    SearchType
)
from app.services.vector_store.async_pg_vector import AsyncPgVector
# IMPORTANTE: Importar la instancia, no la clase
from app.services.hybrid_search import hybrid_search_service
from app.utils.document_loader import (
    get_loader,
    clean_text,
    process_documents,
    cleanup_temp_encoding_file,
)
from app.utils.health import is_health_ok

router = APIRouter()


def clean_metadata_for_response(doc: Document, score: float) -> tuple:
    """
    Clean and optimize metadata before sending to the model.
    Only keep necessary fields and ensure consistency.
    """
    metadata = doc.metadata.copy()

    # Essential fields to always keep
    essential_fields = {
        'file_id', 'filename', 'source', 'chunk_index', 'total_chunks',
        'page', 'last_modified', 'page_url'
    }

    # Create cleaned metadata
    cleaned_metadata = {}

    # Add essential fields if they exist
    for field in essential_fields:
        if field in metadata:
            cleaned_metadata[field] = metadata[field]

    # Ensure custom_id is present
    cleaned_metadata['custom_id'] = metadata.get('custom_id', metadata.get('_id', ''))

    # Add search-specific metadata if present
    if '_fusion_score' in metadata:
        cleaned_metadata['fusion_score'] = metadata['_fusion_score']
    if '_semantic_rank' in metadata:
        cleaned_metadata['semantic_rank'] = metadata['_semantic_rank']
    if '_bm25_rank' in metadata:
        cleaned_metadata['bm25_rank'] = metadata['_bm25_rank']

    # Return document with cleaned metadata
    cleaned_doc = Document(
        page_content=doc.page_content,
        metadata=cleaned_metadata
    )

    return (cleaned_doc, score)

def generate_chunk_id(file_id: str, content: str, index: int) -> str:
    content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()[:8]
    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S%f')
    return f"{file_id}_{index}_{content_hash}_{timestamp}"

@router.on_event("startup")
async def startup_event():
    """Initialize hybrid search on startup"""
    if ENABLE_HYBRID_SEARCH:
        try:
            # Verify we have the instance, not the class
            logger.info(f"Hybrid search service type: {type(hybrid_search_service)}")
            logger.info(f"Hybrid search service: {hybrid_search_service}")

            # Call initialize on the instance
            await hybrid_search_service.initialize()
            logger.info("Hybrid search feature enabled and initialized")
        except Exception as e:
            logger.error(f"Failed to initialize hybrid search on startup: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Don't fail startup, hybrid search will try lazy initialization


@router.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    try:
        await hybrid_search_service.cleanup()
        logger.info("Hybrid search service cleaned up")
    except Exception as e:
        logger.error(f"Error during hybrid search cleanup: {e}")


def get_user_id(request: Request, entity_id: str = None) -> str:
    """Extract user ID from request or entity_id."""
    if not hasattr(request.state, "user"):
        return entity_id if entity_id else "public"
    else:
        return entity_id if entity_id else request.state.user.get("id")


async def save_upload_file_async(file: UploadFile, temp_file_path: str) -> None:
    """Save uploaded file asynchronously."""
    try:
        async with aiofiles.open(temp_file_path, "wb") as temp_file:
            chunk_size = 64 * 1024  # 64 KB
            while content := await file.read(chunk_size):
                await temp_file.write(content)
    except Exception as e:
        logger.error(
            "Failed to save uploaded file | Path: %s | Error: %s | Traceback: %s",
            temp_file_path,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save the uploaded file. Error: {str(e)}",
        )


def save_upload_file_sync(file: UploadFile, temp_file_path: str) -> None:
    """Save uploaded file synchronously."""
    try:
        with open(temp_file_path, "wb") as temp_file:
            copyfileobj(file.file, temp_file)
    except Exception as e:
        logger.error(
            "Failed to save uploaded file | Path: %s | Error: %s | Traceback: %s",
            temp_file_path,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save the uploaded file. Error: {str(e)}",
        )


async def load_file_content(
    filename: str, content_type: str, file_path: str, executor
) -> tuple:
    """Load file content using appropriate loader."""
    loader, known_type, file_ext = get_loader(filename, content_type, file_path)
    data = await run_in_executor(executor, loader.load)

    # Clean up temporary UTF-8 file if it was created for encoding conversion
    cleanup_temp_encoding_file(loader)

    return data, known_type, file_ext


def extract_text_from_documents(documents: List[Document], file_ext: str) -> str:
    """Extract text content from loaded documents."""
    text_content = ""
    if documents:
        for doc in documents:
            if hasattr(doc, "page_content"):
                # Clean text if it's a PDF
                if file_ext == "pdf":
                    text_content += clean_text(doc.page_content) + "\n"
                else:
                    text_content += doc.page_content + "\n"

    # Remove trailing newline
    return text_content.rstrip("\n")


async def cleanup_temp_file_async(file_path: str) -> None:
    """Clean up temporary file asynchronously."""
    try:
        await aiofiles.os.remove(file_path)
    except Exception as e:
        logger.error(
            "Failed to remove temporary file | Path: %s | Error: %s | Traceback: %s",
            file_path,
            str(e),
            traceback.format_exc(),
        )


async def ensure_hybrid_search_initialized() -> bool:
    """
    Ensure hybrid search is initialized when needed
    Returns True if hybrid search is available, False otherwise
    """
    if not ENABLE_HYBRID_SEARCH:
        return False

    if not hybrid_search_service._initialized:
        try:
            await hybrid_search_service.initialize()
            logger.info("Hybrid search initialized on demand")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize hybrid search on demand: {e}")
            return False

    return True


@router.get("/ids")
async def get_all_ids(request: Request):
    try:
        if isinstance(vector_store, AsyncPgVector):
            ids = await vector_store.get_all_ids(executor=request.app.state.thread_pool)
        else:
            ids = vector_store.get_all_ids()

        return list(set(ids))
    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in get_all_ids | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Failed to get all IDs | Error: %s | Traceback: %s",
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    try:
        health_status = {
            "status": "UP" if await is_health_ok() else "DOWN",
            "hybrid_search": {
                "enabled": ENABLE_HYBRID_SEARCH,
                "initialized": hybrid_search_service._initialized if ENABLE_HYBRID_SEARCH else False
            }
        }

        if ENABLE_HYBRID_SEARCH and hybrid_search_service._initialized:
            health_status["hybrid_search"]["metrics"] = hybrid_search_service.get_metrics()

        if health_status["status"] == "DOWN":
            logger.error("Health check failed")
            return health_status, 503

        return health_status
    except Exception as e:
        logger.error(
            "Error during health check | Error: %s | Traceback: %s",
            str(e),
            traceback.format_exc(),
        )
        return {"status": "DOWN", "error": str(e)}, 503


@router.get("/documents", response_model=list[DocumentResponse])
async def get_documents_by_ids(request: Request, ids: list[str] = Query(...)):
    try:
        if isinstance(vector_store, AsyncPgVector):
            existing_ids = await vector_store.get_filtered_ids(
                ids, executor=request.app.state.thread_pool
            )
            documents = await vector_store.get_documents_by_ids(
                ids, executor=request.app.state.thread_pool
            )
        else:
            existing_ids = vector_store.get_filtered_ids(ids)
            documents = vector_store.get_documents_by_ids(ids)

        # Ensure all requested ids exist
        if not all(id in existing_ids for id in ids):
            raise HTTPException(status_code=404, detail="One or more IDs not found")

        # Ensure documents list is not empty
        if not documents:
            raise HTTPException(
                status_code=404, detail="No documents found for the given IDs"
            )

        return documents
    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in get_documents_by_ids | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Error getting documents by IDs | IDs: %s | Error: %s | Traceback: %s",
            ids,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents")
async def delete_documents(request: Request, document_ids: List[str] = Body(...)):
    try:
        if isinstance(vector_store, AsyncPgVector):
            # Find all custom_ids that match the file_id patterns
            all_custom_ids = []
            for file_id in document_ids:
                # Get custom_ids that start with this file_id
                custom_ids = await get_custom_ids_by_file_id_pattern(
                    file_id, executor=request.app.state.thread_pool
                )
                all_custom_ids.extend(custom_ids)
            
            if not all_custom_ids:
                raise HTTPException(status_code=404, detail="One or more IDs not found")
            
            # Delete using the found custom_ids
            await vector_store.delete(
                ids=all_custom_ids, executor=request.app.state.thread_pool
            )
            
            deleted_count = len(all_custom_ids)
            logger.info(f"Deleted {deleted_count} chunks for {len(document_ids)} file(s): {document_ids}")
            
        else:
            # For non-async vector stores, try original method first
            existing_ids = vector_store.get_filtered_ids(document_ids)
            if not existing_ids:
                raise HTTPException(status_code=404, detail="One or more IDs not found")
            vector_store.delete(ids=document_ids)

        file_count = len(document_ids)
        return {
            "message": f"Documents for {file_count} file{'s' if file_count > 1 else ''} deleted successfully"
        }
    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in delete_documents | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Failed to delete documents | IDs: %s | Error: %s | Traceback: %s",
            document_ids,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=str(e))


async def get_custom_ids_by_file_id_pattern(file_id: str, executor=None) -> List[str]:
    """Find all custom_ids that start with the given file_id pattern."""
    from langchain_core.runnables.config import run_in_executor
    from sqlalchemy import text
    
    def _get_custom_ids_sync(file_id: str) -> List[str]:
        """Synchronous version that queries the database directly."""
        try:
            # Use SQLAlchemy's text() for parameterized queries
            query = text("SELECT custom_id FROM langchain_pg_embedding WHERE custom_id LIKE :pattern")
            pattern = f"{file_id}_%"
            
            # Try to create a session using vector store's method
            if hasattr(vector_store, '_make_session'):
                with vector_store._make_session() as session:
                    result = session.execute(query, {"pattern": pattern})
                    custom_ids = [row[0] for row in result.fetchall()]
                    logger.info(f"Found {len(custom_ids)} custom_ids for file_id {file_id}")
                    return custom_ids
            
            # Alternative: try to use the _bind attribute
            elif hasattr(vector_store, '_bind') and vector_store._bind:
                with vector_store._bind.connect() as connection:
                    result = connection.execute(query, {"pattern": pattern})
                    custom_ids = [row[0] for row in result.fetchall()]
                    logger.info(f"Found {len(custom_ids)} custom_ids for file_id {file_id}")
                    return custom_ids
            
            # Try to create an engine and connect
            elif hasattr(vector_store, '_create_engine'):
                engine = vector_store._create_engine()
                with engine.connect() as connection:
                    result = connection.execute(query, {"pattern": pattern})
                    custom_ids = [row[0] for row in result.fetchall()]
                    logger.info(f"Found {len(custom_ids)} custom_ids for file_id {file_id}")
                    return custom_ids
            
            logger.warning(f"Could not access database connection for pattern search. Using fallback for file_id: {file_id}")
            # Fallback: return empty list to trigger 404
            return []
                    
        except Exception as e:
            logger.error(f"Error getting custom_ids for file_id {file_id}: {str(e)}")
            logger.debug(f"Vector store type: {type(vector_store)}, attributes: {dir(vector_store)}")
            # Fallback: return empty list to trigger 404 
            return []
    
    if executor:
        return await run_in_executor(executor, _get_custom_ids_sync, file_id)
    else:
        return _get_custom_ids_sync(file_id)

class QueryEmbeddingCache:
    """Enhanced cache for query embeddings with normalization"""

    def __init__(self, max_size: int = 1000):
        self.cache = {}
        self.max_size = max_size
        self.access_order = []

    def _normalize_query(self, query: str) -> str:
        """Normalize query for better cache hits"""
        # Remove extra whitespace
        normalized = ' '.join(query.split())
        # Convert to lowercase
        normalized = normalized.lower()
        # Fix common encoding issues
        normalized = normalized.encode('utf-8', errors='ignore').decode('utf-8')
        return normalized

    def _get_cache_key(self, query: str) -> str:
        """Generate cache key from normalized query"""
        normalized = self._normalize_query(query)
        return hashlib.md5(normalized.encode('utf-8')).hexdigest()

    def get(self, query: str):
        """Get embedding from cache"""
        key = self._get_cache_key(query)
        if key in self.cache:
            # Move to end (most recently used)
            self.access_order.remove(key)
            self.access_order.append(key)
            return self.cache[key]
        return None

    def set(self, query: str, embedding):
        """Store embedding in cache"""
        key = self._get_cache_key(query)

        # Remove oldest if cache is full
        if len(self.cache) >= self.max_size and key not in self.cache:
            oldest = self.access_order.pop(0)
            del self.cache[oldest]

        self.cache[key] = embedding
        if key in self.access_order:
            self.access_order.remove(key)
        self.access_order.append(key)

    def clear(self):
        """Clear the cache"""
        self.cache.clear()
        self.access_order.clear()

embedding_cache = QueryEmbeddingCache(max_size=1000)

# Cache the embedding function with LRU cache
def get_cached_query_embedding(query: str):
    """Get query embedding with caching"""
    # Check cache first
    cached = embedding_cache.get(query)
    if cached is not None:
        logger.debug(f"Cache hit for query: {query[:50]}...")
        return cached

    # Compute embedding
    logger.debug(f"Cache miss for query: {query[:50]}...")
    embedding = vector_store.embedding_function.embed_query(query)

    # Store in cache
    embedding_cache.set(query, embedding)

    return embedding


@router.post("/query")
async def query_embeddings_by_file_id(
    body: QueryRequestBody,
    request: Request,
):
    if not hasattr(request.state, "user"):
        user_authorized = body.entity_id if body.entity_id else "public"
    else:
        user_authorized = (
            body.entity_id if body.entity_id else request.state.user.get("id")
        )

    authorized_documents = []

    try:
        # Check if hybrid search is requested and available
        use_hybrid = False
        if body.search_type in [SearchType.hybrid, SearchType.bm25]:
            use_hybrid = await ensure_hybrid_search_initialized()
            if not use_hybrid:
                logger.warning(
                    f"Hybrid search requested but not available, falling back to semantic search"
                )
                body.search_type = SearchType.semantic

        if use_hybrid and body.search_type == SearchType.bm25:
            # Pure BM25 search
            try:
                documents = await asyncio.wait_for(
                    hybrid_search_service.bm25_search(
                        body.query,
                        k=body.k,
                        filter_dict={"file_id": body.file_id}
                    ),
                    timeout=HYBRID_SEARCH_TIMEOUT
                )
            except asyncio.TimeoutError:
                logger.error(f"BM25 search timed out after {HYBRID_SEARCH_TIMEOUT}s")
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Search operation timed out"
                )

        elif use_hybrid and body.search_type == SearchType.hybrid:
            # Hybrid search - run both in parallel
            embedding = get_cached_query_embedding(body.query)  # Use improved cache
            k_expanded = int(body.k * HYBRID_EXPANSION_FACTOR)

            # Semantic search
            if isinstance(vector_store, AsyncPgVector):
                semantic_task = vector_store.asimilarity_search_with_score_by_vector(
                    embedding,
                    k=k_expanded,
                    filter={"file_id": body.file_id},
                    executor=request.app.state.thread_pool,
                )
            else:
                semantic_task = asyncio.create_task(
                    asyncio.to_thread(
                        vector_store.similarity_search_with_score_by_vector,
                        embedding,
                        k=k_expanded,
                        filter={"file_id": body.file_id}
                    )
                )

            # BM25 search
            bm25_task = hybrid_search_service.bm25_search(
                body.query,
                k=k_expanded,
                filter_dict={"file_id": body.file_id}
            )

            try:
                # Wait for both with timeout
                semantic_results, bm25_results = await asyncio.wait_for(
                    asyncio.gather(semantic_task, bm25_task),
                    timeout=HYBRID_SEARCH_TIMEOUT
                )

                # Combine using RRF
                documents = hybrid_search_service.reciprocal_rank_fusion(
                    semantic_results,
                    bm25_results,
                    k=HYBRID_FUSION_K,
                    semantic_weight=body.semantic_weight
                )[:body.k]

            except asyncio.TimeoutError:
                logger.error(f"Hybrid search timed out after {HYBRID_SEARCH_TIMEOUT}s")
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Search operation timed out"
                )

        else:
            # Default semantic search
            embedding = get_cached_query_embedding(body.query)  # Use improved cache
            if isinstance(vector_store, AsyncPgVector):
                documents = await vector_store.asimilarity_search_with_score_by_vector(
                    embedding,
                    k=body.k,
                    filter={"file_id": body.file_id},
                    executor=request.app.state.thread_pool,
                )
            else:
                documents = vector_store.similarity_search_with_score_by_vector(
                    embedding, k=body.k, filter={"file_id": body.file_id}
                )

        # Clean metadata before returning
        documents = [clean_metadata_for_response(doc, score) for doc, score in documents]

        if not documents:
            return authorized_documents

        document, score = documents[0]
        doc_metadata = document.metadata
        doc_user_id = doc_metadata.get("user_id")

        if doc_user_id is None or doc_user_id == user_authorized:
            authorized_documents = documents
        else:
            # Authorization logic...
            if body.entity_id and hasattr(request.state, "user"):
                user_authorized = request.state.user.get("id")
                if doc_user_id == user_authorized:
                    authorized_documents = documents
                else:
                    logger.warning(
                        f"Access denied for user {user_authorized}"
                    )
            else:
                logger.warning(
                    f"Unauthorized access attempt by user {user_authorized}"
                )

        return authorized_documents

    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in query_embeddings_by_file_id | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Error in query embeddings | File ID: %s | Query: %s | Search Type: %s | Error: %s | Traceback: %s",
            body.file_id,
            body.query,
            body.search_type,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=str(e))


def generate_digest(page_content: str):
    try:
        hash_obj = hashlib.md5(page_content.encode("utf-8"))
    except UnicodeEncodeError:
        hash_obj = hashlib.md5(
            page_content.encode("utf-8", "ignore").decode("utf-8").encode("utf-8")
        )
    return hash_obj.hexdigest()


async def store_data_in_vector_db(
    data: Iterable[Document],
    file_id: str,
    user_id: str = "",
    clean_content: bool = False,
    executor=None,
) -> bool:
    """
    Store document data in vector database
    """
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    documents = text_splitter.split_documents(data)

    if clean_content:
        for doc in documents:
            doc.page_content = clean_text(doc.page_content)

    # Create unique IDs for each chunk
    chunk_ids = []
    docs = []
    for i, doc in enumerate(documents):
        chunk_id = generate_chunk_id(file_id, doc.page_content, i)  # Pasar el contenido
        chunk_ids.append(chunk_id)

        docs.append(
            Document(
                page_content=doc.page_content,
                metadata={
                    "file_id": file_id,
                    "user_id": user_id,
                    "digest": generate_digest(doc.page_content),
                    "chunk_index": i,
                    "total_chunks": len(documents),
                    **(doc.metadata or {}),
                },
            )
        )

    try:
        # Insert chunks with unique IDs
        if isinstance(vector_store, AsyncPgVector):
            ids = await vector_store.aadd_documents(
                docs, ids=chunk_ids, executor=executor
            )
        else:
            ids = vector_store.add_documents(docs, ids=chunk_ids)

        # If hybrid search is enabled, update search_text
        if ENABLE_HYBRID_SEARCH:
            if await ensure_hybrid_search_initialized():
                success = await hybrid_search_service.update_search_text_batch(
                    docs,
                    file_id,
                    chunk_ids,
                    max_retries=HYBRID_MAX_RETRIES
                )

                if not success:
                    logger.warning(
                        f"Failed to update search_text for BM25, "
                        f"documents may not be fully searchable via hybrid search"
                    )

                logger.info(
                    f"Document {file_id} stored with {len(documents)} chunks."
                )

        return {"message": "Documents added successfully", "ids": ids}

    except Exception as e:
        logger.error(
            f"Failed to store data in vector DB | File ID: {file_id} | "
            f"User ID: {user_id} | Error: {e} | Traceback: {traceback.format_exc()}"
        )
        return {"message": "An error occurred while adding documents.", "error": str(e)}


@router.post("/local/embed")
async def embed_local_file(
    document: StoreDocument, request: Request, entity_id: str = None
):
    # Check if the file exists
    if not os.path.exists(document.filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.FILE_NOT_FOUND,
        )

    if not hasattr(request.state, "user"):
        user_id = entity_id if entity_id else "public"
    else:
        user_id = entity_id if entity_id else request.state.user.get("id")

    try:
        loader, known_type, file_ext = get_loader(
            document.filename, document.file_content_type, document.filepath
        )
        data = await run_in_executor(request.app.state.thread_pool, loader.load)

        # Clean up temporary UTF-8 file if it was created for encoding conversion
        cleanup_temp_encoding_file(loader)

        result = await store_data_in_vector_db(
            data,
            document.file_id,
            user_id,
            clean_content=file_ext == "pdf",
            executor=request.app.state.thread_pool,
        )

        if result:
            return {
                "status": True,
                "file_id": document.file_id,
                "filename": document.filename,
                "known_type": known_type,
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=ERROR_MESSAGES.DEFAULT(),
            )
    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in embed_local_file | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(e)
        if "No pandoc was found" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.PANDOC_NOT_INSTALLED,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT(e),
            )


@router.post("/embed")
async def embed_file(
    request: Request,
    file_id: str = Form(...),
    file: UploadFile = File(...),
    entity_id: str = Form(None),
):
    response_status = True
    response_message = "File processed successfully."
    known_type = None

    user_id = get_user_id(request, entity_id)
    temp_base_path = os.path.join(RAG_UPLOAD_DIR, user_id)
    os.makedirs(temp_base_path, exist_ok=True)
    temp_file_path = os.path.join(RAG_UPLOAD_DIR, user_id, file.filename)

    await save_upload_file_async(file, temp_file_path)

    try:
        data, known_type, file_ext = await load_file_content(
            file.filename,
            file.content_type,
            temp_file_path,
            request.app.state.thread_pool,
        )

        result = await store_data_in_vector_db(
            data=data,
            file_id=file_id,
            user_id=user_id,
            clean_content=file_ext == "pdf",
            executor=request.app.state.thread_pool,
        )

        if not result:
            response_status = False
            response_message = "Failed to process/store the file data."
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process/store the file data.",
            )
        elif "error" in result:
            response_status = False
            response_message = "Failed to process/store the file data."
            if isinstance(result["error"], str):
                response_message = result["error"]
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="An unspecified error occurred.",
                )
    except HTTPException as http_exc:
        response_status = False
        response_message = f"HTTP Exception: {http_exc.detail}"
        logger.error(
            "HTTP Exception in embed_file | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        response_status = False
        response_message = f"Error during file processing: {str(e)}"
        logger.error(
            "Error during file processing: %s\nTraceback: %s",
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error during file processing: {str(e)}",
        )
    finally:
        await cleanup_temp_file_async(temp_file_path)

    return {
        "status": response_status,
        "message": response_message,
        "file_id": file_id,
        "filename": file.filename,
        "known_type": known_type,
    }


@router.get("/documents/{id}/context")
async def load_document_context(request: Request, id: str):
    ids = [id]
    try:
        if isinstance(vector_store, AsyncPgVector):
            existing_ids = await vector_store.get_filtered_ids(
                ids, executor=request.app.state.thread_pool
            )
            documents = await vector_store.get_documents_by_ids(
                ids, executor=request.app.state.thread_pool
            )
        else:
            existing_ids = vector_store.get_filtered_ids(ids)
            documents = vector_store.get_documents_by_ids(ids)

        # Ensure the requested id exists
        if not all(id in existing_ids for id in ids):
            raise HTTPException(
                status_code=404, detail="The specified file_id was not found"
            )

        # Ensure documents list is not empty
        if not documents:
            raise HTTPException(
                status_code=404, detail="No document found for the given ID"
            )

        return process_documents(documents)
    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in load_document_context | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Error loading document context | Document ID: %s | Error: %s | Traceback: %s",
            id,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT(e),
        )


@router.post("/embed-upload")
async def embed_file_upload(
    request: Request,
    file_id: str = Form(...),
    uploaded_file: UploadFile = File(...),
    entity_id: str = Form(None),
):
    user_id = get_user_id(request, entity_id)
    temp_file_path = os.path.join(RAG_UPLOAD_DIR, uploaded_file.filename)

    save_upload_file_sync(uploaded_file, temp_file_path)

    try:
        data, known_type, file_ext = await load_file_content(
            uploaded_file.filename,
            uploaded_file.content_type,
            temp_file_path,
            request.app.state.thread_pool,
        )

        result = await store_data_in_vector_db(
            data,
            file_id,
            user_id,
            clean_content=file_ext == "pdf",
            executor=request.app.state.thread_pool,
        )

        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process/store the file data.",
            )
    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in embed_file_upload | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Error during file processing | File: %s | Error: %s | Traceback: %s",
            uploaded_file.filename,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error during file processing: {str(e)}",
        )
    finally:
        os.remove(temp_file_path)

    return {
        "status": True,
        "message": "File processed successfully.",
        "file_id": file_id,
        "filename": uploaded_file.filename,
        "known_type": known_type,
    }


@router.post("/query_multiple")
async def query_embeddings_by_file_ids(request: Request, body: QueryMultipleBody):
    try:
        # Check if hybrid search is requested and available
        use_hybrid = False
        if body.search_type in [SearchType.hybrid, SearchType.bm25]:
            use_hybrid = await ensure_hybrid_search_initialized()
            if not use_hybrid:
                logger.warning(
                    f"Hybrid search requested but not available, falling back to semantic search"
                )
                body.search_type = SearchType.semantic

        if use_hybrid and body.search_type == SearchType.bm25:
            # Pure BM25 search
            try:
                documents = await asyncio.wait_for(
                    hybrid_search_service.bm25_search(
                        body.query,
                        k=body.k,
                        filter_dict={"file_id": {"$in": body.file_ids}}
                    ),
                    timeout=HYBRID_SEARCH_TIMEOUT
                )
            except asyncio.TimeoutError:
                logger.error(f"BM25 search timed out after {HYBRID_SEARCH_TIMEOUT}s")
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Search operation timed out"
                )

        elif use_hybrid and body.search_type == SearchType.hybrid:
            logger.info(f"=== HYBRID SEARCH CONFIG ===")
            logger.info(f"Query: {body.query[:50]}...")
            logger.info(f"Semantic weight: {body.semantic_weight}")
            logger.info(f"Search type: {body.search_type}")
            logger.info(f"K requested: {body.k}")
            logger.info(f"K expanded: {int(body.k * HYBRID_EXPANSION_FACTOR)}")
            logger.info(f"===========================")

            # Hybrid search
            embedding = get_cached_query_embedding(body.query)  # Use improved cache
            k_expanded = int(body.k * HYBRID_EXPANSION_FACTOR)

            # Semantic search
            if isinstance(vector_store, AsyncPgVector):
                semantic_task = vector_store.asimilarity_search_with_score_by_vector(
                    embedding,
                    k=k_expanded,
                    filter={"file_id": {"$in": body.file_ids}},
                    executor=request.app.state.thread_pool,
                )
            else:
                semantic_task = asyncio.create_task(
                    asyncio.to_thread(
                        vector_store.similarity_search_with_score_by_vector,
                        embedding,
                        k=k_expanded,
                        filter={"file_id": {"$in": body.file_ids}}
                    )
                )

            # BM25 search
            bm25_task = hybrid_search_service.bm25_search(
                body.query,
                k=k_expanded,
                filter_dict={"file_id": {"$in": body.file_ids}}
            )

            try:
                # Wait for both with timeout
                semantic_results, bm25_results = await asyncio.wait_for(
                    asyncio.gather(semantic_task, bm25_task),
                    timeout=HYBRID_SEARCH_TIMEOUT
                )

                # Combine using RRF
                documents = hybrid_search_service.reciprocal_rank_fusion(
                    semantic_results,
                    bm25_results,
                    k=HYBRID_FUSION_K,
                    semantic_weight=body.semantic_weight
                )[:body.k]

            except asyncio.TimeoutError:
                logger.error(f"Hybrid search timed out after {HYBRID_SEARCH_TIMEOUT}s")
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Search operation timed out"
                )

        else:
            # Default semantic search
            embedding = get_cached_query_embedding(body.query)  # Use improved cache

            if isinstance(vector_store, AsyncPgVector):
                documents = await vector_store.asimilarity_search_with_score_by_vector(
                    embedding,
                    k=body.k,
                    filter={"file_id": {"$in": body.file_ids}},
                    executor=request.app.state.thread_pool,
                )
            else:
                documents = vector_store.similarity_search_with_score_by_vector(
                    embedding, k=body.k, filter={"file_id": {"$in": body.file_ids}}
                )

        # Clean metadata before returning
        documents = [clean_metadata_for_response(doc, score) for doc, score in documents]

        # Ensure documents list is not empty
        if not documents:
            raise HTTPException(
                status_code=404, detail="No documents found for the given query"
            )

        return documents

    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in query_embeddings_by_file_ids | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Error in query multiple embeddings | File IDs: %s | Query: %s | Search Type: %s | Error: %s | Traceback: %s",
            body.file_ids,
            body.query,
            body.search_type,
            str(e),
            traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/text")
async def extract_text_from_file(
    request: Request,
    file_id: str = Form(...),
    file: UploadFile = File(...),
    entity_id: str = Form(None),
):
    """
    Extract text content from an uploaded file without creating embeddings.
    Returns the raw text content for text parsing purposes.
    """
    user_id = get_user_id(request, entity_id)
    temp_base_path = os.path.join(RAG_UPLOAD_DIR, user_id)
    os.makedirs(temp_base_path, exist_ok=True)
    temp_file_path = os.path.join(RAG_UPLOAD_DIR, user_id, file.filename)

    await save_upload_file_async(file, temp_file_path)

    try:
        data, known_type, file_ext = await load_file_content(
            file.filename,
            file.content_type,
            temp_file_path,
            request.app.state.thread_pool,
        )

        # Extract text content from loaded documents
        text_content = extract_text_from_documents(data, file_ext)

        return {
            "text": text_content,
            "file_id": file_id,
            "filename": file.filename,
            "known_type": known_type,
        }

    except HTTPException as http_exc:
        logger.error(
            "HTTP Exception in extract_text_from_file | Status: %d | Detail: %s",
            http_exc.status_code,
            http_exc.detail,
        )
        raise http_exc
    except Exception as e:
        logger.error(
            "Error during text extraction | File: %s | Error: %s | Traceback: %s",
            file.filename,
            str(e),
            traceback.format_exc(),
        )
        if "No pandoc was found" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.PANDOC_NOT_INSTALLED,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error during text extraction: {str(e)}",
            )
    finally:
        await cleanup_temp_file_async(temp_file_path)


@router.get("/search/metrics")
async def get_search_metrics():
    """Get hybrid search performance metrics"""
    if not ENABLE_HYBRID_SEARCH:
        return {"message": "Hybrid search is not enabled"}

    return {
        "enabled": True,
        "initialized": hybrid_search_service._initialized,
        "metrics": hybrid_search_service.get_metrics() if hybrid_search_service._initialized else {}
    }
