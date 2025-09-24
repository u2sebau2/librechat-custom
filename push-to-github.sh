#!/bin/bash

echo "🚀 Script para subir a GitHub"
echo "============================"
echo ""
echo "📝 Pasos:"
echo "1. Ve a https://github.com/new"
echo "2. Crea un repositorio llamado 'librechat-custom'"
echo "3. NO inicialices con README, .gitignore o licencia"
echo ""
echo "Presiona ENTER cuando hayas creado el repositorio..."
read

echo ""
echo "Configurando repositorio remoto..."
git remote add origin https://github.com/u2sebau2/librechat-custom.git

echo "Subiendo código a GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ ¡Listo! Tu código está en GitHub"
echo "🔗 URL: https://github.com/u2sebau2/librechat-custom"
echo ""
echo "📦 Las imágenes Docker ya están en Docker Hub:"
echo "  - u2sebau2/librechat-custom:latest"
echo "  - u2sebau2/librechat-rag-custom:latest"
