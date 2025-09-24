const { nanoid } = require('nanoid');
const { sendEvent } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { Tools, StepTypes, FileContext } = require('librechat-data-provider');
const {
  EnvVar,
  Providers,
  GraphEvents,
  getMessageId,
  ToolEndHandler,
  handleToolCalls,
  ChatModelStreamHandler,
} = require('@librechat/agents');
const { processFileCitations } = require('~/server/services/Files/Citations');
const { processCodeOutput } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { saveBase64Image } = require('~/server/services/Files/process');

class BedrockCitationStreamHandler {
  constructor() {
    this.originalHandler = new ChatModelStreamHandler();
  }

  /**
   * Enhanced handler for CHAT_MODEL_STREAM that properly structures citation blocks
   * @param {string} event
   * @param {any} data
   * @param {any} metadata
   * @param {any} graph
   */
  handle(event, data, metadata, graph) {
    try {
      logger.info('[BEDROCK-CITATIONS-V4] CHAT_MODEL_STREAM event:', {
        event,
        hasData: !!data,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : null,
        provider: metadata?.provider,
        model: metadata?.model
      });

      // Procesar y estructurar citations en el stream
      if (data && typeof data === 'object') {
        // Verificar si hay content con citations en el mensaje
        if (data.message && data.message.content && Array.isArray(data.message.content)) {
          const processedContent = [];
          let hasCitations = false;
          
          data.message.content.forEach((contentBlock) => {
            if (contentBlock?.type === 'citation' && contentBlock?.citation) {
              logger.info('[BEDROCK-CITATIONS-V4] Stream citation block found:', {
                citation: JSON.stringify(contentBlock.citation, null, 2)
              });
              processedContent.push(contentBlock);
              hasCitations = true;
            } else if (typeof contentBlock === 'string') {
              // Si es string, convertir a formato de texto estructurado
              processedContent.push({
                type: 'text',
                text: contentBlock
              });
            } else {
              processedContent.push(contentBlock);
            }
          });
          
          // Actualizar el contenido procesado
          data.message.content = processedContent;
          
          if (hasCitations) {
            logger.info('[BEDROCK-CITATIONS-V4] Stream data structured with citations');
          }
        }
        
        // También verificar response_metadata para citations
        if (data.message?.response_metadata?.citation) {
          logger.info('[BEDROCK-CITATIONS-V4] Citation in response_metadata:', {
            citation: JSON.stringify(data.message.response_metadata.citation, null, 2)
          });
          
          // Asegurar que el contentType esté marcado
          if (!data.message.response_metadata.contentType) {
            data.message.response_metadata.contentType = 'citation';
          }
        }
      }

      // Llamar al handler original con los datos estructurados
      if (this.originalHandler && typeof this.originalHandler.handle === 'function') {
        return this.originalHandler.handle(event, data, metadata, graph);
      } else {
        logger.warn('[BEDROCK-CITATIONS-V4] Original ChatModelStreamHandler not available');
      }
    } catch (error) {
      logger.error('[BEDROCK-CITATIONS-V4] Error in BedrockCitationStreamHandler:', {
        error: error.message,
        stack: error.stack,
        data: data ? JSON.stringify(data, null, 2) : null,
        metadata: metadata ? JSON.stringify(metadata, null, 2) : null
      });
      
      // Intentar manejar el error de manera graceful
      throw error; // Re-throw para que el sistema maneje el error normalmente
    }
  }
}

class ModelEndHandler {
  /**
   * @param {Array<UsageMetadata>} collectedUsage
   */
  constructor(collectedUsage) {
    if (!Array.isArray(collectedUsage)) {
      throw new Error('collectedUsage must be an array');
    }
    this.collectedUsage = collectedUsage;
  }

  /**
   * @param {string} event
   * @param {ModelEndData | undefined} data
   * @param {Record<string, unknown> | undefined} metadata
   * @param {StandardGraph} graph
   * @returns
   */
  handle(event, data, metadata, graph) {
    if (!graph || !metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }

    try {
      if (metadata.provider === Providers.GOOGLE || graph.clientOptions?.disableStreaming) {
        handleToolCalls(data?.output?.tool_calls, metadata, graph);
      }

      const usage = data?.output?.usage_metadata;
      if (!usage) {
        return;
      }
      if (metadata?.model) {
        usage.model = metadata.model;
      }

      this.collectedUsage.push(usage);
      const streamingDisabled = !!(
        graph.clientOptions?.disableStreaming || graph?.boundModel?.disableStreaming
      );
      if (!streamingDisabled) {
        return;
      }
      if (!data.output.content) {
        return;
      }
      const stepKey = graph.getStepKey(metadata);
      const message_id = getMessageId(stepKey, graph) ?? '';
      if (message_id) {
        graph.dispatchRunStep(stepKey, {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id,
          },
        });
      }
      const stepId = graph.getStepIdByKey(stepKey);
      const content = data.output.content;
      if (typeof content === 'string') {
        graph.dispatchMessageDelta(stepId, {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        });
      } else if (content.every((c) => c.type?.startsWith('text'))) {
        graph.dispatchMessageDelta(stepId, {
          content,
        });
      }
    } catch (error) {
      logger.error('Error handling model end event:', error);
      logger.error('[BEDROCK-CITATIONS-DEBUG] ModelEndHandler error details:', {
        error: error.message,
        stack: error.stack,
        data: JSON.stringify(data, null, 2),
        metadata: JSON.stringify(metadata, null, 2)
      });
    }
  }
}

