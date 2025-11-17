"use client";

import React, { useRef, useEffect, useCallback } from 'react';
import type { Vector2D } from '@/types/game';

// Declarar el tipo para JoyStick (declaración global)
declare global {
  interface Window {
    JoyStick: any;
  }
}

interface JoystickWrapperProps {
  x: number;
  y: number;
  size: number;
  onDirectionChange: (direction: Vector2D) => void;
  onRelease: () => void;
  visible: boolean;
  activeTouchId?: number | null;
}

const JoystickWrapper: React.FC<JoystickWrapperProps> = ({
  x,
  y,
  size,
  onDirectionChange,
  onRelease,
  visible,
  activeTouchId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<any>(null);
  const containerIdRef = useRef<string>(`joystick-${Date.now()}-${Math.random()}`);
  const wasActiveRef = useRef<boolean>(false);

  // Convertir valores del joystick (-100 a 100) a Vector2D normalizado
  const convertJoyStickToDirection = useCallback((x: number | string, y: number | string): Vector2D => {
    // Los valores vienen de -100 a 100 (pueden ser strings por .toFixed()), los convertimos a números
    const numX = typeof x === 'string' ? parseFloat(x) : x;
    const numY = typeof y === 'string' ? parseFloat(y) : y;
    
    // Los normalizamos a -1 a 1
    let normalizedX = numX / 100;
    let normalizedY = numY / 100;
    
    // IMPORTANTE: El joystick ya invierte Y (multiplica por -1 en joy.js línea 357)
    // pero el juego espera: y < 0 = arriba, y > 0 = abajo
    // Cuando mueves el joystick hacia arriba, el joystick devuelve Y positivo (por el *-1)
    // pero el juego espera Y negativo para arriba, así que necesitamos invertir Y de nuevo
    normalizedY = -normalizedY;
    
    // Si ambos valores son muy pequeños, retornar dirección neutral
    if (Math.abs(normalizedX) < 0.01 && Math.abs(normalizedY) < 0.01) {
      return { x: 0, y: 0 };
    }
    
    // Normalizar el vector para mantener la magnitud máxima en 1
    const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    if (magnitude > 1) {
      return {
        x: normalizedX / magnitude,
        y: normalizedY / magnitude,
      };
    }
    
    return { x: normalizedX, y: normalizedY };
  }, []);

  // Inicializar el joystick cuando el componente se monte y sea visible
  useEffect(() => {
    if (!visible || !containerRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[JoystickWrapper] Skipping initialization - visible:', visible, 'containerRef:', !!containerRef.current);
      }
      return;
    }
    
    // Función para inicializar el joystick
    const initializeJoystick = () => {
      // Verificar que el contenedor esté en el DOM
      const containerElement = document.getElementById(containerIdRef.current);
      if (!containerElement) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[JoystickWrapper] Container element not found in DOM:', containerIdRef.current);
        }
        return false;
      }

      // Verificar que la biblioteca JoyStick esté cargada
      if (typeof window === 'undefined' || !(window as any).JoyStick) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[JoystickWrapper] JoyStick library not loaded. Make sure /joy.js is loaded.');
        }
        return false;
      }
      
      const JoyStickClass = (window as any).JoyStick;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[JoystickWrapper] Initializing joystick with container:', containerIdRef.current, 'size:', size, 'position:', { x, y });
      }

      // Limpiar joystick anterior si existe
      if (joystickRef.current) {
        const container = containerRef.current;
        const canvas = container.querySelector('canvas');
        if (canvas) {
          canvas.remove();
        }
        joystickRef.current = null;
      }

      // Asegurar que el tamaño sea suficiente para evitar errores de radio negativo
      const minSize = 100; // Tamaño mínimo para evitar problemas con el cálculo del radio
      const joystickSize = Math.max(size, minSize);
      
      // Crear el joystick con callback
      try {
        const joy = new JoyStickClass(
          containerIdRef.current,
          {
            width: joystickSize,
            height: joystickSize,
            internalFillColor: '#EC4899', // Rosa para el stick interno
            internalLineWidth: 2,
            internalStrokeColor: '#BE185D', // Rosa oscuro para el borde
            externalLineWidth: 3,
            externalStrokeColor: 'rgba(255, 255, 255, 0.5)', // Borde externo semi-transparente
            autoReturnToCenter: true,
          },
          (stickData: any) => {
            // Callback que se ejecuta cuando el joystick se mueve
            // stickData contiene: { x, y, xPosition, yPosition, cardinalDirection }
            console.log('[JoystickWrapper] Callback received - Raw values:', {
              x: stickData.x,
              y: stickData.y,
              xType: typeof stickData.x,
              yType: typeof stickData.y,
              cardinalDirection: stickData.cardinalDirection
            });
            
            const direction = convertJoyStickToDirection(stickData.x, stickData.y);
            console.log('[JoystickWrapper] Converted direction:', direction, {
              magnitude: Math.sqrt(direction.x * direction.x + direction.y * direction.y),
              angle: Math.atan2(direction.y, direction.x) * 180 / Math.PI
            });
            
            const isActive = Math.abs(direction.x) > 0.01 || Math.abs(direction.y) > 0.01;
            
            // Si estaba activo y ahora está en el centro, llamar a onRelease
            if (wasActiveRef.current && !isActive) {
              console.log('[JoystickWrapper] Joystick returned to center, calling onRelease');
              onRelease();
            }
            
            wasActiveRef.current = isActive;
            
            // Siempre llamar a onDirectionChange, incluso cuando está en el centro (para resetear)
            console.log('[JoystickWrapper] Calling onDirectionChange with:', direction, 'isActive:', isActive);
            onDirectionChange(direction);
          }
        );
        
        joystickRef.current = joy;
        
        // Asegurar que el canvas también tenga touchAction: none
        const canvas = containerElement.querySelector('canvas');
        if (canvas) {
          (canvas as HTMLElement).style.touchAction = 'none';
          
          // Intentar capturar el touch activo inmediatamente después de la inicialización
          setTimeout(() => {
            // Si tenemos un activeTouchId, intentar capturarlo inmediatamente
            if (activeTouchId !== null && activeTouchId !== undefined) {
              console.log('[JoystickWrapper] Attempting to capture active touch:', activeTouchId);
              
              // Crear un evento touchmove simulado para activar el joystick
              // Esto ayuda a capturar el touch que comenzó antes de la inicialización
              // Nota: No podemos crear eventos TouchEvent reales, pero el joystick debería
              // capturar el próximo touchmove que llegue con ese touchId
              
              // En su lugar, forzamos que el joystick busque el touch en el próximo evento
              // El código en joy.js ya tiene lógica para buscar touches activos en onTouchMove
            }
            
            // Asegurar que el canvas y el contenedor puedan recibir eventos de touch
            canvas.style.pointerEvents = 'auto';
            containerElement.style.pointerEvents = 'auto';
            
            console.log('[JoystickWrapper] Canvas ready, waiting for touch events');
          }, 10);
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[JoystickWrapper] Joystick initialized successfully');
        }
        
        return true;
      } catch (error) {
        console.error('[JoystickWrapper] Error initializing joystick:', error);
        return false;
      }
    };

    // Función de cleanup
    const cleanup = () => {
      if (joystickRef.current && containerRef.current) {
        const container = containerRef.current;
        const canvas = container.querySelector('canvas');
        if (canvas) {
          canvas.remove();
        }
        joystickRef.current = null;
      }
    };

    let checkInterval: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;

    // Esperar un pequeño delay para asegurar que el DOM esté listo
    const initTimeout = setTimeout(() => {
      // Intentar inicializar inmediatamente
      if (initializeJoystick()) {
        // Ya está inicializado
      } else {
        // Si no está disponible, esperar un poco y reintentar
        checkInterval = setInterval(() => {
          if ((window as any).JoyStick) {
            const containerElement = document.getElementById(containerIdRef.current);
            if (containerElement) {
              if (checkInterval) clearInterval(checkInterval);
              initializeJoystick();
            }
          }
        }, 100);

        // Limpiar después de 5 segundos si no se carga
        timeout = setTimeout(() => {
          if (checkInterval) clearInterval(checkInterval);
          console.error('[JoystickWrapper] Timeout waiting for JoyStick library');
        }, 5000);
      }
    }, 50); // Pequeño delay para asegurar que el DOM esté listo

    return () => {
      clearTimeout(initTimeout);
      if (checkInterval) clearInterval(checkInterval);
      if (timeout) clearTimeout(timeout);
      cleanup();
    };
  }, [visible, size, x, y, onDirectionChange, onRelease, convertJoyStickToDirection]);

  // Reset wasActiveRef cuando el componente se oculta
  useEffect(() => {
    if (!visible) {
      wasActiveRef.current = false;
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      id={containerIdRef.current}
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        width: `${Math.max(size, 100)}px`,
        height: `${Math.max(size, 100)}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    />
  );
};

export default JoystickWrapper;



