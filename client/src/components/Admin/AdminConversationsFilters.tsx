import React, { useState } from 'react';
import { Search, Calendar, User, X } from 'lucide-react';
import { Button, Input } from '@librechat/client';
import { useLocalize } from '~/hooks';
import type { ConversationFilters } from './AdminConversations';

interface AdminConversationsFiltersProps {
  filters: ConversationFilters;
  onFiltersChange: (filters: ConversationFilters) => void;
}

/**
 * AdminConversationsFilters - Componente para filtrar conversaciones
 * 
 * Proporciona filtros por fecha, usuario y búsqueda de texto
 */
const AdminConversationsFilters: React.FC<AdminConversationsFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const localize = useLocalize();
  const [localFilters, setLocalFilters] = useState<ConversationFilters>(filters);

  // Aplicar filtros
  const applyFilters = () => {
    console.log('🎯 AdminConversationsFilters - Applying filters:', localFilters);
    onFiltersChange(localFilters);
  };

  // Limpiar filtros
  const clearFilters = () => {
    const emptyFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  // Manejar cambio de filtro
  const handleFilterChange = (key: keyof ConversationFilters, value: string) => {
    const newFilters = {
      ...localFilters,
      [key]: value || undefined, // Remover campos vacíos
    };
    setLocalFilters(newFilters);
  };

  // Verificar si hay filtros activos
  const hasActiveFilters = Object.values(localFilters).some(value => value);

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        {/* Filtro por ID de usuario */}
        <div className="sm:w-64">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            ID de Usuario
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="ID del usuario..."
              value={localFilters.userId || ''}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              className="pl-10"
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
        </div>


        {/* Fecha de inicio */}
        <div className="sm:w-52">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            Modificación Desde (UTC)
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
            <Input
              type="date"
              value={localFilters.startDate || ''}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Fecha de fin */}
        <div className="sm:w-52">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            Modificación Hasta (UTC)
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
            <Input
              type="date"
              value={localFilters.endDate || ''}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 flex-1 justify-end">
          <Button
            onClick={applyFilters}
            variant="default"
            size="sm"
            className="whitespace-nowrap bg-green-600 dark:bg-green-700 text-white hover:bg-green-700 dark:hover:bg-green-800"
          >
            Filtrar
          </Button>
          
          {hasActiveFilters && (
            <Button
              onClick={clearFilters}
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
            >
              <X className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Indicadores de filtros activos */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {localFilters.userId && (
            <div className="flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
              <User className="h-3 w-3" />
              <span>Usuario: {localFilters.userId}</span>
            </div>
          )}
          {localFilters.startDate && (
            <div className="flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
              <Calendar className="h-3 w-3" />
              <span>Desde: {localFilters.startDate} (UTC)</span>
            </div>
          )}
          {localFilters.endDate && (
            <div className="flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
              <Calendar className="h-3 w-3" />
              <span>Hasta: {localFilters.endDate} (UTC)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminConversationsFilters;
