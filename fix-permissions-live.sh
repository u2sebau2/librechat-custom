#!/bin/bash

echo "🔧 ARREGLO INMEDIATO DE PERMISOS"
echo "================================="
echo ""

# Detener contenedores
echo "⏹️  Deteniendo contenedores..."
docker-compose -f docker-compose.production.yml down

# Crear directorios con permisos correctos
echo "📁 Creando directorios necesarios..."
mkdir -p logs
mkdir -p uploads  
mkdir -p images
mkdir -p data-node
mkdir -p meili_data

# Dar permisos totales
echo "🔓 Aplicando permisos 777..."
sudo chmod -R 777 logs
sudo chmod -R 777 uploads
sudo chmod -R 777 images
sudo chmod -R 777 data-node
sudo chmod -R 777 meili_data

# Verificar permisos
echo ""
echo "✅ Verificando permisos:"
ls -la | grep -E "logs|uploads|images"

# Reiniciar con la última imagen
echo ""
echo "🔄 Actualizando imagen..."
docker pull u2sebau2/librechat-custom:latest

echo ""
echo "🚀 Iniciando servicios..."
docker-compose -f docker-compose.production.yml up -d

echo ""
echo "⏳ Esperando 5 segundos..."
sleep 5

echo ""
echo "📋 Logs de LibreChat:"
docker logs LibreChat --tail=30

echo ""
echo "✅ Si ves 'Server listening on http://0.0.0.0:3080' está funcionando!"
echo "❌ Si ves 'EACCES: permission denied' ejecuta este script de nuevo con sudo"
