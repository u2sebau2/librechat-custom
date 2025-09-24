#!/bin/bash

echo "🚀 LibreChat Custom - Instalación Rápida"
echo "========================================"
echo ""

# Clonar el repositorio
echo "📦 Clonando repositorio..."
git clone https://github.com/u2sebau2/librechat-custom.git
cd librechat-custom

# Configurar .env
echo ""
echo "⚙️ Configurando archivo .env..."
if [ ! -f .env ]; then
    cp env.example .env
    echo "✅ Archivo .env creado desde env.example"
    echo "⚠️ IMPORTANTE: Edita el archivo .env con tus claves API"
else
    echo "✅ Archivo .env ya existe"
fi

# Descargar imágenes
echo ""
echo "🐳 Descargando imágenes Docker..."
docker pull u2sebau2/librechat-custom:latest
docker pull u2sebau2/librechat-rag-custom:latest

# Mostrar siguiente paso
echo ""
echo "✅ ¡Instalación lista!"
echo ""
echo "📝 Siguientes pasos:"
echo "1. Edita el archivo .env con tus claves API:"
echo "   nano .env"
echo ""
echo "2. Levanta los servicios:"
echo "   docker-compose -f docker-compose.production.yml up -d"
echo ""
echo "3. Verifica los logs:"
echo "   docker-compose -f docker-compose.production.yml logs -f"
echo ""
echo "La aplicación estará disponible en: http://localhost:3080"
