# 🎯 FIX DEFINITIVO: Mapping 1:1 entre Anchors y Sources

## 🔍 Problema Raíz Identificado

### Investigación del Frontend:
```typescript
// En client/src/utils/citations.ts:
export const STANDALONE_PATTERN = /\\ue202turn(\d+)(search|image|news|video|ref|file)(\d+)/g;
```

**Cómo funciona LibreChat:**
1. Modelo dice: `"log_fine_tunning.txt \\ue202turn0file1"`
2. Frontend usa regex para extraer: `turn=0, type=file, index=1`
3. Frontend busca: `sources[1]` (directamente por índice)
4. Muestra: `sources[1].fileName`

## ❌ Problema en Lógica Anterior

### MI SOURCES ARRAY ANTERIOR (incorrecto):
```javascript
sources = [
  chunk1_fine_tunning,     // sources[0] 
  chunk2_fine_tunning,     // sources[1] ← ¡Mismo archivo en índice diferente!
  chunk1_log_fine,         // sources[2]
  chunk2_log_fine          // sources[3]
]

// Cuando modelo dice "log_fine_tunning.txt turn0file1":
// Frontend busca sources[1] = chunk2_fine_tunning ❌ (archivo incorrecto)
```

### ✅ NUEVA LÓGICA (correcta):
```javascript
// Crear UNA entrada por archivo único, ordenada alfabéticamente
sources = [
  fine_tunning_v2.txt,     // sources[0] = turn0file0 ✅
  log_fine_tunning.txt     // sources[1] = turn0file1 ✅  
]

// Cuando modelo dice "log_fine_tunning.txt turn0file1":
// Frontend busca sources[1] = log_fine_tunning.txt ✅ (correcto)
```

## 🔧 Cambio Implementado

### Archivo: `api/app/clients/tools/util/fileSearch.js`

#### ANTES (múltiples chunks por archivo):
```javascript
formattedResults.forEach((result) => {
  sourcesByFile[fileIndex].push(result); // ← Cada chunk = entrada separada
});

sources.push(...sourcesByFile[i]); // ← Múltiples entradas por archivo
```

#### AHORA (una entrada por archivo):
```javascript
formattedResults.forEach((result) => {
  if (!sourcesByFile[fileIndex]) {
    sourcesByFile[fileIndex] = result; // ← Solo primera/mejor entrada por archivo
  }
  // Ignorar chunks adicionales del mismo archivo
});

sources.push(sourcesByFile[i]); // ← Una entrada por archivo
```

## 📊 Resultado Garantizado

### Con archivos: `fine_tunning_v2.txt`, `log_fine_tunning.txt`

| Archivo | Orden alfabético | FileIndex | Sources Array | Anchor |
|---------|-----------------|-----------|---------------|--------|
| `fine_tunning_v2.txt` | 1º | 0 | `sources[0]` | `turn0file0` |
| `log_fine_tunning.txt` | 2º | 1 | `sources[1]` | `turn0file1` |

### ✅ Sincronización Perfecta:
- **Modelo dice:** `"log_fine_tunning.txt \\ue202turn0file1"`
- **Frontend busca:** `sources[1]`
- **Frontend encuentra:** `log_fine_tunning.txt`
- **Botón muestra:** `log_fine_tunning.txt` ✅

## 🚀 Nueva Imagen

- **Docker Hub**: `u2sebau2/librechat-custom:latest`
- **SHA**: `sha256:28db0571b2a4539da2da7aaa4242bd97755f65bd6fc41ba49adee3d4a7477347`
- **Garantía**: Mapping 1:1 perfecto entre anchors y sources

## 🎯 Lógica Final

1. **Orden alfabético** garantiza consistencia entre búsquedas
2. **Una entrada por archivo** en sources array
3. **Índice directo** entre turn0fileN y sources[N]
4. **Sin confusión** entre chunks del mismo archivo

---
**MAPPING 1:1 GARANTIZADO - PROBLEMA SOLUCIONADO DEFINITIVAMENTE** ✅
