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
  const elementRef = useRef<T>(null);

  useEffect(() => {
    const doc = document as DocumentWithFullscreen;
    
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement ||
        doc.mozFullScreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

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
    
    // En móvil, usar el documento completo directamente
    const targetElement = isMobile 
      ? (document.documentElement as FullscreenElement)
      : (element || (document.documentElement as FullscreenElement));

    if (process.env.NODE_ENV === 'development') {
      console.log('[useFullscreen] Entering fullscreen:', {
        isMobile,
        hasElement: !!element,
        targetElement: targetElement.tagName,
        hasRequestFullscreen: !!targetElement.requestFullscreen,
        hasWebkitRequestFullscreen: !!targetElement.webkitRequestFullscreen,
      });
    }

    try {
      if (targetElement.requestFullscreen) {
        await targetElement.requestFullscreen();
      } else if (targetElement.webkitRequestFullscreen) {
        await targetElement.webkitRequestFullscreen();
      } else if ((targetElement as any).webkitEnterFullscreen) {
        // iOS Safari (para video elements principalmente)
        await (targetElement as any).webkitEnterFullscreen();
      } else if (targetElement.msRequestFullscreen) {
        await targetElement.msRequestFullscreen();
      } else if (targetElement.mozRequestFullScreen) {
        await targetElement.mozRequestFullScreen();
      } else {
        console.warn('[useFullscreen] Fullscreen API not supported on this browser');
        // En móvil, intentar ocultar la barra de direcciones como alternativa
        if (isMobile) {
          window.scrollTo(0, 1);
        }
      }
    } catch (error: any) {
      console.error('[useFullscreen] Error entering fullscreen:', error);
      // Si falla con el elemento específico en móvil, intentar con documento completo
      if (isMobile && element && element !== document.documentElement) {
        try {
          const docElement = document.documentElement as FullscreenElement;
          if (docElement.requestFullscreen) {
            await docElement.requestFullscreen();
          } else if (docElement.webkitRequestFullscreen) {
            await docElement.webkitRequestFullscreen();
          }
        } catch (fallbackError) {
          console.error('[useFullscreen] Fallback fullscreen also failed:', fallbackError);
          // Último recurso: intentar ocultar la barra de direcciones
          if (isMobile) {
            window.scrollTo(0, 1);
          }
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
      }
    } catch (error) {
      console.error('Error exiting fullscreen:', error);
    }
  };

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  };

  return {
    elementRef,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}

