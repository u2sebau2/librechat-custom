const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const checkAdmin = require('~/server/middleware/roles/admin');
const { getConvosByCursor } = require('~/models');
const { Conversation, Message } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

// Ruta de prueba sin middleware para diagnosticar
router.get('/test', (req, res) => {
  res.json({
    message: 'Admin endpoint is working',
    user: req.user ? {
      id: req.user.id,
      role: req.user.role,
      email: req.user.email
    } : 'No user',
    timestamp: new Date().toISOString()
  });
});

// Middleware para autenticación y verificación de admin
router.use(requireJwtAuth);
router.use(checkAdmin);

/**
 * GET /admin/conversations/:id
 * Obtiene una conversación específica (solo para admins)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Getting conversation by ID:', id);
    console.log('ID type:', typeof id);
    
    // El ID puede ser un UUID (conversationId) o un MongoDB ObjectId (_id)
    let conversation;
    
    // Primero intentar buscar por conversationId (UUID)
    conversation = await Conversation.findOne({ conversationId: id }).populate('user', 'name username email');
    
    // Si no se encuentra y parece ser un ObjectId válido, intentar por _id
    if (!conversation && id.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('Trying to find by MongoDB ObjectId');
      conversation = await Conversation.findById(id).populate('user', 'name username email');
    }
    
    if (!conversation) {
      console.log('Conversation not found with ID:', id);
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }
    
    console.log('Found conversation:', conversation.conversationId);
    res.json({ conversation });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

/**
 * GET /admin/conversations
 * Obtiene todas las conversaciones del sistema con filtros (solo para admins)
 */
