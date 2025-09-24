#!/bin/bash

echo "🎯 ACTUALIZACIÓN FINAL - FIX COMPLETO DE CITAS DE ARCHIVOS"
echo "=========================================================="
echo ""

echo "🐛 Problemas solucionados:"
echo "  1. ❌ Caracteres Unicode eliminados (‹turn0file0› en vez de \\ue202turn0file0)"
echo "  2. ❌ Numeración incorrecta (chunks del mismo archivo tenían números diferentes)"  
echo "  3. ❌ Mapping desincronizado (modelo citaba archivo_A, botón mostraba archivo_B)"
echo ""

echo "✅ Fixes aplicados:"
echo "  1. RAG API: Preservar caracteres \\uE200-\\uE2FF en regex de limpieza"
echo "  2. LibreChat: Numeración de anchors por archivo único (no por chunk)"
echo "  3. LibreChat: Sincronizar sources array con mapping de anchors"
echo ""

echo "📊 Nuevas imágenes Docker:"
echo "  • LibreChat: sha256:8013b4aea29a6623f960b04cbc65e402723ab09ec52318601cd6ae1a16f63071"
echo "  • RAG API: sha256:08ba9c50b492c4343309cc560668fb08e440cc5c6f359b8620dc7199d25a6faf"
echo ""

echo "🔄 Actualizando sistema..."
git pull

echo ""
echo "📥 Descargando imágenes corregidas..."
docker pull u2sebau2/librechat-custom:latest
docker pull u2sebau2/librechat-rag-custom:latest

echo ""
echo "📁 Verificando directorios..."
if [ ! -d "logs" ] || [ ! -d "uploads" ] || [ ! -d "images" ]; then
    echo "📁 Ejecutando install.sh para crear directorios..."
    ./install.sh
else
    echo "✅ Directorios ya existen"
fi

echo ""
echo "⏹️  Deteniendo servicios actuales..."
docker-compose -f docker-compose.production.yml down

echo ""
echo "🚀 Iniciando con imágenes corregidas..."
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización (15 segundos)..."
sleep 15

echo ""
echo "📊 Estado final de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "📋 Verificando logs importantes:"
echo ""
echo "🔍 LibreChat (últimas 5 líneas):"
docker logs LibreChat --tail=5

echo ""
echo "🔍 RAG API (últimas 5 líneas):"
docker logs rag_api --tail=5

echo ""
echo "🎉 ACTUALIZACIÓN COMPLETA - SISTEMA LISTO"
echo ""
echo "🧪 Para probar las citas corregidas:"
echo "  1. Ve a http://localhost:3080"
echo "  2. Sube 2+ archivos diferentes"
echo "  3. Haz una pregunta que use información de ambos"
echo "  4. Verifica que:"
echo "     ✅ Las citas aparezcan como \\ue202turn0file0, \\ue202turn0file1"
echo "     ✅ Los botones apunten al archivo correcto citado en el texto"
echo "     ✅ Chunks del mismo archivo compartan el mismo número"
echo ""
echo "🏆 ¡LibreChat Custom con sistema de citas totalmente funcional!"
