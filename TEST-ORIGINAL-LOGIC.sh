#!/bin/bash

echo "🎯 PROBANDO LÓGICA ORIGINAL RESTAURADA"
echo "====================================="
echo ""

echo "✅ Lógica actual:"
echo "  • Cada chunk = índice secuencial (0,1,2,3...)"
echo "  • turn0file0 → sources[0] (chunk más relevante)"
echo "  • turn0file1 → sources[1] (chunk segundo más relevante)"  
echo "  • Orden natural de relevancia (NO alfabético)"
echo ""

echo "📦 Nueva imagen:"
echo "  • SHA: 4b2c35f3a23a4e011c2bc6792034997d5dcc05474d8e31cec8a58d3f25f0d9ef"
echo "  • Lógica: Original simple + fix Unicode RAG"
echo ""

echo "🔄 Actualizando..."
git pull

echo ""
echo "📥 Descargando imagen nueva..."
docker rmi u2sebau2/librechat-custom:latest 2>/dev/null || echo "Imagen no existía"
docker pull u2sebau2/librechat-custom:latest

echo ""
echo "📊 Verificando SHA de imagen descargada:"
docker images u2sebau2/librechat-custom:latest --format "{{.ID}}"

echo ""
echo "⏹️  Reiniciando con imagen nueva..."
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización..."
sleep 10

echo ""
echo "📊 Verificando imagen en uso:"
docker inspect LibreChat --format "{{.Image}}"

echo ""
echo "📋 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "✅ LÓGICA ORIGINAL RESTAURADA"
echo ""
echo "🧪 TESTING RECOMENDADO:"
echo "======================"
echo ""
echo "1. 🆕 NUEVA CONVERSACIÓN (importante - no reutilizar anterior)"
echo ""
echo "2. 📁 Subir SOLO 2 archivos para test limpio:"
echo "   • fine_tunnning_v2.txt"  
echo "   • log_fine_tunning.txt"
echo ""
echo "3. 🔍 Pregunta específica:"
echo "   'Busca información sobre fine tuning en los archivos'"
echo ""
echo "4. ✅ Verificar mapping:"
echo "   • Primer resultado → turn0file0 → Debe coincidir con sources[0]"
echo "   • Segundo resultado → turn0file1 → Debe coincidir con sources[1]"
echo "   • Botones deben apuntar al archivo correcto mencionado en texto"
echo ""
echo "📝 El orden ahora es POR RELEVANCIA (no alfabético)"
echo "   → Si log_fine_tunning es más relevante, será turn0file0"
echo "   → Si fine_tunning_v2 es más relevante, será turn0file0"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "🎯 Esta lógica simple DEBE funcionar correctamente!"
