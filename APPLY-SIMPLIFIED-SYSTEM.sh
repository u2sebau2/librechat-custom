#!/bin/bash

echo "🎯 APLICANDO SISTEMA DE CITAS SIMPLIFICADO"
echo "=========================================="
echo ""

echo "🔄 CAMBIO FUNDAMENTAL:"
echo "❌ ANTES: Anchors complejos \\ue202turn0file0, \\ue202turn0file1"
echo "✅ AHORA: Markdown simple [filename.ext]"
echo ""

echo "📋 Ventajas del nuevo sistema:"
echo "  • ✅ Más natural: [especificaciones.txt] en lugar de \\ue202turn0file0"
echo "  • ✅ Sin errores de mapping: Búsqueda directa por nombre de archivo"
echo "  • ✅ Sin problemas Unicode: Solo caracteres normales"
echo "  • ✅ Más robusto: No depende de orden específico"
echo "  • ✅ Fácil debugging: Se ve claramente qué archivo se cita"
echo ""

echo "📦 Nueva imagen:"
echo "  • SHA: 3660f4507119151147351e54b4374c181dbc16359e26408eef4595eb9a130e8b"
echo "  • Tag: u2sebau2/librechat-custom:latest"
echo ""

echo "🔄 Actualizando código..."
git pull

echo ""
echo "📥 Descargando imagen simplificada..."
docker rmi u2sebau2/librechat-custom:latest 2>/dev/null || echo "Imagen no existía"
docker pull u2sebau2/librechat-custom:latest

echo ""
echo "📊 Verificando SHA de imagen descargada:"
docker images u2sebau2/librechat-custom:latest --format "{{.ID}}"

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
echo "🚀 Iniciando con sistema simplificado..."
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización..."
sleep 15

echo ""
echo "📊 Verificando imagen en uso:"
docker inspect LibreChat --format "{{.Image}}"

echo ""
echo "📋 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "✅ SISTEMA SIMPLIFICADO APLICADO"
echo ""
echo "🧪 TESTING DEL NUEVO SISTEMA:"
echo "============================"
echo ""
echo "1. 🆕 NUEVA CONVERSACIÓN (muy importante)"
echo ""
echo "2. 📁 Sube archivos de prueba:"
echo "   • especificaciones.txt"
echo "   • contexto.txt"
echo ""
echo "3. 🔍 Haz pregunta específica:"
echo "   'Busca información sobre requerimientos en los archivos'"
echo ""
echo "4. ✅ VERIFICA QUE el modelo cite así:"
echo "   ❌ ANTES: 'especificaciones.txt \\ue202turn0file0 indica...'"
echo "   ✅ AHORA: 'Según [especificaciones.txt], los requerimientos...'"
echo ""
echo "5. 🎯 Resultado esperado:"
echo "   • Citas naturales en formato markdown"
echo "   • Botones clickeables en los nombres de archivos"
echo "   • Sin errores de mapping o referencias incorrectas"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "🏆 SISTEMA ROBUSTO Y SIMPLE IMPLEMENTADO!"
