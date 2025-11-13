"use client";

import React, { useState, useCallback, useEffect } from 'react';
import type { Vector2D } from '@/types/game';
import VirtualDPad from './virtual-dpad';

interface TouchZonesProps {
  onDirectionChange: (direction: Vector2D) => void;
  onDirectionClear: () => void;
}

const TouchZones: React.FC<TouchZonesProps> = ({
  onDirectionChange,
  onDirectionClear,
}) => {
  const [dpadVisible, setDpadVisible] = useState(false);
  const [dpadPosition, setDpadPosition] = useState({ x: 0, y: 0 });
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const dpadSize = 200; // Base size, will be adjusted for mobile

  // Debug: Log when component mounts
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[D-PAD] TouchZones component MOUNTED');
    }
    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[D-PAD] TouchZones component UNMOUNTED');
      }
    };
  }, []);

  // Listen for orientation changes and window resize
  useEffect(() => {
    const updateScreenSize = () => {
      const newSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setScreenSize(newSize);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[D-PAD] Screen size updated:', {
          ...newSize,
          isLandscape: newSize.width > newSize.height,
        });
      }
    };

    // Initial size
    updateScreenSize();

    // Listen for resize and orientation changes
    window.addEventListener('resize', updateScreenSize);
    window.addEventListener('orientationchange', updateScreenSize);

    return () => {
      window.removeEventListener('resize', updateScreenSize);
      window.removeEventListener('orientationchange', updateScreenSize);
    };
  }, []);

  // Debug: Log when component mounts/updates
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[D-PAD] TouchZones component mounted/updated:', {
        screenSize,
        isLandscape: screenSize.width > screenSize.height,
      });
    }
  }, [screenSize]);

  // Calculate D-pad size based on screen size (works for both portrait and landscape)
  const getDpadSize = useCallback(() => {
    if (typeof window === 'undefined') return dpadSize;
    
    // Use current window dimensions (they update on orientation change)
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const minDimension = Math.min(screenWidth, screenHeight);
    
    // Check if device is in landscape mode
    const isLandscape = screenWidth > screenHeight;
    
    if (isLandscape) {
      // In landscape, use a percentage of height (which is the smaller dimension)
      // Make it slightly larger for better visibility in landscape
      return Math.min(Math.max(screenHeight * 0.25, 150), 280);
    } else {
      // In portrait, use percentage of width (which is the smaller dimension)
      return Math.min(Math.max(minDimension * 0.22, 150), 250);
    }
  }, [screenSize]);

  // Adjust D-pad position when orientation changes
  useEffect(() => {
    if (dpadVisible && screenSize.width > 0 && screenSize.height > 0) {
      const currentDpadSize = getDpadSize();
      const halfSize = currentDpadSize / 2;
      
      // Re-clamp position to ensure D-pad stays within bounds after orientation change
      const clampedX = Math.max(halfSize, Math.min(dpadPosition.x, screenSize.width - halfSize));
      const clampedY = Math.max(halfSize, Math.min(dpadPosition.y, screenSize.height - halfSize));
      
      if (clampedX !== dpadPosition.x || clampedY !== dpadPosition.y) {
        setDpadPosition({ x: clampedX, y: clampedY });
      }
    }
  }, [screenSize, dpadVisible, getDpadSize, dpadPosition]);

  // Check if the touch target is a button or interactive element
  const isInteractiveElement = useCallback((target: EventTarget | null): boolean => {
    if (!target) return false;
    
    const element = target as HTMLElement;
    
    // Check if it's a button element
    if (element.tagName === 'BUTTON') return true;
    
    // Check if it has the game-button class
    if (element.classList.contains('game-button')) return true;
    
    // Check if it's inside a button
    const buttonParent = element.closest('button');
    if (buttonParent) return true;
    
    // Check if it's inside an element with game-button class
    const gameButtonParent = element.closest('.game-button');
    if (gameButtonParent) return true;
    
    // Check if it's a link
    if (element.tagName === 'A') return true;
    
    // Check if it's inside a link
    if (element.closest('a')) return true;
    
    // Check if it's inside a modal or overlay (z-index >= 60)
    const modal = element.closest('[class*="z-[6"], [class*="z-[7"], [class*="z-[8"], [class*="z-[9"]');
    if (modal) return true;
    
    // Check if it's an input, textarea, or select element
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return true;
    
    // Check if it's inside an input, textarea, or select
    if (element.closest('input, textarea, select')) return true;
    
    // Check if it has an onClick handler (but be careful - many elements might have this)
    // Only check direct onclick attribute, not React handlers
    if (element.hasAttribute('onclick')) return true;
    
    // Check if parent has onclick attribute
    const parentWithClick = element.closest('[onclick]');
    if (parentWithClick) return true;
    
    // Don't block canvas or game elements - they should allow D-pad
    if (element.tagName === 'CANVAS') return false;
    if (element.closest('canvas')) return false;
    
    return false;
  }, []);


  const handleDpadDirectionChange = useCallback(
    (direction: Vector2D) => {
      onDirectionChange(direction);
    },
    [onDirectionChange]
  );

  const handleDpadRelease = useCallback(() => {
    setDpadVisible(false);
    setActiveTouchId(null);
    onDirectionClear();
  }, [onDirectionClear]);

  // Prevent default touch behaviors only for D-pad area
  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      
      // Only prevent default if touching the D-pad (and not a button)
      if (target.closest('.virtual-dpad') && !isInteractiveElement(target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventDefault);
    };
  }, [isInteractiveElement]);

  // Use global touch listeners to detect touches anywhere on screen
  useEffect(() => {
    const handleGlobalTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      // Get the element at the touch point
      const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
      
      // Debug: log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('[D-PAD] Touch detected:', {
          x: touch.clientX,
          y: touch.clientY,
          elementAtPoint: elementAtPoint?.tagName,
          elementAtPointClass: elementAtPoint?.className,
          target: (e.target as HTMLElement)?.tagName,
          targetClass: (e.target as HTMLElement)?.className,
          isInteractive: isInteractiveElement(elementAtPoint) || isInteractiveElement(e.target),
          dpadVisible,
        });
      }
      
      // Check if touching an interactive element
      const isInteractive = isInteractiveElement(elementAtPoint) || isInteractiveElement(e.target);
      if (isInteractive) {
        // Let the button handle the touch normally - don't activate D-pad
        return;
      }

      // Only activate D-pad if not already visible
      if (!dpadVisible) {
        const touchId = touch.identifier;
        setActiveTouchId(touchId);

        const x = touch.clientX;
        const y = touch.clientY;
        
        // Ensure D-pad position stays within screen bounds (important for landscape mode)
        const dpadSize = getDpadSize();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const halfSize = dpadSize / 2;
        
        // Clamp position to keep D-pad within screen bounds
        const clampedX = Math.max(halfSize, Math.min(x, screenWidth - halfSize));
        const clampedY = Math.max(halfSize, Math.min(y, screenHeight - halfSize));

        if (process.env.NODE_ENV === 'development') {
          console.log('[D-PAD] Activating D-pad:', {
            original: { x, y },
            clamped: { x: clampedX, y: clampedY },
            dpadSize,
            screenSize: { width: screenWidth, height: screenHeight },
            isLandscape: screenWidth > screenHeight,
          });
        }

        setDpadPosition({ x: clampedX, y: clampedY });
        setDpadVisible(true);
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (activeTouchId !== null) {
        const endedTouch = Array.from(e.changedTouches).find(
          (t) => t.identifier === activeTouchId
        );
        if (endedTouch) {
          setActiveTouchId(null);
          setDpadVisible(false);
          onDirectionClear();
        }
      }
    };

    const handleGlobalTouchCancel = () => {
      setActiveTouchId(null);
      setDpadVisible(false);
      onDirectionClear();
    };

    // Add listeners in capture phase to catch events early, but use passive to not block buttons
    // Using capture phase ensures we see the event before it reaches other handlers
    // But passive: true means we can't preventDefault, which is fine - we just want to detect
    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true, capture: true });
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', handleGlobalTouchCancel, { passive: true, capture: true });

    if (process.env.NODE_ENV === 'development') {
      console.log('[D-PAD] Global touch listeners added:', {
        screenSize: { width: window.innerWidth, height: window.innerHeight },
        isLandscape: window.innerWidth > window.innerHeight,
      });
    }

    return () => {
      document.removeEventListener('touchstart', handleGlobalTouchStart, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchend', handleGlobalTouchEnd, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchcancel', handleGlobalTouchCancel, { capture: true } as EventListenerOptions);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[D-PAD] Global touch listeners removed');
      }
    };
  }, [dpadVisible, activeTouchId, isInteractiveElement, onDirectionClear, getDpadSize]);

  return (
    <>

      {/* Virtual D-pad */}
      <VirtualDPad
        x={dpadPosition.x}
        y={dpadPosition.y}
        size={getDpadSize()}
        onDirectionChange={handleDpadDirectionChange}
        onRelease={handleDpadRelease}
        visible={dpadVisible}
      />
    </>
  );
};

export default TouchZones;

