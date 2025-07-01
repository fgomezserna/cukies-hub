'use client';

import React, { useState, useEffect } from 'react';
import { Tile } from '@/types/game';
import { cn } from '@/lib/utils';
import { AnimatedToken } from './animated-token';
import { MovingToken } from './moving-token';

interface GameBoardProps {
  tiles: Tile[];
  isAnimating: boolean;
  currentPosition: number;
  previousPosition?: number;
  onTileClick?: (index: number) => void;
  onMoveAnimationComplete?: () => void;
}

export function GameBoard({ 
  tiles, 
  isAnimating, 
  currentPosition, 
  previousPosition, 
  onTileClick, 
  onMoveAnimationComplete 
}: GameBoardProps) {
  const [isMovingToken, setIsMovingToken] = useState(false);
  const [gridCols, setGridCols] = useState(16); // 16 columnas para una sola fila

  // Hook para detectar el tamaño de pantalla
  useEffect(() => {
    const updateGridCols = () => {
      // Siempre 16 columnas (una sola fila)
      setGridCols(16);
    };

    // Establecer columnas iniciales
    updateGridCols();

    // Listener para cambios de tamaño
    window.addEventListener('resize', updateGridCols);
    return () => window.removeEventListener('resize', updateGridCols);
  }, []);

  // Detectar cuando comenzar la animación de movimiento
  useEffect(() => {
    if (isAnimating && previousPosition !== undefined && previousPosition !== currentPosition) {
      setIsMovingToken(true);
    }
  }, [isAnimating, previousPosition, currentPosition]);

  const handleMoveComplete = () => {
    setIsMovingToken(false);
    onMoveAnimationComplete?.();
  };

  return (
    <div className="w-full max-w-[95vw] mx-auto p-2">
      <div className="relative">
                  <div className="grid grid-cols-16 gap-2 mb-4">
        {tiles.map((tile, index) => (
          <div
            key={index}
            className={cn(
              "aspect-square flex items-center justify-center text-sm font-bold transition-all duration-500 cursor-pointer relative overflow-hidden",
              // Estados de la casilla
              tile.isActive && "ring-2 ring-yellow-400 ring-offset-1 scale-105 shadow-xl",
              tile.isActive && isAnimating && "ring-4 ring-yellow-300 animate-pulse",
              // Animaciones
              isAnimating && tile.isActive && "brightness-125",
              // Estados de hover
              tile.isActive && "hover:scale-110"
            )}
            style={{
              backgroundImage: 'url(/assets/images/road_1.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
            onClick={() => onTileClick?.(index)}
          >
            {/* Número de casilla */}
            <span className="absolute top-1 left-1 text-sm text-white font-bold bg-black/50 px-1.5 py-0.5 rounded">
              {index + 1}
            </span>
            
            {/* Contenido principal */}
            <div className="flex flex-col items-center justify-center">
              {tile.isActive ? (
                // Token animado - idle cuando no se está moviendo (prioridad máxima)
                !isMovingToken && <AnimatedToken isMoving={false} className="drop-shadow-lg" />
              ) : tile.revealed ? (
                tile.hasTrap ? (
                  // Icono de trampa
                  <div className="text-red-500 text-3xl drop-shadow-lg">💥</div>
                ) : (
                  // Icono de éxito - solo en casillas completadas donde NO está el token
                  <div className="text-green-400 text-3xl drop-shadow-lg">✅</div>
                )
              ) : (
                // Casilla no revelada
                <div className="text-white text-2xl drop-shadow-lg opacity-70">❓</div>
              )}
            </div>
            
            {/* Efecto de brillo para casilla activa */}
            {tile.isActive && (
              <>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                {isAnimating && (
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-300/30 via-orange-300/30 to-red-300/30 animate-pulse" />
                )}
              </>
            )}
          </div>
        ))}
        </div>

        {/* Moving Token - layer superior */}
        {isMovingToken && previousPosition !== undefined && (
          <MovingToken
            fromIndex={previousPosition}
            toIndex={currentPosition}
            isMoving={isMovingToken}
            onAnimationComplete={handleMoveComplete}
            gridCols={gridCols}
          />
        )}
      </div>
      
      {/* Barra de progreso */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${(tiles.filter(t => t.revealed && !t.hasTrap).length / tiles.length) * 100}%`
          }}
        />
      </div>
      
      <p className="text-center text-sm text-white font-semibold">
        {isAnimating 
          ? "🏃 Moving to next tile..." 
          : `Progress: ${tiles.filter(t => t.revealed && !t.hasTrap).length} / ${tiles.length} tiles`
        }
      </p>
    </div>
  );
}