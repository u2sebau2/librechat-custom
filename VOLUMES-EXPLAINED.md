# 📁 Explicación de Volúmenes en LibreChat Custom

## 🤔 ¿Por qué el error de permisos?

### La imagen Docker YA tiene los directorios con permisos correctos:
```dockerfile
RUN mkdir -p /app/api/logs /app/uploads /app/client/public/images && \
    chmod -R 777 /app/api/logs /app/uploads /app/client/public/images
```

### PERO...
Cuando montas volúmenes locales en `docker-compose.yml`:
```yaml
volumes:
  - ./logs:/app/api/logs  # ⚠️ REEMPLAZA el directorio de la imagen
```

**El directorio local SOBRESCRIBE el directorio de la imagen!**

## 📋 Tienes 2 opciones:

### Opción 1: SIN volúmenes persistentes (más simple) ✅
```bash
# Usar docker-compose.production.yml (volúmenes comentados)
docker-compose -f docker-compose.production.yml up -d
```

**Ventajas:**
- No hay errores de permisos
- Funciona inmediatamente
- Los permisos ya están configurados

**Desventajas:**
- Los logs/uploads se pierden si eliminas el contenedor
- No puedes acceder fácilmente a los archivos desde el host

### Opción 2: CON volúmenes persistentes (recomendado para producción) 💾
```bash
# Primero crear carpetas con permisos
sudo mkdir -p logs uploads images
sudo chmod -R 777 logs uploads images

# Usar versión con volúmenes
docker-compose -f docker-compose.production-with-volumes.yml up -d
```

**Ventajas:**
- Datos persistentes
- Acceso directo a logs desde el host
- Backups más fáciles

**Desventajas:**
- Requiere crear carpetas manualmente
- Posibles problemas de permisos

## 🔧 Script automático para Opción 2:
```bash
#!/bin/bash
# Crear todas las carpetas necesarias con permisos
for dir in logs uploads images data-node meili_data; do
    sudo mkdir -p $dir
    sudo chmod -R 777 $dir
done

# Iniciar con volúmenes
docker-compose -f docker-compose.production-with-volumes.yml up -d
```

## 🎯 Recomendación:

- **Para desarrollo/testing**: Usa sin volúmenes (Opción 1)
- **Para producción**: Usa con volúmenes + script de permisos (Opción 2)

## 💡 ¿Por qué pasa esto?

Docker tiene esta peculiaridad:
1. Los volúmenes bind (`./local:/container`) tienen prioridad sobre el contenido del contenedor
2. Si la carpeta local no existe, Docker la crea pero con permisos root
3. El proceso dentro del contenedor (usuario `node`) no puede escribir en carpetas de root

Por eso la imagen puede tener permisos perfectos, pero si montas un volumen local sin permisos, falla.
