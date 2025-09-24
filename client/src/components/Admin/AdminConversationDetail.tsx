import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Image, Bot, User as UserIcon, Paperclip } from 'lucide-react';
import { Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';

interface Message {
  _id: string;
  messageId: string;
  text: string;
  sender: string;
  isCreatedByUser: boolean;
  createdAt: string;
  content?: Array<{
    type: string;
    text?: string;
    think?: string;
  }>;
  attachments?: Array<{
    filename: string;
    filepath?: string;
    type?: string;
    width?: number;
    height?: number;
  }>;
  files?: Array<{
    filename: string;
    filepath?: string;
    type?: string;
    width?: number;
    height?: number;
  }>;
  user?: {
    _id: string;
    username?: string;
    email?: string;
    name?: string;
  };
}

interface AdminConversationDetailProps {
  conversationId: string;
}

/**
 * AdminConversationDetail - Vista detallada de una conversación específica
 * 
 * Muestra información detallada y todos los mensajes de la conversación
 */
const AdminConversationDetail: React.FC<AdminConversationDetailProps> = ({
  conversationId,
}) => {
  const { token } = useAuthContext();

  // Query para obtener datos de la conversación
  const {
    data: conversationData,
    isLoading: isLoadingConversation,
    error: conversationError,
  } = useQuery({
    queryKey: ['admin', 'conversation', conversationId],
    queryFn: async () => {
      console.log('Fetching conversation with ID:', conversationId);
      const response = await fetch(`/api/admin/conversations/${conversationId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Admin Conversation API Error:', response.status, errorData);
        throw new Error(`Error al obtener conversación: ${response.status}`);
      }
      
      return response.json();
    },
    staleTime: 60000, // 1 minuto
    enabled: !!token,
  });

  // Query para obtener mensajes de la conversación
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
    error: messagesError,
  } = useQuery({
    queryKey: ['admin', 'conversation', conversationId, 'messages'],
    queryFn: async () => {
      console.log('Fetching messages for conversation ID:', conversationId);
      const response = await fetch(`/api/admin/conversations/${conversationId}/messages`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Admin Messages API Error:', response.status, errorData);
        throw new Error(`Error al obtener mensajes: ${response.status}`);
      }
      
      return response.json();
    },
    staleTime: 60000, // 1 minuto
    enabled: !!token,
  });

  // Formatear fecha
  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  // Obtener icono para tipo de archivo
  const getFileIcon = (filename: string | undefined) => {
    if (!filename || typeof filename !== 'string') {
      return <FileText className="h-4 w-4" />;
    }
    
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  // Renderizar contenido completo del mensaje
  const renderMessageContent = (message: Message) => {
    // Si hay texto directo (mensajes de usuario), usarlo
    if (message.text && message.text.trim()) {
      return (
        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
          {message.text}
        </div>
      );
    }
    
    // Si hay contenido estructurado (mensajes del modelo), renderizar en orden
    if (message.content && message.content.length > 0) {
      return (
        <div className="space-y-3">
          {message.content.map((item, index) => {
            if (item.type === 'think' && item.think) {
              return (
                <div key={index} className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-3 rounded-r">
                  <div className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                    🤔 Procesamiento interno:
                  </div>
                  <div className="text-sm text-yellow-700 dark:text-yellow-300 italic whitespace-pre-wrap">
                    {item.think}
                  </div>
                </div>
              );
            }
            
            if (item.type === 'text' && item.text) {
              return (
                <div key={index} className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {item.text}
                </div>
              );
            }
            
            // Otros tipos de contenido
            return (
              <div key={index} className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs text-gray-600 dark:text-gray-300">
                <strong>Tipo {item.type}:</strong> {JSON.stringify(item, null, 2)}
              </div>
            );
          })}
        </div>
      );
    }
    
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        (Sin contenido de texto)
      </div>
    );
  };

  // Obtener archivos del mensaje (puede estar en 'files' o 'attachments')
  const getMessageFiles = (message: Message) => {
    const files = message.files || [];
    const attachments = message.attachments || [];
    
    // Filtrar solo archivos reales, no herramientas como file_search
    const realFiles = attachments.filter(att => 
      att.type !== 'file_search' && 
      att.filename && 
      typeof att.filename === 'string'
    );
    
    return [...files, ...realFiles];
  };

  const conversation = conversationData?.conversation;
  const messages = messagesData?.messages || [];
  const isLoading = isLoadingConversation || isLoadingMessages;
  const error = conversationError || messagesError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-2">
          <Spinner className="h-4 w-4" />
          <span className="text-sm text-gray-600 dark:text-gray-300">Cargando mensajes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500 dark:text-red-400 text-sm">
        Error al cargar mensajes
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
        No hay mensajes en esta conversación
      </div>
    );
  }

  return (
    <div className="p-4 max-h-96 overflow-y-auto">
      {/* Información básica de la conversación */}
      {conversation && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">ID:</span>
              <span className="ml-1 text-gray-600 dark:text-gray-400 font-mono">{conversation.conversationId}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Modelo:</span>
              <span className="ml-1 text-gray-600 dark:text-gray-400">{conversation.model || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="space-y-3">
        {messages.map((message: Message, index: number) => (
          <div
            key={message.messageId || message._id || index}
            className="border-l-2 border-gray-200 dark:border-gray-700 pl-3"
          >
            {/* Header del mensaje */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                {message.isCreatedByUser ? (
                  <UserIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Bot className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                )}
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {message.isCreatedByUser ? 'Usuario' : 'Asistente'}
                </span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(message.createdAt)}
              </span>
            </div>

            {/* Contenido del mensaje */}
            <div className="mb-3">
              {renderMessageContent(message)}
            </div>

            {/* Archivos adjuntos */}
            {(() => {
              const files = getMessageFiles(message);
              return files.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 mb-1">
                    <Paperclip className="h-3 w-3" />
                    <span>Archivos ({files.length})</span>
                  </div>
                  <div className="space-y-1">
                    {files.map((file, fileIndex) => {
                      // Validar que el archivo tenga filename
                      if (!file.filename || typeof file.filename !== 'string') {
                        return null;
                      }
                      
                      return (
                        <div
                          key={fileIndex}
                          className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1"
                        >
                          {getFileIcon(file.filename)}
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                            {file.filename}
                          </span>
                          {file.width && file.height && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {file.width}×{file.height}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminConversationDetail;
