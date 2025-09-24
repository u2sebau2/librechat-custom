import React, { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { TooltipAnchor, Button } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';

interface AdminConversationsButtonProps {
  isSmallScreen?: boolean;
  toggleNav: () => void;
}

/**
 * AdminConversationsButton - Botón de navegación para acceder al panel de administración de conversaciones
 * 
 * Solo visible para usuarios con rol de administrador
 */
export default function AdminConversationsButton({
  isSmallScreen,
  toggleNav,
}: AdminConversationsButtonProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext();

  // Verificar si el usuario es administrador
  const isAdmin = isAuthenticated && user?.role === SystemRoles.ADMIN;

  const handleAdminConversations = useCallback(() => {
    navigate('/admin/conversations');
    if (isSmallScreen) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  // Debug logging (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    console.log('AdminConversationsButton Debug:', {
      isAuthenticated,
      userRole: user?.role,
      adminRole: SystemRoles.ADMIN,
      isAdmin,
      willRender: isAdmin
    });
  }

  // No mostrar el botón si no es admin
  if (!isAdmin) {
    return null;
  }

  return (
    <TooltipAnchor
      description="Panel de Administración - Conversaciones"
      render={
        <Button
          variant="outline"
          data-testid="nav-admin-conversations-button"
          aria-label="Panel de Administración - Conversaciones"
          className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
          onClick={handleAdminConversations}
        >
          <Shield className="icon-lg text-text-primary" />
        </Button>
      }
    />
  );
}
