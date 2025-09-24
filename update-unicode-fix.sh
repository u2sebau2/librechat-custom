#!/bin/bash

echo "🔄 ACTUALIZANDO CON FIX UNICODE PARA CITAS"
echo "=========================================="
echo ""

echo "📊 Nueva imagen RAG API:"
echo "  • SHA: sha256:08ba9c50b492c4343309cc560668fb08e440cc5c6f359b8620dc7199d25a6faf"
echo "  • Fix: Preserva caracteres \\uE200-\\uE2FF para citas LibreChat"
echo "  • Resultado: turn0file0, turn0file1 funcionan correctamente"
echo ""

echo "🔄 Actualizando código..."
git pull

echo ""
echo "📥 Descargando imágenes actualizadas..."
docker pull u2sebau2/librechat-custom:latest
docker pull u2sebau2/librechat-rag-custom:latest

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
echo "📋 Verificando logs de RAG API:"
echo "  (Buscando confirmación de que el servicio inició correctamente)"
docker logs rag_api --tail=10

echo ""
echo "✨ ACTUALIZACIÓN COMPLETA"
echo ""
echo "🎯 Para verificar que las citas funcionan:"
echo "  1. Sube un documento a LibreChat"
echo "  2. Haz una pregunta sobre el contenido"
echo "  3. Las citas deberían aparecer como: \\ue202turn0file0"
echo "     (No como: ‹turn0file0›)"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "✅ ¡Las citas de archivos ya deberían funcionar correctamente!"
