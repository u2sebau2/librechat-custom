import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import throttle from 'lodash/throttle';
import {
  ResizableHandleAlt,
  ResizablePanel,
  ResizablePanelGroup,
  useMediaQuery,
} from '@librechat/client';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { normalizeLayout } from '~/utils';
import Nav from './Nav';

interface ResizableNavGroupProps {
  navVisible: boolean;
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
}

// Configuración basada en píxeles
const TARGET_NAV_WIDTH_PX = 320; // Ancho fijo en píxeles
const MIN_NAV_WIDTH_PX = 320;    // Mínimo 320px (fijo)
const MAX_NAV_WIDTH_PX = 320;    // Máximo 320px (fijo)
const MIN_MAIN_WIDTH = 50;       // El contenido principal necesita al menos 50%

const ResizableNavGroup = memo(
  ({ navVisible, setNavVisible, children }: ResizableNavGroupProps) => {
    const isSmallScreen = useMediaQuery('(max-width: 768px)');
    const panelRef = useRef<ImperativePanelHandle>(null);

    // Función helper para convertir píxeles a porcentaje basado en el viewport actual
    const getNavPercentage = useCallback((widthPx: number) => {
      if (typeof window === 'undefined') return 25; // Server-side fallback
      const viewportWidth = window.innerWidth;
      const percentage = (widthPx / viewportWidth) * 100;
      
      // 🚨 CRUCIAL: No forzar mínimos/máximos artificiales en porcentaje
      // Solo limitar si el resultado es extremadamente pequeño o grande
      if (percentage < 5) return 5;   // Mínimo absoluto 5% (para casos extremos)
      if (percentage > 50) return 50; // Máximo 50% para no ocupar demasiado
      
      return percentage; // Respetar el cálculo exacto de píxeles
    }, []);

    // Calcular porcentajes dinámicamente
    const DEFAULT_NAV_WIDTH = useMemo(() => {
      const percentage = getNavPercentage(TARGET_NAV_WIDTH_PX);
      console.log('[ResizableNav] Default width calculation:', {
        targetPx: TARGET_NAV_WIDTH_PX,
        viewportWidth: window.innerWidth,
        calculatedPercentage: percentage,
        equivalentPx: (window.innerWidth * percentage) / 100
      });
      return percentage;
    }, [getNavPercentage]);
    
    const MIN_NAV_WIDTH = useMemo(() => {
      const percentage = getNavPercentage(MIN_NAV_WIDTH_PX);
      console.log('[ResizableNav] Min width calculation:', {
        minPx: MIN_NAV_WIDTH_PX,
        viewportWidth: window.innerWidth,
        calculatedPercentage: percentage,
        equivalentPx: (window.innerWidth * percentage) / 100
      });
      return percentage;
    }, [getNavPercentage]);
    
    const MAX_NAV_WIDTH = useMemo(() => {
      const percentage = getNavPercentage(MAX_NAV_WIDTH_PX);
      console.log('[ResizableNav] Max width calculation:', {
        maxPx: MAX_NAV_WIDTH_PX,
        viewportWidth: window.innerWidth,
        calculatedPercentage: percentage,
        equivalentPx: (window.innerWidth * percentage) / 100
      });
      return percentage;
    }, [getNavPercentage]);

    // Cargar layout guardado o usar default basado en 280px
    const getSavedLayout = useCallback(() => {
      if (isSmallScreen) {
        // En móviles, el nav ocupa toda la pantalla cuando está visible
        return navVisible ? [100, 0] : [0, 100];
      }
      
      const savedLayout = localStorage.getItem('nav-resizable-panels:layout');
      if (savedLayout) {
        try {
          const parsed = JSON.parse(savedLayout);
          // Validar que el layout sea válido
          if (Array.isArray(parsed) && parsed.length === 2) {
            const [navSize, mainSize] = parsed;
            // Recalcular mínimos basados en viewport actual
            const currentMinNav = getNavPercentage(MIN_NAV_WIDTH_PX);
            const currentMaxNav = getNavPercentage(MAX_NAV_WIDTH_PX);
            
            if (navSize >= currentMinNav && navSize <= currentMaxNav && mainSize >= MIN_MAIN_WIDTH) {
              return navVisible ? parsed : [0, 100];
            }
          }
        } catch (e) {
          console.warn('Error parsing saved nav layout:', e);
        }
      }
      
      // Default layout basado en 280px
      const defaultWidth = getNavPercentage(TARGET_NAV_WIDTH_PX);
      return navVisible ? [defaultWidth, 100 - defaultWidth] : [0, 100];
    }, [navVisible, isSmallScreen, getNavPercentage]);

    const [currentLayout, setCurrentLayout] = useState(() => getSavedLayout());

    // Log inicial para debugging
    useEffect(() => {
      if (!isSmallScreen) {
        console.log('[ResizableNav] Initial configuration:', {
          viewportWidth: window.innerWidth,
          targetPx: TARGET_NAV_WIDTH_PX,
          minPx: MIN_NAV_WIDTH_PX,
          maxPx: MAX_NAV_WIDTH_PX,
          calculatedPercentages: {
            default: DEFAULT_NAV_WIDTH,
            min: MIN_NAV_WIDTH,
            max: MAX_NAV_WIDTH
          },
          equivalentPixels: {
            default: (window.innerWidth * DEFAULT_NAV_WIDTH) / 100,
            min: (window.innerWidth * MIN_NAV_WIDTH) / 100,
            max: (window.innerWidth * MAX_NAV_WIDTH) / 100
          },
          currentLayout,
          navVisible
        });
      }
    }, []); // Solo en mount inicial

    // Throttled save function para evitar demasiadas escrituras a localStorage
    const throttledSaveLayout = useMemo(
      () =>
        throttle((sizes: number[]) => {
          if (!isSmallScreen && navVisible) {
            const normalizedSizes = normalizeLayout(sizes);
            localStorage.setItem('nav-resizable-panels:layout', JSON.stringify(normalizedSizes));
          }
        }, 350),
      [isSmallScreen, navVisible],
    );

    // Actualizar layout cuando cambie la visibilidad del nav
    useEffect(() => {
      const newLayout = getSavedLayout();
      setCurrentLayout(newLayout);
      
      // Guardar el estado de visibilidad inmediatamente
      if (!isSmallScreen) {
        localStorage.setItem('navVisible', JSON.stringify(navVisible));
      }
    }, [getSavedLayout, navVisible, isSmallScreen]);

    // Recalcular layout cuando cambie el tamaño de la ventana
    useEffect(() => {
      if (isSmallScreen) return;
      
      const handleResize = throttle(() => {
        // Recalcular porcentajes basados en nuevo viewport
        const newLayout = getSavedLayout();
        setCurrentLayout(newLayout);
        
        console.log('[ResizableNav] Window resized, recalculating nav width:', {
          viewportWidth: window.innerWidth,
          targetPx: TARGET_NAV_WIDTH_PX,
          minPx: MIN_NAV_WIDTH_PX,
          maxPx: MAX_NAV_WIDTH_PX,
          calculatedPercentages: {
            default: getNavPercentage(TARGET_NAV_WIDTH_PX),
            min: getNavPercentage(MIN_NAV_WIDTH_PX), 
            max: getNavPercentage(MAX_NAV_WIDTH_PX)
          },
          newLayout
        });
      }, 250);

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [isSmallScreen, getSavedLayout, getNavPercentage]);

    // Handler para el resize
    const handleLayout = useCallback(
      (sizes: number[]) => {
        setCurrentLayout(sizes);
        throttledSaveLayout(sizes);
      },
      [throttledSaveLayout],
    );

    // Si estamos en móvil, usar el layout tradicional sin resize
    if (isSmallScreen) {
      return (
        <div className="relative z-0 flex h-full w-full overflow-hidden">
          <Nav navVisible={navVisible} setNavVisible={setNavVisible} isResizable={false} />
          <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      );
    }

    return (
      <div className="relative z-0 flex h-full w-full overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={handleLayout}
          className="h-full w-full"
        >
          {/* Panel del Navigation Sidebar */}
          <ResizablePanel
            defaultSize={currentLayout[0]}
            minSize={navVisible ? MIN_NAV_WIDTH : 0}
            maxSize={navVisible ? MAX_NAV_WIDTH : 0}
            collapsible={false}
            order={1}
            id="nav-sidebar"
            ref={panelRef}
            className={`transition-all duration-200 hide-scrollbar ${
              !navVisible ? 'min-w-0 max-w-0 overflow-hidden' : ''
            }`}
            style={{
              // Ancho fijo de 320px
              minWidth: navVisible ? '320px' : '0px',
              maxWidth: navVisible ? '320px' : '0px',
              width: navVisible ? '320px' : '0px',
            }}
          >
            {navVisible && (
              <div className="h-full w-full hide-scrollbar">
                <Nav navVisible={navVisible} setNavVisible={setNavVisible} isResizable={true} />
              </div>
            )}
          </ResizablePanel>

          {/* Handle desactivado - sidebar con ancho fijo de 320px */}
          {/* {navVisible && (
            <ResizableHandleAlt 
              withHandle 
              className="w-1 bg-transparent hover:bg-border-light/50 transition-colors duration-200 group cursor-col-resize"
            >
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-0.5 h-12 bg-border-medium/60 dark:bg-border-light/40 rounded-full group-hover:bg-border-medium dark:group-hover:bg-border-light transition-all duration-200 group-hover:w-1" />
              </div>
            </ResizableHandleAlt>
          )} */}

          {/* Panel del contenido principal */}
          <ResizablePanel
            defaultSize={currentLayout[1]}
            minSize={MIN_MAIN_WIDTH}
            order={2}
            id="main-content"
            className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden"
          >
            {children}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  },
);

ResizableNavGroup.displayName = 'ResizableNavGroup';

export default ResizableNavGroup;
