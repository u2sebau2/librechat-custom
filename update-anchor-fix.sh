#!/bin/bash

echo "🔄 ACTUALIZANDO LIBRECHAT CON FIX DE NUMERACIÓN DE ANCHORS"
echo "=========================================================="
echo ""

echo "📊 Cambios aplicados:"
echo "  • LibreChat: Fix numeración de anchors por archivo único"
echo "  • RAG API: Preservar caracteres Unicode de citación"
echo "  • Resultado: Citas funcionan correctamente agrupadas por archivo"
echo ""

echo "🔄 Actualizando código..."
git pull

echo ""
echo "📥 Descargando imágenes actualizadas..."
echo "  • LibreChat: sha256:b6821426a3f6151f3c47e3357051e395652f37dd17901873910fe468af08c589"
echo "  • RAG API: sha256:08ba9c50b492c4343309cc560668fb08e440cc5c6f359b8620dc7199d25a6faf"

docker pull u2sebau2/librechat-custom:latest
docker pull u2sebau2/librechat-rag-custom:latest

echo ""
echo "📁 Verificando/creando directorios necesarios..."
./install.sh 2>/dev/null || {
    echo "📁 Creando directorios manualmente..."
    sudo mkdir -p logs uploads images data-node meili_data_v1.12
    sudo chmod -R 777 logs uploads images data-node meili_data_v1.12
}

echo ""
echo "⏹️  Deteniendo servicios..."
docker-compose -f docker-compose.production.yml down

echo ""
echo "🚀 Iniciando servicios con imágenes actualizadas..."
docker-compose -f docker-compose.production.yml up -d

echo ""
echo "⏳ Esperando que los servicios estén listos..."
sleep 10

echo ""
echo "📊 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "✅ ACTUALIZACIÓN COMPLETA"
echo ""
echo "🎯 Verificación de fix de anchors:"
echo "  1. Sube 2+ archivos diferentes a LibreChat"
echo "  2. Haz una pregunta que use información de ambos archivos"
echo "  3. Verifica que las citas se muestren correctamente:"
echo ""
echo "     ✅ CORRECTO:"
echo "     'manual.pdf dice que... \\ue202turn0file0'"
echo "     'tutorial.docx explica... \\ue202turn0file1'"
echo ""
echo "     ❌ INCORRECTO (ya NO debe pasar):"
echo "     'manual.pdf dice que... \\ue202turn0file0'"
echo "     'manual.pdf también... \\ue202turn0file1' ← Mismo archivo, número diferente"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "🏆 Las citas ahora se agrupan correctamente por archivo único!"
