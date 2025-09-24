# ✅ SOLUCIÓN DEFINITIVA - LibreChat Custom

## 🎯 Configuración Final: Volúmenes Persistentes para TODOS los Ambientes

### 📋 Ejecuta estos comandos desde `/mnt/data/libre3/librechat-custom`:

```bash
# 1. Actualizar el código
git pull

# 2. Ejecutar instalador (crea carpetas con permisos)
chmod +x install.sh
./install.sh

# 3. Reiniciar servicios
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d

# 4. Verificar
docker logs -f LibreChat
```

## ✅ ¿Qué hace el install.sh?

1. Crea estas carpetas locales:
   - `logs/` - Logs de la aplicación
   - `uploads/` - Archivos subidos
   - `images/` - Imágenes
   - `data-node/` - Base de datos MongoDB
   - `meili_data_v1.12/` - Índices de búsqueda

2. Les da permisos 777 a todas

3. Copia env.example a .env si no existe

## 🚀 Estado Final:

- ✅ **Volúmenes persistentes** configurados para todos los ambientes
- ✅ **Permisos** manejados automáticamente por install.sh
- ✅ **Datos persistentes** aunque elimines contenedores
- ✅ **Sin errores** de permisos
- ✅ **Fácil backup** - solo respalda las carpetas locales

## 📊 Estructura Final:
```
librechat-custom/
├── docker-compose.production.yml  # Con volúmenes activados
├── install.sh                     # Script de instalación
├── logs/                          # 📁 Persistente (creado por install.sh)
├── uploads/                       # 📁 Persistente (creado por install.sh)
├── images/                        # 📁 Persistente (creado por install.sh)
├── data-node/                     # 📁 MongoDB persistente
└── meili_data_v1.12/             # 📁 Búsquedas persistentes
```

## 🔍 Comandos Útiles:

```bash
# Ver logs en tiempo real
docker logs -f LibreChat

# Ver estado de servicios
docker-compose -f docker-compose.production.yml ps

# Reiniciar un servicio específico
docker-compose -f docker-compose.production.yml restart api

# Backup de datos
tar -czf backup-$(date +%Y%m%d).tar.gz logs/ uploads/ images/ data-node/
```

## ⚠️ Importante:

- Los volúmenes **YA ESTÁN ACTIVOS** en docker-compose.production.yml
- Las carpetas se crean con **install.sh** (solo primera vez)
- Si cambias de servidor, copia las carpetas de datos
- Para desarrollo local: mismo proceso, funciona igual

## 🎯 GitHub Actualizado:
https://github.com/u2sebau2/librechat-custom

---
**La configuración está COMPLETA y DEFINITIVA** ✅
