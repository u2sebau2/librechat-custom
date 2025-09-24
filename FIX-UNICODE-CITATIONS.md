# 🐛 FIX: Caracteres Unicode de Citación en RAG API

## 🔍 Problema Identificado

Los caracteres Unicode especiales usados para las citas de LibreChat (`\ue202`, `\ue200`, `\ue201`) estaban siendo eliminados por la función de limpieza de texto en el RAG API modificado.

### Síntomas:
- ✅ La herramienta devolvía correctamente: `Anchor: \ue202turn0file0 (archivo.txt)`
- ❌ El modelo imprimía incorrectamente: `‹turn0file3›` (sin los caracteres Unicode)
- ✅ Funcionaba con la imagen oficial de RAG API
- ❌ NO funcionaba con la imagen custom

## 🛠️ Causa del Problema

En `rag_api/hybrid_search/hybrid_search.py`, la función `clean_query_text` tenía esta regex:

```python
# ANTES (eliminaba caracteres Unicode de citación):
cleaned = re.sub(r'[^a-zA-Z0-9áéíóúñüçÁÉÍÓÚÑÜÇ\s]', ' ', query)
```

Esta expresión regular eliminaba TODOS los caracteres que no fueran letras, números, caracteres españoles o espacios, incluyendo los caracteres Unicode especiales del rango Private Use Area (U+E200-U+E2FF) que LibreChat usa para las citas.

## ✅ Solución Aplicada

```python
# AHORA (preserva caracteres de citación):
cleaned = re.sub(r'[^a-zA-Z0-9áéíóúñüçÁÉÍÓÚÑÜÇ\s\uE200-\uE2FF]', ' ', query)
```

Agregamos el rango `\uE200-\uE2FF` a la regex para preservar los caracteres Unicode de citación.

## 📋 Archivos Modificados

- `rag_api/hybrid_search/hybrid_search.py` (línea 157)

## 🚀 Cómo Actualizar

```bash
# 1. Actualizar código
cd /path/to/librechat-custom
git pull

# 2. Descargar imagen actualizada
docker pull u2sebau2/librechat-rag-custom:latest

# 3. Reiniciar servicios
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d

# 4. Verificar que las citas funcionen
# Las citas ahora deberían aparecer correctamente como: \ue202turn0file0
```

## ✨ Resultado

Ahora las citas de archivos funcionan correctamente:
- **Antes**: `El documento dice... ‹turn0file3›` ❌
- **Después**: `El documento dice... \ue202turn0file3` ✅

Los caracteres Unicode se preservan y LibreChat puede mostrar las citas visuales correctamente en la interfaz.

## 🔍 Detalles Técnicos

Los caracteres Unicode en el rango U+E200-U+E2FF son parte del "Private Use Area" y LibreChat los usa específicamente para:
- `\ue200`: Inicio de grupo de citas
- `\ue201`: Fin de grupo de citas  
- `\ue202`: Marcador individual de cita

Este formato permite que la interfaz de LibreChat:
1. Identifique qué partes del texto son citas
2. Muestre enlaces visuales a los archivos fuente
3. Mantenga trazabilidad entre respuestas y documentos
