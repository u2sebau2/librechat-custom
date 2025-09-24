require('events').EventEmitter.defaultMaxListeners = 100;
const crypto = require('crypto');
const fs = require('fs');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { logger } = require('@librechat/data-schemas');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { getBufferString, HumanMessage } = require('@langchain/core/messages');
const {
  sendEvent,
  createRun,
  Tokenizer,
  checkAccess,
  resolveHeaders,
  getBalanceConfig,
  memoryInstructions,
  formatContentStrings,
    createMemoryProcessor,
} = require('@librechat/api');
const {
  Callback,
  Providers,
  GraphEvents,
  TitleMethod,
  formatMessage,
    formatAgentMessages,
      getTokenCountForMessage,
      createMetadataAggregator,
} = require('@librechat/agents');
const {
  Constants,
  Permissions,
  VisionModes,
  ContentTypes,
  EModelEndpoint,
  PermissionTypes,
  isAgentsEndpoint,
  AgentCapabilities,
  bedrockInputSchema,
  removeNullishValues,
} = require('librechat-data-provider');
const { addCacheControl, createContextHandlers } = require('~/app/clients/prompts');
const { initializeAgent } = require('~/server/services/Endpoints/agents/agent');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { getFormattedMemories, deleteMemory, setMemory } = require('~/models');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { getProviderConfig } = require('~/server/services/Endpoints');
const { checkCapability } = require('~/server/services/Config');
const BaseClient = require('~/app/clients/BaseClient');
const { getRoleByName } = require('~/models/Role');
const { loadAgent } = require('~/models/Agent');
const { getMCPManager } = require('~/config');

const omitTitleOptions = new Set([
  'stream',
  'thinking',
  'streaming',
  'clientOptions',
  'thinkingConfig',
  'thinkingBudget',
  'includeThoughts',
  'maxOutputTokens',
  'additionalModelRequestFields',
]);

/**
 * @param {ServerRequest} req
 * @param {Agent} agent
 * @param {string} endpoint
 */
const payloadParser = ({ req, agent, endpoint }) => {
  if (isAgentsEndpoint(endpoint)) {
    return { model: undefined };
  } else if (endpoint === EModelEndpoint.bedrock) {
    const parsedValues = bedrockInputSchema.parse(agent.model_parameters);
    if (parsedValues.thinking == null) {
      parsedValues.thinking = false;
    }

    // AGREGAR AQUÃ EL LOG
    logger.info('Bedrock parsed values:', parsedValues);

    return parsedValues;
  }
  return req.body.endpointOption.model_parameters;
};

const noSystemModelRegex = [/\b(o1-preview|o1-mini|amazon\.titan-text)\b/gi];


function sanitizeBedrockDocumentName(filename) {
  if (!filename) return 'document';

  // Remover extensión para el nombre del documento
  const lastDotIndex = filename.lastIndexOf('.');
  let name = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;

  // Aplicar las reglas de Bedrock
  let sanitizedName = name
  .replace(/[^a-zA-Z0-9\s\-\(\)\[\]]/g, '-')  // Solo caracteres permitidos
  .replace(/\s+/g, ' ')                        // Espacios múltiples → espacio único
  .replace(/-+/g, '-')                         // Guiones múltiples → guión único
  .trim()                                      // Eliminar espacios al inicio/final
  || 'document';

  return sanitizedName;
}

/**
 * Genera la configuración de citations para Bedrock DocumentBlock
 * @param {Object} options - Opciones para configurar citations
 * @param {boolean} options.enabled - Si las citations están habilitadas
 * @param {number} options.maxCitations - Máximo número de citations por documento
 * @param {string} options.format - Formato de las citations ('markdown' | 'plain')
 * @returns {Object|null} - Configuración de citations o null si está deshabilitado
 */
function createBedrockCitationsConfig(options = {}) {
  const {
    enabled = true,
    maxCitations = 10,
    format = 'markdown'
  } = options;

  if (!enabled) {
    return null;
  }

  return {
    enabled: true,
    maxCitations: Math.max(1, Math.min(maxCitations, 50)), // Limitar entre 1 y 50
    format: ['markdown', 'plain'].includes(format) ? format : 'markdown'
  };
}

/**
 * Remueve citations de DocumentBlocks en un payload para recovery de errores
 * @param {Array} payload - El payload de mensajes
 * @returns {Array} - Payload limpio sin citations en DocumentBlocks
 */
function removeCitationsFromPayload(payload) {
  if (!Array.isArray(payload)) {
    return payload;
  }

  return payload.map(message => {
    if (!Array.isArray(message.content)) {
      return message;
    }

    const cleanedMessage = { ...message };
    cleanedMessage.content = message.content.map(contentItem => {
      if (contentItem.type === 'document' && contentItem.document) {
        const cleanedDocument = { ...contentItem };
        cleanedDocument.document = { ...contentItem.document };
        
        // Remover citations si existen
        if (cleanedDocument.document.citations) {
          delete cleanedDocument.document.citations;
          logger.info('[BEDROCK-CITATIONS-DEBUG] Removed citations from document:', {
            documentName: cleanedDocument.document.name
          });
        }
        
        return cleanedDocument;
      }
      return contentItem;
    });

    return cleanedMessage;
  });
}

function createTokenCounter(encoding) {
  return function (message) {
    const countTokens = (text) => Tokenizer.getTokenCount(text, encoding);
    return getTokenCountForMessage(message, countTokens);
  };
}

// AGREGAR al inicio de client.js (despuÃ©s de los imports):
function removeExtension(filename) {
  if (!filename) return null;
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
}

function logToolError(graph, error, toolId) {
  logger.error(
    '[api/server/controllers/agents/client.js #chatCompletion] Tool Error',
    error,
    toolId,
  );
}


class AgentClient extends BaseClient {
  constructor(options = {}) {
    super(null, options);
    /** The current client class
     * @type {string} */
    this.clientName = EModelEndpoint.agents;

    /** @type {'discard' | 'summarize'} */
    this.contextStrategy = 'discard';

    /** @deprecated @type {true} - Is a Chat Completion Request */
    this.isChatCompletion = true;

    /** @type {AgentRun} */
    this.run;

    this.processedPDFs = new Map();

    const {
      agentConfigs,
      contentParts,
      collectedUsage,
      artifactPromises,
      maxContextTokens,
      citationsEnabled,
      maxCitations,
      citationsFormat,
      ...clientOptions
    } = options;

    this.agentConfigs = agentConfigs;
    this.maxContextTokens = maxContextTokens;
    /** @type {MessageContentComplex[]} */
    this.contentParts = contentParts;
    /** @type {Array<UsageMetadata>} */
    this.collectedUsage = collectedUsage;
    
    // Configuración de citations para Bedrock
    this.citationsEnabled = citationsEnabled !== false; // Default: true
    this.maxCitations = maxCitations || 10;
    this.citationsFormat = citationsFormat || 'markdown';
    /** @type {ArtifactPromises} */
    this.artifactPromises = artifactPromises;
    /** @type {AgentClientOptions} */
    this.options = Object.assign({ endpoint: options.endpoint }, clientOptions);
    /** @type {string} */
    this.model = this.options.agent.model_parameters.model;

    logger.info('[DEBUG Constructor] Endpoint:', this.options.endpoint);
    logger.info('[DEBUG Constructor] Model:', this.model);
    logger.info('[DEBUG Constructor] agent.model_parameters:', this.options.agent.model_parameters);
    logger.info('[DEBUG Constructor] maxContextTokens:', this.maxContextTokens);
    /** The key for the usage object's input tokens
     * @type {string} */
    this.inputTokensKey = 'input_tokens';
    /** The key for the usage object's output tokens
     * @type {string} */
    this.outputTokensKey = 'output_tokens';
    /** @type {UsageMetadata} */
    this.usage;
    /** @type {Record<string, number>} */
    this.indexTokenCountMap = {};
    /** @type {(messages: BaseMessage[]) => Promise<void>} */
    this.processMemory;
  }

  /**
   * Convierte un objeto plano con claves numÃ©ricas a Buffer
   * @param {Object|Buffer|Uint8Array} data
   * @returns {Buffer}
   */
// REEMPLAZAR el mÃ©todo convertToBuffer con esta versiÃ³n diagnÃ³stica:
  convertToBuffer(data) {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }

    if (typeof data === 'string') {
      return Buffer.from(data, 'base64');
    }

    // Si es un objeto, hacer diagnÃ³stico completo
    if (typeof data === 'object' && data !== null) {
      // ðŸ”´ LOG DIAGNÃ“STICO TEMPORAL
      const keys = Object.keys(data);
      const firstKeys = keys.slice(0, 10); // Primeras 10 claves
      const hasType = 'type' in data;
      const hasData = 'data' in data;
      const hasBuffer = 'buffer' in data;

      logger.info('[BEDROCK-DEBUG] convertToBuffer object analysis:', {
        keysCount: keys.length,
        firstKeys,
        hasType,
        hasData,
        hasBuffer,
        dataType: hasData ? typeof data.data : 'n/a',
        bufferType: hasBuffer ? typeof data.buffer : 'n/a',
        // Mostrar estructura completa si es pequeÃ±a
        fullObject: keys.length < 20 ? data : 'too-large-to-show',
        // Verificar si es un Buffer serializado por MongoDB
        isLikelyMongoBuffer: hasType && hasData && data.type === 'Buffer',
        // Verificar claves numÃ©ricas
        hasNumericKeys: keys.some(k => /^\d+$/.test(k)),
        numericKeysCount: keys.filter(k => /^\d+$/.test(k)).length
      });

      // Manejar Buffer serializado por MongoDB: {type: 'Buffer', data: [255, 216, 255, ...]}
      if (hasType && hasData && data.type === 'Buffer' && Array.isArray(data.data)) {
        logger.info('[BEDROCK-PDF] Converting MongoDB Buffer format');
        return Buffer.from(data.data);
      }

      // Manejar objeto con claves numÃ©ricas: {0: 255, 1: 216, 2: 255, ...}
      if (keys.length > 0 && keys.every(key => /^\d+$/.test(key))) {
        logger.info('[BEDROCK-PDF] Converting numeric keys object');
        const values = keys.map(key => data[key]);
        return Buffer.from(values);
      }

      // Manejar otros formatos posibles
      if (hasBuffer) {
        logger.info('[BEDROCK-PDF] Object has buffer property, attempting conversion');
        return this.convertToBuffer(data.buffer);
      }

      if (hasData && Array.isArray(data.data)) {
        logger.info('[BEDROCK-PDF] Object has data array, attempting conversion');
        return Buffer.from(data.data);
      }
    }

    // Si llegamos aquÃ­, no pudimos convertir
    logger.error('[BEDROCK-DEBUG] Cannot convert unknown data structure:', {
      dataType: typeof data,
      isArray: Array.isArray(data),
      constructor: data?.constructor?.name,
      keys: typeof data === 'object' && data !== null ? Object.keys(data).slice(0, 5) : null
    });

    throw new Error(`Cannot convert data to Buffer: ${typeof data}`);
  }

  /**
   * Returns the aggregated content parts for the current run.
   * @returns {MessageContentComplex[]} */
  getContentParts() {
    return this.contentParts;
  }

  setOptions(options) {
    logger.info('[api/server/controllers/agents/client.js] setOptions', options);
  }

  /**
   * `AgentClient` is not opinionated about vision requests, so we don't do anything here
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest() {}

  getSaveOptions() {
    // TODO:
    // would need to be override settings; otherwise, model needs to be undefined
    // model: this.override.model,
    // instructions: this.override.instructions,
    // additional_instructions: this.override.additional_instructions,
    let runOptions = {};
    try {
      runOptions = payloadParser(this.options);
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #getSaveOptions] Error parsing options',
        error,
      );
    }

    logger.info('[DEBUG] Agent model_parameters:', this.options.agent.model_parameters);
    logger.info('[DEBUG] Options maxContextTokens:', this.options.maxContextTokens);

    // ðŸ”´ AGREGAR AQUÃ: Limpiar documentos antes de guardar
    // Esto previene que los bytes del PDF se guarden en la base de datos
    if (this.orderedMessages) {
      this.orderedMessages = this.orderedMessages.map(msg => {
        const cleanedMsg = { ...msg };

        // Si el mensaje tiene content como array, limpiar documentos
        if (Array.isArray(cleanedMsg.content)) {
          cleanedMsg.content = cleanedMsg.content.filter(item => item.type !== 'document');

          // Si solo queda un elemento de texto, convertir a string
          if (cleanedMsg.content.length === 1 && cleanedMsg.content[0].type === 'text') {
            cleanedMsg.content = cleanedMsg.content[0].text;
          } else if (cleanedMsg.content.length === 0) {
            // Si no queda nada, usar el texto original si existe
            cleanedMsg.content = cleanedMsg.text || '';
          }
        }

        // Mantener la referencia del documento si existe
        // document_reference se guardarÃ¡ pero sin los bytes

        return cleanedMsg;
      });
    }

    return removeNullishValues(
      Object.assign(
        {
          endpoint: this.options.endpoint,
          agent_id: this.options.agent.id,
          modelLabel: this.options.modelLabel,
          maxContextTokens: this.options.maxContextTokens,
          resendFiles: this.options.resendFiles,
          imageDetail: this.options.imageDetail,
          spec: this.options.spec,
          iconURL: this.options.iconURL,
          // ðŸ”´ IMPORTANTE: Incluir document_reference en los campos a guardar
          document_reference: this.document_reference,
        },
        // TODO: PARSE OPTIONS BY PROVIDER, MAY CONTAIN SENSITIVE DATA
        runOptions,
      ),
    );
  }

  getBuildMessagesOptions() {
    return {
      instructions: this.options.agent.instructions,
      additional_instructions: this.options.agent.additional_instructions,
    };
  }

  /**
   * Encuentra un archivo por su file_id en el message_file_map
   * @param {string} messageId
   * @param {string} format
   * @returns {MongoFile|null}
   */
  findFileForMessage(messageId, specificFormat = null) {
    if (!this.message_file_map || !this.message_file_map[messageId]) {
      return null;
    }

    const files = this.message_file_map[messageId];
    
    // Tipos de documentos nativos de Bedrock
    const nativeDocumentTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'text/csv', // .csv files
      'application/csv' // .csv files (alt MIME type)
    ];

    // Si se especifica un formato específico
    if (specificFormat) {
      return files.find(f => f.type === `application/${specificFormat}`) || null;
    }

    // Buscar cualquier documento nativo de Bedrock
    return files.find(f => nativeDocumentTypes.includes(f.type)) || null;
  }

  /**
   * Crea un documento part desde un archivo
   * @param {MongoFile} file
   * @returns {Object}
   */


  async createDocumentPartFromFile(file) {
    try {
      let fullPath = file.filepath;
      if (fullPath.startsWith('/uploads/')) {
        fullPath = `/app${fullPath}`;
      }

      if (!fs.existsSync(fullPath)) {
        logger.warn('[BEDROCK-DOC] File not found for document creation:', { path: fullPath, type: file.type });
        return null;
      }

      const buffer = fs.readFileSync(fullPath);

      // Detectar formato del documento
      const formatMap = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/csv': 'csv',
        'application/csv': 'csv'
      };
      const format = formatMap[file.type] || 'document';

      // IMPORTANTE: Sanitizar el nombre del documento para Bedrock
      const isBedrock = this.options?.agent?.provider === 'bedrock' ||
                      this.options?.endpoint === 'bedrock';

      let documentName;
      if (isBedrock) {
        documentName = sanitizeBedrockDocumentName(file.filename);
        logger.info('[BEDROCK-DOC] Sanitized document name for Bedrock:', {
          original: file.filename,
          sanitized: documentName,
          type: file.type,
          format: format
        });
      } else {
        documentName = removeExtension(file.filename) || file.file_id || `${format}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      logger.info('[BEDROCK-DOC] Created document part from file:', {
        filepath: fullPath,
        size: buffer.length,
        documentName: documentName,
        type: file.type,
        format: format
      });

      return {
        type: 'document',
        document: {
          name: documentName,  // ← Este nombre debe cumplir las reglas de Bedrock
          format: format,
          source: {
            bytes: buffer
          }
        }
      };
    } catch (error) {
      logger.error('[BEDROCK-DOC] Error creating document part:', { error: error.message, type: file.type });
      return null;
    }
  }

  /**
   * Re-hidrata documentos en un mensaje desde las referencias
   * @param {TMessage} message
   */
  async rehydrateDocuments(message) {
    if (!message.document_references || message.document_references.length === 0) {
      return;
    }

    logger.info('[BEDROCK-PDF] Re-hydrating documents for message:', message.messageId);

    // Log detallado del estado del archivo
    logger.info('[BEDROCK-DEBUG] File system check:', {
      messageId: message.messageId,
      expectedPaths: message.files?.map(f => ({
        original: f.filepath,
        withApp: `/app${f.filepath}`,
        exists: fs.existsSync(f.filepath),
        existsWithApp: fs.existsSync(`/app${f.filepath}`)
      })) || [],
      messageFileMapKeys: Object.keys(this.message_file_map || {}),
      hasMessageFileMap: !!this.message_file_map,
      documentReferences: message.document_references?.map(ref => ({
        document_id: ref.document_id,
        metadata: ref.metadata
      })) || []
    });

    // Asegurar que content sea un array
    if (!Array.isArray(message.content)) {
      const textContent = message.content || message.text || '';
      message.content = [];
      if (textContent) {
        message.content.push({ type: 'text', text: textContent });
      }
    }

    // Verificar si ya tiene documentos
    const hasDocuments = message.content.some(item => item.type === 'document');
    if (hasDocuments) {
      logger.info('[BEDROCK-PDF] Message already has documents, skipping re-hydration');
      return;
    }

    // Intentar mÃºltiples estrategias para encontrar el archivo
    for (const docRef of message.document_references) {
      let documentPart = null;

      // Estrategia 1: Buscar en message_file_map (cualquier documento nativo de Bedrock)
      const file = this.findFileForMessage(message.messageId);
      if (file) {
        documentPart = await this.createDocumentPartFromFile(file);
        if (documentPart) {
          logger.info('[BEDROCK-DOC] Document rehydrated from message_file_map:', { type: file.type, filename: file.filename });
        }
      }

      // Estrategia 2: Buscar archivo por filepath guardado en BD si existe
      if (!documentPart && message.files && message.files.length > 0) {
        const nativeDocumentTypes = [
          'application/pdf',
          'application/msword', // .doc
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
          'application/vnd.ms-excel', // .xls
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'text/csv', // .csv files
          'application/csv' // .csv files (alt MIME type)
        ];
        const docFile = message.files.find(f => nativeDocumentTypes.includes(f.type));
        if (docFile) {
          try {
            let fullPath = docFile.filepath;
            if (fullPath.startsWith('/uploads/')) {
              fullPath = `/app${fullPath}`;
            }

            logger.info('[BEDROCK-DOC] Attempting to load from filepath:', { path: fullPath, type: docFile.type });

            if (fs.existsSync(fullPath)) {
              const buffer = fs.readFileSync(fullPath);
              
              // Detectar formato del documento
              const formatMap = {
                'application/pdf': 'pdf',
                'application/msword': 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.ms-excel': 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                'text/csv': 'csv',
                'application/csv': 'csv'
              };
              const format = formatMap[docFile.type] || 'document';
              
              documentPart = {
                type: 'document',
                document: {
                  name: removeExtension(docFile.filename) || docFile.file_id || `${format}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  format: format,
                  source: {
                    bytes: buffer
                  }
                }
              };
              logger.info('[BEDROCK-DOC] Document rehydrated from filepath in BD:', { type: docFile.type, format: format });
            } else {
              logger.warn('[BEDROCK-DOC] File not found at expected path:', { path: fullPath, type: docFile.type });
            }
          } catch (error) {
            logger.error('[BEDROCK-DOC] Error loading file from BD filepath:', { error: error.message, type: docFile.type });
          }
        }
      }

      // Estrategia 3: Buscar usando document_reference metadata si tiene info del archivo
      if (!documentPart && docRef.metadata && docRef.metadata.absolutePath) {
        try {
          let fullPath = docRef.metadata.absolutePath;
          if (fullPath.startsWith('/uploads/')) {
            fullPath = `/app${fullPath}`;
          }

          logger.info('[BEDROCK-PDF] Attempting to load from reference metadata:', fullPath);

          if (fs.existsSync(fullPath)) {
            const buffer = fs.readFileSync(fullPath);
            documentPart = {
              type: 'document',
              document: {
                name: removeExtension(file.filename) || file.file_id || `document_${Date.now()}`,
                format: docRef.format || 'pdf',
                source: {
                  bytes: buffer
                }
              }
            };
            logger.info('[BEDROCK-PDF] Document rehidrated from reference metadata');
          }
        } catch (error) {
          logger.error('[BEDROCK-PDF] Error loading file from reference metadata:', error);
        }
      }

      if (documentPart) {
        message.content.unshift(documentPart);
        logger.info('[BEDROCK-PDF] Document successfully rehidrated');
        break; // Solo agregar el primer documento que se encuentre
      } else {
        logger.warn('[BEDROCK-PDF] Could not rehidrate document for reference:', {
          docRef,
          messageId: message.messageId,
          hasFiles: !!message.files,
          filesCount: message.files?.length || 0
        });
      }
    }
  }

  /**
   * Adjunta PDFs al Ãºltimo mensaje
   * @param {TMessage[]} orderedMessages
   * @param {MongoFile[]} pdfFiles
   */
  async attachPDFsToLastMessage(orderedMessages, pdfFiles) {
    if (pdfFiles.length === 0) {
      return;
    }

    const lastMessage = orderedMessages[orderedMessages.length - 1];

    // Verificar si ya tiene documento
    const hasDocument = Array.isArray(lastMessage.content) &&
      lastMessage.content.some(item => item.type === 'document');

    if (hasDocument) {
      logger.info('[BEDROCK-PDF] Last message already has document, skipping attachment');
      return;
    }

    const pdfFile = pdfFiles[0]; // Tomar el primer PDF
    const documentPart = await this.createDocumentPartFromFile(pdfFile);

    if (!documentPart) {
      logger.warn('[BEDROCK-PDF] Failed to create document part from file');
      return;
    }

    // Obtener el texto del mensaje
    const userText = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : lastMessage.text || '';

    // Modificar el contenido
    if (!lastMessage.content) {
      lastMessage.content = [
        documentPart,
        { type: 'text', text: userText || 'Please analyze the attached PDF.' }
      ];
    } else if (typeof lastMessage.content === 'string') {
      lastMessage.content = [
        documentPart,
        { type: 'text', text: lastMessage.content }
      ];
    } else if (Array.isArray(lastMessage.content)) {
      const hasText = lastMessage.content.some(item => item.type === 'text');
      lastMessage.content.unshift(documentPart);

      if (!hasText) {
        lastMessage.content.push({
          type: 'text',
          text: userText || 'Please analyze the attached PDF.'
        });
      }
    }

    logger.info('[BEDROCK-PDF] PDF attached to last message successfully');
  }

/**
   * MÃ©todo mejorado para validar y corregir documentos antes de enviar
   */
  validateDocumentBytes(payload) {
    if (!Array.isArray(payload)) return;

    for (let i = 0; i < payload.length; i++) {
      const message = payload[i];
      if (Array.isArray(message.content)) {
        for (let j = 0; j < message.content.length; j++) {
          const item = message.content[j];
          if (item.type === 'document') {
            const bytes = item.document?.source?.bytes;

            if (!bytes) {
              logger.warn('[BEDROCK-PDF] Document without bytes detected:', {
                messageIndex: i,
                contentIndex: j,
                role: message.role
              });
              continue;
            }

            // Verificar si los bytes son vÃ¡lidos
            const isValidBytes = Buffer.isBuffer(bytes) ||
                               bytes instanceof Uint8Array ||
                               typeof bytes === 'string';

            if (!isValidBytes) {
              logger.warn('[BEDROCK-PDF] Invalid bytes detected, attempting conversion:', {
                messageIndex: i,
                contentIndex: j,
                bytesType: typeof bytes,
                isBuffer: Buffer.isBuffer(bytes),
                isUint8Array: bytes instanceof Uint8Array,
                role: message.role,
                hasNumericKeys: typeof bytes === 'object' && bytes !== null ?
                  Object.keys(bytes).some(k => /^\d+$/.test(k)) : false
              });

              try {
                // Intentar convertir usando el mÃ©todo convertToBuffer
                const convertedBytes = this.convertToBuffer(bytes);
                message.content[j].document.source.bytes = convertedBytes;

                logger.info('[BEDROCK-PDF] Successfully converted invalid bytes:', {
                  messageIndex: i,
                  contentIndex: j,
                  role: message.role,
                  newBytesType: typeof convertedBytes,
                  isBuffer: Buffer.isBuffer(convertedBytes),
                  length: convertedBytes.length
                });
              } catch (conversionError) {
                logger.error('[BEDROCK-PDF] Failed to convert invalid bytes:', {
                  messageIndex: i,
                  contentIndex: j,
                  role: message.role,
                  error: conversionError.message
                });
                throw new Error(`Invalid document bytes at message ${i}, content ${j}: ${typeof bytes}. Conversion failed: ${conversionError.message}`);
              }
            } else {
              logger.info('[BEDROCK-PDF] Valid document bytes found:', {
                messageIndex: i,
                role: message.role,
                bytesLength: bytes.length,
                bytesType: typeof bytes,
                isBuffer: Buffer.isBuffer(bytes),
                isUint8Array: bytes instanceof Uint8Array
              });
            }
          }
        }
      }
    }
  }

  /**
   *
   * @param {TMessage} message
   * @param {Array<MongoFile>} attachments
   * @returns {Promise<Array<Partial<MongoFile>>>}
   */
  async addImageURLs(message, attachments) {
    const { files, text, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      this.options.agent.provider,
      VisionModes.agents,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    if (text && text.length) {
      message.ocr = text;
    }
    return files;
  }

  /**
   * Encuentra un archivo por su file_id en el message_file_map
   * @param {string} messageId
   * @param {string} format
   * @returns {MongoFile|null}
   */
  findFileForMessage(messageId, specificFormat = null) {
    if (!this.message_file_map || !this.message_file_map[messageId]) {
      return null;
    }

    const files = this.message_file_map[messageId];
    
    // Tipos de documentos nativos de Bedrock
    const nativeDocumentTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'text/csv', // .csv files
      'application/csv' // .csv files (alt MIME type)
    ];

    // Si se especifica un formato específico
    if (specificFormat) {
      return files.find(f => f.type === `application/${specificFormat}`) || null;
    }

    // Buscar cualquier documento nativo de Bedrock
    return files.find(f => nativeDocumentTypes.includes(f.type)) || null;
  }

  /**
   * Crea un documento part desde un archivo
   * @param {MongoFile} file
   * @returns {Object}
   */
  async createDocumentPartFromFile(file) {
    try {
      let fullPath = file.filepath;
      if (fullPath.startsWith('/uploads/')) {
        fullPath = `/app${fullPath}`;
      }

      if (!fs.existsSync(fullPath)) {
        logger.warn('[BEDROCK-DOC] File not found for document creation:', { path: fullPath, type: file.type });
        return null;
      }

      const buffer = fs.readFileSync(fullPath);
      
      // Detectar formato del documento
      const formatMap = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/csv': 'csv',
        'application/csv': 'csv'
      };
      const format = formatMap[file.type] || 'document';
      
      logger.info('[BEDROCK-DOC] Created document part from file:', {
        filepath: fullPath,
        size: buffer.length,
        type: file.type,
        format: format
      });

      return {
        type: 'document',
        document: {
          name: removeExtension(file.filename) || file.file_id || `${format}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          format: format,
          source: {
            bytes: buffer
          }
        }
      };
    } catch (error) {
      logger.error('[BEDROCK-DOC] Error creating document part:', { error: error.message, type: file.type });
      return null;
    }
  }

  /**
   * Re-hidrata documentos en un mensaje desde las referencias
   * @param {TMessage} message
   */
  async rehydrateDocuments(message) {
    if (!message.document_references || message.document_references.length === 0) {
      return;
    }

    logger.info('[BEDROCK-PDF] Re-hydrating documents for message:', message.messageId);

    // Asegurar que content sea un array
    if (!Array.isArray(message.content)) {
      const textContent = message.content || message.text || '';
      message.content = [];
      if (textContent) {
        message.content.push({ type: 'text', text: textContent });
      }
    }

    // Verificar si ya tiene documentos
    const hasDocuments = message.content.some(item => item.type === 'document');
    if (hasDocuments) {
      logger.info('[BEDROCK-PDF] Message already has documents, skipping re-hydration');
      return;
    }

    // Intentar encontrar el archivo asociado (cualquier documento nativo de Bedrock)
    const file = this.findFileForMessage(message.messageId);
    if (file) {
      const documentPart = await this.createDocumentPartFromFile(file);
      if (documentPart) {
        message.content.unshift(documentPart);
        logger.info('[BEDROCK-DOC] Document re-hydrated successfully:', { type: file.type, filename: file.filename });
      }
    } else {
      logger.warn('[BEDROCK-PDF] No file found for re-hydration:', message.messageId);
    }
  }

  /**
   * Adjunta PDFs al Ãºltimo mensaje
   * @param {TMessage[]} orderedMessages
   * @param {MongoFile[]} pdfFiles
   */
  async attachPDFsToLastMessage(orderedMessages, pdfFiles) {
    if (pdfFiles.length === 0) {
      return;
    }

    const lastMessage = orderedMessages[orderedMessages.length - 1];

    // Verificar si ya tiene documento
    const hasDocument = Array.isArray(lastMessage.content) &&
      lastMessage.content.some(item => item.type === 'document');

    if (hasDocument) {
      logger.info('[BEDROCK-PDF] Last message already has document, skipping attachment');
      return;
    }

    const pdfFile = pdfFiles[0]; // Tomar el primer PDF
    const documentPart = await this.createDocumentPartFromFile(pdfFile);

    if (!documentPart) {
      logger.warn('[BEDROCK-PDF] Failed to create document part from file');
      return;
    }

    // Obtener el texto del mensaje
    const userText = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : lastMessage.text || '';

    // Modificar el contenido
    if (!lastMessage.content) {
      lastMessage.content = [
        documentPart,
        { type: 'text', text: userText || 'Please analyze the attached PDF.' }
      ];
    } else if (typeof lastMessage.content === 'string') {
      lastMessage.content = [
        documentPart,
        { type: 'text', text: lastMessage.content }
      ];
    } else if (Array.isArray(lastMessage.content)) {
      const hasText = lastMessage.content.some(item => item.type === 'text');
      lastMessage.content.unshift(documentPart);

      if (!hasText) {
        lastMessage.content.push({
          type: 'text',
          text: userText || 'Please analyze the attached PDF.'
        });
      }
    }

    logger.info('[BEDROCK-PDF] PDF attached to last message successfully');
  }

  async buildMessages(
    messages,
    parentMessageId,
    { instructions = null, additional_instructions = null },
    opts,
  ) {
    let orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
    });

    logger.info('[PDF-EDIT-DEBUG] After getMessagesForConversation:', {
      orderedMessagesCount: orderedMessages.length,
      messagesWithFiles: orderedMessages.filter(m => m.files?.length > 0).length
    });

    let payload;
    let promptTokens;

    let systemContent = [instructions ?? '', additional_instructions ?? '']
      .filter(Boolean)
      .join('\n')
      .trim();

    const isBedrock = this.options.agent?.provider === 'bedrock' ||
      this.options.endpoint === EModelEndpoint.bedrock ||
      (this.options.agent?.model_parameters?.model &&
      this.options.agent.model_parameters.model.includes('anthropic'));

    logger.info('[BEDROCK-DEBUG] isBedrock detection:', {
      isBedrock,
      provider: this.options.agent?.provider,
      endpoint: this.options.endpoint,
      model: this.options.agent?.model_parameters?.model
    });

    // IMPORTANTE: Crear copia de mensajes para Bedrock sin modificar originales
    let messagesForAPI = orderedMessages;

    if (isBedrock) {
      // Crear copia profunda de los mensajes para modificar solo para el API
      messagesForAPI = orderedMessages.map(msg => ({ ...msg }));

      // Procesar TODOS los PDFs en la COPIA para el API
      for (let i = 0; i < messagesForAPI.length; i++) {
        const message = messagesForAPI[i];

        // Si el mensaje tiene documentos nativos de Bedrock, crear estructura document EN LA COPIA
        const nativeDocumentTypes = [
          'application/pdf',
          'application/msword', // .doc
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
          'application/vnd.ms-excel', // .xls
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'text/csv', // .csv files
          'application/csv' // .csv files (alt MIME type)
        ];
        const nativeDocFiles = message.files?.filter(f => nativeDocumentTypes.includes(f.type)) || [];
        const pdfFiles = nativeDocFiles; // Mantener compatibilidad con código existente
        
        if (nativeDocFiles.length > 0) {
          logger.info('[BEDROCK-DOC] Processing multiple native documents for API message:', {
            messageId: message.messageId,
            sender: message.sender,
            docCount: nativeDocFiles.length,
            filenames: nativeDocFiles.map(f => f.filename),
            types: nativeDocFiles.map(f => f.type)
          });

          const textContent = message.text?.trim();
          message.content = [];
          
          // 🚨 SOLUCIÓN CRÍTICA: Si el mensaje tiene image_urls, convertirlas a content blocks primero
          if (message.image_urls?.length > 0) {
            logger.info('[BEDROCK-PDF] Converting image_urls to content blocks for existing message:', {
              messageId: message.messageId,
              imageCount: message.image_urls.length
            });
            
            for (const imageUrl of message.image_urls) {
              if (imageUrl.type === 'image_url' && imageUrl.image_url?.url) {
                // Convertir de image_url format a content block format para Bedrock
                const base64Match = imageUrl.image_url.url.match(/data:([^;]+);base64,(.+)/);
                if (base64Match) {
                  const [, mimeType, base64Data] = base64Match;
                  
                  // Convertir base64 a buffer para Bedrock
                  const imageBuffer = Buffer.from(base64Data, 'base64');
                  
                  // Determinar formato de imagen
                  const imageFormat = mimeType === 'image/jpeg' ? 'jpeg' : 'png';
                  
                  message.content.push({
                    type: 'image',
                    image: {
                      format: imageFormat,
                      source: {
                        bytes: imageBuffer
                      }
                    }
                  });
                  
                  logger.info('[BEDROCK-PDF] Converted existing message image_url to Bedrock content block:', {
                    messageId: message.messageId,
                    mimeType,
                    imageFormat,
                    bufferLength: imageBuffer.length,
                    base64Length: base64Data?.length || 0
                  });
                }
              }
            }
            
            // Limpiar image_urls ya que ahora están en content
            delete message.image_urls;
            logger.info('[BEDROCK-PDF] Cleared image_urls from existing message after conversion');
          }

          // Procesar TODOS los PDFs, no solo el primero
          for (const pdfFile of pdfFiles) {
            try {
              let fullPath = pdfFile.filepath;
              if (fullPath.startsWith('/uploads/')) {
                fullPath = `/app${fullPath}`;
              }

              if (fs.existsSync(fullPath)) {
                const buffer = fs.readFileSync(fullPath);

                // Crear la estructura del documento para Bedrock
                const documentStructure = {
                  name: isBedrock ? sanitizeBedrockDocumentName(pdfFile.filename) : (removeExtension(pdfFile.filename) || 'document'),
                  format: 'pdf',
                  source: {
                    bytes: buffer
                  }
                };

                // Agregar configuración de citations para Bedrock
                if (isBedrock) {
                  const citationsConfig = createBedrockCitationsConfig({
                    enabled: this.citationsEnabled && docFile.metadata?.supportsCitations !== false,
                    maxCitations: this.maxCitations,
                    format: this.citationsFormat
                  });

                  if (citationsConfig) {
                    documentStructure.citations = citationsConfig;
                  }
                }

                message.content.push({
                  type: 'document',
                  document: documentStructure
                });

                logger.info('[BEDROCK-PDF] Added PDF to document structure:', {
                  messageId: message.messageId,
                  filename: pdfFile.filename,
                  bytesLength: buffer.length,
                  documentName: documentStructure.name,
                  citationsEnabled: !!documentStructure.citations,
                  citationsConfig: documentStructure.citations ? {
                    enabled: documentStructure.citations.enabled,
                    maxCitations: documentStructure.citations.maxCitations,
                    format: documentStructure.citations.format
                  } : null
                });
                
                // Log detallado de la estructura del documento para debug
                logger.info('[BEDROCK-CITATIONS-DEBUG] Document structure details:', {
                  documentStructure: JSON.stringify(documentStructure, null, 2)
                });
              } else {
                logger.error('[BEDROCK-PDF] File not found:', fullPath);
              }
            } catch (error) {
              logger.error('[BEDROCK-PDF] Error processing PDF:', {
                filename: pdfFile.filename,
                error: error.message
              });
            }
          }

          // Solo agregar bloque de texto si hay contenido válido
          if (textContent && textContent.length > 0) {
            message.content.push({
              type: 'text',
              text: textContent
            });
          }

          logger.info('[BEDROCK-PDF] Completed processing existing message PDFs:', {
            messageId: message.messageId,
            documentsAdded: pdfFiles.length,
            hasText: !!(textContent && textContent.length > 0),
            finalContentBlocks: message.content.length,
            contentTypes: message.content.map(c => c.type),
            imagesConvertedToContent: true,
            imageUrlsCleaned: !message.image_urls,
            contentDetails: message.content.map((c, i) => ({
              index: i,
              type: c.type,
              hasSource: !!c.source,
              hasImage: !!c.image,
              hasDocument: !!c.document,
              hasText: !!c.text,
              textLength: c.text?.length || 0,
              imageFormat: c.image?.format || null,
              imageBytes: c.image?.source?.bytes?.length || null,
              documentName: c.document?.name || null
            }))
          });
        }
      }
    }

    // Procesar attachments nuevos
    // Procesar attachments nuevos
    if (this.options.attachments) {
      const attachments = await this.options.attachments;

      logger.info('[BEDROCK-DEBUG] Attachments received:', {
        count: attachments.length,
        files: attachments.map(f => ({
          file_id: f.file_id,
          type: f.type,
          filepath: f.filepath,
          filename: f.filename
        }))
      });

      // 🔍 DEBUGGING: Análisis detallado de tipos de archivo
      const fileTypeAnalysis = {
        imageFiles: attachments.filter(f => f.type?.startsWith('image/')),
        pdfFiles: attachments.filter(f => f.type === 'application/pdf'),
        textFiles: attachments.filter(f => f.type === 'text/plain'),
        otherFiles: attachments.filter(f => 
          !f.type?.startsWith('image/') && 
          f.type !== 'application/pdf' && 
          f.type !== 'text/plain'
        )
      };

      logger.info('[BEDROCK-DEBUG] File type analysis:', {
        imageCount: fileTypeAnalysis.imageFiles.length,
        pdfCount: fileTypeAnalysis.pdfFiles.length, 
        textCount: fileTypeAnalysis.textFiles.length,
        otherCount: fileTypeAnalysis.otherFiles.length,
        imageFiles: fileTypeAnalysis.imageFiles.map(f => ({filename: f.filename, type: f.type})),
        pdfFiles: fileTypeAnalysis.pdfFiles.map(f => ({filename: f.filename, type: f.type})),
        textFiles: fileTypeAnalysis.textFiles.map(f => ({filename: f.filename, type: f.type})),
        otherFiles: fileTypeAnalysis.otherFiles.map(f => ({filename: f.filename, type: f.type}))
      });

      // 🔥 SEPARACIÓN CRÍTICA: Dividir archivos por tipo y destino
      // Tipos de documentos nativos de Bedrock
      const nativeDocumentTypes = [
        'application/pdf',
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.ms-excel', // .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'text/csv', // .csv files
        'application/csv' // .csv files (alt MIME type)
      ];

      const nativeDocFiles = attachments?.filter(file =>
        nativeDocumentTypes.includes(file.type) && isBedrock
      ) || [];

      const otherFiles = attachments?.filter(file =>
        !nativeDocumentTypes.includes(file.type) || !isBedrock
      ) || [];

      // Mantener compatibilidad con variable pdfFiles (renombrar después)
      const pdfFiles = nativeDocFiles;

      logger.info('[BEDROCK-DEBUG] File separation after filtering:', {
        originalAttachmentsCount: attachments.length,
        isBedrock,
        pdfFilesCount: pdfFiles.length,
        otherFilesCount: otherFiles.length,
        pdfFilesDetails: pdfFiles.map(f => ({filename: f.filename, type: f.type})),
        otherFilesDetails: otherFiles.map(f => ({filename: f.filename, type: f.type})),
        separationLogic: {
          nativeDocCriteria: 'nativeDocumentTypes.includes(file.type) && isBedrock',
          otherCriteria: '!nativeDocumentTypes.includes(file.type) || !isBedrock'
        },
        nativeDocumentTypes: nativeDocumentTypes
      });

      // 🎯 PROCESAR ARCHIVOS NO-NATIVOS PRIMERO (imágenes, texto, etc.)
      if (otherFiles.length > 0) {
        logger.info('[BEDROCK-DEBUG] Processing non-native document files:', {
          count: otherFiles.length,
          types: otherFiles.map(f => f.type),
          filenames: otherFiles.map(f => f.filename),
          hasNativeDocsAlso: pdfFiles.length > 0
        });

        // 🚨 CRÍTICO: Actualizar message_file_map ANTES de procesar imágenes
        if (this.message_file_map) {
          this.message_file_map[orderedMessages[orderedMessages.length - 1].messageId] = otherFiles;
        } else {
          this.message_file_map = {
            [orderedMessages[orderedMessages.length - 1].messageId]: otherFiles,
          };
        }

        // 🎯 PROCESAR IMÁGENES EN AMBOS: original Y copia API
        const originalMessage = orderedMessages[orderedMessages.length - 1];
        const apiMessage = messagesForAPI[messagesForAPI.length - 1];

        logger.info('[BEDROCK-DEBUG] Messages before image processing:', {
          originalMessage: {
            messageId: originalMessage.messageId,
            text: originalMessage.text,
            hasText: !!originalMessage.text,
            textLength: originalMessage.text?.length || 0,
            hasFiles: !!originalMessage.files,
            fileCount: originalMessage.files?.length || 0
          },
          apiMessage: {
            messageId: apiMessage.messageId,
            text: apiMessage.text,
            hasText: !!apiMessage.text,
            textLength: apiMessage.text?.length || 0,
            hasFiles: !!apiMessage.files,
            fileCount: apiMessage.files?.length || 0
          }
        });

        // Procesar imagen en mensaje original (para BD)
        const files = await this.addImageURLs(originalMessage, otherFiles);

        // 🚨 NUEVO: Copiar image_urls y ocr al mensaje de la API
        if (originalMessage.image_urls) {
          apiMessage.image_urls = [...originalMessage.image_urls];
          logger.info('[BEDROCK-DEBUG] Copied image_urls to API message:', {
            count: apiMessage.image_urls.length,
            imageUrls: apiMessage.image_urls.map(img => ({
              type: img.type,
              hasUrl: !!img.image_url?.url
            }))
          });
        }

        if (originalMessage.ocr) {
          apiMessage.ocr = originalMessage.ocr;
          logger.info('[BEDROCK-DEBUG] Copied OCR to API message');
        }

        logger.info('[BEDROCK-DEBUG] Messages after image processing:', {
          originalMessage: {
            messageId: originalMessage.messageId,
            text: originalMessage.text,
            hasText: !!originalMessage.text,
            textLength: originalMessage.text?.length || 0,
            hasImageUrls: !!originalMessage.image_urls,
            imageUrlsCount: originalMessage.image_urls?.length || 0
          },
          apiMessage: {
            messageId: apiMessage.messageId,
            text: apiMessage.text,
            hasText: !!apiMessage.text,
            textLength: apiMessage.text?.length || 0,
            hasImageUrls: !!apiMessage.image_urls,
            imageUrlsCount: apiMessage.image_urls?.length || 0
          }
        });

        // Actualizar attachments con archivos procesados
        this.options.attachments = files;
      }

      // 🔧 PROCESAR TODOS LOS DOCUMENTOS NATIVOS PARA BEDROCK POR SEPARADO
      if (isBedrock && pdfFiles.length > 0) {
        logger.info('[BEDROCK-DOC] Processing multiple native documents for Bedrock API:', {
          count: pdfFiles.length,
          filenames: pdfFiles.map(f => f.filename),
          types: pdfFiles.map(f => f.type)
        });

        // Marcar para reenvío de archivos
        this.options.resendFiles = true;

        // Modificar SOLO la copia para el API
        const lastAPIMessage = messagesForAPI[messagesForAPI.length - 1];

        if (!Array.isArray(lastAPIMessage.content)) {
          logger.info('[BEDROCK-DOC] Message before native document processing:', {
            messageId: lastAPIMessage.messageId,
            text: lastAPIMessage.text,
            hasText: !!lastAPIMessage.text,
            textLength: lastAPIMessage.text?.length || 0,
            hasImageUrls: !!lastAPIMessage.image_urls,
            imageUrlsCount: lastAPIMessage.image_urls?.length || 0,
            hasOcr: !!lastAPIMessage.ocr,
            contentType: typeof lastAPIMessage.content,
            isContentArray: Array.isArray(lastAPIMessage.content)
          });

          const textContent = lastAPIMessage.text?.trim();
          
          // 🚨 SOLUCIÓN CRÍTICA: Convertir image_urls a content blocks
          lastAPIMessage.content = [];
          
          // Si ya tiene image_urls, convertirlas a content blocks primero
          if (lastAPIMessage.image_urls?.length > 0) {
            logger.info('[BEDROCK-PDF] Converting image_urls to content blocks for mixed content:', {
              imageCount: lastAPIMessage.image_urls.length
            });
            
            for (const imageUrl of lastAPIMessage.image_urls) {
              if (imageUrl.type === 'image_url' && imageUrl.image_url?.url) {
                // Convertir de image_url format a content block format para Bedrock
                const base64Match = imageUrl.image_url.url.match(/data:([^;]+);base64,(.+)/);
                if (base64Match) {
                  const [, mimeType, base64Data] = base64Match;
                  
                  // Convertir base64 a buffer para Bedrock
                  const imageBuffer = Buffer.from(base64Data, 'base64');
                  
                  // Determinar formato de imagen
                  const imageFormat = mimeType === 'image/jpeg' ? 'jpeg' : 'png';
                  
                  lastAPIMessage.content.push({
                    type: 'image',
                    image: {
                      format: imageFormat,
                      source: {
                        bytes: imageBuffer
                      }
                    }
                  });
                  
                  logger.info('[BEDROCK-PDF] Converted image_url to Bedrock content block:', {
                    mimeType,
                    imageFormat,
                    bufferLength: imageBuffer.length,
                    base64Length: base64Data?.length || 0
                  });
                }
              }
            }
            
            // Limpiar image_urls ya que ahora están en content
            delete lastAPIMessage.image_urls;
            logger.info('[BEDROCK-DOC] Cleared image_urls after conversion to content blocks');
          }

          // Procesar TODOS los documentos nativos, no solo PDFs
          for (const docFile of pdfFiles) {
            try {
              let fullPath = docFile.filepath;
              if (fullPath.startsWith('/uploads/')) {
                fullPath = `/app${fullPath}`;
              }

              if (fs.existsSync(fullPath)) {
                const buffer = fs.readFileSync(fullPath);

                // Detectar formato del documento
                const formatMap = {
                  'application/pdf': 'pdf',
                  'application/msword': 'doc',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                  'application/vnd.ms-excel': 'xls',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                  'text/csv': 'csv',
                  'application/csv': 'csv'
                };
                const format = formatMap[docFile.type] || 'document';

                // Crear la estructura del documento para Bedrock
                const documentStructure = {
                  name: isBedrock ? sanitizeBedrockDocumentName(docFile.filename) : (removeExtension(docFile.filename) || 'document'),
                  format: format,
                  source: {
                    bytes: buffer
                  }
                };
                
                logger.debug('[BEDROCK-DOC] Document structure created:', {
                  type: docFile.type,
                  format: format,
                  size: buffer.length,
                  name: documentStructure.name
                });

                // Agregar configuración de citations SOLO para PDFs
                if (isBedrock && format === 'pdf') {
                  const citationsConfig = createBedrockCitationsConfig({
                    enabled: this.citationsEnabled && docFile.metadata?.supportsCitations !== false,
                    maxCitations: this.maxCitations,
                    format: this.citationsFormat
                  });

                  if (citationsConfig) {
                    documentStructure.citations = citationsConfig;
                    logger.debug('[BEDROCK-DOC] Citations enabled for PDF:', { 
                      filename: docFile.filename,
                      citationsConfig: citationsConfig
                    });
                  }
                } else if (isBedrock) {
                  logger.debug('[BEDROCK-DOC] Citations disabled for non-PDF document:', { 
                    filename: docFile.filename,
                    format: format,
                    reason: 'Only PDF supports citations in Bedrock Converse'
                  });
                }

                lastAPIMessage.content.push({
                  type: 'document',
                  document: documentStructure
                });

                logger.info('[BEDROCK-DOC] Added new native document attachment to structure:', {
                  filename: docFile.filename,
                  type: docFile.type,
                  format: format,
                  bytesLength: buffer.length,
                  documentName: documentStructure.name,
                  citationsEnabled: !!documentStructure.citations,
                  citationsConfig: documentStructure.citations ? {
                    enabled: documentStructure.citations.enabled,
                    maxCitations: documentStructure.citations.maxCitations,
                    format: documentStructure.citations.format
                  } : null
                });
              } else {
                logger.error('[BEDROCK-DOC] Native document file not found:', { path: fullPath, type: docFile.type });
              }
            } catch (error) {
              logger.error('[BEDROCK-DOC] Error processing native document:', {
                filename: docFile.filename,
                type: docFile.type,
                error: error.message
              });
            }
          }

          // Solo agregar bloque de texto si hay contenido válido
          if (textContent && textContent.length > 0) {
            lastAPIMessage.content.push({
              type: 'text',
              text: textContent
            });
          }

          logger.info('[BEDROCK-DOC] Completed processing new native document attachments:', {
            documentsAdded: pdfFiles.length,
            documentTypes: pdfFiles.map(f => f.type),
            hasText: !!(textContent && textContent.length > 0),
            finalContentBlocks: lastAPIMessage.content.length,
            contentTypes: lastAPIMessage.content.map(c => c.type),
            imagesConvertedToContent: true,
            hasImageUrls: !!lastAPIMessage.image_urls,
            imageUrlsCleaned: !lastAPIMessage.image_urls
          });
          
          logger.info('[BEDROCK-DOC] Final message structure after processing:', {
            messageId: lastAPIMessage.messageId,
            text: lastAPIMessage.text,
            hasText: !!lastAPIMessage.text,
            textLength: lastAPIMessage.text?.length || 0,
            hasImageUrls: !!lastAPIMessage.image_urls,
            imageUrlsCount: lastAPIMessage.image_urls?.length || 0,
            hasContent: !!lastAPIMessage.content,
            contentLength: lastAPIMessage.content?.length || 0,
            contentTypes: Array.isArray(lastAPIMessage.content) ? lastAPIMessage.content.map(c => c.type) : 'not-array',
            contentDetails: Array.isArray(lastAPIMessage.content) ? lastAPIMessage.content.map((c, i) => ({
              index: i,
              type: c.type,
              hasSource: !!c.source,
              hasImage: !!c.image,
              hasDocument: !!c.document,
              hasText: !!c.text,
              textLength: c.text?.length || 0,
              imageFormat: c.image?.format || null,
              imageBytes: c.image?.source?.bytes?.length || null,
              documentName: c.document?.name || null
            })) : 'not-array'
          });
        }

        // Agregar PDFs al message_file_map si es necesario (para tracking)
        if (this.message_file_map) {
          // Combinar con archivos existentes si los hay
          const existingFiles = this.message_file_map[orderedMessages[orderedMessages.length - 1].messageId] || [];
          this.message_file_map[orderedMessages[orderedMessages.length - 1].messageId] = [
            ...existingFiles,
            ...pdfFiles
          ];
        } else {
          this.message_file_map = {
            [orderedMessages[orderedMessages.length - 1].messageId]: pdfFiles,
          };
        }
      }

      // 🔧 CASO ESPECIAL: Si no hay archivos que procesar, mantener estructura
      if (otherFiles.length === 0 && pdfFiles.length === 0) {
        logger.info('[BEDROCK-DEBUG] No files to process, maintaining original structure');

        // Mantener message_file_map para compatibilidad
        if (this.message_file_map) {
          this.message_file_map[orderedMessages[orderedMessages.length - 1].messageId] = attachments;
        } else {
          this.message_file_map = {
            [orderedMessages[orderedMessages.length - 1].messageId]: attachments,
          };
        }

        this.options.attachments = attachments;
      }
    }

    // Validar documentos solo en la copia API si es Bedrock
    if (isBedrock) {
      this.validateDocumentBytes(messagesForAPI);
      
      // 🔍 DEBUGGING DETALLADO: Logging completo de mensajes para Bedrock
      logger.info('[BEDROCK-DEBUG] Messages being sent to API:', {
        totalMessages: messagesForAPI.length,
        messages: messagesForAPI.map((msg, idx) => ({
          index: idx,
          messageId: msg.messageId,
          sender: msg.sender,
          role: msg.role,
          hasText: !!msg.text,
          textLength: msg.text?.length || 0,
          textPreview: msg.text?.substring(0, 100) || '',
          hasFiles: !!msg.files,
          fileCount: msg.files?.length || 0,
          fileTypes: msg.files?.map(f => f.type) || [],
          hasContent: !!msg.content,
          contentType: Array.isArray(msg.content) ? 'array' : typeof msg.content,
          contentBlocks: Array.isArray(msg.content) ? msg.content.map((block, blockIdx) => ({
            blockIndex: blockIdx,
            type: block.type,
            hasText: !!block.text,
            textLength: block.text?.length || 0,
            textContent: block.text || '',
            hasDocument: !!block.document,
            documentName: block.document?.name || null
          })) : 'not-array'
        }))
      });
    }

    // Formatear mensajes usando la copia API si es Bedrock, sino los originales
    const messagesToFormat = isBedrock ? messagesForAPI : orderedMessages;

    const formattedMessages = messagesToFormat.map((message, i) => {
      const formattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.modelLabel,
      });

      // Usar orderedMessages para el token count (no la copia modificada)
      const originalMessage = orderedMessages[i];

      if (originalMessage.ocr && i !== orderedMessages.length - 1) {
        if (typeof formattedMessage.content === 'string') {
          formattedMessage.content = originalMessage.ocr + '\n' + formattedMessage.content;
        } else {
          const textPart = formattedMessage.content.find((part) => part.type === 'text');
          textPart
            ? (textPart.text = originalMessage.ocr + '\n' + textPart.text)
            : formattedMessage.content.unshift({ type: 'text', text: originalMessage.ocr });
        }
      } else if (originalMessage.ocr && i === orderedMessages.length - 1) {
        systemContent = [systemContent, originalMessage.ocr].join('\n');
      }

      const needsTokenCount =
        (this.contextStrategy && !orderedMessages[i].tokenCount) || originalMessage.ocr;

      if (needsTokenCount || (this.isVisionModel && (originalMessage.image_urls || originalMessage.files))) {
        orderedMessages[i].tokenCount = this.getTokenCountForMessage(formattedMessage);
      }

      if (this.message_file_map && this.message_file_map[originalMessage.messageId]) {
        const attachments = this.message_file_map[originalMessage.messageId];
        for (const file of attachments) {
          if (file.embedded) {
            this.contextHandlers?.processFile(file);
            continue;
          }
          if (file.metadata?.fileIdentifier) {
            continue;
          }
        }
      }

      return formattedMessage;
    });

    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      systemContent = this.augmentedPrompt + systemContent;
    }

    // Inject MCP server instructions
    const ephemeralAgent = this.options.req.body.ephemeralAgent;
    let mcpServers = [];

    if (ephemeralAgent && ephemeralAgent.mcp && ephemeralAgent.mcp.length > 0) {
      mcpServers = ephemeralAgent.mcp;
    }
    else if (this.options.agent && this.options.agent.tools) {
      mcpServers = this.options.agent.tools
        .filter(
          (tool) =>
            tool instanceof DynamicStructuredTool && tool.name.includes(Constants.mcp_delimiter),
        )
        .map((tool) => tool.name.split(Constants.mcp_delimiter).pop())
        .filter(Boolean);
    }

    if (mcpServers.length > 0) {
      try {
        const mcpInstructions = getMCPManager().formatInstructionsForContext(mcpServers);
        if (mcpInstructions) {
          systemContent = [systemContent, mcpInstructions].filter(Boolean).join('\n\n');
          logger.debug('[AgentClient] Injected MCP instructions for servers:', mcpServers);
        }
      } catch (error) {
        logger.error('[AgentClient] Failed to inject MCP instructions:', error);
      }
    }

    if (systemContent) {
      this.options.agent.instructions = systemContent;
    }

    let tokenCountMap;

    if (this.contextStrategy) {
      // Usar mensajes ORIGINALES para el contexto, pero formattedMessages para el payload
      ({ payload, promptTokens, tokenCountMap, messages } = await this.handleContextStrategy({
        orderedMessages,  // Originales para preservar estructura
        formattedMessages,
      }));
    }

    // IMPORTANTE: Asegurar que usamos los mensajes originales para el indexTokenCountMap
    for (let i = 0; i < orderedMessages.length; i++) {
      this.indexTokenCountMap[i] = orderedMessages[i].tokenCount;
    }

    // Guardar referencia a los mensajes originales para la BD
    this.orderedMessages = orderedMessages;

    const result = {
      tokenCountMap,
      prompt: payload,
      promptTokens,
      messages: orderedMessages,  // Devolver originales, no modificados
    };

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }

    const withoutKeys = await this.useMemory();
    if (withoutKeys) {
      systemContent += `${memoryInstructions}\n\n# Existing memory about the user:\n${withoutKeys}`;
    }

    if (systemContent) {
      this.options.agent.instructions = systemContent;
    }

    logger.info('[BEDROCK-DEBUG] buildMessages complete:', {
      originalMessagesPreserved: !orderedMessages.some(m => Array.isArray(m.content)),
      apiMessagesHaveDocuments: isBedrock && messagesForAPI.some(m =>
        Array.isArray(m.content) && m.content.some(c => c.type === 'document')
      )
    });

    return result;
  }

  /**
   * Creates a promise that resolves with the memory promise result or undefined after a timeout
   * @param {Promise<(TAttachment | null)[] | undefined>} memoryPromise - The memory promise to await
   * @param {number} timeoutMs - Timeout in milliseconds (default: 3000)
   * @returns {Promise<(TAttachment | null)[] | undefined>}
   */
  async awaitMemoryWithTimeout(memoryPromise, timeoutMs = 3000) {
    if (!memoryPromise) {
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Memory processing timeout')), timeoutMs),
      );

      const attachments = await Promise.race([memoryPromise, timeoutPromise]);
      return attachments;
    } catch (error) {
      if (error.message === 'Memory processing timeout') {
        logger.warn('[AgentClient] Memory processing timed out after 3 seconds');
      } else {
        logger.error('[AgentClient] Error processing memory:', error);
      }
      return;
    }
  }

  /**
   * @returns {Promise<string | undefined>}
   */
  async useMemory() {
    const user = this.options.req.user;
    if (user.personalization?.memories === false) {
      return;
    }
    const hasAccess = await checkAccess({
      user,
      permissionType: PermissionTypes.MEMORIES,
      permissions: [Permissions.USE],
      getRoleByName,
    });

    if (!hasAccess) {
      logger.debug(
        `[api/server/controllers/agents/client.js #useMemory] User ${user.id} does not have USE permission for memories`,
      );
      return;
    }
    const appConfig = this.options.req.config;
    const memoryConfig = appConfig.memory;
    if (!memoryConfig || memoryConfig.disabled === true) {
      return;
    }

    /** @type {Agent} */
    let prelimAgent;
    const allowedProviders = new Set(
      appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders,
    );
    try {
      if (memoryConfig.agent?.id != null && memoryConfig.agent.id !== this.options.agent.id) {
        prelimAgent = await loadAgent({
          req: this.options.req,
          agent_id: memoryConfig.agent.id,
          endpoint: EModelEndpoint.agents,
        });
      } else if (
        memoryConfig.agent?.id == null &&
        memoryConfig.agent?.model != null &&
        memoryConfig.agent?.provider != null
      ) {
        prelimAgent = { id: Constants.EPHEMERAL_AGENT_ID, ...memoryConfig.agent };
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #useMemory] Error loading agent for memory',
        error,
      );
    }

    const agent = await initializeAgent({
      req: this.options.req,
      res: this.options.res,
      agent: prelimAgent,
      allowedProviders,
      endpointOption: {
        endpoint:
          prelimAgent.id !== Constants.EPHEMERAL_AGENT_ID
            ? EModelEndpoint.agents
            : memoryConfig.agent?.provider,
      },
    });

    if (!agent) {
      logger.warn(
        '[api/server/controllers/agents/client.js #useMemory] No agent found for memory',
        memoryConfig,
      );
      return;
    }

    const llmConfig = Object.assign(
      {
        provider: agent.provider,
        model: agent.model,
      },
      agent.model_parameters,
    );

    /** @type {import('@librechat/api').MemoryConfig} */
    const config = {
      validKeys: memoryConfig.validKeys,
      instructions: agent.instructions,
      llmConfig,
      tokenLimit: memoryConfig.tokenLimit,
    };

    const userId = this.options.req.user.id + '';
    const messageId = this.responseMessageId + '';
    const conversationId = this.conversationId + '';
    const [withoutKeys, processMemory] = await createMemoryProcessor({
      userId,
      config,
      messageId,
      conversationId,
      memoryMethods: {
        setMemory,
        deleteMemory,
        getFormattedMemories,
      },
      res: this.options.res,
    });

    this.processMemory = processMemory;
    return withoutKeys;
  }

  /**
   * Filters out image URLs from message content
   * @param {BaseMessage} message - The message to filter
   * @returns {BaseMessage} - A new message with image URLs removed
   */
  filterImageUrls(message) {
    if (!message.content || typeof message.content === 'string') {
      return message;
    }

    if (Array.isArray(message.content)) {
      const filteredContent = message.content.filter(
        (part) => part.type !== ContentTypes.IMAGE_URL,
      );

      if (filteredContent.length === 1 && filteredContent[0].type === ContentTypes.TEXT) {
        const MessageClass = message.constructor;
        return new MessageClass({
          content: filteredContent[0].text,
          additional_kwargs: message.additional_kwargs,
        });
      }

      const MessageClass = message.constructor;
      return new MessageClass({
        content: filteredContent,
        additional_kwargs: message.additional_kwargs,
      });
    }

    return message;
  }

  /**
   * @param {BaseMessage[]} messages
   * @returns {Promise<void | (TAttachment | null)[]>}
   */
  async runMemory(messages) {
    try {
      if (this.processMemory == null) {
        return;
      }
      const appConfig = this.options.req.config;
      const memoryConfig = appConfig.memory;
      const messageWindowSize = memoryConfig?.messageWindowSize ?? 5;

      let messagesToProcess = [...messages];
      if (messages.length > messageWindowSize) {
        for (let i = messages.length - messageWindowSize; i >= 0; i--) {
          const potentialWindow = messages.slice(i, i + messageWindowSize);
          if (potentialWindow[0]?.role === 'user') {
            messagesToProcess = [...potentialWindow];
            break;
          }
        }

        if (messagesToProcess.length === messages.length) {
          messagesToProcess = [...messages.slice(-messageWindowSize)];
        }
      }

      const filteredMessages = messagesToProcess.map((msg) => this.filterImageUrls(msg));
      const bufferString = getBufferString(filteredMessages);
      const bufferMessage = new HumanMessage(`# Current Chat:\n\n${bufferString}`);
      return await this.processMemory([bufferMessage]);
    } catch (error) {
      logger.error('Memory Agent failed to process memory', error);
    }
  }

  /** @type {sendCompletion} */
  async sendCompletion(payload, opts = {}) {
    try {
      logger.info('[BEDROCK-CITATIONS-DEBUG] sendCompletion starting:', {
        hasPayload: !!payload,
        payloadLength: payload?.length,
        onProgress: !!opts.onProgress,
        abortController: !!opts.abortController,
        citationsEnabled: this.citationsEnabled,
        provider: this.options.agent?.provider,
        endpoint: this.options.endpoint
      });

      await this.chatCompletion({
        payload,
        onProgress: opts.onProgress,
        userMCPAuthMap: opts.userMCPAuthMap,
        abortController: opts.abortController,
      });

      logger.info('[BEDROCK-CITATIONS-DEBUG] chatCompletion completed successfully');
      return this.contentParts;
    } catch (error) {
      logger.error('[BEDROCK-CITATIONS-DEBUG] Error in sendCompletion/chatCompletion:', {
        error: error.message,
        stack: error.stack,
        isUnsupportedContentError: error.message && error.message.includes('Unsupported content block type'),
        isCitationError: error.message && error.message.includes('citation'),
        citationsEnabled: this.citationsEnabled,
        provider: this.options.agent?.provider,
        endpoint: this.options.endpoint
      });

      // Si es el error específico de content block no soportado Y incluye citations
      if (error.message && error.message.includes('Unsupported content block type') && 
          error.message.includes('citation') && this.citationsEnabled) {
        
        logger.warn('[BEDROCK-CITATIONS-DEBUG] Retrying sendCompletion without citations...');
        
        try {
          // Desactivar citations temporalmente para este cliente
          const originalCitationsEnabled = this.citationsEnabled;
          this.citationsEnabled = false;
          
          // Limpiar citations del payload existente
          logger.info('[BEDROCK-CITATIONS-DEBUG] Cleaning citations from payload...');
          const cleanedPayload = removeCitationsFromPayload(payload);
          
          logger.info('[BEDROCK-CITATIONS-DEBUG] Retrying with cleaned payload...');
          
          // Reintentar la operación con payload limpio
          await this.chatCompletion({
            payload: cleanedPayload,
            onProgress: opts.onProgress,
            userMCPAuthMap: opts.userMCPAuthMap,
            abortController: opts.abortController,
          });

          logger.info('[BEDROCK-CITATIONS-DEBUG] Retry without citations successful');
          
          // Restaurar la configuración original para futuras requests
          this.citationsEnabled = originalCitationsEnabled;
          
          return this.contentParts;
        } catch (retryError) {
          logger.error('[BEDROCK-CITATIONS-DEBUG] Retry without citations also failed:', {
            error: retryError.message,
            stack: retryError.stack
          });
          
          // Restaurar configuración y lanzar error original
          this.citationsEnabled = true;
          throw error;
        }
      } else {
        // Para otros errores, lanzar directamente
        throw error;
      }
    }
  }

  /**
   * @param {Object} params
   * @param {string} [params.model]
   * @param {string} [params.context='message']
   * @param {AppConfig['balance']} [params.balance]
   * @param {UsageMetadata[]} [params.collectedUsage=this.collectedUsage]
   */
  async recordCollectedUsage({
    model,
    balance,
    context = 'message',
    collectedUsage = this.collectedUsage,
  }) {
    if (!collectedUsage || !collectedUsage.length) {
      return;
    }
    const input_tokens =
      (collectedUsage[0]?.input_tokens || 0) +
      (Number(collectedUsage[0]?.input_token_details?.cache_creation) || 0) +
      (Number(collectedUsage[0]?.input_token_details?.cache_read) || 0);

    let output_tokens = 0;
    let previousTokens = input_tokens; // Start with original input
    for (let i = 0; i < collectedUsage.length; i++) {
      const usage = collectedUsage[i];
      if (!usage) {
        continue;
      }

      const cache_creation = Number(usage.input_token_details?.cache_creation) || 0;
      const cache_read = Number(usage.input_token_details?.cache_read) || 0;

      const txMetadata = {
        context,
        balance,
        conversationId: this.conversationId,
        user: this.user ?? this.options.req.user?.id,
        endpointTokenConfig: this.options.endpointTokenConfig,
        model: usage.model ?? model ?? this.model ?? this.options.agent.model_parameters.model,
      };

      if (i > 0) {
        // Count new tokens generated (input_tokens minus previous accumulated tokens)
        output_tokens +=
          (Number(usage.input_tokens) || 0) + cache_creation + cache_read - previousTokens;
      }

      // Add this message's output tokens
      output_tokens += Number(usage.output_tokens) || 0;

      // Update previousTokens to include this message's output
      previousTokens += Number(usage.output_tokens) || 0;

      if (cache_creation > 0 || cache_read > 0) {
        spendStructuredTokens(txMetadata, {
          promptTokens: {
            input: usage.input_tokens,
            write: cache_creation,
            read: cache_read,
          },
          completionTokens: usage.output_tokens,
        }).catch((err) => {
          logger.error(
            '[api/server/controllers/agents/client.js #recordCollectedUsage] Error spending structured tokens',
            err,
          );
        });
        continue;
      }
      spendTokens(txMetadata, {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #recordCollectedUsage] Error spending tokens',
          err,
        );
      });
    }

    this.usage = {
      input_tokens,
      output_tokens,
    };
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {UsageMetadata} The stream usage object.
   */
  getStreamUsage() {
    return this.usage;
  }

  /**
   * @param {TMessage} responseMessage
   * @returns {number}
   */
  getTokenCountForResponse({ content }) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content,
    });
  }

  /**
   * Calculates the correct token count for the current user message based on the token count map and API usage.
   * Edge case: If the calculation results in a negative value, it returns the original estimate.
   * If revisiting a conversation with a chat history entirely composed of token estimates,
   * the cumulative token count going forward should become more accurate as the conversation progresses.
   * @param {Object} params - The parameters for the calculation.
   * @param {Record<string, number>} params.tokenCountMap - A map of message IDs to their token counts.
   * @param {string} params.currentMessageId - The ID of the current message to calculate.
   * @param {OpenAIUsageMetadata} params.usage - The usage object returned by the API.
   * @returns {number} The correct token count for the current user message.
   */
  calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage }) {
    const originalEstimate = tokenCountMap[currentMessageId] || 0;

    if (!usage || typeof usage[this.inputTokensKey] !== 'number') {
      return originalEstimate;
    }

    tokenCountMap[currentMessageId] = 0;
    const totalTokensFromMap = Object.values(tokenCountMap).reduce((sum, count) => {
      const numCount = Number(count);
      return sum + (isNaN(numCount) ? 0 : numCount);
    }, 0);
    const totalInputTokens = usage[this.inputTokensKey] ?? 0;

    const currentMessageTokens = totalInputTokens - totalTokensFromMap;
    return currentMessageTokens > 0 ? currentMessageTokens : originalEstimate;
  }

  /**
   * @param {object} params
   * @param {string | ChatCompletionMessageParam[]} params.payload
   * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
   * @param {AbortController} [params.abortController]
   */
