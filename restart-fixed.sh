#!/bin/bash

echo "🔧 Script de Reinicio con Imágenes Corregidas"
echo "============================================="
echo ""

# Detener contenedores actuales
echo "🛑 Deteniendo contenedores actuales..."
docker-compose -f docker-compose.production.yml down

# Actualizar el repositorio
echo ""
echo "📥 Actualizando código desde GitHub..."
git pull

# Descargar imágenes actualizadas
echo ""
echo "🐳 Descargando imágenes actualizadas..."
docker pull u2sebau2/librechat-custom:latest
docker pull ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest

# Verificar archivo .env
echo ""
if [ ! -f .env ]; then
    echo "⚠️ Archivo .env no encontrado. Creando desde plantilla..."
    cp env.example .env
    echo "📝 Por favor edita .env con tus claves API"
    echo "   nano .env"
    echo ""
    echo "Presiona ENTER cuando hayas configurado el archivo..."
    read
else
    echo "✅ Archivo .env encontrado"
fi

# Levantar servicios
echo ""
echo "🚀 Levantando servicios..."
docker-compose -f docker-compose.production.yml up -d

# Mostrar logs
echo ""
echo "📋 Mostrando logs (Ctrl+C para salir)..."
sleep 3
docker-compose -f docker-compose.production.yml logs -f

echo ""
echo "✅ Sistema reiniciado con éxito"
echo "🌐 Accede a: http://localhost:3080"
