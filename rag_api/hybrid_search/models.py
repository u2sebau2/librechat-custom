# app/models.py
import os
import hashlib
from enum import Enum
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from app.config import DEFAULT_SEMANTIC_WEIGHT  # â† AGREGAR ESTA IMPORTACIÃ“N


class SearchType(str, Enum):
    semantic = "semantic"
    bm25 = "bm25"
    hybrid = "hybrid"


class DocumentResponse(BaseModel):
    page_content: str
    metadata: dict


class DocumentModel(BaseModel):
    page_content: str
    metadata: Optional[dict] = {}

    def generate_digest(self):
        hash_obj = hashlib.md5(self.page_content.encode())
        return hash_obj.hexdigest()


class StoreDocument(BaseModel):
    filepath: str
    filename: str
    file_content_type: str
    file_id: str


class QueryRequestBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Search query")
    file_id: str = Field(..., description="File ID to search within")
    k: int = Field(4, ge=1, le=100, description="Number of results to return")
    entity_id: Optional[str] = Field(None, description="Entity ID for access control")
    search_type: Optional[SearchType] = Field(
        SearchType.semantic,
        description="Type of search: semantic, bm25, or hybrid"
    )
    semantic_weight: Optional[float] = Field(
        DEFAULT_SEMANTIC_WEIGHT,
        ge=0.0,
        le=1.0,
        description="Weight for semantic search in hybrid mode (0.0-1.0)"
    )

    @validator('search_type')
    def validate_search_type(cls, v, values):
        """Validate that hybrid search is enabled if requested"""
        if v in [SearchType.hybrid, SearchType.bm25]:
            # Check if hybrid search is enabled
            if not os.getenv("ENABLE_HYBRID_SEARCH", "false").lower() == "true":
                raise ValueError(
                    f"Search type '{v.value}' is not available. "
                    "Hybrid search is not enabled on this server."
                )
        return v

    @validator('semantic_weight')
    def validate_semantic_weight(cls, v, values):
        """Validate semantic weight is only used with hybrid search"""
        search_type = values.get('search_type')
        if search_type != SearchType.hybrid and v != DEFAULT_SEMANTIC_WEIGHT:  # â† CAMBIAR AQUÃ TAMBIÃ‰N
            # Log a warning but don't raise an error
            import logging
            logging.getLogger(__name__).warning(
                f"semantic_weight ({v}) is only used with hybrid search, not {search_type}"
            )
        return v

    @validator('k')
    def validate_k_value(cls, v, values):
        """Validate k value based on search type"""
        search_type = values.get('search_type')
        if search_type in [SearchType.hybrid, SearchType.bm25]:
            # For hybrid search, we might need more results internally
            max_k = int(os.getenv("HYBRID_MAX_K", "100"))
            if v > max_k:
                raise ValueError(
                    f"k value ({v}) exceeds maximum allowed for {search_type.value} search ({max_k})"
                )
        return v

    class Config:
        schema_extra = {
            "example": {
                "query": "What is machine learning?",
                "file_id": "doc_123",
                "k": 5,
                "search_type": "hybrid",
                "semantic_weight": 0.7
            }
        }


class CleanupMethod(str, Enum):
    incremental = "incremental"
    full = "full"


class QueryMultipleBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Search query")
    file_ids: List[str] = Field(
        ...,
        min_items=1,
        max_items=100,
        description="List of file IDs to search within"
    )
    k: int = Field(4, ge=1, le=100, description="Number of results to return")
    search_type: Optional[SearchType] = Field(
        SearchType.semantic,
        description="Type of search: semantic, bm25, or hybrid"
    )
    semantic_weight: Optional[float] = Field(
        DEFAULT_SEMANTIC_WEIGHT,
        ge=0.0,
        le=1.0,
        description="Weight for semantic search in hybrid mode (0.0-1.0)"
    )

    @validator('search_type')
    def validate_search_type(cls, v):
        """Validate that hybrid search is enabled if requested"""
        if v in [SearchType.hybrid, SearchType.bm25]:
            if not os.getenv("ENABLE_HYBRID_SEARCH", "false").lower() == "true":
                raise ValueError(
                    f"Search type '{v.value}' is not available. "
                    "Hybrid search is not enabled on this server."
                )
        return v

    @validator('file_ids')
    def validate_file_ids(cls, v):
        """Validate file IDs are unique"""
        if len(v) != len(set(v)):
            raise ValueError("Duplicate file IDs are not allowed")
        return v

    class Config:
        schema_extra = {
            "example": {
                "query": "What are the main findings?",
                "file_ids": ["doc_123", "doc_456", "doc_789"],
                "k": 10,
                "search_type": "hybrid",
                "semantic_weight": 0.7
            }
        }


class SearchMetricsResponse(BaseModel):
    """Response model for search metrics endpoint"""
    enabled: bool
    initialized: bool
    metrics: Optional[dict] = None

    class Config:
        schema_extra = {
            "example": {
                "enabled": True,
                "initialized": True,
                "metrics": {
                    "bm25_searches": 42,
                    "avg_bm25_time": 0.123,
                    "fusion_operations": 20
                }
            }
        }


class HybridSearchConfig(BaseModel):
    """Configuration model for hybrid search settings"""
    enabled: bool = Field(..., description="Whether hybrid search is enabled")
    default_search_type: SearchType = Field(..., description="Default search type")
    default_semantic_weight: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Default semantic weight for hybrid search"
    )
    fusion_k: int = Field(..., ge=1, description="K parameter for RRF fusion")
    expansion_factor: float = Field(
        ...,
        ge=1.0,
        le=5.0,
        description="Factor to expand k for internal searches"
    )
    max_retries: int = Field(..., ge=1, le=10, description="Max retries for updates")
    timeout: int = Field(..., ge=1, le=300, description="Search timeout in seconds")

    @classmethod
    def from_env(cls):
        """Create config from environment variables"""
        return cls(
            enabled=os.getenv("ENABLE_HYBRID_SEARCH", "false").lower() == "true",
            default_search_type=SearchType(
                os.getenv("DEFAULT_SEARCH_TYPE", "semantic")
            ),
            default_semantic_weight=float(
                os.getenv("DEFAULT_SEMANTIC_WEIGHT", "0.7")
            ),
            fusion_k=int(os.getenv("HYBRID_FUSION_K", "60")),
            expansion_factor=float(os.getenv("HYBRID_EXPANSION_FACTOR", "2.0")),
            max_retries=int(os.getenv("HYBRID_MAX_RETRIES", "3")),
            timeout=int(os.getenv("HYBRID_SEARCH_TIMEOUT", "30"))
        )
