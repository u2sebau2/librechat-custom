import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState } from 'recoil';
import { useMediaQuery, Button } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { useDocumentTitle, useLocalize, useFileMap } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { SidePanelProvider, ChatContext, AgentPanelProvider, FileMapContext } from '~/Providers';
import { SidePanelGroup } from '~/components/SidePanel';
import { OpenSidebar } from '~/components/Chat/Menus';
import AdminConversationsGrid from './AdminConversationsGrid';
import AdminConversationsFilters from './AdminConversationsFilters';
import { cn } from '~/utils';
import store from '~/store';

interface AdminConversationsProps {
  className?: string;
}

export interface ConversationFilters {
  userId?: string;
  startDate?: string;
  endDate?: string;
}

const AdminConversations: React.FC<AdminConversationsProps> = ({ className = '' }) => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const fileMap = useFileMap({ isAuthenticated });
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const [hideSidePanel, setHideSidePanel] = useRecoilState(store.hideSidePanel);

  const [filters, setFilters] = useState<ConversationFilters>({});
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  
  // Memorizar filtros para evitar re-renders innecesarios
  const memoizedFilters = useMemo(() => filters, [filters]);

  useDocumentTitle('Admin - Conversaciones');
  const isAdmin = user?.role === SystemRoles.ADMIN;

  // Ensure right sidebar is always visible in admin module
  useEffect(() => {
    setHideSidePanel(false);
    localStorage.setItem('hideSidePanel', 'false');
    localStorage.setItem('fullPanelCollapse', 'false');
  }, [setHideSidePanel]);

  // Layout configuration for SidePanelGroup
  const defaultLayout = useMemo(() => {
    const resizableLayout = localStorage.getItem('react-resizable-panels:layout');
    return typeof resizableLayout === 'string' ? JSON.parse(resizableLayout) : [75, 25]; // 75% main, 25% sidebar
  }, []);

  const defaultCollapsed = useMemo(() => {
    const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed');
    return typeof collapsedPanels === 'string' ? JSON.parse(collapsedPanels) : true;
  }, []);

  const fullCollapse = useMemo(() => localStorage.getItem('fullPanelCollapse') === 'true', []);

  // Contexto completo de chat para el sidebar (valores por defecto/vacíos)
  const adminChatContext = useMemo(() => ({
    // Propiedades básicas de conversación
    conversation: null,
    setConversation: () => {},
    newConversation: () => {},
    
    // Estados de envío
    isSubmitting: false,
    setIsSubmitting: () => {},
    
    // Manejo de mensajes
    getMessages: () => [],
    setMessages: () => {},
    setSiblingIdx: () => {},
    latestMessage: null,
    setLatestMessage: () => {},
    resetLatestMessage: () => {},
    
    // Funciones de chat (async functions)
    ask: async () => {},
    regenerate: async () => {},
    stopGenerating: async () => {},
    handleStopGenerating: () => {},
    handleRegenerate: () => {},
    handleContinue: () => {},
    
    // Estados de UI
    showPopover: false,
    setShowPopover: () => {},
    abortScroll: false,
    setAbortScroll: () => {},
    
    // Configuraciones
    preset: null,
    setPreset: () => {},
    optionSettings: {},
    setOptionSettings: () => {},
    showAgentSettings: false,
    setShowAgentSettings: () => {},
    
    // Archivos
    files: new Map(),
    setFiles: () => {},
    filesLoading: false,
    setFilesLoading: () => {},
    
    // Índice
    index: 0,
  }), []);

  const handleFiltersChange = useCallback((newFilters: ConversationFilters) => {
    console.log('🔄 AdminConversations - handleFiltersChange called with:', newFilters);
    setFilters(newFilters);
    // No necesitamos invalidar aquí porque useQuery se actualiza automáticamente
    // cuando cambian los filtros en la queryKey
  }, []);

  const handleConversationToggle = (conversationId: string) => {
    setExpandedConversation(prev => 
      prev === conversationId ? null : conversationId
    );
  };

  /**
   * Handle new chat button click - redirect to main chat interface
   */
  const handleNewChat = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    // Redirect to main chat interface instead of using chat context
    window.location.href = '/c/new';
  };

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            Acceso Denegado
          </h2>
          <p className="text-text-secondary">
            Solo los administradores pueden acceder a esta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex w-full grow overflow-hidden bg-white dark:bg-gray-900 ${className}`}>
      <ChatContext.Provider value={adminChatContext}>
        <FileMapContext.Provider value={fileMap}>
          <AgentPanelProvider>
            <SidePanelProvider>
                  <SidePanelGroup
          defaultLayout={defaultLayout}
          fullPanelCollapse={fullCollapse}
          defaultCollapsed={defaultCollapsed}
          artifacts={null}
        >
          <main className="flex h-full flex-col overflow-hidden" role="main">
            {/* Scrollable container */}
            <div className="scrollbar-gutter-stable relative flex h-full flex-col overflow-y-auto overflow-x-hidden">
              {/* Header with navigation controls */}
              {!isSmallScreen && (
                <div className="sticky top-0 z-20 flex items-center justify-between bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2 font-semibold text-gray-900 dark:text-white md:h-14">
                  <div className="mx-1 flex items-center gap-2">
                    {!navVisible ? (
                      <>
                        <OpenSidebar setNavVisible={setNavVisible} />
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="admin-new-chat-button"
                          aria-label={localize('com_ui_new_chat')}
                          className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white max-md:hidden"
                          onClick={handleNewChat}
                        >
                          {localize('com_ui_new_chat')}
                        </Button>
                      </>
                    ) : (
                      // Invisible placeholder to maintain height
                      <div className="h-10 w-10" />
                    )}
                  </div>
                </div>
              )}

              {/* Hero Section */}
              {!isSmallScreen && (
                <div className="container mx-auto max-w-6xl">
                  <div className={cn('mb-8 text-center', 'mt-12')}>
                    <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-5xl">
                      Administración de Conversaciones
                    </h1>
                    <p className="mx-auto mb-6 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
                      Gestiona y supervisa todas las conversaciones de los usuarios del sistema
                    </p>
                  </div>
                </div>
              )}

              {/* Sticky wrapper for filters */}
              <div className={cn(
                'sticky z-10 bg-presentation pb-4',
                isSmallScreen ? 'top-0' : 'top-14',
              )}>
                <div className="container mx-auto max-w-6xl px-4">
                <AdminConversationsFilters
                  filters={memoizedFilters}
                  onFiltersChange={handleFiltersChange}
                />
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="container mx-auto max-w-6xl px-4 pb-8">
              <AdminConversationsGrid
                filters={memoizedFilters}
                expandedConversation={expandedConversation}
                onConversationToggle={handleConversationToggle}
              />
              </div>
            </div>
          </main>
                  </SidePanelGroup>
            </SidePanelProvider>
          </AgentPanelProvider>
        </FileMapContext.Provider>
      </ChatContext.Provider>
    </div>
  );
};

export default AdminConversations;
