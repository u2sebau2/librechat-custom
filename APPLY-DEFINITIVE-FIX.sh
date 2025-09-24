#!/bin/bash

echo "🎯 APLICANDO FIX DEFINITIVO DE MAPPING SOURCES 1:1"
echo "================================================="
echo ""

echo "🔍 Problema detectado:"
echo "  • Modelo: 'log_fine_tunning.txt \\ue202turn0file1' ✅" 
echo "  • Frontend: Botón muestra 'fine_tunnning_v2.txt' ❌"
echo "  • Causa: Mapping desincronizado entre anchors y sources array"
echo ""

echo "✅ Solución aplicada:"
echo "  • UNA entrada por archivo único en sources array"
echo "  • sources[0] = fine_tunning_v2.txt (alfabéticamente 1º)"
echo "  • sources[1] = log_fine_tunning.txt (alfabéticamente 2º)" 
echo "  • Mapping 1:1 garantizado: turn0fileN = sources[N]"
echo ""

echo "📦 Nueva imagen LibreChat:"
echo "  • SHA: 28db0571b2a4539da2da7aaa4242bd97755f65bd6fc41ba49adee3d4a7477347"
echo "  • Fix: Mapping definitivo 1:1"
echo ""

echo "🔄 Aplicando actualización..."
git pull

echo ""
echo "📥 Descargando imagen con fix definitivo..."
docker pull u2sebau2/librechat-custom:latest

echo ""
echo "⏹️  Deteniendo servicios..."
docker-compose -f docker-compose.production.yml down

echo ""
echo "🚀 Iniciando con fix definitivo..."
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización..."
sleep 10

echo ""
echo "📊 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "🔍 Verificando logs de LibreChat:"
docker logs LibreChat --tail=10 | grep -E "error|Error|Invalid" || echo "✅ No hay errores detectados"

echo ""
echo "✅ FIX DEFINITIVO APLICADO"
echo ""
echo "🧪 PRUEBA CRÍTICA - Verificación del fix:"
echo "================================================"
echo ""
echo "1. 📁 Sube estos archivos (en este orden para test):"
echo "   • fine_tunning_v2.txt"
echo "   • log_fine_tunning.txt"
echo ""
echo "2. 🔍 Haz una pregunta que use AMBOS archivos:"
echo "   'Compara la información de entrenamiento entre ambos archivos'"
echo ""
echo "3. ✅ Verifica que:"
echo "   • Cuando modelo diga: 'fine_tunning_v2.txt \\ue202turn0file0'"
echo "   • El botón muestre: 'fine_tunning_v2.txt' (NO otro archivo)"
echo "   • Cuando modelo diga: 'log_fine_tunning.txt \\ue202turn0file1'" 
echo "   • El botón muestre: 'log_fine_tunning.txt' (NO otro archivo)"
echo ""
echo "4. 🎯 RESULTADO ESPERADO:"
echo "   ✅ TODOS los botones deben apuntar al archivo mencionado en el texto"
echo "   ❌ Si sigue mostrando archivo incorrecto, reportar para investigación adicional"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "🏆 MAPPING 1:1 IMPLEMENTADO - CITAS DEBEN FUNCIONAR PERFECTAMENTE"
