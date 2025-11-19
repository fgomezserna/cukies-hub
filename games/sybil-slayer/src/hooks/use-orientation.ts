import { useState, useEffect } from 'react';

/**
 * Hook para detectar si el dispositivo está en modo portrait (vertical)
 * @returns {boolean} true si está en portrait, false si está en landscape
 */
export function useOrientation(): boolean {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < window.innerHeight;
  });

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerWidth < window.innerHeight);
    };

    // Check on mount
    checkOrientation();

    // Listen to resize events
    window.addEventListener('resize', checkOrientation);
    
    // Listen to orientation change events (for mobile devices)
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  return isPortrait;
}