// BUSCAR el mÃ©todo chatCompletion y REEMPLAZAR la secciÃ³n desde formatAgentMessages:

  async chatCompletion({ payload, userMCPAuthMap, abortController = null }) {
    /** @type {Partial<GraphRunnableConfig>} */
    let config;
    /** @type {ReturnType<createRun>} */
    let run;
    /** @type {Promise<(TAttachment | null)[] | undefined>} */
    let memoryPromise;
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      const appConfig = this.options.req.config;
      /** @type {AppConfig['endpoints']['agents']} */
      const agentsEConfig = appConfig.endpoints?.[EModelEndpoint.agents];

      config = {
        configurable: {
          thread_id: this.conversationId,
          last_agent_index: this.agentConfigs?.size ?? 0,
          user_id: this.user ?? this.options.req.user?.id,
          hide_sequential_outputs: this.options.agent.hide_sequential_outputs,
          requestBody: {
            messageId: this.responseMessageId,
            conversationId: this.conversationId,
            parentMessageId: this.parentMessageId,
          },
          user: this.options.req.user,
        },
        recursionLimit: agentsEConfig?.recursionLimit ?? 25,
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      const toolSet = new Set((this.options.agent.tools ?? []).map((tool) => tool && tool.name));

      // Log de payload antes de formatAgentMessages


      logger.info('[BEDROCK-DEBUG] Payload before formatAgentMessages:', {
        payloadType: typeof payload,
        isArray: Array.isArray(payload),
        payloadLength: Array.isArray(payload) ? payload.length : 'not-array'
      });

      if (Array.isArray(payload)) {
        payload.forEach((msg, idx) => {
          logger.info(`[BEDROCK-DEBUG] Message ${idx}:`, {
            role: msg.role,
            contentType: typeof msg.content,
            hasContent: !!msg.content,
            contentStructure: Array.isArray(msg.content)
              ? msg.content.map(item => ({
                type: item.type,
                hasBytes: item.type === 'document' ? !!item.document?.source?.bytes : false,
                bytesType: item.type === 'document' ? typeof item.document?.source?.bytes : 'n/a'
              }))
              : 'not-array'
          });
        });
      }

      // ðŸ”´ AGREGAR: ValidaciÃ³n antes de formatAgentMessages
      try {
        this.validateDocumentBytes(payload);
        logger.info('[BEDROCK-PDF] Document validation passed before formatAgentMessages');
      } catch (error) {
        logger.error('[BEDROCK-PDF] Document validation failed before formatAgentMessages:', error);
        throw error;
      }

      let { messages: initialMessages, indexTokenCountMap } = formatAgentMessages(
        payload,
        this.indexTokenCountMap,
        toolSet,
      );

      // ðŸ”´ AGREGAR: ValidaciÃ³n despuÃ©s de formatAgentMessages tambiÃ©n
      try {
        this.validateDocumentBytes(initialMessages);
        logger.info('[BEDROCK-PDF] Document validation passed after formatAgentMessages');
      } catch (error) {
        logger.error('[BEDROCK-PDF] Document validation failed after formatAgentMessages:', error);
        throw error;
      }

      // ... resto del mÃ©todo chatCompletion permanece igual ...

      /**
       *
       * @param {Agent} agent
       * @param {BaseMessage[]} messages
       * @param {number} [i]
       * @param {TMessageContentParts[]} [contentData]
       * @param {Record<string, number>} [currentIndexCountMap]
       */
      const runAgent = async (agent, _messages, i = 0, contentData = [], _currentIndexCountMap) => {
        config.configurable.model = agent.model_parameters.model;
        const currentIndexCountMap = _currentIndexCountMap ?? indexTokenCountMap;
        if (i > 0) {
          this.model = agent.model_parameters.model;
        }
        if (i > 0 && config.signal == null) {
          config.signal = abortController.signal;
        }
        if (agent.recursion_limit && typeof agent.recursion_limit === 'number') {
          config.recursionLimit = agent.recursion_limit;
        }
        if (
          agentsEConfig?.maxRecursionLimit &&
          config.recursionLimit > agentsEConfig?.maxRecursionLimit
        ) {
          config.recursionLimit = agentsEConfig?.maxRecursionLimit;
        }
        config.configurable.agent_id = agent.id;
        config.configurable.name = agent.name;
        config.configurable.agent_index = i;
        const noSystemMessages = noSystemModelRegex.some((regex) =>
          agent.model_parameters.model.match(regex),
        );

        const systemMessage = Object.values(agent.toolContextMap ?? {})
          .join('\n')
          .trim();

        let systemContent = [
          systemMessage,
          agent.instructions ?? '',
          i !== 0 ? (agent.additional_instructions ?? '') : '',
        ]
          .join('\n')
          .trim();

        if (noSystemMessages === true) {
          agent.instructions = undefined;
          agent.additional_instructions = undefined;
        } else {
          agent.instructions = systemContent;
          agent.additional_instructions = undefined;
        }

        if (noSystemMessages === true && systemContent?.length) {
          const latestMessageContent = _messages.pop().content;
          if (typeof latestMessageContent !== 'string') {
            latestMessageContent[0].text = [systemContent, latestMessageContent[0].text].join('\n');
            _messages.push(new HumanMessage({ content: latestMessageContent }));
          } else {
            const text = [systemContent, latestMessageContent].join('\n');
            _messages.push(new HumanMessage(text));
          }
        }

        let messages = _messages;
        if (agent.useLegacyContent === true) {
          messages = formatContentStrings(messages);
        }
        if (
          agent.model_parameters?.clientOptions?.defaultHeaders?.['anthropic-beta']?.includes(
            'prompt-caching',
          )
        ) {
          messages = addCacheControl(messages);
        }

        if (i === 0) {
          memoryPromise = this.runMemory(messages);
        }

        /** Resolve request-based headers for Custom Endpoints. Note: if this is added to
         *  non-custom endpoints, needs consideration of varying provider header configs.
         */
        if (agent.model_parameters?.configuration?.defaultHeaders != null) {
          agent.model_parameters.configuration.defaultHeaders = resolveHeaders({
            headers: agent.model_parameters.configuration.defaultHeaders,
            body: config.configurable.requestBody,
          });
        }

        run = await createRun({
          agent,
          req: this.options.req,
          runId: this.responseMessageId,
          signal: abortController.signal,
          customHandlers: this.options.eventHandlers,
        });

        if (!run) {
          throw new Error('Failed to create run');
        }

        if (i === 0) {
          this.run = run;
        }

        if (contentData.length) {
          const agentUpdate = {
            type: ContentTypes.AGENT_UPDATE,
            [ContentTypes.AGENT_UPDATE]: {
              index: contentData.length,
              runId: this.responseMessageId,
              agentId: agent.id,
            },
          };
          const streamData = {
            event: GraphEvents.ON_AGENT_UPDATE,
            data: agentUpdate,
          };
          this.options.aggregateContent(streamData);
          sendEvent(this.options.res, streamData);
          contentData.push(agentUpdate);
          run.Graph.contentData = contentData;
        }

        if (userMCPAuthMap != null) {
          config.configurable.userMCPAuthMap = userMCPAuthMap;
        }
        await run.processStream({ messages }, config, {
          keepContent: i !== 0,
          tokenCounter: createTokenCounter(this.getEncoding()),
          indexTokenCountMap: currentIndexCountMap,
          maxContextTokens: agent.maxContextTokens,
          callbacks: {
            [Callback.TOOL_ERROR]: logToolError,
          },
        });

        config.signal = null;
      };

      await runAgent(this.options.agent, initialMessages);

      // ... resto del mÃ©todo permanece igual ...

    } catch (err) {
      const attachments = await this.awaitMemoryWithTimeout(memoryPromise);
      if (attachments && attachments.length > 0) {
        this.artifactPromises.push(...attachments);
      }
      logger.error(
        '[api/server/controllers/agents/client.js #sendCompletion] Operation aborted',
        err,
      );
      if (!abortController.signal.aborted) {
        logger.error(
          '[api/server/controllers/agents/client.js #sendCompletion] Unhandled error type',
          err,
        );
        this.contentParts.push({
          type: ContentTypes.ERROR,
          [ContentTypes.ERROR]: `An error occurred while processing the request${err?.message ? `: ${err.message}` : ''}`,
        });
      }
    }
  }

  /**
   *
   * @param {Object} params
   * @param {string} params.text
   * @param {string} params.conversationId
   */
  async titleConvo({ text, abortController }) {
    if (!this.run) {
      throw new Error('Run not initialized');
    }
    const { handleLLMEnd, collected: collectedMetadata } = createMetadataAggregator();
    const { req, res, agent } = this.options;
    const appConfig = req.config;
    let endpoint = agent.endpoint;

    /** @type {import('@librechat/agents').ClientOptions} */
    let clientOptions = {
      model: agent.model || agent.model_parameters.model,
    };

    let titleProviderConfig = getProviderConfig({ provider: endpoint, appConfig });

    /** @type {TEndpoint | undefined} */
    const endpointConfig =
      appConfig.endpoints?.all ??
      appConfig.endpoints?.[endpoint] ??
      titleProviderConfig.customEndpointConfig;
    if (!endpointConfig) {
      logger.warn(
        '[api/server/controllers/agents/client.js #titleConvo] Error getting endpoint config',
      );
    }

    if (endpointConfig?.titleEndpoint && endpointConfig.titleEndpoint !== endpoint) {
      try {
        titleProviderConfig = getProviderConfig({
          provider: endpointConfig.titleEndpoint,
          appConfig,
        });
        endpoint = endpointConfig.titleEndpoint;
      } catch (error) {
        logger.warn(
          `[api/server/controllers/agents/client.js #titleConvo] Error getting title endpoint config for ${endpointConfig.titleEndpoint}, falling back to default`,
          error,
        );
        // Fall back to original provider config
        endpoint = agent.endpoint;
        titleProviderConfig = getProviderConfig({ provider: endpoint, appConfig });
      }
    }

    if (
      endpointConfig &&
      endpointConfig.titleModel &&
      endpointConfig.titleModel !== Constants.CURRENT_MODEL
    ) {
      clientOptions.model = endpointConfig.titleModel;
    }

    const options = await titleProviderConfig.getOptions({
      req,
      res,
      optionsOnly: true,
      overrideEndpoint: endpoint,
      overrideModel: clientOptions.model,
      endpointOption: { model_parameters: clientOptions },
    });

    let provider = options.provider ?? titleProviderConfig.overrideProvider ?? agent.provider;
    if (
      endpoint === EModelEndpoint.azureOpenAI &&
      options.llmConfig?.azureOpenAIApiInstanceName == null
    ) {
      provider = Providers.OPENAI;
    } else if (
      endpoint === EModelEndpoint.azureOpenAI &&
      options.llmConfig?.azureOpenAIApiInstanceName != null &&
      provider !== Providers.AZURE
    ) {
      provider = Providers.AZURE;
    }

    /** @type {import('@librechat/agents').ClientOptions} */
    clientOptions = { ...options.llmConfig };
    if (options.configOptions) {
      clientOptions.configuration = options.configOptions;
    }

    if (clientOptions.maxTokens != null) {
      delete clientOptions.maxTokens;
    }
    if (clientOptions?.modelKwargs?.max_completion_tokens != null) {
      delete clientOptions.modelKwargs.max_completion_tokens;
    }
    if (clientOptions?.modelKwargs?.max_output_tokens != null) {
      delete clientOptions.modelKwargs.max_output_tokens;
    }

    clientOptions = Object.assign(
      Object.fromEntries(
        Object.entries(clientOptions).filter(([key]) => !omitTitleOptions.has(key)),
      ),
    );

    if (
      provider === Providers.GOOGLE &&
      (endpointConfig?.titleMethod === TitleMethod.FUNCTIONS ||
        endpointConfig?.titleMethod === TitleMethod.STRUCTURED)
    ) {
      clientOptions.json = true;
    }

    /** Resolve request-based headers for Custom Endpoints. Note: if this is added to
     *  non-custom endpoints, needs consideration of varying provider header configs.
     */
    if (clientOptions?.configuration?.defaultHeaders != null) {
      clientOptions.configuration.defaultHeaders = resolveHeaders({
        headers: clientOptions.configuration.defaultHeaders,
        body: {
          messageId: this.responseMessageId,
          conversationId: this.conversationId,
          parentMessageId: this.parentMessageId,
        },
      });
    }

    try {
      // Prompt en español para generar títulos
      const spanishTitlePrompt = `Escribe un título conciso para esta conversación en español. El título debe tener 5 palabras o menos, sin puntuación ni comillas. Debe estar en formato de título apropiado para el idioma español.

Conversación:
${text}

Título:`;

      const titleResult = await this.run.generateTitle({
        provider,
        clientOptions,
        inputText: text,
        contentParts: this.contentParts,
        titleMethod: endpointConfig?.titleMethod,
        titlePrompt: spanishTitlePrompt,
        titlePromptTemplate: endpointConfig?.titlePromptTemplate,
        chainOptions: {
          signal: abortController.signal,
          callbacks: [
            {
              handleLLMEnd,
            },
          ],
        },
      });

      const collectedUsage = collectedMetadata.map((item) => {
        let input_tokens, output_tokens;

        if (item.usage) {
          input_tokens =
            item.usage.prompt_tokens || item.usage.input_tokens || item.usage.inputTokens;
          output_tokens =
            item.usage.completion_tokens || item.usage.output_tokens || item.usage.outputTokens;
        } else if (item.tokenUsage) {
          input_tokens = item.tokenUsage.promptTokens;
          output_tokens = item.tokenUsage.completionTokens;
        }

        return {
          input_tokens: input_tokens,
          output_tokens: output_tokens,
        };
      });

      const balanceConfig = getBalanceConfig(appConfig);
      await this.recordCollectedUsage({
        collectedUsage,
        context: 'title',
        model: clientOptions.model,
        balance: balanceConfig,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #titleConvo] Error recording collected usage',
          err,
        );
      });

      return titleResult.title;
    } catch (err) {
      logger.error('[api/server/controllers/agents/client.js #titleConvo] Error', err);
      return;
    }
  }

  /**
   * @param {object} params
   * @param {number} params.promptTokens
   * @param {number} params.completionTokens
   * @param {string} [params.model]
   * @param {OpenAIUsageMetadata} [params.usage]
   * @param {AppConfig['balance']} [params.balance]
   * @param {string} [params.context='message']
   * @returns {Promise<void>}
   */
  async recordTokenUsage({
    model,
    usage,
    balance,
    promptTokens,
    completionTokens,
    context = 'message',
  }) {
    try {
      await spendTokens(
        {
          model,
          context,
          balance,
          conversationId: this.conversationId,
          user: this.user ?? this.options.req.user?.id,
          endpointTokenConfig: this.options.endpointTokenConfig,
        },
        { promptTokens, completionTokens },
      );

      if (
        usage &&
        typeof usage === 'object' &&
        'reasoning_tokens' in usage &&
        typeof usage.reasoning_tokens === 'number'
      ) {
        await spendTokens(
          {
            model,
            balance,
            context: 'reasoning',
            conversationId: this.conversationId,
            user: this.user ?? this.options.req.user?.id,
            endpointTokenConfig: this.options.endpointTokenConfig,
          },
          { completionTokens: usage.reasoning_tokens },
        );
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #recordTokenUsage] Error recording token usage',
        error,
      );
    }
  }

  getEncoding() {
    return 'o200k_base';
  }

  /**
   * Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
   * @param {string} text - The text to get the token count for.
   * @returns {number} The token count of the given text.
   */
  getTokenCount(text) {
    const encoding = this.getEncoding();
    return Tokenizer.getTokenCount(text, encoding);
  }
}

module.exports = AgentClient;
