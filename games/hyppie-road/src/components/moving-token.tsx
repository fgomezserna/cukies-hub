'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MovingTokenProps {
  fromIndex: number;
  toIndex: number;
  isMoving: boolean;
  onAnimationComplete: () => void;
  gridCols: number;
}

export function MovingToken({ fromIndex, toIndex, isMoving, onAnimationComplete, gridCols }: MovingTokenProps) {
  const [currentFrame, setCurrentFrame] = useState(0); // Base 0 para mejor control
  const [animationStep, setAnimationStep] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Preload de imágenes de movimiento
  useEffect(() => {
    const preloadImages = async () => {
      const imagePromises: Promise<void>[] = [];
      
      for (let i = 1; i <= 6; i++) {
        const src = `/assets/images/token/move/token_right_${i}.png`;
        imagePromises.push(
          new Promise((resolve, reject) => {
            if (imageCache.current.has(src)) {
              resolve();
              return;
            }
            
            const img = new Image();
            img.onload = () => {
              imageCache.current.set(src, img);
              resolve();
            };
            img.onerror = reject;
            img.src = src;
          })
        );
      }
      
      try {
        await Promise.all(imagePromises);
        setImagesLoaded(true);
      } catch (error) {
        console.error('Error preloading moving token images:', error);
        setImagesLoaded(true);
      }
    };
    
    preloadImages();
  }, []);

  // Animación de frames del sprite
  useEffect(() => {
    if (!isMoving || !imagesLoaded) {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      return;
    }

    frameIntervalRef.current = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % 6);
    }, 120); // Sincronizado con animated-token

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, [isMoving, imagesLoaded]);

  // Animación de movimiento de posición
  useEffect(() => {
    if (!isMoving) {
      setAnimationStep(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const startTime = performance.now();
    const duration = 1000; // 1 segundo para moverse

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing suave para movimiento más fluido
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setAnimationStep(easedProgress * 100);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        onAnimationComplete();
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isMoving, onAnimationComplete]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isMoving || !imagesLoaded) return null;

  // Calcular posiciones de inicio y fin
  const fromRow = Math.floor(fromIndex / gridCols);
  const fromCol = fromIndex % gridCols;
  const toRow = Math.floor(toIndex / gridCols);
  const toCol = toIndex % gridCols;

  // Interpolación de posición
  const currentRow = fromRow + (toRow - fromRow) * (animationStep / 100);
  const currentCol = fromCol + (toCol - fromCol) * (animationStep / 100);

  const imagePath = `/assets/images/token/move/token_right_${currentFrame + 1}.png`;

  return (
          <div
        className="absolute pointer-events-none z-50 overflow-hidden no-flicker"
      style={{
        left: `${Math.max(0, Math.min((currentCol / gridCols) * 100, 75))}%`,
        top: `${(currentRow * 100) / 1}%`,
        width: `${100 / gridCols}%`,
        height: `100%`,
        transform: 'translate(0, 4px)',
        // Optimizaciones para suavidad
        willChange: 'left, top',
      }}
    >
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="drop-shadow-lg token-animation"
          style={{
            width: '120px',
            height: '120px',
            backgroundImage: `url(${imagePath})`,
            backgroundSize: 'contain',
                        backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      </div>
    </div>
  );
} 