import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Calendar, User, MessageSquare, Hash } from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import AdminConversationDetail from './AdminConversationDetail';

interface Conversation {
  _id: string;
  conversationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  user: string;
  endpoint: string;
  messageCount: number;
}

interface AdminConversationsGridProps {
  filters: {
    startDate?: string;
    endDate?: string;
    userId?: string;
  };
  expandedConversation?: string | null;
  onConversationToggle?: (conversationId: string) => void;
}

const AdminConversationsGrid: React.FC<AdminConversationsGridProps> = ({ 
  filters, 
  expandedConversation, 
  onConversationToggle 
}) => {
  const { token } = useAuthContext();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const limit = 20;

  // Resetear página cuando cambien los filtros
  React.useEffect(() => {
    setPage(1);
  }, [filters]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['adminConversations', filters, page],
    staleTime: 30000, // 30 segundos - evita requests innecesarios
    gcTime: 300000, // 5 minutos - mantiene datos en cache
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(filters.userId && { userId: filters.userId }),
      });

      console.log('🔍 AdminConversationsGrid - Making API request:', `/api/admin/conversations?${params}`);
      console.log('🔍 Filters object:', filters);

      const response = await fetch(`/api/admin/conversations?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Admin API Error:', response.status, errorData);
        throw new Error(`Error al obtener conversaciones: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!token,
  });

  useEffect(() => {
    refetch();
  }, [filters, refetch]);

  const toggleRow = (conversationId: string) => {
    if (onConversationToggle) {
      onConversationToggle(conversationId);
    } else {
      const newExpanded = new Set(expandedRows);
      if (newExpanded.has(conversationId)) {
        newExpanded.delete(conversationId);
      } else {
        newExpanded.add(conversationId);
      }
      setExpandedRows(newExpanded);
    }
  };

  // Use expandedConversation prop if provided, otherwise use local state
  const isExpanded = (conversationId: string) => {
    if (expandedConversation !== undefined) {
      return expandedConversation === conversationId;
    }
    return expandedRows.has(conversationId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC', // Mantener zona horaria de la base de datos
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-300">Cargando conversaciones...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-600 dark:text-red-400">
          Error al cargar conversaciones: {error instanceof Error ? error.message : 'Error desconocido'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const conversations: Conversation[] = data?.conversations || [];
  const totalPages = Math.ceil((data?.total || 0) / limit);

  return (
    <div className="space-y-4">
      {/* Paginación Superior */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Página {page} de {totalPages} ({data?.total || 0} conversaciones)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            
            {/* Números de página */}
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                if (pageNum > totalPages) return null;
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1 text-sm rounded ${
                      page === pageNum
                        ? 'bg-green-600 dark:bg-green-700 text-white'
                        : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <div className="grid grid-cols-6 gap-4 font-semibold text-gray-700 dark:text-gray-300">
          <div className="flex items-center col-span-2">
            <MessageSquare className="w-4 h-4 mr-2" />
            Conversación
          </div>
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            Modificada (UTC)
          </div>
          <div className="flex items-center">
            <User className="w-4 h-4 mr-2" />
            Usuario
          </div>
          <div className="flex items-center">
            Endpoint
          </div>
          <div className="flex items-center justify-center">
            #
          </div>
        </div>
      </div>

      {/* Conversaciones */}
      {conversations.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No se encontraron conversaciones con los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <div key={conversation._id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
              {/* Fila principal */}
              <div className="grid grid-cols-6 gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 items-center">
                <div className="col-span-2 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white block truncate">
                    {conversation.title || 'Sin título'}
                  </span>
                  <button
                    onClick={() => toggleRow(conversation._id)}
                    className="inline-flex items-center mt-2 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    {isExpanded(conversation._id) ? (
                      <>
                        <ChevronDown className="w-3 h-3 mr-1" />
                        Contraer
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-3 h-3 mr-1" />
                        Expandir
                      </>
                    )}
                  </button>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {formatDate(conversation.updatedAt)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                  {conversation.user}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 capitalize">
                  {conversation.endpoint || 'N/A'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 text-center">
                  {conversation.messageCount || 0}
                </div>
              </div>

              {/* Detalle expandido */}
              {isExpanded(conversation._id) && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <AdminConversationDetail conversationId={conversation.conversationId} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2 py-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminConversationsGrid;