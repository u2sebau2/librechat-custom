#!/bin/bash
# Script para desarrollo local

echo "🚀 Iniciando LibreChat en modo desarrollo..."

# Verificar permisos
echo "📁 Verificando permisos de carpetas..."
sudo chown -R $(id -u):$(id -g) meili_data images uploads logs data-node

# Construir imágenes si es necesario
echo "🔨 Construyendo imágenes Docker..."
docker compose build

# Iniciar servicios base
echo "🎯 Iniciando servicios base..."
docker compose up -d mongodb meilisearch

# Esperar a que MongoDB esté listo
echo "⏳ Esperando a MongoDB..."
sleep 5

# Iniciar API en modo desarrollo
echo "🔥 Iniciando API en modo desarrollo..."
docker compose up -d api

# Preguntar si iniciar frontend
read -p "¿Deseas iniciar el frontend en modo desarrollo? (s/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]
then
    echo "🎨 Iniciando frontend..."
    docker compose --profile development up -d frontend
fi

echo "✅ LibreChat está corriendo!"
echo "📍 API: http://localhost:3080"
echo "📍 Frontend Dev: http://localhost:3090"
echo "📍 MongoDB Express: http://localhost:8081 (si está habilitado)"

# Mostrar logs
docker compose logs -f
