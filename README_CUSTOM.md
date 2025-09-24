# LibreChat Custom - Versión Personalizada

Versión personalizada de LibreChat con modificaciones específicas y todo pre-compilado.

## 🚀 Instalación Rápida

### 1. Clonar repositorio
```bash
git clone https://github.com/TU_USUARIO/librechat-custom.git
cd librechat-custom
```

### 2. Configurar .env
```bash
cp .env.example .env
# Editar .env con tus claves API
```

### 3. Levantar servicios
```bash
docker-compose -f docker-compose.production.yml up -d
```

La aplicación estará en `http://localhost:3080`

## 📋 Características

- Frontend pre-compilado
- Integración Amazon Bedrock (Nova Canvas)
- RAG API con búsqueda híbrida  
- Módulo administración de conversaciones
- Interfaz en español
- Optimizaciones de rendimiento

## 🐳 Comandos Docker

```bash
# Ver logs
docker-compose -f docker-compose.production.yml logs -f

# Detener
docker-compose -f docker-compose.production.yml down

# Reconstruir
docker-compose -f docker-compose.production.yml build --no-cache
```

## 📁 Estructura
- `api/` - Backend modificado
- `client/dist/` - Frontend compilado
- `rag_api/` - API RAG personalizada
- `docker-compose.production.yml` - Config Docker
- `librechat.yaml` - Config LibreChat

## ⚠️ Importante
- Configurar `.env` antes de iniciar
- Hacer backup de: `data-node/`, `uploads/`
- Puerto por defecto: 3080
