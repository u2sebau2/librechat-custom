#!/bin/bash

echo "🚀 LibreChat Custom - Instalación Inicial"
echo "========================================="
echo ""

# Verificar si .env existe
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env desde env.example..."
    cp env.example .env
    echo "   ⚠️  IMPORTANTE: Edita el archivo .env con tus configuraciones"
else
    echo "✅ Archivo .env ya existe"
fi

# Crear directorios necesarios con permisos
echo ""
echo "📁 Creando directorios persistentes..."

directories=(
    "logs"
    "uploads"
    "images"
    "data-node"
    "meili_data_v1.12"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo "   ✅ Creado: $dir"
    else
        echo "   ⏭️  Ya existe: $dir"
    fi
    # Aplicar permisos
    chmod -R 777 "$dir"
done

echo ""
echo "✅ INSTALACIÓN COMPLETA"
echo ""
echo "Próximos pasos:"
echo "1. Edita el archivo .env con tus configuraciones"
echo "2. Ejecuta: docker-compose -f docker-compose.production.yml up -d"
echo "3. Accede a: http://localhost:3080"
echo ""
echo "📋 Para ver los logs: docker logs -f LibreChat"
