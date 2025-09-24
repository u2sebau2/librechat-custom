# 📁 ESTRUCTURA FINAL DE CARPETAS

## ✅ Configuración Unificada y Simplificada

### 📊 Carpetas Compartidas:

```
librechat-custom/
├── logs/              # Logs de LibreChat
├── uploads/           # ✨ COMPARTIDA: LibreChat + RAG API
├── images/            # Imágenes de LibreChat  
├── data-node/         # Base de datos MongoDB
└── meili_data_v1.12/  # Índices de búsqueda Meilisearch
```

### 🎯 Beneficios de compartir `uploads/`:
- ✅ Una sola carpeta para administrar
- ✅ Archivos accesibles por ambos servicios
- ✅ Menos permisos que configurar
- ✅ Más simple y lógico

## 🐳 Configuración en docker-compose.production.yml:

```yaml
api:  # LibreChat
  volumes:
    - ./uploads:/app/uploads      # ← Monta uploads

rag_api:
  volumes:
    - ./uploads:/app/uploads      # ← MISMA carpeta uploads
```

## 🔧 Permisos (una sola vez):

```bash
# El script install.sh hace todo automáticamente:
./install.sh

# O manualmente:
sudo mkdir -p logs uploads images data-node meili_data_v1.12
sudo chmod -R 777 logs uploads images data-node meili_data_v1.12
```

## 📋 Resumen de Volúmenes:

| Servicio | Volumen Local | Volumen Contenedor | Compartido |
|----------|--------------|-------------------|------------|
| LibreChat | `./logs` | `/app/api/logs` | No |
| LibreChat | `./uploads` | `/app/uploads` | **SÍ** ✅ |
| LibreChat | `./images` | `/app/client/public/images` | No |
| RAG API | `./uploads` | `/app/uploads` | **SÍ** ✅ |
| MongoDB | `./data-node` | `/data/db` | No |
| Meilisearch | `./meili_data_v1.12` | `/meili_data` | No |
| VectorDB | `pgdata2` (volumen Docker) | `/var/lib/postgresql/data` | No |

## ✨ Estado Final:

- **5 carpetas locales** en total (no 6)
- **uploads/** compartida entre LibreChat y RAG API
- **Todos con permisos 777** para evitar problemas
- **Datos persistentes** aunque elimines contenedores
- **Configuración más simple** y fácil de mantener

---
**CONFIGURACIÓN DEFINITIVA Y OPTIMIZADA** 🏆
