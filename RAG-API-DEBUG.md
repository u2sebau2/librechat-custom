# 🔍 Estado del Debug del RAG API

## ❌ Debug NO está habilitado por defecto

### Configuración actual:
```python
# rag_api/hybrid_search/config.py
debug_mode = os.getenv("DEBUG_RAG_API", "False").lower() in ("true", "1", "yes", "y", "t")

if debug_mode:
    logger.setLevel(logging.DEBUG)  # Modo debug
else:
    logger.setLevel(logging.INFO)   # Modo normal (por defecto)
```

## 📊 Estado actual:
- **DEBUG_RAG_API**: `False` (por defecto)
- **Nivel de logs**: `INFO` (solo información importante)
- **Debug logs BM25**: Desactivados
- **Debug logs híbridos**: Desactivados

## ✅ Para HABILITAR el debug:

### Opción 1: En tu archivo `.env` local
```bash
# Agregar esta línea a tu .env
DEBUG_RAG_API=true
```

### Opción 2: En `docker-compose.production.yml`
```yaml
rag_api:
  environment:
    - DB_HOST=vectordb
    - RAG_PORT=${RAG_PORT:-8000}
    - DEBUG_RAG_API=true  # ← Agregar esta línea
```

### Opción 3: Variable de ambiente al ejecutar
```bash
DEBUG_RAG_API=true docker-compose -f docker-compose.production.yml up
```

## 📝 ¿Qué muestra el debug cuando está activo?

Cuando `DEBUG_RAG_API=true`:
- Queries SQL completas de BM25
- Scores de relevancia detallados
- Tiempos de respuesta por componente
- Cache hits/misses
- Información de búsqueda híbrida
- Detalles de embeddings
- Errores más detallados

## 🎯 Recomendación:

**Para producción**: Mantén `DEBUG_RAG_API=False` (por defecto)
- Menos logs = mejor performance
- Menos ruido en los logs
- Información sensible no expuesta

**Para desarrollo/debugging**: Activa con `DEBUG_RAG_API=true`
- Útil para diagnosticar problemas
- Ver exactamente qué está haciendo el RAG
- Optimizar búsquedas

## 🔧 Verificar estado actual:

```bash
# Ver si está configurado en tu sistema
docker exec rag_api printenv | grep DEBUG_RAG_API

# Ver nivel de logs actual
docker logs rag_api | grep -E "DEBUG|INFO" | head -5
```

Si ves muchos logs con `DEBUG`, está activo.
Si solo ves `INFO`, está desactivado (normal).

---
**Estado en tu instalación: DESACTIVADO (configuración por defecto)** ✅
