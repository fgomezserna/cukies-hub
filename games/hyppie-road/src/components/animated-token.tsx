'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AnimatedTokenProps {
  isMoving: boolean;
  className?: string;
}

export function AnimatedToken({ isMoving, className = '' }: AnimatedTokenProps) {
  const [currentFrame, setCurrentFrame] = useState(0); // Cambiar a base 0 para mejor control
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  
  // Preload todas las imágenes necesarias
  useEffect(() => {
    const preloadImages = async () => {
      const imagePromises: Promise<void>[] = [];
      
      // Preload imágenes idle
      for (let i = 1; i <= 6; i++) {
        const idleSrc = `/assets/images/token/idle/token_down_${i}.png`;
        imagePromises.push(
          new Promise((resolve, reject) => {
            if (imageCache.current.has(idleSrc)) {
              resolve();
              return;
            }
            
            const img = new Image();
            img.onload = () => {
              imageCache.current.set(idleSrc, img);
              resolve();
            };
            img.onerror = reject;
            img.src = idleSrc;
          })
        );
      }
      
      // Preload imágenes move
      for (let i = 1; i <= 6; i++) {
        const moveSrc = `/assets/images/token/move/token_right_${i}.png`;
        imagePromises.push(
          new Promise((resolve, reject) => {
            if (imageCache.current.has(moveSrc)) {
              resolve();
              return;
            }
            
            const img = new Image();
            img.onload = () => {
              imageCache.current.set(moveSrc, img);
              resolve();
            };
            img.onerror = reject;
            img.src = moveSrc;
          })
        );
      }
      
      try {
        await Promise.all(imagePromises);
        setImagesLoaded(true);
      } catch (error) {
        console.error('Error preloading token images:', error);
        setImagesLoaded(true); // Continúa aunque haya errores
      }
    };
    
    preloadImages();
  }, []);

  // Manejar la animación de frames de manera continua
  useEffect(() => {
    if (!imagesLoaded) return;
    
    // Limpiar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Configurar velocidad según el estado
    const frameDelay = isMoving ? 120 : 300; // Velocidades más consistentes
    
    intervalRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        // Ciclo continuo de 0 a 5 (6 frames total)
        return (prev + 1) % 6;
      });
    }, frameDelay);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isMoving, imagesLoaded]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const animationType = isMoving ? 'move' : 'idle';
  const direction = isMoving ? 'right' : 'down';
  const imagePath = `/assets/images/token/${animationType}/token_${direction}_${currentFrame + 1}.png`;

  return (
    <div 
      className={`token-animation no-flicker ${className}`}
      style={{
        width: '120px',
        height: '120px',
        backgroundImage: imagesLoaded ? `url(${imagePath})` : 'none',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        // Remover transiciones que pueden causar conflictos
        transition: 'none',
        // Bajar 10px la animación idle
        marginTop: isMoving ? '0px' : '10px'
      }}
    />
  );
} 