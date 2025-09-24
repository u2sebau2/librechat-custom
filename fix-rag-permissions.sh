#!/bin/bash

echo "🔧 ARREGLANDO PERMISOS RAG API"
echo "==============================="
echo ""

# Crear carpeta rag_uploads con permisos
echo "📁 Creando carpeta rag_uploads..."
sudo mkdir -p rag_uploads
sudo chmod -R 777 rag_uploads
echo "✅ Carpeta rag_uploads creada con permisos 777"

# Verificar otras carpetas
echo ""
echo "🔍 Verificando otras carpetas..."
for dir in logs uploads images data-node meili_data_v1.12; do
    if [ ! -d "$dir" ]; then
        sudo mkdir -p "$dir"
        echo "  ✅ Creada: $dir"
    fi
    sudo chmod -R 777 "$dir"
    echo "  ✅ Permisos aplicados: $dir"
done

echo ""
echo "📋 Estado de carpetas:"
ls -la | grep -E "logs|uploads|images|rag_uploads"

echo ""
echo "🔄 Reiniciando servicios..."
docker-compose -f docker-compose.production.yml down
docker pull u2sebau2/librechat-rag-custom:latest
docker-compose -f docker-compose.production.yml up -d

echo ""
echo "⏳ Esperando 5 segundos..."
sleep 5

echo ""
echo "📊 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "📋 Logs de RAG API:"
docker logs rag_api --tail=20

echo ""
echo "✅ Si ves 'Uvicorn running on http://0.0.0.0:8000' está funcionando!"
