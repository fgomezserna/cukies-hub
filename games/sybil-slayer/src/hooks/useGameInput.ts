import { useState, useEffect, useCallback } from 'react';
import type { Vector2D } from '@/types/game';
import { KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_PAUSE, KEY_START } from '@/lib/constants';

interface InputState {
  direction: Vector2D;
  pauseToggled: boolean;
  startToggled: boolean;
}

const initialInputState: InputState = {
  direction: { x: 0, y: 0 },
  pauseToggled: false,
  startToggled: false,
};

export function useGameInput(): InputState {
  const [inputState, setInputState] = useState<InputState>(initialInputState);
  const pressedKeys = new Set<string>();

  const updateDirection = useCallback(() => {
    let dx = 0;
    let dy = 0;
    if (pressedKeys.has(KEY_LEFT)) dx -= 1;
    if (pressedKeys.has(KEY_RIGHT)) dx += 1;
    if (pressedKeys.has(KEY_UP)) dy -= 1;
    if (pressedKeys.has(KEY_DOWN)) dy += 1;

     // Normalize the direction vector if moving diagonally
     const magnitude = Math.sqrt(dx * dx + dy * dy);
     if (magnitude > 0) {
       dx /= magnitude;
       dy /= magnitude;
     }

    setInputState(prev => ({ ...prev, direction: { x: dx, y: dy } }));
  }, []); // No dependencies needed as pressedKeys is managed internally


  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if ([KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT].includes(event.code)) {
        if (!pressedKeys.has(event.code)) {
             pressedKeys.add(event.code);
             updateDirection();
        }
    }
     if (event.code === KEY_PAUSE) {
         setInputState(prev => ({ ...prev, pauseToggled: true }));
     }
      if (event.code === KEY_START) {
         setInputState(prev => ({ ...prev, startToggled: true }));
     }
    // Prevent default browser behavior for arrow keys, space, etc.
    if ([KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_START].includes(event.code)) {
        event.preventDefault();
    }

  }, [updateDirection]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
     if ([KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT].includes(event.code)) {
        pressedKeys.delete(event.code);
        updateDirection();
     }
    // Reset toggle states on key up to require a fresh press
     if (event.code === KEY_PAUSE) {
         setInputState(prev => ({ ...prev, pauseToggled: false }));
     }
     if (event.code === KEY_START) {
        setInputState(prev => ({ ...prev, startToggled: false }));
     }
  }, [updateDirection]);


  // Función para limpiar teclas presionadas cuando se pierde el foco
  const clearPressedKeys = useCallback(() => {
    pressedKeys.clear();
    setInputState(prev => ({ ...prev, direction: { x: 0, y: 0 } }));
  }, []);

  // Función para prevenir menú contextual y recuperar foco
  const handleContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    // Enfocar el window para asegurar que los eventos de teclado funcionen
    window.focus();
  }, []);

  // Función para recuperar foco cuando se hace clic en la ventana
  const handleWindowClick = useCallback(() => {
    window.focus();
  }, []);

  useEffect(() => {
    // Eventos de teclado
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // BUGFIX: Prevenir menú contextual y recuperar foco
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleWindowClick);
    
    // BUGFIX: Limpiar teclas cuando se pierde el foco
    window.addEventListener('blur', clearPressedKeys);
    window.addEventListener('focus', clearPressedKeys);
    
    // BUGFIX: Limpiar teclas cuando se cambia de pestaña
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearPressedKeys();
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('blur', clearPressedKeys);
      window.removeEventListener('focus', clearPressedKeys);
    };
  }, [handleKeyDown, handleKeyUp, handleContextMenu, handleWindowClick, clearPressedKeys]);

  // Return a stable object, but its properties will update
  return inputState;
}
