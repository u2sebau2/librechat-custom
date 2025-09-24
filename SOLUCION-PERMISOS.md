# 🚨 SOLUCIÓN INMEDIATA - Error de Permisos

## El problema:
```
EACCES: permission denied, open '/app/api/logs/error-2025-09-24.log'
```

## ✅ Solución Rápida (hazlo YA):

Desde tu directorio `/mnt/data/libre2/librechat-custom`:

```bash
# 1. Crear directorios con permisos correctos
sudo mkdir -p logs uploads images
sudo chmod -R 777 logs uploads images

# 2. Reiniciar servicios
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d

# 3. Verificar logs
docker-compose -f docker-compose.production.yml logs -f api
```

## 🔧 Solución Permanente:

### Opción A: Actualizar y reconstruir (5 min)
```bash
# Actualizar código
git pull

# Reconstruir imagen con permisos corregidos
docker build -f Dockerfile.custom -t u2sebau2/librechat-custom:fixed .
docker tag u2sebau2/librechat-custom:fixed u2sebau2/librechat-custom:latest

# Reiniciar
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

### Opción B: Solo arreglar permisos locales (1 min)
```bash
# Script automático
chmod +x fix-permissions.sh
sudo ./fix-permissions.sh
```

## 📝 Explicación:

El contenedor necesita escribir en:
- `/app/api/logs` - Para logs de errores
- `/app/uploads` - Para archivos subidos
- `/app/client/public/images` - Para imágenes

Al no tener permisos, el servidor crashea inmediatamente.

## ✅ Verificación:

Si funciona correctamente verás:
```
LibreChat | Server listening on http://0.0.0.0:3080
```

En lugar de:
```
LibreChat exited with code 1
```
