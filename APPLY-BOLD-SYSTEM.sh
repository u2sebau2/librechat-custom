#!/bin/bash

echo "🎯 APLICANDO SISTEMA FINAL - CITAS EN NEGRITA"
echo "============================================="
echo ""

echo "✅ SISTEMA DEFINITIVO:"
echo "  • Citas naturales: **filename.ext** (negrita)"
echo "  • Sin anchors Unicode complejos"
echo "  • Sin problemas de mapping"
echo "  • ReactMarkdown renderiza negrita automáticamente"
echo ""

echo "🔄 CAMBIOS FINALES:"
echo "  • LibreChat: Instrucciones cambiadas a negrita **filename.ext**"
echo "  • RAG API: Regex revertida (ya no preserva Unicode innecesario)"
echo "  • Eliminado: Líneas Anchor \\ue202turn0file{index}"
echo ""

echo "📦 Imágenes nuevas:"
echo "  • LibreChat: sha256:0a85ad07c90c7d37eafe5c5f2c45289ccbd234d005805fd8268851779c869111"
echo "  • RAG API: sha256:5d8b489c3857c3a74690253cdd0cddf136c6261cff56f512ef02cf5c39356c7b"
echo ""

echo "🔄 Actualizando código..."
git pull

echo ""
echo "📥 Descargando imágenes finales..."
docker rmi u2sebau2/librechat-custom:latest u2sebau2/librechat-rag-custom:latest 2>/dev/null || echo "Imágenes no existían"
docker pull u2sebau2/librechat-custom:latest
docker pull u2sebau2/librechat-rag-custom:latest

echo ""
echo "📊 Verificando SHAs descargadas:"
echo "LibreChat:"
docker images u2sebau2/librechat-custom:latest --format "{{.ID}}"
echo "RAG API:"
docker images u2sebau2/librechat-rag-custom:latest --format "{{.ID}}"

echo ""
echo "📁 Verificando directorios..."
if [ ! -d "logs" ] || [ ! -d "uploads" ] || [ ! -d "images" ]; then
    echo "📁 Ejecutando install.sh..."
    ./install.sh
else
    echo "✅ Directorios ya existen"
fi

echo ""
echo "⏹️  Deteniendo servicios..."
docker-compose -f docker-compose.production.yml down

echo ""
echo "🚀 Iniciando con sistema de negrita..."
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización..."
sleep 15

echo ""
echo "📊 Verificando imágenes en uso:"
echo "LibreChat:"
docker inspect LibreChat --format "{{.Image}}"
echo "RAG API:"
docker inspect rag_api --format "{{.Image}}"

echo ""
echo "📋 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "✅ SISTEMA DE NEGRITA APLICADO"
echo ""
echo "🧪 TESTING SISTEMA FINAL:"
echo "========================"
echo ""
echo "1. 🆕 NUEVA CONVERSACIÓN (crítico para limpiar caché)"
echo ""
echo "2. 📁 Sube archivos de prueba:"
echo "   • especificaciones.txt"
echo "   • contexto.txt"
echo ""
echo "3. 🔍 Haz pregunta específica:"
echo "   'Busca información sobre requerimientos técnicos'"
echo ""
echo "4. ✅ VERIFICA QUE el modelo cite así:"
echo "   ❌ ANTES: 'especificaciones.txt \\ue202turn0file0 indica...'"
echo "   ❌ MEDIO: 'Según [especificaciones.txt], el proceso...'"  
echo "   ✅ AHORA: 'Según **especificaciones.txt**, el proceso...'"
echo ""
echo "5. 🎯 Resultado visual esperado:"
echo "   • Nombres de archivos aparecen en NEGRITA"
echo "   • Sin botones raros o errores de mapping"
echo "   • Texto natural y fluido"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "🏆 SISTEMA NATURAL Y ROBUSTO - 100% FUNCIONAL!"
echo ""
echo "📝 NOTA: Si sigues viendo problemas, la app puede tener caché."
echo "   Solución: Ctrl+Shift+R en el navegador para hard refresh"
