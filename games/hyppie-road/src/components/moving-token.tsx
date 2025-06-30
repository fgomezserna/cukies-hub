'use client';

import React, { useState, useEffect } from 'react';

interface MovingTokenProps {
  fromIndex: number;
  toIndex: number;
  isMoving: boolean;
  onAnimationComplete: () => void;
  gridCols: number;
}

export function MovingToken({ fromIndex, toIndex, isMoving, onAnimationComplete, gridCols }: MovingTokenProps) {
  const [currentFrame, setCurrentFrame] = useState(1);
  const [animationStep, setAnimationStep] = useState(0); // 0-100 para la interpolación

  // Animación de frames del sprite
  useEffect(() => {
    if (!isMoving) return;

    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev % 6) + 1);
    }, 100);

    return () => clearInterval(interval);
  }, [isMoving]);

  // Animación de movimiento de posición
  useEffect(() => {
    if (!isMoving) {
      setAnimationStep(0);
      return;
    }

    let animationId: number;
    const startTime = Date.now();
    const duration = 1000; // 1 segundo para moverse

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing suave
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setAnimationStep(easedProgress * 100);

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      } else {
        onAnimationComplete();
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isMoving, onAnimationComplete]);

  if (!isMoving) return null;

  // Calcular posiciones de inicio y fin
  const fromRow = Math.floor(fromIndex / gridCols);
  const fromCol = fromIndex % gridCols;
  const toRow = Math.floor(toIndex / gridCols);
  const toCol = toIndex % gridCols;

  // Interpolación de posición
  const currentRow = fromRow + (toRow - fromRow) * (animationStep / 100);
  const currentCol = fromCol + (toCol - fromCol) * (animationStep / 100);

  const imagePath = `/assets/images/token/move/token_right_${currentFrame}.png`;

  return (
    <div
      className="absolute pointer-events-none z-50 transition-none"
      style={{
        left: `${(currentCol / gridCols) * 100}%`,
        top: `${(currentRow / Math.ceil(32 / gridCols)) * 100}%`,
        width: `${100 / gridCols}%`,
        height: `${100 / Math.ceil(32 / gridCols)}%`,
        transform: 'translate(0, 0)',
      }}
    >
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="drop-shadow-xl"
          style={{
            width: '70px',
            height: '70px',
            backgroundImage: `url(${imagePath})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.8))',
          }}
        />
      </div>
    </div>
  );
} 