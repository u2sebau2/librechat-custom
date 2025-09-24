# 🐛 FIX CRÍTICO: Mapping de Sources para Anchors

## 🚨 Problema Más Complejo Detectado

### ❌ Síntomas:
- **Modelo escribía:** `log_fine_tunning.txt \\ue202turn0file0` ✅ (correcto)
- **Frontend mostraba:** Botón que dice `fine_tunnning_v2.txt` ❌ (archivo incorrecto)

### 🔍 Causa Raíz:

Había **DOS mappings diferentes** que no coincidían:

#### 1. Mapping para el TEXTO (anchor):
```javascript
const fileIndex = fileIndexMap[result.filename]; // Basado en archivo único
return `\\ue202turn0file${fileIndex}`;           // turn0file0, turn0file1...
```

#### 2. Mapping para el FRONTEND (sources array):
```javascript
const sources = formattedResults.map((result) => ({ // ❌ Índice secuencial
  fileName: result.filename,
  // sources[0], sources[1], sources[2]... (por orden de resultado)
}));
```

### 💥 Resultado:
- Modelo dice `turn0file0` (refiere a archivo con índice 0 según filename)
- Frontend usa `sources[0]` (primer resultado, puede ser cualquier archivo)

**Si el primer resultado era de archivo_B, el botón mostraba archivo_B aunque el modelo citara archivo_A**

## ✅ Solución Implementada

### Nuevo algoritmo en `fileSearch.js`:

```javascript
// 1. Crear mapa de archivos únicos (igual que antes)
const uniqueFiles = [...new Set(formattedResults.map(result => result.filename))];
const fileIndexMap = {
  "log_fine_tunning.txt": 0,
  "fine_tunnning_v2.txt": 1
};

// 2. Agrupar sources POR ÍNDICE DE ARCHIVO (nuevo)
const sourcesByFile = {};
formattedResults.forEach((result) => {
  const fileIndex = fileIndexMap[result.filename]; // 0 o 1
  if (!sourcesByFile[fileIndex]) sourcesByFile[fileIndex] = [];
  sourcesByFile[fileIndex].push(result);
});

// 3. Crear sources array ORDENADO por índice de archivo
const sources = [];
for (let i = 0; i < uniqueFiles.length; i++) {
  if (sourcesByFile[i]) {
    sources.push(...sourcesByFile[i]);
  }
}
```

### 🎯 Resultado:

| Anchor en texto | Posición en sources | Archivo mostrado |
|----------------|-------------------|-----------------|
| `turn0file0` | `sources[0-X]` | `log_fine_tunning.txt` ✅ |
| `turn0file1` | `sources[X+1-Y]` | `fine_tunnning_v2.txt` ✅ |

## 📊 Ejemplo Práctico

### Búsqueda devuelve:
```
Resultado 1: fine_tunnning_v2.txt (chunk 1)
Resultado 2: log_fine_tunning.txt (chunk 1)  
Resultado 3: fine_tunnning_v2.txt (chunk 2)
Resultado 4: log_fine_tunning.txt (chunk 2)
```

### ANTES (mapeo incorrecto):
```
Texto: "log_fine_tunning.txt \\ue202turn0file0"
Frontend: sources[0] = fine_tunnning_v2.txt ❌ (primer resultado)
```

### AHORA (mapeo correcto):
```
fileIndexMap = {
  "log_fine_tunning.txt": 0,
  "fine_tunnning_v2.txt": 1  
}

sourcesByFile = {
  0: [log_chunk1, log_chunk2],      # log_fine_tunning.txt
  1: [fine_chunk1, fine_chunk2]     # fine_tunnning_v2.txt
}

sources = [log_chunk1, log_chunk2, fine_chunk1, fine_chunk2]
          ^-- positions 0-1         ^-- positions 2-3

Texto: "log_fine_tunning.txt \\ue202turn0file0" 
Frontend: sources[0-1] = log_fine_tunning.txt ✅ (correcto)
```

## 🚀 Nueva Imagen

- **Docker Hub**: `u2sebau2/librechat-custom:latest`
- **SHA**: `sha256:8013b4aea29a6623f960b04cbc65e402723ab09ec52318601cd6ae1a16f63071`

## ✨ Beneficio Final

Ahora cuando el modelo dice:
> "Según log_fine_tunning.txt \\ue202turn0file0, el entrenamiento..."

El botón/enlace en el frontend efectivamente apunta a `log_fine_tunning.txt`, no a otro archivo aleatorio.

---
**MAPPING CORREGIDO - ANCHORS Y SOURCES SINCRONIZADOS** ✅
