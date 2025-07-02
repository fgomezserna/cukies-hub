'use client';

import React, { useState, useEffect } from 'react';

interface AnimatedTokenProps {
  isMoving: boolean;
  className?: string;
}

export function AnimatedToken({ isMoving, className = '' }: AnimatedTokenProps) {
  const [currentFrame, setCurrentFrame] = useState(1);
  
  useEffect(() => {
    // Reiniciar frame cuando cambia el estado de movimiento
    setCurrentFrame(1);
    
    // Animación más rápida cuando se mueve, más lenta cuando está idle
    const frameDelay = isMoving ? 100 : 250; // 100ms para move, 250ms para idle (más lento y suave)
    
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev % 6) + 1);
    }, frameDelay);

    return () => clearInterval(interval);
  }, [isMoving]);

  const animationType = isMoving ? 'move' : 'idle';
  const direction = isMoving ? 'right' : 'down';
  const imagePath = `/assets/images/token/${animationType}/token_${direction}_${currentFrame}.png`;

  return (
    <div 
      className={`transition-all duration-500 ${className}`}
      style={{
        width: '120px',
        height: '120px',
        backgroundImage: `url(${imagePath})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    />
  );
} 