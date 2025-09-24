const { z } = require('zod');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { ProxyAgent } = require('undici');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { getImageBasename } = require('@librechat/api');
const { FileContext, ContentTypes } = require('librechat-data-provider');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const displayMessage =
  "Nova Canvas displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

class NovaCanvas extends Tool {
  constructor(fields = {}) {
    super();
    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    /** @type {boolean} Necessary for output to contain all image metadata. */
    this.returnMetadata = fields.returnMetadata ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;
    /** @type {boolean} */
    this.isAgent = fields.isAgent;
    /** @type {ServerRequest} */
    this.req = fields.req;
    /** @type {Array<MongoFile>} */
    this.imageFiles = fields.imageFiles || [];
    
    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }
    
    if (fields.uploadImageBuffer) {
      /** @type {uploadImageBuffer} */
      this.uploadImageBuffer = fields.uploadImageBuffer.bind(this);
    }

    // AWS Bedrock configuration using existing LibreChat infrastructure
    this.region = process.env.BEDROCK_AWS_DEFAULT_REGION || 'us-east-1';
    this.credentials = this.getAWSCredentials();
    
    // Initialize Bedrock Runtime client for Nova Canvas
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      credentials: this.credentials,
    });

    this.name = 'nova-canvas';
    this.description = `Use Nova Canvas to create and edit images with AI.
    - TEXT_IMAGE: Generate images from text descriptions
    - IMAGE_VARIATION: Create variations of existing images (requires prompt + reference image)
    - COLOR_GUIDED_GENERATION: Generate with specific color palettes
    - INPAINTING: Replace specific parts of images with new content (requires mask + prompt for replacement)
    - OUTPAINTING: Extend/expand images (requires mask + prompt)
    - BACKGROUND_REMOVAL: Remove backgrounds from images (no prompt needed)
    - VIRTUAL_TRY_ON: Try clothes on people in images
    - Supports various styles and advanced configurations.`;
    
    this.description_for_model =
      process.env.NOVA_CANVAS_SYSTEM_PROMPT ??
      `// Use Nova Canvas to generate and edit images with multiple advanced capabilities.
      // 1. IMPORTANT: Nova Canvas generates multiple images in ONE SINGLE CALL using numberOfImages parameter.
      //    NEVER make multiple separate calls - use numberOfImages instead:
      //    - numberOfImages: 1 for single image
      //    - numberOfImages: 3 for variety (default) 
      //    - numberOfImages: 5 for maximum options
      //    User says "3 images" → ONE call with numberOfImages: 3 (NOT 3 separate calls)
      // 2. Text prompts must be 1-1024 characters (NOT 4000 like other models).
      // 3. Image dimensions: Nova Canvas supports up to 4.19 million pixels (max 2048×2048, 2816×1536). 
      //    Common resolutions: 1024×1024 (square), 1536×1024 (landscape), 1024×1536 (portrait), 2048×1024 (wide), 2816×1536 (ultrawide).
      //    ALWAYS use 1024×1024 by default unless user specifically requests different size/aspect ratio.
      //    For portraits use 1024×1536, for landscapes use 1536×1024, for wide banners use 2048×1024.
      // 4. Multiple task types available:
      //    - TEXT_IMAGE: Generate from text description (1-1024 chars)
      //    - TEXT_IMAGE with conditionImage: Generate with reference image control (CANNY_EDGE, SEGMENTATION)
      //    - COLOR_GUIDED_GENERATION: Generate using up to 10 hex colors (#RRGGBB format) and optional reference image
      //    - IMAGE_VARIATION: Create 1-5 variations of ONE existing image (only accepts 1 reference image at a time, similarity_strength: 0.2-1.0)
      //    - INPAINTING: Replace specific parts of images with new content (requires image + mask + replacement content)
      //    - OUTPAINTING: Extend/expand images beyond borders (requires image + mask)
      //    - BACKGROUND_REMOVAL: Remove background from ONE image (only accepts 1 source image at a time)
      //    - VIRTUAL_TRY_ON: Try clothes/accessories on people (requires source + reference images)
      // 5. Image reference strategy (You specify exactly which images to use):
      //    - reference_image_names: ["filename1.png", "filename2.jpg"] = Specify exact image filenames from conversation
      //    - You can see image names in the conversation context and specify which ones to use
      //    - For IMAGE_VARIATION: specify 1-5 images you want to create variations of (supports multiple reference images)
      //    - For style reference: specify the image(s) that have the desired style
      //    - Nova Canvas will automatically find and convert the specified images to base64
      // 6. For negative prompts: avoid negating words ("no", "not", "without"). Use positive descriptions in negativeText field.
      // 7. When Nova Canvas returns multiple image URLs separated by |, display each using markdown:
      //    ![Generated image 1 - Description](URL1)
      //    ![Generated image 2 - Description](URL2) 
      //    ![Generated image 3 - Description](URL3)
      // 8. Always show ALL generated images to the user.
      // 9. EXAMPLES:
      //    User: "Generate 3 images of a cat" → ✅ ONE call with numberOfImages: 3 (NOT 3 separate calls)
      //    User: "Create variations of this image" → ✅ IMAGE_VARIATION with prompt: "artistic variations with different styles and colors"
      //    User: "Make different versions of photo.jpg" → ✅ IMAGE_VARIATION with prompt: "create diverse variations" + reference_image_names: ["photo.jpg"]
      //    User: "Remove the person from this image" → Ask: "What should appear where the person was? (background, objects, etc.)"
      //    User: "Replace the car with a bicycle" → INPAINTING with mask_prompt: "the car", prompt: "blue bicycle"
      // 10. You must intelligently choose task type and specify exact images needed:
      //    TASK TYPE decisions:
      //      - Text-to-image: use TEXT_IMAGE
      //      - User wants variations: use IMAGE_VARIATION with reference_image_names: ["filename.png"] + prompt: "describe the variations"
      //      - User wants to replace something: use INPAINTING with mask_prompt (what to replace) + prompt (what to put there)
      //      - User says "remove X": Ask user "What should I put in place of X?" - INPAINTING always requires replacement content, cannot simply remove
      //      - User wants style reference: use TEXT_IMAGE with reference_image_names: ["style_image.jpg"] and control_mode
      //      - User mentions colors: use COLOR_GUIDED_GENERATION with color_palette
      //    IMAGE SPECIFICATION (specify exact filenames you see in conversation):
      //      - For variations: reference_image_names: ["candado.png", "image2.jpg"] (specify 1-5 filenames - IMAGE_VARIATION accepts 1-5 images)
      //      - For background removal: reference_image_names: ["photo.jpg"] (specify ONE filename only - BACKGROUND_REMOVAL only accepts 1 image)
      //      - For style reference: reference_image_names: ["reference_style.jpg"]
      //      - For multiple images: IMAGE_VARIATION supports 1-5 images in single call, BACKGROUND_REMOVAL requires separate calls (1 image each)
      // 11. NEW ADVANCED EDITING CAPABILITIES:
      //    INPAINTING - Edit specific parts of images:
      //      - Requires: reference_image_names (source image) + mask_prompt OR mask_image_name + prompt (ALWAYS required)
      //      - mask_prompt: "the three flower pots on the table" (describes WHAT TO REMOVE/MASK)
      //      - prompt: "empty wooden table surface" (describes WHAT TO PUT IN PLACE - ALWAYS required)
      //      - mask_image_name: "mask.png" (alternative: black=edit, white=keep)
      //      - IMPORTANT: Always specify what to put in place of masked area. If user says "remove X" but doesn't specify replacement, ask user: "What should I put in place of X?"
      //      - Examples: 
      //        * Replace objects: mask_prompt: "flower pots", prompt: "empty wooden table surface"
      //        * Fill with background: mask_prompt: "person", prompt: "grass and trees background"
      //        * Clean surface: mask_prompt: "graffiti", prompt: "clean brick wall texture"
      //    OUTPAINTING - Extend images beyond borders:
      //      - Requires: reference_image_names (source image) + mask_prompt OR mask_image_name  
      //      - mask_prompt: "beyond the edges of the landscape" (describes WHERE TO EXTEND)
      //      - prompt/outpainting_text: "more mountains and blue sky" (describes WHAT TO ADD in extended area)
      //      - outpainting_mode: DEFAULT (smooth) or PRECISE (strict boundaries)
      //    BACKGROUND_REMOVAL - Remove background from ONE image:
      //      - Only requires: reference_image_names (specify ONE source image only)
      //      - Returns PNG with transparency
      //      - Process multiple images: Use separate calls for each image
      //    VIRTUAL_TRY_ON - Try clothes on people:
      //      - source_image_name: person image, reference_image_name: clothing image
      //      - mask_type: GARMENT (auto-detect), IMAGE (manual mask), PROMPT (text mask)
      //      - garment_class: UPPER_BODY, LOWER_BODY, FULL_BODY, etc.
      //      - merge_style: BALANCED, SEAMLESS, DETAILED
      // 12. Styles available: PHOTOREALISM, SOFT_DIGITAL_PAINTING, 3D_ANIMATED_FAMILY_FILM, DESIGN_SKETCH, FLAT_VECTOR_ILLUSTRATION, GRAPHIC_NOVEL_ILLUSTRATION, MAXIMALISM, MIDCENTURY_RETRO`;
    
    this.schema = z.object({
      task_type: z
        .enum(['TEXT_IMAGE', 'COLOR_GUIDED_GENERATION', 'IMAGE_VARIATION', 'INPAINTING', 'OUTPAINTING', 'BACKGROUND_REMOVAL', 'VIRTUAL_TRY_ON'])
        .default('TEXT_IMAGE')
        .describe('Type of generation task: TEXT_IMAGE for text-to-image, COLOR_GUIDED_GENERATION for color-guided, IMAGE_VARIATION for variations, INPAINTING for replacing parts of images with new content, OUTPAINTING for extending images, BACKGROUND_REMOVAL for removing backgrounds, VIRTUAL_TRY_ON for trying on clothes'),
      prompt: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe('🚨 CRITICAL: ALWAYS include prompt for IMAGE_VARIATION! Describe the type of variations you want (e.g., "create artistic variations", "different color schemes", "various styles"). REQUIRED for: TEXT_IMAGE, COLOR_GUIDED_GENERATION, IMAGE_VARIATION, INPAINTING, OUTPAINTING. Only OPTIONAL for: BACKGROUND_REMOVAL, VIRTUAL_TRY_ON. Length: 1-1024 characters.'),
      width: z
        .number()
        .min(512)
        .max(2816)
        .default(1024)
        .describe('Width of the generated image in pixels. Max total pixels: 4.19M (e.g., 2048×2048, 2816×1536). Must be multiple of 16'),
      height: z
        .number()
        .min(512)
        .max(2048)
        .default(1024)
        .describe('Height of the generated image in pixels. Max total pixels: 4.19M (e.g., 2048×2048, 2816×1536). Must be multiple of 16'),
      numberOfImages: z
        .number()
        .min(1)
        .max(5)
        .default(3)
        .describe('Number of images to generate (1-5 images per request). Default is 3 images'),
      style: z
        .enum(['PHOTOREALISM', 'SOFT_DIGITAL_PAINTING', '3D_ANIMATED_FAMILY_FILM', 'DESIGN_SKETCH', 'FLAT_VECTOR_ILLUSTRATION', 'GRAPHIC_NOVEL_ILLUSTRATION', 'MAXIMALISM', 'MIDCENTURY_RETRO'])
        .optional()
        .describe('Style preset for the generated image'),
      quality: z
        .enum(['standard', 'premium'])
        .default('standard')
        .describe('Quality level of the generated image'),
      negative_prompt: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe('A text prompt to define what not to include in the image. Must be 1-1024 characters. Avoid negating words like "no", "not", "without"'),
      seed: z
        .number()
        .optional()
        .describe('Seed for reproducible generation'),
      cfg_scale: z
        .number()
        .min(1)
        .max(10)
        .default(7)
        .describe('Classifier-free guidance scale (1-10). Higher values produce images closer to the prompt'),
      reference_image_names: z
        .array(z.string())
        .optional()
        .describe('List of image filenames from conversation to use as reference (e.g., ["candado.png", "landscape.jpg"]). For IMAGE_VARIATION and BACKGROUND_REMOVAL: only specify 1 image. Other tasks can use multiple images. You can see image names in conversation context'),
      control_mode: z
        .enum(['CANNY_EDGE', 'SEGMENTATION'])
        .optional()
        .describe('Control mode when using reference image (CANNY_EDGE for edge detection, SEGMENTATION for semantic control)'),
      control_strength: z
        .number()
        .min(0)
        .max(1)
        .default(0.7)
        .optional()
        .describe('Strength of reference image control (0.0-1.0)'),
      color_palette: z
        .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
        .max(10)
        .optional()
        .describe('List of up to 10 hex color codes in format "#RRGGBB" (e.g., ["#FF5733", "#33FF57"]) that define desired color palette'),
      similarity_strength: z
        .number()
        .min(0.2)
        .max(1.0)
        .default(0.7)
        .optional()
        .describe('How similar the generated image should be to input images. Valid values 0.2-1.0, lower values introduce more randomness'),
      // INPAINTING parameters
      mask_prompt: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe('Natural language description of WHAT TO REMOVE/MASK in the image (for INPAINTING/OUTPAINTING). Example: "the three flower pots on the table". Use either mask_prompt or mask_image_name, not both'),
      mask_image_name: z
        .string()
        .optional()
        .describe('Filename of mask image from conversation (for INPAINTING/OUTPAINTING). Pure black = edit areas, pure white = keep areas. Use either mask_prompt or mask_image_name, not both'),
      inpainting_text: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe('Text describing WHAT TO PUT IN PLACE of the masked area (for INPAINTING). INPAINTING cannot simply remove - it must replace with something specific. Examples: "wooden table surface", "grass background", "brick wall texture", "blue sky". If omitted, uses main prompt as fallback'),
      // OUTPAINTING parameters
      outpainting_mode: z
        .enum(['DEFAULT', 'PRECISE'])
        .default('DEFAULT')
        .optional()
        .describe('How to interpret mask: DEFAULT for smooth transition, PRECISE for strict boundaries (for OUTPAINTING)'),
      outpainting_text: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe('Text describing WHAT TO ADD in the extended area (for OUTPAINTING). Example: "more mountains and blue sky". If omitted, uses main prompt as fallback'),
      // VIRTUAL_TRY_ON parameters
      source_image_name: z
        .string()
        .optional()
        .describe('Filename of source image (person) from conversation (for VIRTUAL_TRY_ON)'),
      reference_image_name: z
        .string()
        .optional()
        .describe('Filename of reference image (clothing) from conversation (for VIRTUAL_TRY_ON)'),
      mask_type: z
        .enum(['IMAGE', 'GARMENT', 'PROMPT'])
        .optional()
        .describe('Type of mask for VIRTUAL_TRY_ON: IMAGE (use mask image), GARMENT (auto-detect clothing), PROMPT (text description)'),
      garment_class: z
        .enum(['UPPER_BODY', 'LOWER_BODY', 'FULL_BODY', 'FOOTWEAR', 'LONG_SLEEVE_SHIRT', 'SHORT_SLEEVE_SHIRT', 'NO_SLEEVE_SHIRT', 'OTHER_UPPER_BODY', 'LONG_PANTS', 'SHORT_PANTS', 'OTHER_LOWER_BODY', 'LONG_DRESS', 'SHORT_DRESS', 'FULL_BODY_OUTFIT', 'OTHER_FULL_BODY', 'SHOES', 'BOOTS', 'OTHER_FOOTWEAR'])
        .optional()
        .describe('Type of clothing to try on (required when mask_type is GARMENT)'),
      mask_shape: z
        .enum(['CONTOUR', 'BOUNDING_BOX', 'DEFAULT'])
        .default('DEFAULT')
        .optional()
        .describe('Shape of mask bounding box for VIRTUAL_TRY_ON'),
      merge_style: z
        .enum(['BALANCED', 'SEAMLESS', 'DETAILED'])
        .default('BALANCED')
        .optional()
        .describe('How to merge images: BALANCED (protects original), SEAMLESS (no seams), DETAILED (better fine details)'),
      preserve_body_pose: z
        .enum(['ON', 'OFF', 'DEFAULT'])
        .default('DEFAULT')
        .optional()
        .describe('Whether to preserve body pose in VIRTUAL_TRY_ON'),
      preserve_hands: z
        .enum(['ON', 'OFF', 'DEFAULT'])
        .default('DEFAULT')
        .optional()
        .describe('Whether to preserve hands in VIRTUAL_TRY_ON'),
      preserve_face: z
        .enum(['ON', 'OFF', 'DEFAULT'])
        .default('DEFAULT')
        .optional()
        .describe('Whether to preserve face in VIRTUAL_TRY_ON'),
      return_mask: z
        .boolean()
        .default(false)
        .optional()
        .describe('Whether to return mask image with output (for VIRTUAL_TRY_ON)'),
      long_sleeve_style: z
        .enum(['SLEEVE_DOWN', 'SLEEVE_UP'])
        .optional()
        .describe('Style for long sleeve garments in VIRTUAL_TRY_ON'),
      tucking_style: z
        .enum(['UNTUCKED', 'TUCKED'])
        .optional()
        .describe('Tucking style for garments in VIRTUAL_TRY_ON'),
      outer_layer_style: z
        .enum(['CLOSED', 'OPEN'])
        .optional()
        .describe('Style for outer layer garments in VIRTUAL_TRY_ON'),
    });
  }

  async getAllConversationImages() {
    // Obtiene todas las imágenes disponibles en la conversación (contexto + mensajes)
    try {
      // PRIMERO: Imágenes en contexto inmediato
      let contextImages = [];
      if (this.imageFiles && this.imageFiles.length > 0) {
        contextImages = this.imageFiles.map(f => ({
          filename: f.filename,
          filepath: f.filepath,
          file_id: f.file_id,
          createdAt: f.createdAt || new Date(),
          source: 'context'
        }));
      }

      // SEGUNDO: Imágenes en mensajes de la conversación
      let messageImages = [];
      const conversationId = this.req.body?.conversationId || this.req.body?.conversation_id;
      
      if (conversationId) {
        logger.debug('[Nova Canvas] Getting images from conversation messages:', {
          conversationId: conversationId,
          userId: this.req.user.id,
        });

        // Usar el modelo Message para obtener TODOS los mensajes con archivos (usuario Y agente)
        const { getMessages } = require('~/models/Message');
        const messages = await getMessages({ conversationId }, null, { createdAt: 1 });
        
        if (messages && messages.length > 0) {
          messages.forEach(message => {
            // Buscar en archivos adjuntos (files)
            if (message.files && message.files.length > 0) {
              message.files.forEach(file => {
                if (file.type && file.type.startsWith('image/')) {
                  messageImages.push({
                    filename: file.filename,
                    filepath: file.filepath,
                    file_id: file.file_id,
                    createdAt: message.createdAt,
                    source: message.isCreatedByUser ? 'user_message' : 'agent_message',
                    messageId: message.messageId,
                    author: message.isCreatedByUser ? 'user' : 'agent'
                  });
                }
              });
            }

            // Buscar en outputs de tool calls (imágenes generadas por agente)
            if (message.content && Array.isArray(message.content)) {
              message.content.forEach(contentItem => {
                  if (contentItem.type === 'tool_call' && contentItem.tool_call) {
                    const output = contentItem.tool_call.output;
                    if (typeof output === 'string' && output.includes('/images/')) {
                      let imageUrls = [];
                      
                      // MÉTODO 1: Intentar parsear como JSON array
                      try {
                        const parsed = JSON.parse(output);
                        if (Array.isArray(parsed)) {
                          // Extraer URLs del array JSON (puede incluir metadatos)
                          parsed.forEach(item => {
                            if (typeof item === 'string' && item.includes('/images/') && /\.(png|jpg|jpeg|gif|webp)$/i.test(item)) {
                              // Limpiar URL de caracteres extraños
                              const cleanUrl = item.trim().replace(/[|'"]/g, '');
                              imageUrls.push(cleanUrl);
                            }
                          });
                        }
                      } catch (e) {
                        // No es JSON válido, continuar con otros métodos
                      }
                      
                      // MÉTODO 2: Buscar formato pipe-separated (URL1|URL2|URL3)
                      if (imageUrls.length === 0 && output.includes('|')) {
                        const pipeSeparated = output.split('|');
                        pipeSeparated.forEach(item => {
                          const trimmed = item.trim().replace(/['"]/g, ''); // Limpiar comillas
                          if (trimmed.includes('/images/') && /\.(png|jpg|jpeg|gif|webp)$/i.test(trimmed)) {
                            imageUrls.push(trimmed);
                          }
                        });
                      }
                      
                      // MÉTODO 3: Regex general para extraer todas las URLs de imagen
                      if (imageUrls.length === 0) {
                        const imageUrlMatches = output.match(/\/images\/[^"'\s,\]|]+\.(png|jpg|jpeg|gif|webp)/gi);
                        if (imageUrlMatches) {
                          // Limpiar URLs de caracteres extraños
                          imageUrls = imageUrlMatches.map(url => url.trim().replace(/[|'"]/g, ''));
                        }
                      }
                      
                      // Procesar todas las URLs encontradas
                      imageUrls.forEach((imagePath, index) => {
                        const filename = imagePath.split('/').pop();
                        messageImages.push({
                          filename: filename,
                          filepath: imagePath,
                          file_id: `${contentItem.tool_call.id}-${index + 1}`,
                          createdAt: message.createdAt,
                          source: 'agent_tool_output',
                          messageId: message.messageId,
                          author: 'agent',
                          toolName: contentItem.tool_call.name,
                          imageIndex: index + 1,
                          totalImages: imageUrls.length
                        });
                      });
                    }
                  }
              });
            }
          });
        }
        
        logger.debug('[Nova Canvas] Found images in messages:', {
          messagesChecked: messages?.length || 0,
          imagesFound: messageImages.length,
          imageFilenames: messageImages.map(img => img.filename),
          userImages: messageImages.filter(img => img.author === 'user').length,
          agentImages: messageImages.filter(img => img.author === 'agent').length,
          toolOutputImages: messageImages.filter(img => img.source === 'agent_tool_output').length,
          multiImageOutputs: messageImages.filter(img => img.totalImages && img.totalImages > 1).length,
        });
      }

      // COMBINAR y deduplicar por filename (priorizar contexto, luego mensajes)
      const allImages = [...contextImages];
      const existingFilenames = contextImages.map(f => f.filename);
      
      messageImages.forEach(msgImg => {
        if (!existingFilenames.includes(msgImg.filename)) {
          allImages.push(msgImg);
          existingFilenames.push(msgImg.filename);
        }
      });

      return allImages;
    } catch (error) {
      logger.error('[Nova Canvas] Error getting all conversation images:', error);
      return [];
    }
  }

  async findImagesByNames(imageNames) {
    // Busca imágenes específicas por nombre en la conversación
    if (!imageNames || imageNames.length === 0) {
      return { count: 0, files: [], context: 'No image names specified' };
    }

    const conversationId = this.req.body?.conversationId || this.req.body?.conversation_id;
    logger.info('[Nova Canvas] Starting hybrid image search:', {
      requestedNames: imageNames,
      conversationId: conversationId || 'MISSING',
      userId: this.req?.user?.id || 'MISSING',
      hasImageFiles: !!(this.imageFiles && this.imageFiles.length > 0),
      imageFilesCount: this.imageFiles?.length || 0,
    });

    try {
      // PRIMERO: Buscar en contexto inmediato (mensaje actual, aún no guardado)
      let foundInContext = [];
      if (this.imageFiles && this.imageFiles.length > 0) {
        foundInContext = this.imageFiles.filter(img => 
          imageNames.includes(img.filename)
        );
        
      logger.info('[Nova Canvas] Found images in immediate context:', {
        requestedNames: imageNames,
        contextFiles: this.imageFiles.map(f => f.filename),
        foundInContext: foundInContext.map(f => f.filename),
        conversationId: this.req.body?.conversationId || this.req.body?.conversation_id || 'MISSING',
      });
      }

      // SEGUNDO: Si no se encontraron todas en contexto, buscar en mensajes de la conversación
      let foundInMessages = [];
      const notFoundInContext = imageNames.filter(name => 
        !foundInContext.some(img => img.filename === name)
      );

      if (notFoundInContext.length > 0) {
        const conversationId = this.req.body?.conversationId || this.req.body?.conversation_id;
        
        if (!conversationId) {
          logger.warn('[Nova Canvas] No conversationId found, will only search in immediate context (no message search for security).');
        } else {
          logger.debug('[Nova Canvas] Message search parameters:', {
            conversationId: conversationId,
            searchingFor: notFoundInContext,
          });

          // Usar el modelo Message para obtener TODOS los mensajes con archivos (usuario Y agente)
          const { getMessages } = require('~/models/Message');
          const messages = await getMessages({ conversationId }, null, { createdAt: 1 });
          
          logger.debug('[Nova Canvas] Messages query results:', {
            messagesFound: messages?.length || 0,
            conversationId: conversationId,
          });

          if (messages && messages.length > 0) {
            const messageImages = [];
            
            messages.forEach(message => {
              // Buscar en archivos adjuntos (files)
              if (message.files && message.files.length > 0) {
                message.files.forEach(file => {
                  if (file.type && file.type.startsWith('image/') && notFoundInContext.includes(file.filename)) {
                    messageImages.push({
                      filename: file.filename,
                      filepath: file.filepath,
                      file_id: file.file_id,
                      createdAt: message.createdAt,
                      source: message.isCreatedByUser ? 'user_message' : 'agent_message',
                      messageId: message.messageId,
                      author: message.isCreatedByUser ? 'user' : 'agent'
                    });
                  }
                });
              }

              // Buscar en outputs de tool calls (imágenes generadas por agente)
              if (message.content && Array.isArray(message.content)) {
                message.content.forEach(contentItem => {
                  if (contentItem.type === 'tool_call' && contentItem.tool_call) {
                    const output = contentItem.tool_call.output;
                    if (typeof output === 'string' && output.includes('/images/')) {
                      let imageUrls = [];
                      
                      // MÉTODO 1: Intentar parsear como JSON array
                      try {
                        const parsed = JSON.parse(output);
                        if (Array.isArray(parsed)) {
                          // Extraer URLs del array JSON (puede incluir metadatos)
                          parsed.forEach(item => {
                            if (typeof item === 'string' && item.includes('/images/') && /\.(png|jpg|jpeg|gif|webp)$/i.test(item)) {
                              // Limpiar URL de caracteres extraños
                              const cleanUrl = item.trim().replace(/[|'"]/g, '');
                              imageUrls.push(cleanUrl);
                            }
                          });
                        }
                      } catch (e) {
                        // No es JSON válido, continuar con otros métodos
                      }
                      
                      // MÉTODO 2: Buscar formato pipe-separated (URL1|URL2|URL3)
                      if (imageUrls.length === 0 && output.includes('|')) {
                        const pipeSeparated = output.split('|');
                        pipeSeparated.forEach(item => {
                          const trimmed = item.trim().replace(/['"]/g, ''); // Limpiar comillas
                          if (trimmed.includes('/images/') && /\.(png|jpg|jpeg|gif|webp)$/i.test(trimmed)) {
                            imageUrls.push(trimmed);
                          }
                        });
                      }
                      
                      // MÉTODO 3: Regex general para extraer todas las URLs de imagen
                      if (imageUrls.length === 0) {
                        const imageUrlMatches = output.match(/\/images\/[^"'\s,\]|]+\.(png|jpg|jpeg|gif|webp)/gi);
                        if (imageUrlMatches) {
                          // Limpiar URLs de caracteres extraños
                          imageUrls = imageUrlMatches.map(url => url.trim().replace(/[|'"]/g, ''));
                        }
                      }
                      
                      // Procesar todas las URLs encontradas
                      imageUrls.forEach((imagePath, index) => {
                        const filename = imagePath.split('/').pop();
                        if (notFoundInContext.includes(filename)) {
                          messageImages.push({
                            filename: filename,
                            filepath: imagePath,
                            file_id: `${contentItem.tool_call.id}-${index + 1}`,
                            createdAt: message.createdAt,
                            source: 'agent_tool_output',
                            messageId: message.messageId,
                            author: 'agent',
                            toolName: contentItem.tool_call.name,
                            imageIndex: index + 1,
                            totalImages: imageUrls.length
                          });
                        }
                      });
                    }
                  }
                });
              }
            });

            // Agrupar por filename y tomar el más reciente de cada uno
            const imagesByFilename = {};
            messageImages.forEach(file => {
              const filename = file.filename;
              if (!imagesByFilename[filename] || file.createdAt > imagesByFilename[filename].createdAt) {
                imagesByFilename[filename] = file;
              }
            });

            foundInMessages = Object.values(imagesByFilename);
            
            logger.info('[Nova Canvas] Found images in messages:', {
              searchedNames: notFoundInContext,
              foundInMessages: foundInMessages.map(f => ({ 
                filename: f.filename, 
                messageId: f.messageId,
                author: f.author,
                source: f.source,
                toolName: f.toolName,
                imageIndex: f.imageIndex,
                totalImages: f.totalImages
              })),
              userImages: foundInMessages.filter(f => f.author === 'user').length,
              agentImages: foundInMessages.filter(f => f.author === 'agent').length,
              toolOutputImages: foundInMessages.filter(f => f.source === 'agent_tool_output').length,
              multiImageOutputs: foundInMessages.filter(f => f.totalImages && f.totalImages > 1).length,
              conversationId: conversationId,
              searchScope: 'conversation_messages (user + agent + multi-image tool_outputs)',
            });
          }
        }
      }

      // COMBINAR: Contexto inmediato + Mensajes de conversación
      const uniqueImages = [...foundInContext, ...foundInMessages];
      
      // Validar que todas las imágenes tienen filepath
      uniqueImages.forEach((image, index) => {
        if (!image.filepath) {
          logger.error('[Nova Canvas] Image missing filepath at index', index, ':', image);
        }
      });
      
      const conversationId = this.req.body?.conversationId || this.req.body?.conversation_id;
      
      logger.info('[Nova Canvas] Hybrid search results:', {
        requestedNames: imageNames,
        totalFound: uniqueImages.length,
        foundInContext: foundInContext.length,
        foundInMessages: foundInMessages.length,
        userImages: uniqueImages.filter(f => f.author === 'user').length,
        agentImages: uniqueImages.filter(f => f.author === 'agent').length,
        toolOutputImages: uniqueImages.filter(f => f.source === 'agent_tool_output').length,
        multiImageOutputs: uniqueImages.filter(f => f.totalImages && f.totalImages > 1).length,
        contextImages: foundInContext.length,
        strategy: 'immediate_context + conversation_messages (user + agent + multi-image tool_outputs)',
        conversationId: conversationId || 'no_conversation_id',
        searchScope: 'current_conversation_transversal_with_multi_tools',
        foundFiles: uniqueImages.map(f => ({ 
          filename: f.filename, 
          filepath: f.filepath, 
          file_id: f.file_id,
          source: f.source || (foundInContext.includes(f) ? 'context' : 'message'),
          author: f.author || 'context',
          toolName: f.toolName,
          imageIndex: f.imageIndex,
          totalImages: f.totalImages,
          createdAt: f.createdAt,
          hasFilepath: !!f.filepath
        })),
      });

      // Verificar qué nombres no se encontraron
      const foundFilenames = uniqueImages.map(f => f.filename);
      const notFound = imageNames.filter(name => !foundFilenames.includes(name));
      
      if (notFound.length > 0) {
        logger.warn('[Nova Canvas] Images not found:', {
          notFoundNames: notFound,
          availableInConversation: foundFilenames,
        });
      }

      return {
        count: uniqueImages.length,
        files: uniqueImages,
        requestedNames: imageNames,
        foundNames: foundFilenames,
        notFound,
      };
    } catch (error) {
      logger.error('[Nova Canvas] Error searching images by names:', error);
      throw error;
    }
  }

  async getAvailableImages(searchConversationHistory = false) {
    // Si se solicita buscar en historial, buscar en toda la conversación
    if (searchConversationHistory) {
      logger.info('[Nova Canvas] Explicitly searching conversation history as requested');
    } else {
      // Si no se solicita historial, usar solo contexto inmediato si está disponible
      if (this.imageFiles && this.imageFiles.length > 0) {
        const imageContext = `Available images in current message context:\n${this.imageFiles.map((file, index) => 
          `  ${index + 1}. ${file.filename} (${file.file_id}) - ${file.type}`
        ).join('\n')}`;

        logger.info('[Nova Canvas] Using current message images only');
        return {
          count: this.imageFiles.length,
          files: this.imageFiles,
          context: imageContext,
          source: 'current_message'
        };
      }
    }

    // Buscar en toda la conversación (si se solicita O no hay imágenes en contexto inmediato)
    try {
      const { getFiles } = require('~/models/File');
      
      if (!this.req?.user?.id) {
        return { count: 0, files: [], context: 'No user ID available for file search' };
      }

      // Buscar todas las imágenes del usuario en la conversación actual
      const conversationId = this.req.body?.conversationId;
      const query = {
        user: this.req.user.id,
        type: { $regex: '^image/' },
        ...(conversationId && { conversationId }),
      };

      const allUserImages = await getFiles(query, {}, { createdAt: -1 });
      
      if (allUserImages && allUserImages.length > 0) {
        const imageContext = `Images found in conversation history:\n${allUserImages.map((file, index) => 
          `  ${index + 1}. ${file.filename} (${file.file_id}) - ${file.type} - ${file.createdAt}`
        ).join('\n')}`;

        logger.info('[Nova Canvas] Found images in conversation history:', {
          count: allUserImages.length,
          conversationId,
          searchRequested: searchConversationHistory,
        });

        return {
          count: allUserImages.length,
          files: allUserImages,
          context: imageContext,
          source: 'conversation_history'
        };
      }
    } catch (error) {
      logger.error('[Nova Canvas] Error searching for conversation images:', error);
    }

    return { count: 0, files: [], context: 'No images available in conversation' };
  }

  async getImageFromContext(imageIndex = 0) {
    // Obtiene una imagen específica del contexto de la conversación (completa)
    const availableImages = await this.getAvailableImages();
    
    if (availableImages.count === 0) {
      throw new Error('No images available in conversation context');
    }

    if (imageIndex >= availableImages.count) {
      throw new Error(`Image index ${imageIndex} out of range. Available: 0-${availableImages.count - 1}`);
    }

    const imageFile = availableImages.files[imageIndex];
    
    try {
      // Convertir la imagen del contexto a base64
      return await this.convertImageUrlToBase64(imageFile.filepath);
    } catch (error) {
      logger.error(`[Nova Canvas] Error accessing image from context:`, error);
      throw new Error(`Could not access image ${imageFile.filename}: ${error.message}`);
    }
  }

  async convertImageUrlToBase64(imageUrl) {
    try {
      if (!imageUrl) {
        throw new Error('Image URL is undefined or null');
      }

      if (typeof imageUrl !== 'string') {
        throw new Error(`Image URL must be a string, received: ${typeof imageUrl}`);
      }

      // Limpiar URL de caracteres extraños (pipe, espacios, etc.)
      imageUrl = imageUrl.trim().replace(/[|'"]/g, '');

      logger.debug('[Nova Canvas] Converting image URL to base64:', imageUrl);

      // Si es una URL local de LibreChat, usar la misma lógica que getLocalFileStream
      if (imageUrl.startsWith('/images/')) {
        const fs = require('fs');
        const path = require('path');
        
        // Usar la configuración de rutas de LibreChat
        const appConfig = this.req?.config;
        const basePath = imageUrl.split('/images/')[1];
        
        if (!basePath) {
          throw new Error(`Invalid image path: ${imageUrl}`);
        }

        // Usar imageOutput path como en getLocalFileStream
        const imageOutputPath = appConfig?.paths?.imageOutput || '/app/uploads';
        const fullPath = path.join(imageOutputPath, basePath);
        
        logger.debug('[Nova Canvas] Attempting to read image:', {
          imageUrl,
          basePath,
          imageOutputPath,
          fullPath,
          fileExists: fs.existsSync(fullPath)
        });
        
        if (fs.existsSync(fullPath)) {
          const buffer = fs.readFileSync(fullPath);
          logger.info('[Nova Canvas] Successfully read image file:', {
            fullPath,
            bufferSize: buffer.length,
            base64Length: buffer.toString('base64').length
          });
          return buffer.toString('base64');
        }
        
        // Intentar rutas alternativas
        const alternativePaths = [
          path.join('/app/uploads', basePath),
          path.join('/app/client/public/images', basePath),  // ← Ruta que aparece en el error
          path.join('/app/client/public', basePath),         // ← Sin "images" duplicado
          path.join('./client/public/images', basePath),     // ← Ruta relativa 
          path.join('./uploads', basePath),
          path.join(process.cwd(), 'uploads', basePath),
          path.join(process.cwd(), 'client', 'public', 'images', basePath),
          path.join(process.cwd(), 'client', 'public', basePath.replace(/^images\//, '')), // Sin duplicar "images"
        ];
        
        for (const altPath of alternativePaths) {
          logger.debug('[Nova Canvas] Trying alternative path:', altPath);
          if (fs.existsSync(altPath)) {
            const buffer = fs.readFileSync(altPath);
            logger.info('[Nova Canvas] Found image in alternative path:', altPath);
            return buffer.toString('base64');
          }
        }
        
        // Último intento: Si el archivo no se encuentra localmente, intentar HTTP
        logger.debug('[Nova Canvas] File not found in filesystem, trying HTTP fallback');
        try {
          const httpUrl = `http://localhost:3080${imageUrl}`;
          logger.debug('[Nova Canvas] Attempting HTTP fetch:', httpUrl);
          
          const response = await fetch(httpUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            logger.info('[Nova Canvas] Successfully fetched image via HTTP:', httpUrl);
            return Buffer.from(arrayBuffer).toString('base64');
          }
        } catch (httpError) {
          logger.debug('[Nova Canvas] HTTP fallback failed:', httpError.message);
        }
        
        throw new Error(`Image file not found. Tried:
- Primary path: ${fullPath}
- Alternative paths: ${alternativePaths.join(', ')}
- HTTP fallback: http://localhost:3080${imageUrl}
Original URL: ${imageUrl}`);
      }
      
      // Si es una URL externa, hacer fetch
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
      logger.error('[Nova Canvas] Error converting image URL to base64:', error);
      throw error;
    }
  }

  getAWSCredentials() {
    const {
      BEDROCK_AWS_ACCESS_KEY_ID,
      BEDROCK_AWS_SECRET_ACCESS_KEY,
      BEDROCK_AWS_SESSION_TOKEN,
    } = process.env;

    if (!BEDROCK_AWS_ACCESS_KEY_ID || !BEDROCK_AWS_SECRET_ACCESS_KEY) {
      if (!this.override) {
        throw new Error('Missing AWS Bedrock credentials (BEDROCK_AWS_ACCESS_KEY_ID and BEDROCK_AWS_SECRET_ACCESS_KEY)');
      }
      return {};
    }

    const credentials = {
      accessKeyId: BEDROCK_AWS_ACCESS_KEY_ID,
      secretAccessKey: BEDROCK_AWS_SECRET_ACCESS_KEY,
    };

    if (BEDROCK_AWS_SESSION_TOKEN) {
      credentials.sessionToken = BEDROCK_AWS_SESSION_TOKEN;
    }

    return credentials;
  }

  wrapInMarkdown(imageUrl) {
    return `![generated image](${imageUrl})`;
  }

  returnValue(value) {
    if (this.isAgent === true && typeof value === 'string') {
      return [value, {}];
    } else if (this.isAgent === true && typeof value === 'object') {
      // Para herramientas de imagen con agentes, devolver objeto directamente
      // El ToolService lo procesará como imageOutput y creará IMAGE_FILE
      return value;
    }
    return value;
  }

  async _call(data) {
    // Log all received parameters for debugging
    logger.info('[Nova Canvas] Received parameters:', {
      receivedData: JSON.stringify(data, null, 2),
      hasSearchConversationHistory: 'search_conversation_history' in data,
      searchConversationHistoryValue: data.search_conversation_history,
      allKeys: Object.keys(data),
      parameterCount: Object.keys(data).length,
    });

    // Log what will be shown in the UI
    logger.info('[Nova Canvas] Parameters that will be visible in UI:', {
      uiVisibleData: JSON.stringify(data, null, 2),
      includesSearchHistory: JSON.stringify(data).includes('search_conversation_history'),
    });

    const {
      task_type = 'TEXT_IMAGE',
      prompt,
      width = 1024,
      height = 1024,
      numberOfImages = 3,
      style,
      quality = 'standard',
      negative_prompt,
      seed,
      cfg_scale = 7,
      reference_image_names,
      control_mode,
      control_strength = 0.7,
      color_palette,
      similarity_strength = 0.7,
    } = data;

    // Log critical parameters for debugging
    logger.info('[Nova Canvas] Critical parameters extracted:', {
      task_type,
      promptExists: !!prompt,
      promptValue: prompt,
      promptType: typeof prompt,
      promptLength: prompt?.length || 0,
      hasReferenceImages: !!(reference_image_names && reference_image_names.length > 0),
      referenceImageCount: reference_image_names?.length || 0
    });

    // Validate prompt requirements based on task type according to AWS Bedrock specification
    const promptValidation = {
      'TEXT_IMAGE': {
        required: true,
        reason: 'AWS spec requires text field for TEXT_IMAGE: "A text prompt to generate the image" (1-1024 chars)'
      },
      'COLOR_GUIDED_GENERATION': {
        required: true,
        reason: 'AWS spec requires text field for COLOR_GUIDED_GENERATION: "A text prompt to generate the image" (1-1024 chars)'
      },
      'IMAGE_VARIATION': {
        required: true,
        reason: 'AWS spec requires text field for IMAGE_VARIATION: "A text prompt to generate the image" (1-1024 chars)'
      },
      'INPAINTING': {
        required: true,
        reason: 'AWS spec requires text field for INPAINTING: "A text prompt that describes what to generate within the masked region" (1-1024 chars). Cannot simply remove - must specify replacement content.'
      },
      'OUTPAINTING': {
        required: true,
        reason: 'AWS spec requires text field for OUTPAINTING: "A text prompt that describes what to generate within the masked region" (1-1024 chars)'
      },
      'BACKGROUND_REMOVAL': {
        required: false,
        reason: 'AWS spec: BACKGROUND_REMOVAL does not use text field'
      },
      'VIRTUAL_TRY_ON': {
        required: false,
        reason: 'AWS spec: VIRTUAL_TRY_ON does not use text field'
      }
    };

    const validation = promptValidation[task_type];
    if (validation?.required && (!prompt || prompt.trim().length === 0)) {
      // Log detallado para debugging
      logger.error('[Nova Canvas] PROMPT VALIDATION FAILED:', {
        task_type,
        promptReceived: prompt,
        promptType: typeof prompt,
        promptLength: prompt?.length || 0,
        trimmedLength: prompt?.trim?.().length || 0,
        allReceivedParams: Object.keys(data),
        requiredBySpec: validation.required,
        reason: validation.reason
      });
      
      throw new Error(`MISSING REQUIRED FIELD - prompt: ${validation.reason}. Current prompt value: "${prompt || 'undefined/null'}" (type: ${typeof prompt})`);
    }
    
    // Log successful validation for debugging
    if (validation?.required && prompt && prompt.trim().length > 0) {
      logger.debug('[Nova Canvas] Prompt validation passed:', {
        task_type,
        promptLength: prompt.trim().length,
        promptPreview: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')
      });
    }

    // Buscar imágenes por nombres específicos si se proporcionan
    let referenceImages = [];
    if (reference_image_names && reference_image_names.length > 0) {
      const imageSearchResult = await this.findImagesByNames(reference_image_names);
      referenceImages = imageSearchResult.files;
      
      logger.info('[Nova Canvas] Images found by names:', {
        requestedNames: reference_image_names,
        foundCount: referenceImages.length,
        foundFiles: referenceImages.map(f => ({ filename: f.filename, filepath: f.filepath })),
      });
      
      if (referenceImages.length === 0) {
        const notFound = reference_image_names;
        
        // Obtener todas las imágenes disponibles para mostrar opciones
        const allImages = await this.getAllConversationImages();
        const availableFilenames = allImages.map(img => img.filename);
        const conversationId = this.req.body?.conversationId || this.req.body?.conversation_id;
        
        // Información detallada para debugging
        const debugInfo = {
          searchedNames: notFound,
          conversationId: conversationId || 'MISSING',
          userId: this.req?.user?.id || 'MISSING',
          contextImages: this.imageFiles?.length || 0,
          contextFilenames: this.imageFiles?.map(f => f.filename) || [],
          availableInConversation: availableFilenames,
          totalAvailable: availableFilenames.length,
          requestBody: Object.keys(this.req?.body || {}),
        };
        
        throw new Error(`No images found with names: ${notFound.join(', ')}. 
DEBUG INFO:
- Conversation ID: ${debugInfo.conversationId}
- User ID: ${debugInfo.userId}
- Images in context: ${debugInfo.contextImages} [${debugInfo.contextFilenames.join(', ')}]
- Available in conversation: ${debugInfo.totalAvailable > 0 ? debugInfo.availableInConversation.join(', ') : 'none found'}
- Request keys: ${debugInfo.requestBody.join(', ')}
Check the exact filename in conversation context.`);
      }
    }

    // Validar límites según documentación de AWS
    if (prompt && prompt.length > 1024) {
      throw new Error('Prompt must be 1-1024 characters in length');
    }

    // Validar que las dimensiones no excedan 4.19 millones de píxeles
    const totalPixels = width * height;
    const maxPixels = 4190000; // 4.19 millones
    if (totalPixels > maxPixels) {
      throw new Error(`Image dimensions ${width}x${height} exceed maximum of 4.19 million pixels (${totalPixels} > ${maxPixels}). Try smaller dimensions like 2048x2048 or 2816x1536.`);
    }

    // Validar que las dimensiones sean múltiplos de 16
    if (width % 16 !== 0 || height % 16 !== 0) {
      throw new Error(`Width (${width}) and height (${height}) must be multiples of 16. Try: ${Math.round(width/16)*16}x${Math.round(height/16)*16}`);
    }
    
    if (negative_prompt && negative_prompt.length > 1024) {
      throw new Error('Negative prompt must be 1-1024 characters in length');
    }
    
    if (cfg_scale > 10) {
      logger.warn(`[Nova Canvas] cfgScale ${cfg_scale} exceeds maximum of 10, clamping to 10`);
      cfg_scale = 10;
    }
    
    if (similarity_strength < 0.2) {
      logger.warn(`[Nova Canvas] similarity_strength ${similarity_strength} below minimum of 0.2, setting to 0.2`);
      similarity_strength = 0.2;
    }

    // Usar imágenes especificadas por nombre (enfoque directo y controlado por LLM)
    let referenceImageFiles = [];
    if (reference_image_names && reference_image_names.length > 0) {
      const imageSearchResult = await this.findImagesByNames(reference_image_names);
      referenceImageFiles = imageSearchResult.files;
      
      if (referenceImageFiles.length === 0) {
        const notFound = imageSearchResult.notFound || reference_image_names;
        
        // Obtener todas las imágenes disponibles para mostrar opciones
        const allImages = await this.getAllConversationImages();
        const availableFilenames = allImages.map(img => img.filename);
        const conversationId = this.req.body?.conversationId || this.req.body?.conversation_id;
        
        // Información detallada para debugging
        const debugInfo = {
          searchedNames: notFound,
          conversationId: conversationId || 'MISSING',
          userId: this.req?.user?.id || 'MISSING',
          contextImages: this.imageFiles?.length || 0,
          contextFilenames: this.imageFiles?.map(f => f.filename) || [],
          messageSearchResults: foundInMessages.length,
          availableInConversation: availableFilenames,
          totalAvailable: availableFilenames.length
        };
        
        throw new Error(`No images found with names: ${notFound.join(', ')}. 
DEBUG INFO:
- Conversation ID: ${debugInfo.conversationId}
- User ID: ${debugInfo.userId}
- Images in context: ${debugInfo.contextImages} [${debugInfo.contextFilenames.join(', ')}]
- Images found in messages: ${debugInfo.messageSearchResults}
- Available in conversation: ${debugInfo.totalAvailable > 0 ? debugInfo.availableInConversation.join(', ') : 'none found'}
Please check if the image exists in this specific conversation.`);
      }
    }

    // Prepare the request for Nova Canvas based on task type
    let requestBody = {};

    if (task_type === 'TEXT_IMAGE') {
      requestBody = {
        taskType: 'TEXT_IMAGE',
        textToImageParams: {
          text: prompt,
          ...(negative_prompt && { negativeText: negative_prompt }),
          ...(style && { style }),
        },
        imageGenerationConfig: {
          width,
          height,
          numberOfImages,
          ...(quality !== 'standard' && { quality }),
          ...(seed !== undefined && { seed }),
          ...(cfg_scale !== 7 && { cfgScale: cfg_scale }),
        },
      };

      // Add reference image for condition control if provided by name
      if (referenceImageFiles.length > 0) {
        try {
          const referenceImage = referenceImageFiles[0]; // Use first image for condition
          
          if (!referenceImage || !referenceImage.filepath) {
            throw new Error(`Reference image is missing filepath. Image: ${JSON.stringify(referenceImage)}`);
          }
          
          const base64Image = await this.convertImageUrlToBase64(referenceImage.filepath);
          requestBody.textToImageParams.conditionImage = base64Image;
          if (control_mode) {
            requestBody.textToImageParams.controlMode = control_mode;
            requestBody.textToImageParams.controlStrength = control_strength;
          }
          logger.info('[Nova Canvas] Using reference image for TEXT_IMAGE:', referenceImage.filename);
        } catch (error) {
          logger.warn('[Nova Canvas] Could not process reference image:', error.message);
        }
      }
    } else if (task_type === 'COLOR_GUIDED_GENERATION') {
      requestBody = {
        taskType: 'COLOR_GUIDED_GENERATION',
        colorGuidedGenerationParams: {
          text: prompt,
          ...(negative_prompt && { negativeText: negative_prompt }),
          ...(color_palette && { colors: color_palette }),
        },
        imageGenerationConfig: {
          width,
          height,
          numberOfImages,
          ...(quality !== 'standard' && { quality }),
          ...(seed !== undefined && { seed }),
          ...(cfg_scale !== 7 && { cfgScale: cfg_scale }),
        },
      };

      // Add reference image for color guidance if provided by name
      if (referenceImageFiles.length > 0) {
        try {
          const referenceImage = referenceImageFiles[0]; // Use first image for color guidance
          
          if (!referenceImage || !referenceImage.filepath) {
            throw new Error(`Reference image is missing filepath. Image: ${JSON.stringify(referenceImage)}`);
          }
          
          const base64Image = await this.convertImageUrlToBase64(referenceImage.filepath);
          requestBody.colorGuidedGenerationParams.referenceImage = base64Image;
          logger.info('[Nova Canvas] Using reference image for COLOR_GUIDED_GENERATION:', referenceImage.filename);
        } catch (error) {
          logger.warn('[Nova Canvas] Could not process reference image for color guidance:', error.message);
        }
      }
    } else if (task_type === 'IMAGE_VARIATION') {
      if (referenceImageFiles.length === 0) {
        throw new Error('reference_image_names is required for IMAGE_VARIATION task. Specify the filename(s) of images you want to create variations of');
      }

      // IMAGE_VARIATION en Nova Canvas acepta 1-5 imágenes según especificación oficial
      if (referenceImageFiles.length > 5) {
        logger.warn('[Nova Canvas] IMAGE_VARIATION supports maximum 5 images. Using first 5 images only:', {
          requested: referenceImageFiles.length,
          using: referenceImageFiles.slice(0, 5).map(f => f.filename),
          ignored: referenceImageFiles.slice(5).map(f => f.filename)
        });
        referenceImageFiles = referenceImageFiles.slice(0, 5);
      }

      try {
        // Procesar TODAS las imágenes de referencia (1-5 imágenes)
        const base64Images = [];
        
        for (let i = 0; i < referenceImageFiles.length; i++) {
          const imageFile = referenceImageFiles[i];
          
          if (!imageFile) {
            throw new Error(`Image file object at index ${i} is undefined`);
          }
          
          if (!imageFile.filepath) {
            logger.error('[Nova Canvas] Image file missing filepath:', imageFile);
            throw new Error(`Image file "${imageFile.filename || 'unknown'}" is missing filepath property`);
          }
          
          logger.debug(`[Nova Canvas] Processing image ${i + 1}/${referenceImageFiles.length} for variation:`, {
            filename: imageFile.filename,
            filepath: imageFile.filepath,
            file_id: imageFile.file_id,
          });
          
          // Convertir cada imagen a base64
          const base64Image = await this.convertImageUrlToBase64(imageFile.filepath);
          base64Images.push(base64Image);
          
          logger.debug(`[Nova Canvas] Converted image ${i + 1}/${referenceImageFiles.length} to base64:`, {
            filename: imageFile.filename,
            originalPath: imageFile.filepath,
            base64Length: base64Image.length
          });
        }

        requestBody = {
          taskType: 'IMAGE_VARIATION',
          imageVariationParams: {
            images: base64Images, // Array con 1-5 imágenes base64
            text: prompt,
            ...(negative_prompt && { negativeText: negative_prompt }),
            similarityStrength: similarity_strength,
          },
          imageGenerationConfig: {
            width,
            height,
            numberOfImages,
            ...(seed !== undefined && { seed }),
            ...(cfg_scale !== 7 && { cfgScale: cfg_scale }),
          },
        };
        
        logger.info('[Nova Canvas] IMAGE_VARIATION request prepared with multiple images:', {
          imageNames: referenceImageFiles.map(f => f.filename),
          requestedImages: referenceImageFiles.length,
          usingImages: base64Images.length,
          totalBase64Length: base64Images.reduce((sum, img) => sum + img.length, 0)
        });
      } catch (error) {
        throw new Error(`Could not process reference images for variation: ${error.message}`);
      }
    } else if (task_type === 'INPAINTING') {
      // INPAINTING requires source image and mask
      if (!reference_image_names || reference_image_names.length === 0) {
        throw new Error('reference_image_names is required for INPAINTING task. Specify the filename of the image you want to edit');
      }

      // Get source image for inpainting
      const inpaintingSearchResult = await this.findImagesByNames(reference_image_names);
      if (inpaintingSearchResult.files.length === 0) {
        throw new Error(`Source image not found: ${reference_image_names.join(', ')}. Make sure the image is in the conversation`);
      }

      let maskImage = null;
      let maskImageFiles = [];
      
      // Get mask image if mask_image_name is provided
      if (data.mask_image_name) {
        const maskSearchResult = await this.findImagesByNames([data.mask_image_name]);
        maskImageFiles = maskSearchResult.files;
        if (maskImageFiles.length === 0) {
          throw new Error(`Mask image not found: ${data.mask_image_name}. Make sure the mask image is in the conversation`);
        }
        maskImage = await this.convertImageUrlToBase64(maskImageFiles[0].filepath);
      }

      // Validate mask requirements
      if (!data.mask_prompt && !maskImage) {
        throw new Error('Either mask_prompt or mask_image_name is required for INPAINTING');
      }
      if (data.mask_prompt && maskImage) {
        throw new Error('Cannot use both mask_prompt and mask_image_name. Choose one');
      }

      try {
        const sourceImage = await this.convertImageUrlToBase64(inpaintingSearchResult.files[0].filepath);
        const inpaintingText = data.inpainting_text || prompt;
        
        if (!data.inpainting_text) {
          logger.info('[Nova Canvas] No inpainting_text provided, using main prompt as fallback:', {
            prompt: prompt,
            fallbackUsed: true
          });
        }
        
        requestBody = {
          taskType: 'INPAINTING',
          inPaintingParams: {
            image: sourceImage,
            ...(data.mask_prompt && { maskPrompt: data.mask_prompt }),
            ...(maskImage && { maskImage }),
            text: inpaintingText,
            ...(negative_prompt && { negativeText: negative_prompt }),
          },
          imageGenerationConfig: {
            numberOfImages,
            ...(quality !== 'standard' && { quality }),
            ...(seed !== undefined && { seed }),
            ...(cfg_scale !== 7 && { cfgScale: cfg_scale }),
          },
        };
        
        logger.info('[Nova Canvas] INPAINTING request prepared:', {
          sourceImage: inpaintingSearchResult.files[0].filename,
          maskType: maskImage ? 'image' : 'prompt',
          maskValue: maskImage ? maskImageFiles[0].filename : data.mask_prompt,
          inpaintingText: inpaintingText,
          usedPromptFallback: !data.inpainting_text
        });
      } catch (error) {
        throw new Error(`Could not process images for inpainting: ${error.message}`);
      }
    } else if (task_type === 'OUTPAINTING') {
      // OUTPAINTING requires source image and mask
      if (!reference_image_names || reference_image_names.length === 0) {
        throw new Error('reference_image_names is required for OUTPAINTING task. Specify the filename of the image you want to extend');
      }

      // Get source image for outpainting
      const outpaintingSearchResult = await this.findImagesByNames(reference_image_names);
      if (outpaintingSearchResult.files.length === 0) {
        throw new Error(`Source image not found: ${reference_image_names.join(', ')}. Make sure the image is in the conversation`);
      }

      let maskImage = null;
      let maskImageFiles = [];
      
      // Get mask image if mask_image_name is provided
      if (data.mask_image_name) {
        const maskSearchResult = await this.findImagesByNames([data.mask_image_name]);
        maskImageFiles = maskSearchResult.files;
        if (maskImageFiles.length === 0) {
          throw new Error(`Mask image not found: ${data.mask_image_name}. Make sure the mask image is in the conversation`);
        }
        maskImage = await this.convertImageUrlToBase64(maskImageFiles[0].filepath);
      }

      // Validate mask requirements
      if (!data.mask_prompt && !maskImage) {
        throw new Error('Either mask_prompt or mask_image_name is required for OUTPAINTING');
      }
      if (data.mask_prompt && maskImage) {
        throw new Error('Cannot use both mask_prompt and mask_image_name. Choose one');
      }

      try {
        const sourceImage = await this.convertImageUrlToBase64(outpaintingSearchResult.files[0].filepath);
        const outpaintingText = data.outpainting_text || prompt;
        
        if (!data.outpainting_text) {
          logger.info('[Nova Canvas] No outpainting_text provided, using main prompt as fallback:', {
            prompt: prompt,
            fallbackUsed: true
          });
        }
        
        requestBody = {
          taskType: 'OUTPAINTING',
          outPaintingParams: {
            image: sourceImage,
            ...(data.mask_prompt && { maskPrompt: data.mask_prompt }),
            ...(maskImage && { maskImage }),
            outPaintingMode: data.outpainting_mode || 'DEFAULT',
            text: outpaintingText,
            ...(negative_prompt && { negativeText: negative_prompt }),
          },
          imageGenerationConfig: {
            numberOfImages,
            ...(quality !== 'standard' && { quality }),
            ...(seed !== undefined && { seed }),
            ...(cfg_scale !== 7 && { cfgScale: cfg_scale }),
          },
        };
        
        logger.info('[Nova Canvas] OUTPAINTING request prepared:', {
          sourceImage: outpaintingSearchResult.files[0].filename,
          maskType: maskImage ? 'image' : 'prompt',
          maskValue: maskImage ? maskImageFiles[0].filename : data.mask_prompt,
          mode: data.outpainting_mode || 'DEFAULT',
          outpaintingText: outpaintingText,
          usedPromptFallback: !data.outpainting_text
        });
      } catch (error) {
        throw new Error(`Could not process images for outpainting: ${error.message}`);
      }
    } else if (task_type === 'BACKGROUND_REMOVAL') {
      // BACKGROUND_REMOVAL requires only 1 source image
      if (!reference_image_names || reference_image_names.length === 0) {
        throw new Error('reference_image_names is required for BACKGROUND_REMOVAL task. Specify the filename of the image to remove background from');
      }

      // BACKGROUND_REMOVAL solo procesa 1 imagen a la vez
      if (reference_image_names.length > 1) {
        logger.warn('[Nova Canvas] BACKGROUND_REMOVAL only processes 1 image at a time. Using first image only:', {
          requested: reference_image_names.length,
          using: reference_image_names[0],
          ignored: reference_image_names.slice(1)
        });
      }

      // Get source image for background removal (solo buscar la primera)
      const backgroundSearchResult = await this.findImagesByNames([reference_image_names[0]]);
      if (backgroundSearchResult.files.length === 0) {
        throw new Error(`Source image not found: ${reference_image_names[0]}. Make sure the image is in the conversation`);
      }

      try {
        const sourceImage = await this.convertImageUrlToBase64(backgroundSearchResult.files[0].filepath);
        
        requestBody = {
          taskType: 'BACKGROUND_REMOVAL',
          backgroundRemovalParams: {
            image: sourceImage,
          },
        };
        
        logger.info('[Nova Canvas] BACKGROUND_REMOVAL request prepared:', {
          sourceImage: backgroundSearchResult.files[0].filename,
          requestedImages: reference_image_names.length,
          processingImages: 1
        });
      } catch (error) {
        throw new Error(`Could not process image for background removal: ${error.message}`);
      }
    } else if (task_type === 'VIRTUAL_TRY_ON') {
      // VIRTUAL_TRY_ON requires source image (person) and reference image (clothing)
      if (!data.source_image_name || !data.reference_image_name) {
        throw new Error('Both source_image_name (person) and reference_image_name (clothing) are required for VIRTUAL_TRY_ON');
      }

      // Get source image (person)
      const sourceSearchResult = await this.findImagesByNames([data.source_image_name]);
      if (sourceSearchResult.files.length === 0) {
        throw new Error(`Source image not found: ${data.source_image_name}. Make sure the person image is in the conversation`);
      }

      // Get reference image (clothing)  
      const referenceSearchResult = await this.findImagesByNames([data.reference_image_name]);
      if (referenceSearchResult.files.length === 0) {
        throw new Error(`Reference image not found: ${data.reference_image_name}. Make sure the clothing image is in the conversation`);
      }

      // Validate mask_type requirements
      if (!data.mask_type) {
        throw new Error('mask_type is required for VIRTUAL_TRY_ON. Choose: IMAGE, GARMENT, or PROMPT');
      }

      if (data.mask_type === 'GARMENT' && !data.garment_class) {
        throw new Error('garment_class is required when mask_type is GARMENT');
      }

      if (data.mask_type === 'PROMPT' && !data.mask_prompt) {
        throw new Error('mask_prompt is required when mask_type is PROMPT');
      }

      try {
        const sourceImage = await this.convertImageUrlToBase64(sourceSearchResult.files[0].filepath);
        const referenceImage = await this.convertImageUrlToBase64(referenceSearchResult.files[0].filepath);
        
        requestBody = {
          taskType: 'VIRTUAL_TRY_ON',
          virtualTryOnParams: {
            sourceImage: sourceImage,
            referenceImage: referenceImage,
            maskType: data.mask_type,
            ...(data.mask_type === 'IMAGE' && data.mask_image_name && {
              imageBasedMask: {
                maskImage: await this.convertImageUrlToBase64((await this.findImagesByNames([data.mask_image_name])).files[0].filepath)
              }
            }),
            ...(data.mask_type === 'GARMENT' && {
              garmentBasedMask: {
                ...(data.mask_shape && { maskShape: data.mask_shape }),
                garmentClass: data.garment_class,
                ...(data.long_sleeve_style || data.tucking_style || data.outer_layer_style) && {
                  garmentStyling: {
                    ...(data.long_sleeve_style && { longSleeveStyle: data.long_sleeve_style }),
                    ...(data.tucking_style && { tuckingStyle: data.tucking_style }),
                    ...(data.outer_layer_style && { outerLayerStyle: data.outer_layer_style }),
                  }
                }
              }
            }),
            ...(data.mask_type === 'PROMPT' && {
              promptBasedMask: {
                ...(data.mask_shape && { maskShape: data.mask_shape }),
                maskPrompt: data.mask_prompt,
              }
            }),
            ...(data.preserve_body_pose || data.preserve_hands || data.preserve_face) && {
              maskExclusions: {
                ...(data.preserve_body_pose && { preserveBodyPose: data.preserve_body_pose }),
                ...(data.preserve_hands && { preserveHands: data.preserve_hands }),
                ...(data.preserve_face && { preserveFace: data.preserve_face }),
              }
            },
            ...(data.merge_style && { mergeStyle: data.merge_style }),
            ...(data.return_mask !== undefined && { returnMask: data.return_mask }),
          },
          imageGenerationConfig: {
            numberOfImages,
            ...(quality !== 'standard' && { quality }),
            ...(seed !== undefined && { seed }),
            ...(cfg_scale !== 7 && { cfgScale: cfg_scale }),
          },
        };
        
        logger.info('[Nova Canvas] VIRTUAL_TRY_ON request prepared:', {
          sourceImage: data.source_image_name,
          referenceImage: data.reference_image_name,
          maskType: data.mask_type,
          garmentClass: data.garment_class,
          mergeStyle: data.merge_style,
        });
      } catch (error) {
        throw new Error(`Could not process images for virtual try-on: ${error.message}`);
      }
    }

    // Note: stylePreset removed as it may not be supported in Nova Canvas v1:0

    logger.debug('[Nova Canvas] Request body:', requestBody);

    try {
      // Real AWS Bedrock Nova Canvas call
      logger.info('[Nova Canvas] Making real call to AWS Bedrock Nova Canvas');
      
      // Create InvokeModel command for Nova Canvas
      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-canvas-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      logger.info('[Nova Canvas] Response from AWS Bedrock:', {
        seed: responseBody.seed,
        finishReason: responseBody.finishReason,
        imageCount: responseBody.images?.length,
        hasImages: !!(responseBody.images && responseBody.images.length > 0)
      });

      if (!responseBody.images || responseBody.images.length === 0) {
        throw new Error('No images returned from Nova Canvas');
      }

      // Nova Canvas returns array of base64 encoded images
      const base64Images = responseBody.images;
      const actualImageCount = base64Images.length;
      
      if (this.isAgent) {
        // Para agentes con Bedrock, manejar múltiples imágenes
        // Guardar todas las imágenes y devolver URLs para el modelo
        
        const savedImages = [];
        const imageUrls = [];
        
        for (let i = 0; i < base64Images.length; i++) {
          const base64Image = base64Images[i];
          const imageName = `nova-${uuidv4()}-${i + 1}.png`;
          
          try {
            const dataUrl = `data:image/png;base64,${base64Image}`;
            
            const savedResult = await this.processFileURL({
              URL: dataUrl,
              basePath: 'images',
              userId: this.userId,
              fileName: imageName,
              fileStrategy: this.fileStrategy,
              context: FileContext.image_generation,
            });

            savedImages.push(savedResult);
            imageUrls.push(savedResult.filepath);

            logger.info(`[Nova Canvas] Image ${i + 1}/${actualImageCount} saved:`, {
              filepath: savedResult.filepath,
              filename: savedResult.filename,
              imageSizeKB: Math.round(base64Image.length * 0.75 / 1024),
            });
          } catch (saveError) {
            logger.error(`[Nova Canvas] Error saving image ${i + 1}:`, saveError);
          }
        }

        // Crear respuesta con URLs de todas las imágenes para el modelo
        // Formato: URL1|URL2|URL3 para que el modelo las procese fácilmente
        const imageUrlsText = imageUrls.join('|');
        
        logger.info('[Nova Canvas] Returning multiple image URLs for model processing:', {
          imageCount: imageUrls.length,
          totalRequested: numberOfImages,
          imageUrls,
          format: 'URLs separated by |',
        });

        return this.returnValue(imageUrlsText);
      }

      // HOMOLOGADO CON DALL-E: Para no-agentes, procesar imagen y devolver resultado
      const imageName = `nova-${uuidv4()}.png`;
      const base64Image = base64Images[0]; // Use first image for non-agent use
      
      logger.debug('[Nova Canvas] Processing image for non-agent use', {
        imageName,
        imageSize: base64Image.length,
        returnMetadata: this.returnMetadata,
      });

      try {
        // Crear data URL como DALL-E
        const dataUrl = `data:image/png;base64,${base64Image}`;
        
        const result = await this.processFileURL({
          URL: dataUrl,
          basePath: 'images',
          userId: this.userId,
          fileName: imageName,
          fileStrategy: this.fileStrategy,
          context: FileContext.image_generation,
        });

        // HOMOLOGADO CON DALL-E: Usar returnMetadata para decidir formato
        if (this.returnMetadata) {
          this.result = result;
        } else {
          this.result = this.wrapInMarkdown(result.filepath);
        }
      } catch (error) {
        logger.error('[Nova Canvas] Error while saving the image:', error);
        this.result = `Failed to save the image locally. ${error.message}`;
      }

    } catch (error) {
      logger.error('[Nova Canvas] Problem generating the image:', error);
      return this.returnValue(
        `Something went wrong when trying to generate the image with Nova Canvas: ${error.message}`
      );
    }

    return this.returnValue(this.result);
  }
}

module.exports = NovaCanvas;
