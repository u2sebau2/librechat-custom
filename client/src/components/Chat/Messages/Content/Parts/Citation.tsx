import { memo } from 'react';
import type { BedrockCitation } from 'librechat-data-provider';
import { FileText } from 'lucide-react';

type CitationProps = {
  citation: BedrockCitation;
};

const Citation = memo(({ citation }: CitationProps) => {
  // Manejar estructura de citas con validación mejorada
  const location = citation?.location;
  const sourceContent = citation?.sourceContent || [];
  const title = citation?.title || 'Referencia del documento';
  
  // Validar y extraer datos de ubicación
  const documentPage = location?.documentPage || {};
  const documentIndex = documentPage.documentIndex ?? 0;
  const start = documentPage.start ?? 0;
  const end = documentPage.end ?? 0;
  
  // Validar si tenemos contenido de fuente
  const hasContent = sourceContent.length > 0;

  return (
    <div className="my-3 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4 shadow-sm transition-all hover:shadow-md dark:border-blue-800 dark:from-blue-950/20 dark:to-gray-900/50">
      {/* Header con ícono y título */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Documento {documentIndex + 1}
            {start !== end && start > 0 && ` • Páginas ${start}-${end}`}
            {start === end && start > 0 && ` • Página ${start}`}
          </p>
        </div>
      </div>
      
      {/* Contenido de la cita */}
      {hasContent && (
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-blue-400 dark:bg-blue-600" />
          <div className="ml-4 rounded-md bg-white/50 p-3 dark:bg-gray-800/50">
            <div className="space-y-2">
              {sourceContent.map((content, index) => {
                const text = content?.text || content;
                if (!text || typeof text !== 'string') return null;
                
                return (
                  <blockquote key={index} className="border-l-2 border-gray-300 pl-3 text-sm italic text-gray-700 dark:border-gray-600 dark:text-gray-300">
                    {text.trim()}
                  </blockquote>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Si no hay contenido pero sí metadata */}
      {!hasContent && (
        <div className="ml-11 text-sm text-gray-600 dark:text-gray-400">
          <p className="italic">
            Referencia a documento
            {start > 0 && ` en página${start !== end ? 's' : ''} ${start}${end !== start ? `-${end}` : ''}`}
          </p>
        </div>
      )}
    </div>
  );
});

Citation.displayName = 'Citation';

export default Citation;
