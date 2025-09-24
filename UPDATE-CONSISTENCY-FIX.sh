#!/bin/bash

echo "🎯 ACTUALIZACIÓN FINAL: FIX DE CONSISTENCIA + CONFIGURACIÓN DEFAULTMODEL"
echo "========================================================================"
echo ""

echo "🔧 Cambios aplicados en esta actualización:"
echo ""
echo "1. 📊 FIX DE CONSISTENCIA EN ANCHORS:"
echo "   ✅ Orden alfabético para mapping de archivos"
echo "   ✅ fine_tunning_v2.txt = SIEMPRE turn0file0"
echo "   ✅ log_fine_tunning.txt = SIEMPRE turn0file1"
echo "   ✅ No más cambios de numeración entre búsquedas"
echo ""

echo "2. ⚙️ CAMBIO EN LIBRECHAT.YAML:"
echo "   ✅ De: endpoints.bedrock.models.default"
echo "   ✅ A: defaultModel.endpoint + defaultModel.model"
echo "   ⚠️  NOTA: Esta configuración anteriormente causó error"
echo "      Si falla, revisar logs de LibreChat al iniciar"
echo ""

echo "📦 Nueva imagen LibreChat:"
echo "  • SHA: e0e15547d34cd03af3a6f9d7a8dee337c7a30b9db825335ade639c140b75ccc2"
echo "  • Incluye: Fix de consistencia + nueva configuración"
echo ""

echo "🔄 Actualizando sistema..."
git pull

echo ""
echo "📥 Descargando imagen actualizada..."
docker pull u2sebau2/librechat-custom:latest

echo ""
echo "📁 Verificando directorios..."
if [ ! -d "logs" ] || [ ! -d "uploads" ] || [ ! -d "images" ]; then
    echo "📁 Ejecutando install.sh para crear directorios..."
    ./install.sh
else
    echo "✅ Directorios ya existen"
fi

echo ""
echo "⏹️  Deteniendo servicios..."
docker-compose -f docker-compose.production.yml down

echo ""
echo "🚀 Iniciando con imagen actualizada..."
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización (15 segundos)..."
sleep 15

echo ""
echo "📊 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "🔍 Verificando logs de LibreChat (buscando errores de configuración):"
docker logs LibreChat --tail=20 | grep -E "error|Error|ERROR|Invalid|Unrecognized" || echo "✅ No hay errores de configuración"

echo ""
echo "📋 Logs generales de LibreChat:"
docker logs LibreChat --tail=10

echo ""
echo "✅ ACTUALIZACIÓN COMPLETA"
echo ""
echo "⚠️  IMPORTANTE - Verificar configuración:"
echo "  • Si ves 'Server listening on http://0.0.0.0:3080' → ✅ OK"
echo "  • Si ves 'Unrecognized key defaultModel' → ❌ Revertir configuración"
echo ""
echo "🧪 Para probar consistencia de anchors:"
echo "  1. Sube los mismos archivos varias veces"
echo "  2. Haz búsquedas diferentes sobre el mismo contenido"
echo "  3. Verifica que:"
echo "     ✅ fine_tunning_v2.txt SIEMPRE sea turn0file0"
echo "     ✅ log_fine_tunning.txt SIEMPRE sea turn0file1"
echo "     ✅ Los botones apunten al archivo correcto"
echo ""
echo "🌐 Accede a LibreChat: http://localhost:3080"
echo ""
echo "🏆 ¡Mapping consistente implementado!"
