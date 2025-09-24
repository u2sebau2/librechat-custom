#!/bin/bash

echo "🔧 Arreglando permisos de directorios..."
echo "======================================="
echo ""

# Crear directorios si no existen
echo "📁 Creando directorios necesarios..."
mkdir -p logs
mkdir -p uploads
mkdir -p images
mkdir -p data-node
mkdir -p meili_data

# Dar permisos correctos
echo "🔑 Aplicando permisos 777 (escritura total)..."
chmod -R 777 logs
chmod -R 777 uploads
chmod -R 777 images
chmod -R 777 data-node
chmod -R 777 meili_data

echo "✅ Permisos aplicados"
echo ""
echo "🚀 Reiniciando servicios..."
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d

echo ""
echo "✅ Listo! Verificando logs..."
sleep 3
docker-compose -f docker-compose.production.yml logs --tail=20 api
