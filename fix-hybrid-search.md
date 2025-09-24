# 🔧 SOLUCIÓN: Activar Hybrid Search Definitivamente

## 🎯 Problema Identificado:
- `ENABLE_HYBRID_SEARCH=true` ✅ (correcto)
- `DEFAULT_SEARCH_TYPE=hybrid` ✅ (correcto)
- **PERO** el `hybrid_search_service` NO se inicializa al startup ❌

## 📋 Causa Probable:
El startup event del RAG API no está ejecutándose correctamente o falla silenciosamente.

## ✅ SOLUCIÓN INMEDIATA:

### 1. Forzar reinicio del RAG API:
```bash
# Desde /mnt/data/libre3/librechat-custom
docker-compose -f docker-compose.production.yml restart rag_api
docker logs -f rag_api
```

### 2. Buscar estos mensajes específicos:
```
✅ "Hybrid search service type: ..."
✅ "Hybrid search feature enabled and initialized" 
❌ "Failed to initialize hybrid search on startup"
```

### 3. Si sigue fallando, verificar base de datos:
```bash
# Verificar que PostgreSQL tenga extensiones necesarias
docker exec vectordb psql -U myuser -d mydatabase -c "SELECT * FROM pg_extension WHERE extname IN ('pg_trgm', 'btree_gin');"
```

## 🔍 DIAGNÓSTICO AVANZADO:

### Ver estado completo del híbrido:
```bash
# Verificar todas las configuraciones híbridas
docker exec rag_api python -c "
import os
from app.config import ENABLE_HYBRID_SEARCH, DEFAULT_SEARCH_TYPE
from app.services.hybrid_search import hybrid_search_service

print(f'ENABLE_HYBRID_SEARCH: {ENABLE_HYBRID_SEARCH}')
print(f'DEFAULT_SEARCH_TYPE: {DEFAULT_SEARCH_TYPE}')  
print(f'Service initialized: {hybrid_search_service._initialized}')
print(f'Service type: {type(hybrid_search_service)}')
"
```

### Forzar inicialización manual:
```bash
docker exec rag_api python -c "
import asyncio
from app.services.hybrid_search import hybrid_search_service

async def test_init():
    try:
        await hybrid_search_service.initialize()
        print('✅ Inicialización exitosa')
        print(f'Initialized: {hybrid_search_service._initialized}')
        return True
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()
        return False

asyncio.run(test_init())
"
```

## 🎯 PRUEBA DEFINITIVA:

Una vez solucionado, deberías ver estos logs al hacer búsqueda RAG:

```
✅ "=== BM25 DEBUG ==="
✅ "Original query: 'tu consulta'"
✅ "BM25 query (OR=True): ..."
✅ "RRF fusion: X semantic + Y BM25 = Z results"
```

## 📝 Notas:
- La imagen oficial `ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest` **SÍ tiene** las modificaciones híbridas
- El problema es de inicialización, no de código faltante
- Una vez inicializado correctamente, verás logs BM25 + fusión híbrida
