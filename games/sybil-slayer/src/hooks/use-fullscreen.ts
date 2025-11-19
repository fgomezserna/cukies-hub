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
    if (!element) return;

    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        await element.mozRequestFullScreen();
      }
    } catch (error) {
      console.error('Error entering fullscreen:', error);
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

  const toggleFullscreen = () => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
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

