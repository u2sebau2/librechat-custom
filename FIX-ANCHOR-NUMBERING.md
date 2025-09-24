# 🔧 FIX: Numeración Correcta de Anchors por Archivo

## 🐛 Problema Original

Los anchors de citación se numeraban secuencialmente por chunk en lugar de por archivo único:

### ❌ ANTES (problema):
```
Búsqueda retorna:
- Chunk 1 de log_fine_tunning.txt     → Anchor: \ue202turn0file0
- Chunk 2 de log_fine_tunning.txt     → Anchor: \ue202turn0file1 ❌
- Chunk 1 de fine_tunnning_v2.txt     → Anchor: \ue202turn0file2 ❌  
- Chunk 2 de fine_tunnning_v2.txt     → Anchor: \ue202turn0file3 ❌
```

**Resultado**: Cada chunk tenía un número diferente, aunque fuera del mismo archivo.

### ✅ DESPUÉS (correcto):
```
Búsqueda retorna:
- Chunk 1 de log_fine_tunning.txt     → Anchor: \ue202turn0file0 ✅
- Chunk 2 de log_fine_tunning.txt     → Anchor: \ue202turn0file0 ✅
- Chunk 1 de fine_tunnning_v2.txt     → Anchor: \ue202turn0file1 ✅
- Chunk 2 de fine_tunnning_v2.txt     → Anchor: \ue202turn0file1 ✅
```

**Resultado**: Todos los chunks del mismo archivo comparten el mismo número de archivo.

## 🔧 Cambio Aplicado

### Archivo: `/api/app/clients/tools/util/fileSearch.js`

#### ANTES:
```javascript
// Numeración secuencial por resultado
const formattedString = formattedResults
.map((result, index) => {
  // index = 0,1,2,3... (cada resultado tiene número diferente)
  return `Anchor: \\ue202turn0file${index}`;
})
```

#### DESPUÉS:
```javascript
// Crear mapa de archivos únicos
const uniqueFiles = [...new Set(formattedResults.map(result => result.filename))];
const fileIndexMap = {};
uniqueFiles.forEach((filename, index) => {
  fileIndexMap[filename] = index;
});

// Numeración por archivo único
const formattedString = formattedResults
.map((result) => {
  const fileIndex = fileIndexMap[result.filename]; // Número del archivo único
  return `Anchor: \\ue202turn0file${fileIndex}`;
})
```

## ✨ Beneficios

1. **Consistencia**: Todos los chunks del mismo archivo tienen el mismo anchor
2. **Claridad**: Más fácil identificar de qué archivo viene cada cita  
3. **UX mejorada**: Las citas en la interfaz se agrupan lógicamente por archivo
4. **Compatibilidad**: Sin cambios en otras funcionalidades

## 🚀 Nueva Imagen

- **Docker Hub**: `u2sebau2/librechat-custom:latest`
- **SHA**: `sha256:b6821426a3f6151f3c47e3357051e395652f37dd17901873910fe468af08c589`
- **Incluye**: Fix de numeración de anchors + todos los cambios anteriores

## 📊 Ejemplo de Uso

Cuando subes dos archivos y haces una búsqueda:

```
Archivo A: manual.pdf
Archivo B: tutorial.docx

Resultados:
- 3 chunks de manual.pdf    → Todos con turn0file0
- 2 chunks de tutorial.docx → Todos con turn0file1
```

En lugar de:
```
- 3 chunks de manual.pdf    → turn0file0, turn0file1, turn0file2
- 2 chunks de tutorial.docx → turn0file3, turn0file4
```

## ⚠️ Nota sobre "turn0"

El "0" en "turn0file" actualmente está hardcodeado y no cambia dinámicamente por turno de conversación. Este fix solo corrige la numeración de archivos después de "file".

---
**CAMBIO APLICADO Y FUNCIONAL** ✅
