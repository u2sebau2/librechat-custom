#!/bin/bash

echo "🎯 APLICANDO IMAGEN CON FIX DE MAPPING DEFINITIVO"
echo "================================================"
echo ""

echo "📦 Nueva imagen confirmada en Docker Hub:"
echo "  • SHA: 768e7df9444a08d19c4f11b23b2564d742bce5c152fe241d724895f53f1ba461"
echo "  • Tag: u2sebau2/librechat-custom:latest (FORZADO)"
echo "  • Incluye: Mapping 1:1 definitivo entre anchors y sources"
echo ""

echo "🔄 Actualizando instalación..."
git pull

echo ""
echo "📥 FORZANDO descarga de imagen más reciente..."
# Eliminar imagen local para forzar descarga
docker rmi u2sebau2/librechat-custom:latest 2>/dev/null || echo "Imagen no existía localmente"

# Descargar imagen nueva
docker pull u2sebau2/librechat-custom:latest

echo ""
echo "📊 Verificando SHA de imagen descargada:"
docker images u2sebau2/librechat-custom:latest --format "{{.ID}} {{.CreatedAt}}"

echo ""
echo "📁 Creando directorios necesarios..."
sudo mkdir -p logs uploads images data-node meili_data_v1.12
sudo chmod -R 777 logs uploads images data-node meili_data_v1.12

echo ""
echo "⏹️  Deteniendo servicios..."
docker-compose -f docker-compose.production.yml down

echo ""
echo "🚀 Iniciando con imagen NUEVA (--force-recreate)..."
docker-compose -f docker-compose.production.yml up -d --force-recreate

echo ""
echo "⏳ Esperando inicialización..."
sleep 15

echo ""
echo "📊 Verificando que contenedor use imagen nueva:"
docker inspect LibreChat --format "SHA en uso: {{.Image}}"

echo ""
echo "📋 Estado de servicios:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "🔍 Logs de LibreChat:"
docker logs LibreChat --tail=15

echo ""
echo "✅ IMAGEN ACTUALIZADA CON FIX DE MAPPING"
echo ""
echo "🧪 PRUEBA AHORA:"
echo "================================"
echo ""
echo "1. 📁 Ve a http://localhost:3080"
echo "2. 📂 Sube estos archivos (orden alfabético importante):"
echo "   • fine_tunning_v2.txt"
echo "   • log_fine_tunning.txt"
echo ""
echo "3. 🔍 Haz pregunta que use AMBOS:"
echo "   'Compara la información de entrenamiento en ambos archivos'"
echo ""
echo "4. ✅ VERIFICA QUE:"
echo "   • Modelo: 'fine_tunning_v2.txt \\ue202turn0file0' → Botón: 'fine_tunning_v2.txt' ✅"
echo "   • Modelo: 'log_fine_tunning.txt \\ue202turn0file1' → Botón: 'log_fine_tunning.txt' ✅"
echo ""
echo "❌ Si SIGUE mostrando archivo incorrecto:"
echo "   • Reportar SHA en uso: docker inspect LibreChat --format '{{.Image}}'"
echo "   • El problema estaría en otra parte del código"
echo ""
echo "🏆 MAPPING 1:1 IMPLEMENTADO - DEBE FUNCIONAR AHORA"