/**
 * Get default handlers for stream events.
 * @param {Object} options - The options object.
 * @param {ServerResponse} options.res - The options object.
 * @param {ContentAggregator} options.aggregateContent - The options object.
 * @param {ToolEndCallback} options.toolEndCallback - Callback to use when tool ends.
 * @param {Array<UsageMetadata>} options.collectedUsage - The list of collected usage metadata.
 * @returns {Record<string, t.EventHandler>} The default handlers.
 * @throws {Error} If the request is not found.
 */
function getDefaultHandlers({ res, aggregateContent, toolEndCallback, collectedUsage }) {
  if (!res || !aggregateContent) {
    throw new Error(
      `[getDefaultHandlers] Missing required options: res: ${!res}, aggregateContent: ${!aggregateContent}`,
    );
  }
  const handlers = {
    [GraphEvents.CHAT_MODEL_END]: new ModelEndHandler(collectedUsage),
    [GraphEvents.TOOL_END]: new ToolEndHandler(toolEndCallback),
    [GraphEvents.CHAT_MODEL_STREAM]: new BedrockCitationStreamHandler(),
    [GraphEvents.ON_RUN_STEP]: {
      /**
       * Handle ON_RUN_STEP event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.stepDetails.type === StepTypes.TOOL_CALLS) {
          sendEvent(res, { event, data });
        } else if (metadata?.last_agent_index === metadata?.agent_index) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        } else {
          const agentName = metadata?.name ?? 'Agent';
          const isToolCall = data?.stepDetails.type === StepTypes.TOOL_CALLS;
          const action = isToolCall ? 'performing a task...' : 'thinking...';
          sendEvent(res, {
            event: 'on_agent_update',
            data: {
              runId: metadata?.run_id,
              message: `${agentName} is ${action}`,
            },
          });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_DELTA]: {
      /**
       * Handle ON_RUN_STEP_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.delta.type === StepTypes.TOOL_CALLS) {
          sendEvent(res, { event, data });
        } else if (metadata?.last_agent_index === metadata?.agent_index) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      /**
       * Handle ON_RUN_STEP_COMPLETED event.
       * @param {string} event - The event name.
       * @param {StreamEventData & { result: ToolEndData }} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.result != null) {
          sendEvent(res, { event, data });
        } else if (metadata?.last_agent_index === metadata?.agent_index) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_MESSAGE_DELTA]: {
      /**
       * Handle ON_MESSAGE_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        try {
          logger.info('[BEDROCK-CITATIONS-V4] ON_MESSAGE_DELTA event:', {
            event,
            dataKeys: Object.keys(data || {}),
            content: data?.content ? JSON.stringify(data.content, null, 2) : null,
            provider: metadata?.provider,
            model: metadata?.model
          });

          // Procesar y estructurar content blocks para detectar citations
          if (data?.content && Array.isArray(data.content)) {
            const processedContent = [];
            
            data.content.forEach((contentBlock, index) => {
              logger.info(`[BEDROCK-CITATIONS-V4] Content block ${index}:`, {
                type: contentBlock?.type,
                keys: Object.keys(contentBlock || {}),
                hasText: !!contentBlock?.text,
                hasCitation: !!contentBlock?.citation,
                contentBlock: JSON.stringify(contentBlock, null, 2)
              });

              // Si es un bloque de citation, asegurar que tenga la estructura correcta
              if (contentBlock?.type === 'citation' && contentBlock?.citation) {
                logger.info('[BEDROCK-CITATIONS-V4] Citation block detected - preserving structure:', {
                  citation: JSON.stringify(contentBlock.citation, null, 2)
                });
                // Asegurar que el bloque de cita tenga el formato correcto para el frontend
                processedContent.push({
                  type: 'citation',
                  citation: contentBlock.citation
                });
              } else if (contentBlock?.citation && !contentBlock?.type) {
                // Si tiene citation pero no type, agregarlo
                logger.info('[BEDROCK-CITATIONS-V4] Adding type to citation block');
                processedContent.push({
                  type: 'citation',
                  citation: contentBlock.citation
                });
              } else {
                // Para cualquier otro tipo de contenido, pasarlo tal cual
                processedContent.push(contentBlock);
              }
            });
            
            // Reemplazar el contenido con el procesado
            data.content = processedContent;
          }

          if (metadata?.last_agent_index === metadata?.agent_index) {
            sendEvent(res, { event, data });
          } else if (!metadata?.hide_sequential_outputs) {
            sendEvent(res, { event, data });
          }
          aggregateContent({ event, data });
        } catch (error) {
          logger.error('[BEDROCK-CITATIONS-V4] Error in ON_MESSAGE_DELTA handler:', {
            error: error.message,
            stack: error.stack,
            data: JSON.stringify(data, null, 2),
            metadata: JSON.stringify(metadata, null, 2)
          });
          // Continuar con el flujo normal para no interrumpir
          try {
            if (metadata?.last_agent_index === metadata?.agent_index) {
              sendEvent(res, { event, data });
            } else if (!metadata?.hide_sequential_outputs) {
              sendEvent(res, { event, data });
            }
            aggregateContent({ event, data });
          } catch (innerError) {
            logger.error('[BEDROCK-CITATIONS-V4] Fatal error in ON_MESSAGE_DELTA:', innerError);
          }
        }
      },
    },
    [GraphEvents.ON_REASONING_DELTA]: {
      /**
       * Handle ON_REASONING_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (metadata?.last_agent_index === metadata?.agent_index) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
  };

  return handlers;
}

/**
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Promise<MongoFile | { filename: string; filepath: string; expires: number;} | null>[]} params.artifactPromises
 * @returns {ToolEndCallback} The tool end callback.
 */
function createToolEndCallback({ req, res, artifactPromises }) {
  /**
   * @type {ToolEndCallback}
   */
  return async (data, metadata) => {
    const output = data?.output;
    if (!output) {
      return;
    }

    if (!output.artifact) {
      return;
    }

    if (output.artifact[Tools.file_search]) {
      artifactPromises.push(
        (async () => {
          const user = req.user;
          const attachment = await processFileCitations({
            user,
            metadata,
            appConfig: req.config,
            toolArtifact: output.artifact,
            toolCallId: output.tool_call_id,
          });
          if (!attachment) {
            return null;
          }
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing file citations:', error);
          return null;
        }),
      );
    }

    // TODO: a lot of duplicated code in createToolEndCallback
    // we should refactor this to use a helper function in a follow-up PR
    if (output.artifact[Tools.ui_resources]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.ui_resources,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.ui_resources]: output.artifact[Tools.ui_resources].data,
          };
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.web_search]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.web_search,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.web_search]: { ...output.artifact[Tools.web_search] },
          };
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact.content) {
      /** @type {FormattedContent[]} */
      const content = output.artifact.content;
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (!part) {
          continue;
        }
        if (part.type !== 'image_url') {
          continue;
        }
        const { url } = part.image_url;
        artifactPromises.push(
          (async () => {
            const filename = `${output.name}_${output.tool_call_id}_img_${nanoid()}`;
            const file_id = output.artifact.file_ids?.[i];
            const file = await saveBase64Image(url, {
              req,
              file_id,
              filename,
              endpoint: metadata.provider,
              context: FileContext.image_generation,
            });
            const fileMetadata = Object.assign(file, {
              messageId: metadata.run_id,
              toolCallId: output.tool_call_id,
              conversationId: metadata.thread_id,
            });
            if (!res.headersSent) {
              return fileMetadata;
            }

            if (!fileMetadata) {
              return null;
            }

            res.write(`event: attachment\ndata: ${JSON.stringify(fileMetadata)}\n\n`);
            return fileMetadata;
          })().catch((error) => {
            logger.error('Error processing artifact content:', error);
            return null;
          }),
        );
      }
      return;
    }

    {
      if (output.name !== Tools.execute_code) {
        return;
      }
    }

    if (!output.artifact.files) {
      return;
    }

    for (const file of output.artifact.files) {
      const { id, name } = file;
      artifactPromises.push(
        (async () => {
          const result = await loadAuthValues({
            userId: req.user.id,
            authFields: [EnvVar.CODE_API_KEY],
          });
          const fileMetadata = await processCodeOutput({
            req,
            id,
            name,
            apiKey: result[EnvVar.CODE_API_KEY],
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            session_id: output.artifact.session_id,
          });
          if (!res.headersSent) {
            return fileMetadata;
          }

          if (!fileMetadata) {
            return null;
          }

          res.write(`event: attachment\ndata: ${JSON.stringify(fileMetadata)}\n\n`);
          return fileMetadata;
        })().catch((error) => {
          logger.error('Error processing code output:', error);
          return null;
        }),
      );
    }
  };
}

module.exports = {
  getDefaultHandlers,
  createToolEndCallback,
};
