// Patch v4 para agregar soporte REAL de citations en @langchain/aws
// Mantiene la estructura de las citas sin convertirlas a texto plano

const fs = require('fs');
const path = require('path');

const COMMON_JS_PATH = '/app/node_modules/@langchain/aws/dist/common.js';
const COMMON_CJS_PATH = '/app/node_modules/@langchain/aws/dist/common.cjs';

function createCitationHandler(isCommonJS = false) {
  // Usar sintaxis correcta según el tipo de módulo
  const ChatGenerationChunk = isCommonJS ? 'outputs_1.ChatGenerationChunk' : 'ChatGenerationChunk';
  const AIMessageChunk = isCommonJS ? 'messages_1.AIMessageChunk' : 'AIMessageChunk';
  
  return `    else if (contentBlockDelta.delta.citation) {
        // Handle citation content blocks from Bedrock (Citation Patch v4 - Structured)
        const citation = contentBlockDelta.delta.citation;
        console.log('[LANGCHAIN-AWS-PATCH-V4] Citation block detected - preserving structure');
        
        // Crear un content block estructurado para la cita
        const citationContent = {
            type: 'citation',
            citation: citation
        };
        
        // Devolver el chunk con la estructura de cita preservada
        return new ${ChatGenerationChunk}({
            text: '', // No convertir a texto, mantener vacío
            message: new ${AIMessageChunk}({
                content: [citationContent], // Pasar como content estructurado
                response_metadata: {
                    citation: citation,
                    contentType: 'citation'
                }
            }),
        });
    }`;
}

function patchSingleFile(filePath, fileType) {
  console.log(`[CITATION-PATCH-V4] Processing ${fileType}...`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`[CITATION-PATCH-V4] File ${filePath} not found, skipping...`);
    return false;
  }
  
  const originalContent = fs.readFileSync(filePath, 'utf8');
  
  // Verificar si ya está patcheado con v4
  if (originalContent.includes('Citation Patch v4')) {
    console.log(`[CITATION-PATCH-V4] ${fileType} already patched v4, skipping...`);
    return true;
  }
  
  // Si tiene patch anterior, removerlo primero
  if (originalContent.includes('Citation Patch v') && !originalContent.includes('Citation Patch v4')) {
    console.log(`[CITATION-PATCH-V4] Removing previous patch from ${fileType}...`);
    // Buscar backups previos
    for (let i = 3; i >= 1; i--) {
      const backupPath = `${filePath}.backup-v${i}`;
      if (fs.existsSync(backupPath)) {
        const backupContent = fs.readFileSync(backupPath, 'utf8');
        fs.writeFileSync(filePath, backupContent);
        console.log(`[CITATION-PATCH-V4] Restored ${fileType} from backup v${i}`);
        break;
      }
    }
  }
  
  // Crear backup v4
  const backupPath = `${filePath}.backup-v4`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log(`[CITATION-PATCH-V4] Backup v4 created: ${backupPath}`);
  }
  
  // Leer contenido actualizado
  const contentToModify = fs.readFileSync(filePath, 'utf8');
  
  // Buscar la estructura exacta que necesitamos reemplazar
  const targetPattern = /(\s+else\s*\{\s*throw new Error\(`Unsupported content block type\(s\): \$\{JSON\.stringify\(contentBlockDelta\.delta, null, 2\)\}`\);\s*\})/;
  
  const match = contentToModify.match(targetPattern);
  if (!match) {
    console.error(`[CITATION-PATCH-V4] No se encontró el patrón target en ${fileType}`);
    return false;
  }
  
  console.log(`[CITATION-PATCH-V4] Pattern found in ${fileType}, applying structured patch...`);
  
  // Crear el handler de citation con sintaxis correcta
  const isCommonJS = fileType.includes('.cjs');
  const citationHandler = createCitationHandler(isCommonJS);
  
  // Reemplazar de manera precisa
  const modifiedContent = contentToModify.replace(
    match[1],
    `${citationHandler}
    else {
        throw new Error(\`Unsupported content block type(s): \${JSON.stringify(contentBlockDelta.delta, null, 2)}\`);
    }`
  );
  
  // Validar que el contenido modificado es válido
  if (!modifiedContent.includes('Citation Patch v4')) {
    console.error(`[CITATION-PATCH-V4] Patch validation failed for ${fileType}`);
    return false;
  }
  
  // Escribir el archivo modificado
  fs.writeFileSync(filePath, modifiedContent);
  console.log(`[CITATION-PATCH-V4] Successfully patched ${fileType} with structured citation support`);
  
  return true;
}

function verifyPatch() {
  let verifiedCount = 0;
  
  [
    { path: COMMON_JS_PATH, name: 'common.js' },
    { path: COMMON_CJS_PATH, name: 'common.cjs' }
  ].forEach(({ path: filePath, name }) => {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasCitationSupport = content.includes('Citation Patch v4');
      console.log(`[CITATION-PATCH-V4] Verification ${name}:`, hasCitationSupport ? 'SUCCESS (Structured)' : 'FAILED');
      if (hasCitationSupport) verifiedCount++;
    }
  });
  
  return verifiedCount;
}

// Ejecutar el patch v4
try {
  console.log('[CITATION-PATCH-V4] Starting enhanced STRUCTURED citation patch v4...');
  console.log('[CITATION-PATCH-V4] This patch preserves citation structure for proper frontend rendering');
  
  let patchedCount = 0;
  
  // Patch common.js (ES modules)
  if (patchSingleFile(COMMON_JS_PATH, 'common.js')) {
    patchedCount++;
  }
  
  // Patch common.cjs (CommonJS)
  if (patchSingleFile(COMMON_CJS_PATH, 'common.cjs')) {
    patchedCount++;
  }
  
  const verifiedCount = verifyPatch();
  
  console.log(`[CITATION-PATCH-V4] Patch completed! Files patched: ${patchedCount}, Verified: ${verifiedCount}`);
  console.log('[CITATION-PATCH-V4] Citations will now maintain their structure for proper display');
  
  if (verifiedCount === 0) {
    console.error('[CITATION-PATCH-V4] ERROR: No files were successfully patched!');
    process.exit(1);
  }
  
} catch (error) {
  console.error('[CITATION-PATCH-V4] Error applying patch:', error.message);
  console.error('[CITATION-PATCH-V4] Stack:', error.stack);
  process.exit(1);
}