router.get('/', async (req, res) => {
  try {
    // Debug logging
    console.log('Admin conversations endpoint hit');
    console.log('User:', req.user ? { id: req.user.id, role: req.user.role } : 'No user');
    console.log('Conversation model available:', !!Conversation);
    console.log('Conversation.find available:', typeof Conversation?.find);
    
    const {
      page = 1,
      limit = 20,
      userId = null,
      startDate = null,
      endDate = null,
      order = 'desc'
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100); // Máximo 100 por página
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1); // Mínimo página 1
    const skip = (parsedPage - 1) * parsedLimit;
    
    // Construir filtros
    const filters = [];
    
    // Filtro por usuario específico
    if (userId) {
      filters.push({ user: userId });
    }
    
    // Filtro por rango de fechas (basado en updatedAt - última interacción)
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        // Inicio del día (00:00:00.000)
        const startOfDay = new Date(startDate);
        startOfDay.setHours(0, 0, 0, 0);
        dateFilter.$gte = startOfDay;
        console.log('Start date filter:', startOfDay);
      }
      if (endDate) {
        // Final del día (23:59:59.999)
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateFilter.$lte = endOfDay;
        console.log('End date filter:', endOfDay);
      }
      filters.push({ updatedAt: dateFilter });
    }


    // Excluir conversaciones archivadas/expiradas por defecto
    filters.push({ 
      $or: [
        { isArchived: { $ne: true } },
        { isArchived: { $exists: false } }
      ]
    });
    
    filters.push({ 
      $or: [
        { expiredAt: null }, 
        { expiredAt: { $exists: false } }
      ]
    });

    // Construir query
    const query = filters.length === 1 ? filters[0] : { $and: filters };

    // Obtener total de conversaciones que coinciden con los filtros (para paginación)
    const totalConversations = await Conversation.countDocuments(query);
    console.log('Total conversations matching filters:', totalConversations);

    // Ejecutar búsqueda con población de datos del usuario
    const conversations = await Conversation.find(query)
      .populate('user', 'username email name')
      .select('conversationId endpoint title createdAt updatedAt user model agent_id assistant_id spec iconURL')
      .sort({ updatedAt: order === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    // Agregar conteo de mensajes para cada conversación
    const conversationsWithMessageCount = await Promise.all(
      conversations.map(async (convo) => {
        const messageCount = await Message.countDocuments({ 
          conversationId: convo.conversationId 
        });
        return {
          ...convo,
          messageCount
        };
      })
    );

    // Información de paginación
    const totalPages = Math.ceil(totalConversations / parsedLimit);
    const hasNextPage = parsedPage < totalPages;
    const hasPrevPage = parsedPage > 1;

    res.status(200).json({
      conversations: conversationsWithMessageCount,
      pagination: {
        currentPage: parsedPage,
        totalPages,
        totalItems: totalConversations,
        itemsPerPage: parsedLimit,
        hasNextPage,
        hasPrevPage
      },
      total: totalConversations // Total real de conversaciones que coinciden con filtros
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    logger.error('[Admin] Error fetching all conversations:', error);
    res.status(500).json({ 
      error: 'Error fetching conversations',
      message: error.message,
      details: error.name
    });
  }
});

/**
 * GET /admin/conversations/:conversationId/messages
 * Obtiene todos los mensajes de una conversación específica (solo para admins)
 */
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50 } = req.query;

    console.log('=== Messages Endpoint Debug ===');
    console.log('Requested conversationId:', conversationId);
    console.log('Type of conversationId:', typeof conversationId);

    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200); // Máximo 200 mensajes

    // El conversationId puede ser un UUID, necesitamos buscar la conversación correctamente
    let conversation;
    
    // Intentar buscar por conversationId (UUID) primero
    conversation = await Conversation.findOne({ conversationId: conversationId });
    console.log('Found conversation by conversationId:', !!conversation);
    
    // Si no se encuentra y parece ser un ObjectId, intentar por _id
    if (!conversation && conversationId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('Trying to find conversation by MongoDB ObjectId');
      conversation = await Conversation.findById(conversationId);
      console.log('Found conversation by _id:', !!conversation);
    }
    
    if (!conversation) {
      console.log('Conversation not found with ID:', conversationId);
      return res.status(404).json({ 
        error: 'Conversation not found',
        conversationId 
      });
    }

    console.log('Using conversation.conversationId for messages:', conversation.conversationId);

    // Buscar mensajes usando el conversationId real de la conversación
    const messages = await Message.find({ conversationId: conversation.conversationId })
      .populate('user', 'username email name')
      .sort({ createdAt: 1 })
      .limit(parsedLimit)
      .lean();

    console.log('Messages found:', messages.length);

    // Debug logging para ver estructura de mensajes
    if (messages.length > 0) {
      console.log('Sample message structure:', JSON.stringify(messages[0], null, 2));
    } else {
      console.log('No messages found for conversationId:', conversation.conversationId);
    }

    res.status(200).json({
      messages,
      conversationId,
      total: messages.length
    });

  } catch (error) {
    logger.error('[Admin] Error fetching conversation messages:', error);
    res.status(500).json({ 
      error: 'Error fetching conversation messages',
      message: error.message 
    });
  }
});

/**
 * GET /admin/conversations/stats
 * Obtiene estadísticas básicas de conversaciones (solo para admins)
 */
router.get('/stats', async (req, res) => {
  try {
    const { Conversation } = require('~/models');
    
    // Estadísticas básicas
    const totalConversations = await Conversation.countDocuments({
      $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }]
    });

    const activeConversations = await Conversation.countDocuments({
      $and: [
        { $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }] },
        { $or: [{ isArchived: { $ne: true } }, { isArchived: { $exists: false } }] }
      ]
    });

    // Conversaciones por endpoint
    const conversationsByEndpoint = await Conversation.aggregate([
      {
        $match: {
          $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }]
        }
      },
      {
        $group: {
          _id: '$endpoint',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Actividad reciente (últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentActivity = await Conversation.countDocuments({
      updatedAt: { $gte: sevenDaysAgo },
      $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }]
    });

    res.status(200).json({
      totalConversations,
      activeConversations,
      recentActivity,
      conversationsByEndpoint
    });

  } catch (error) {
    logger.error('[Admin] Error fetching conversation stats:', error);
    res.status(500).json({ 
      error: 'Error fetching conversation stats',
      message: error.message 
    });
  }
});

module.exports = router;
