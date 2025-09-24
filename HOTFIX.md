# 🔧 HOTFIX: librechat.yaml

## ✅ Problema corregido:
El campo `defaultModel` no es válido en el nivel superior del archivo `librechat.yaml`.

## 📝 Cambios realizados:

### ❌ Antes (INCORRECTO):
```yaml
defaultModel:
  endpoint: "bedrock"
  model: "us.anthropic.claude-sonnet-4-20250514-v1:0"
```

### ✅ Después (CORRECTO):
```yaml
endpoints:
  bedrock:
    models:
      default: ["us.anthropic.claude-sonnet-4-20250514-v1:0"]
      fetch: false
```

## 🚀 Actualización completada:

1. **GitHub**: Código actualizado ✅
2. **Docker Hub**: Imagen reconstruida y subiendo ✅

## 📦 Para aplicar la corrección:

### Si ya tienes el sistema corriendo:
```bash
# Opción 1: Solo actualizar el archivo
cd librechat-custom
git pull
docker-compose -f docker-compose.production.yml restart api

# Opción 2: Actualizar imagen completa
docker pull u2sebau2/librechat-custom:latest
docker-compose -f docker-compose.production.yml up -d
```

### Si es instalación nueva:
```bash
git clone https://github.com/u2sebau2/librechat-custom.git
cd librechat-custom
cp env.example .env
# Editar .env
docker-compose -f docker-compose.production.yml up -d
```

## ⚠️ Nota importante:
El archivo `librechat.yaml` ahora está correctamente estructurado y no debería mostrar errores de "Unrecognized key" al iniciar.
