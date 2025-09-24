# LibreChat Custom

Versión personalizada de LibreChat con frontend pre-compilado, búsqueda híbrida en español y optimizaciones de rendimiento.

## 🚀 Instalación en 3 pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/u2sebau2/librechat-custom.git
cd librechat-custom

# 2. Configurar
cp env.example .env
nano .env  # Editar con tus API keys

# 3. Iniciar
./APPLY-BOLD-SYSTEM.sh
```

**¡Listo!** Accede a `http://localhost:3080`

## 📋 Características

✅ **Pre-compilado** - Sin necesidad de `npm run frontend`  
✅ **Amazon Bedrock** - Integración completa con Nova Canvas  
✅ **RAG Híbrido** - Búsqueda semántica + BM25 en español  
✅ **Citas en negrita** - Referencias naturales **filename.ext**  
✅ **Interfaz español** - Completamente localizada  
✅ **Datos persistentes** - Logs, uploads, MongoDB en volúmenes locales  

## 🐳 Imágenes Docker

- `u2sebau2/librechat-custom:latest` - LibreChat completo
- `u2sebau2/librechat-rag-custom:latest` - RAG API con híbrido search

## 📊 Comandos útiles

```bash
# Ver logs
docker-compose -f docker-compose.production.yml logs -f

# Reiniciar servicios  
docker-compose -f docker-compose.production.yml restart

# Detener todo
docker-compose -f docker-compose.production.yml down
```

## 📁 Configuración

- **Puerto**: 3080 (configurable en `.env`)
- **Datos**: Carpetas `logs/`, `uploads/`, `images/`, `data-node/`
- **Config**: `librechat.yaml` (modelo Bedrock por defecto)

## 🔧 Mantenimiento

```bash
# Actualizar a nueva versión
git pull
docker pull u2sebau2/librechat-custom:latest  
docker pull u2sebau2/librechat-rag-custom:latest
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

---
**LibreChat Custom** - Listo para producción en minutos
