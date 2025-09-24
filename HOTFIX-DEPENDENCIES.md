# 🚨 HOTFIX: Dependencias Faltantes

## 🔴 Problemas Detectados:

1. **LibreChat**: Faltaba `langchain/memory` 
2. **RAG API**: Problemas con estructura de archivos

## ✅ Soluciones Aplicadas:

### 1. LibreChat - Dockerfile actualizado con TODAS las dependencias:
```dockerfile
RUN npm install --legacy-peer-deps \
    @aws-sdk/client-s3 \
    @aws-sdk/client-textract \
    @aws-sdk/client-comprehend \
    @aws-sdk/client-bedrock-runtime \
    @langchain/aws@^0.1.15 \
    langchain@0.2.20 \  # Versión que incluye /memory
    @langchain/core@^0.3.62 \
    @langchain/community@^0.3.47 \
    @langchain/openai@^0.5.18 \
    @langchain/anthropic \
    @langchain/google-genai@^0.2.13 \
    @langchain/textsplitters@^0.1.0
```

### 2. RAG API - Usando imagen base oficial:
```yaml
rag_api:
  image: ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest
```

## 🚀 Solución Temporal (Mientras se construye):

Si necesitas usar el sistema YA, usa este docker-compose simplificado:

```yaml
# docker-compose-emergency.yml
services:
  api:
    image: ghcr.io/danny-avila/librechat-dev:latest
    container_name: LibreChat
    ports:
      - "3080:3080"
    depends_on:
      - mongodb
    restart: always
    environment:
      - HOST=0.0.0.0
      - PORT=3080
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
      - MEILI_HOST=http://meilisearch:7700
    volumes:
      - ./.env:/app/.env:ro
      - ./librechat.yaml:/app/librechat.yaml:ro
      - ./docker-compose.override.yml:/app/docker-compose.override.yml:ro
      
  mongodb:
    container_name: chat-mongodb
    image: mongo
    restart: always
    volumes:
      - ./data-node:/data/db
    command: mongod --noauth
    
  meilisearch:
    container_name: chat-meilisearch
    image: getmeili/meilisearch:v1.12.3
    restart: always
    environment:
      - MEILI_HOST=http://meilisearch:7700
      - MEILI_NO_ANALYTICS=true
      - MEILI_MASTER_KEY=tu-key-aqui
    volumes:
      - ./meili_data:/meili_data
```

## 📦 Estado de la Reconstrucción:

- **Nueva imagen construyéndose**: u2sebau2/librechat-custom:latest
- **Tiempo estimado**: 5-10 minutos
- **Una vez lista**: Se subirá automáticamente a Docker Hub

## 🔄 Para aplicar cuando esté listo:

```bash
# Detener contenedores actuales
docker-compose -f docker-compose.production.yml down

# Descargar nueva imagen
docker pull u2sebau2/librechat-custom:latest

# Levantar de nuevo
docker-compose -f docker-compose.production.yml up -d
```
