#!/bin/bash

echo "🚀 CONFIGURACIÓN DE PRODUCCIÓN PARA LIBRECHAT"
echo "=============================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📁 Creando estructura de directorios persistentes...${NC}"

# Crear todos los directorios necesarios
directories=(
    "logs"
    "uploads"
    "images"
    "data-node"
    "meili_data_v1.12"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        sudo mkdir -p "$dir"
        echo "  ✅ Creado: $dir"
    else
        echo "  ⏭️  Ya existe: $dir"
    fi
done

echo ""
echo -e "${YELLOW}🔓 Aplicando permisos correctos...${NC}"
for dir in "${directories[@]}"; do
    sudo chmod -R 777 "$dir"
    echo "  ✅ Permisos 777 aplicados a: $dir"
done

echo ""
echo -e "${YELLOW}📝 Descomentando volúmenes en docker-compose...${NC}"

# Crear versión con volúmenes activos
cat > docker-compose.production.yml << 'EOF'
version: '3.8'

services:
  api:
    image: u2sebau2/librechat-custom:latest
    container_name: LibreChat
    ports:
      - "${PORT:-3080}:${PORT:-3080}"
    depends_on:
      - mongodb
      - rag_api
    restart: always
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - HOST=0.0.0.0
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
      - MEILI_HOST=http://meilisearch:7700
      - RAG_PORT=${RAG_PORT:-8000}
      - RAG_API_URL=http://rag_api:${RAG_PORT:-8000}
      # Optimizaciones de rendimiento
      - NODE_OPTIONS=--max-old-space-size=4096
      - UV_THREADPOOL_SIZE=128
      - NODE_NO_WARNINGS=1
    volumes:
      - ./.env:/app/.env:ro
      - ./librechat.yaml:/app/librechat.yaml:ro
      # VOLÚMENES PERSISTENTES ACTIVADOS PARA PRODUCCIÓN
      - ./logs:/app/api/logs
      - ./uploads:/app/uploads
      - ./images:/app/client/public/images
      
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
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
    volumes:
      - ./meili_data_v1.12:/meili_data

  vectordb:
    container_name: vectordb
    image: pgvector/pgvector:0.8.0-pg15-trixie
    environment:
      POSTGRES_DB: mydatabase
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: mypassword
    restart: always
    volumes:
      - pgdata2:/var/lib/postgresql/data
    ports:
      - "5433:5432"

  rag_api:
    image: ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest
    container_name: rag_api
    environment:
      - DB_HOST=vectordb
      - RAG_PORT=${RAG_PORT:-8000}
    restart: always
    depends_on:
      - vectordb
    env_file:
      - .env

volumes:
  pgdata2:
EOF

echo -e "  ✅ docker-compose.production.yml actualizado con volúmenes"

echo ""
echo -e "${YELLOW}🐳 Actualizando imágenes...${NC}"
docker pull u2sebau2/librechat-custom:latest
echo "  ✅ Imagen LibreChat actualizada"

echo ""
echo -e "${YELLOW}🚀 Iniciando servicios...${NC}"
docker-compose -f docker-compose.production.yml down 2>/dev/null
docker-compose -f docker-compose.production.yml up -d

echo ""
echo -e "${GREEN}✅ CONFIGURACIÓN COMPLETA${NC}"
echo ""
echo "📊 Estructura de datos persistentes:"
echo "  • logs/       -> Logs de la aplicación"
echo "  • uploads/    -> Archivos subidos por usuarios"  
echo "  • images/     -> Imágenes del sistema"
echo "  • data-node/  -> Base de datos MongoDB"
echo "  • meili_data/ -> Índices de búsqueda"
echo ""
echo "🔍 Verificando estado..."
sleep 5
docker-compose -f docker-compose.production.yml ps
echo ""
echo "📋 Últimas líneas del log:"
docker logs LibreChat --tail=10

echo ""
echo -e "${GREEN}🎯 Si ves 'Server listening on http://0.0.0.0:3080' está funcionando!${NC}"
echo -e "${YELLOW}📌 Accede a: http://localhost:3080${NC}"
