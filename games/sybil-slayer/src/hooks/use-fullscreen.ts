import { useState, useEffect, useRef } from 'react';

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
}

interface DocumentWithFullscreen extends Document {
  webkitFullscreenElement?: Element | null;
  webkitIsFullScreen?: boolean;
  msFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
}

// Detectar si es móvil
const isMobileDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

export function useFullscreen<T extends HTMLElement = HTMLDivElement>() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const elementRef = useRef<T>(null);

  useEffect(() => {
    const doc = document as DocumentWithFullscreen;
    
    // Verificar si fullscreen está soportado
    const checkFullscreenSupport = () => {
      const element = document.documentElement as FullscreenElement;
      const supported = !!(
        doc.fullscreenEnabled ||
        (doc as any).webkitFullscreenEnabled ||
        element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.msRequestFullscreen ||
        element.mozRequestFullScreen
      );
      setIsFullscreenSupported(supported);
      console.log('[useFullscreen] Fullscreen support check:', {
        fullscreenEnabled: doc.fullscreenEnabled,
        webkitFullscreenEnabled: (doc as any).webkitFullscreenEnabled,
        hasRequestFullscreen: !!element.requestFullscreen,
        hasWebkitRequestFullscreen: !!element.webkitRequestFullscreen,
        supported,
      });
    };
    
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement ||
        doc.mozFullScreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    // Verificar soporte inicial
    checkFullscreenSupport();

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    // Initial check
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const enterFullscreen = async () => {
    const element = elementRef.current as FullscreenElement | null;
    const doc = document as DocumentWithFullscreen;
    const isMobile = isMobileDevice();
    
    // Siempre usar el documento completo en móvil para mejor compatibilidad
    const targetElement = isMobile 
      ? (document.documentElement as FullscreenElement)
      : (element || (document.documentElement as FullscreenElement));

    console.log('[useFullscreen] Entering fullscreen:', {
      isMobile,
      hasElement: !!element,
      targetElement: targetElement.tagName,
      hasRequestFullscreen: !!targetElement.requestFullscreen,
      hasWebkitRequestFullscreen: !!targetElement.webkitRequestFullscreen,
      fullscreenEnabled: doc.fullscreenEnabled,
      userAgent: navigator.userAgent,
    });

    // Verificar si fullscreen está habilitado
    if (!doc.fullscreenEnabled && !(doc as any).webkitFullscreenEnabled) {
      console.warn('[useFullscreen] Fullscreen not enabled. May need user gesture or permission.');
    }

    try {
      // Intentar con el método estándar primero
      if (targetElement.requestFullscreen) {
        console.log('[useFullscreen] Trying requestFullscreen()');
        await targetElement.requestFullscreen();
        return;
      }
      
      // Intentar con webkit (Safari, Chrome móvil)
      if (targetElement.webkitRequestFullscreen) {
        console.log('[useFullscreen] Trying webkitRequestFullscreen()');
        await targetElement.webkitRequestFullscreen();
        return;
      }
      
      // Intentar con ms (IE/Edge antiguo)
      if (targetElement.msRequestFullscreen) {
        console.log('[useFullscreen] Trying msRequestFullscreen()');
        await targetElement.msRequestFullscreen();
        return;
      }
      
      // Intentar con moz (Firefox antiguo)
      if (targetElement.mozRequestFullScreen) {
        console.log('[useFullscreen] Trying mozRequestFullScreen()');
        await targetElement.mozRequestFullScreen();
        return;
      }
      
      console.warn('[useFullscreen] No fullscreen method available');
      
      // Fallback: intentar ocultar la barra de direcciones en móvil
      if (isMobile) {
        console.log('[useFullscreen] Attempting to hide address bar as fallback');
        window.scrollTo(0, 1);
        // También intentar hacer scroll después de un delay
        setTimeout(() => {
          window.scrollTo(0, 0);
        }, 100);
      }
    } catch (error: any) {
      console.error('[useFullscreen] Error entering fullscreen:', error);
      console.error('[useFullscreen] Error details:', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
      });
      
      // Si falla, intentar con documento completo como fallback
      if (isMobile && targetElement !== document.documentElement) {
        try {
          console.log('[useFullscreen] Trying fallback with documentElement');
          const docElement = document.documentElement as FullscreenElement;
          if (docElement.requestFullscreen) {
            await docElement.requestFullscreen();
          } else if (docElement.webkitRequestFullscreen) {
            await docElement.webkitRequestFullscreen();
          }
        } catch (fallbackError) {
          console.error('[useFullscreen] Fallback fullscreen also failed:', fallbackError);
        }
      }
    }
  };

  const exitFullscreen = async () => {
    const doc = document as DocumentWithFullscreen;
    
    try {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await (doc as any).webkitExitFullscreen();
      } else if ((doc as any).msExitFullscreen) {
        await (doc as any).msExitFullscreen();
      } else if ((doc as any).mozCancelFullScreen) {
        await (doc as any).mozCancelFullScreen();
      } else {
        // Si no hay API disponible, salir del modo simulado
        const element = elementRef.current;
        if (element) {
          element.style.position = '';
          element.style.top = '';
          element.style.left = '';
          element.style.width = '';
          element.style.height = '';
          element.style.zIndex = '';
          document.body.style.overflow = '';
          setIsFullscreen(false);
        }
      }
    } catch (error) {
      console.error('Error exiting fullscreen:', error);
      // Si falla, intentar salir del modo simulado
      const element = elementRef.current;
      if (element) {
        element.style.position = '';
        element.style.top = '';
        element.style.left = '';
        element.style.width = '';
        element.style.height = '';
        element.style.zIndex = '';
        document.body.style.overflow = '';
        setIsFullscreen(false);
      }
    }
  };

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  };

  // Función para modo pantalla completa simulada (para navegadores que no soportan fullscreen)
  const toggleSimulatedFullscreen = () => {
    const element = elementRef.current;
    if (!element) return;

    if (isFullscreen) {
      // Salir del modo simulado
      element.style.position = '';
      element.style.top = '';
      element.style.left = '';
      element.style.width = '';
      element.style.height = '';
      element.style.zIndex = '';
      document.body.style.overflow = '';
      setIsFullscreen(false);
    } else {
      // Entrar en modo simulado
      element.style.position = 'fixed';
      element.style.top = '0';
      element.style.left = '0';
      element.style.width = '100vw';
      element.style.height = '100vh';
      element.style.zIndex = '9999';
      document.body.style.overflow = 'hidden';
      setIsFullscreen(true);
    }
  };

  return {
    elementRef,
    isFullscreen,
    isFullscreenSupported,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    toggleSimulatedFullscreen,
  };
}

