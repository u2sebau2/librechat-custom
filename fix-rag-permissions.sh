#!/bin/bash

echo "🔧 ARREGLANDO PERMISOS PARA TODOS LOS SERVICIOS"
echo "================================================"
echo ""

# Crear y verificar todas las carpetas necesarias
echo "📁 Creando directorios con permisos..."
for dir in logs uploads images data-node meili_data_v1.12; do
    if [ ! -d "$dir" ]; then
        sudo mkdir -p "$dir"
        echo "  ✅ Creada: $dir"
    else
        echo "  ⏭️  Ya existe: $dir"
    fi
    sudo chmod -R 777 "$dir"
    echo "  ✅ Permisos 777 aplicados: $dir"
done

echo ""
echo "📋 Estado de carpetas:"
ls -la | grep -E "logs|uploads|images"

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
