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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const [previousScrollGroup, setPreviousScrollGroup] = useState(0);

  // Calcular qué casillas mostrar (4 a la vez)
  const getVisibleTiles = () => {
    const tilesPerView = 4;
    const startIndex = Math.max(0, Math.floor(currentPosition / tilesPerView) * tilesPerView);
    const endIndex = Math.min(tiles.length, startIndex + tilesPerView);
    
    return {
      visibleTiles: tiles.slice(startIndex, endIndex),
      startIndex,
      endIndex
    };
  };

  // Obtener casillas del grupo anterior para la animación
  const getPreviousGroupTiles = () => {
    const tilesPerView = 4;
    const startIndex = previousScrollGroup * tilesPerView;
    const endIndex = Math.min(tiles.length, startIndex + tilesPerView);
    
    return {
      visibleTiles: tiles.slice(startIndex, endIndex),
      startIndex,
      endIndex
    };
  };

  // Actualizar scroll cuando cambie la posición
  useEffect(() => {
    const tilesPerView = 4;
    const newScrollGroup = Math.floor(currentPosition / tilesPerView);
    
    if (newScrollGroup !== scrollOffset) {
      // Iniciar animación de deslizamiento
      setPreviousScrollGroup(scrollOffset);
      setIsSliding(true);
      
      // Cambiar al nuevo grupo después de iniciar la animación
      setTimeout(() => {
        setScrollOffset(newScrollGroup);
      }, 50);
      
      // Terminar la animación
      setTimeout(() => {
        setIsSliding(false);
      }, 600); // Duración de la animación
    }
  }, [currentPosition, scrollOffset]);

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

    const { visibleTiles, startIndex } = getVisibleTiles();
  const previousGroup = getPreviousGroupTiles();

  // Función para renderizar un grupo de casillas
  const renderTileGroup = (groupTiles: any[], groupStartIndex: number, animationClass: string = '') => (
    <div className={`grid grid-cols-4 gap-0 mb-4 ${animationClass}`}>
      {groupTiles.map((tile, viewIndex) => {
        const actualIndex = groupStartIndex + viewIndex;
        return (
          <div
            key={actualIndex}
            className={cn(
              "aspect-[2/3] flex items-center justify-center text-sm font-bold transition-all duration-500 cursor-pointer relative overflow-hidden",
              // Estados de hover
              tile.isActive && "hover:scale-110"
            )}
            style={{
              backgroundImage: 'url(/assets/images/section01.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
            onClick={() => onTileClick?.(actualIndex)}
          >
            {/* Número de casilla */}
            <span className="absolute top-2 left-2 text-lg text-white font-bold bg-black/50 px-2 py-1 rounded">
              {actualIndex + 1}
            </span>
            
            {/* Contenido principal */}
            <div className="flex flex-col items-center justify-center">
              {tile.isActive ? (
                // Token animado - idle cuando no se está moviendo (prioridad máxima)
                !isMovingToken && <AnimatedToken isMoving={false} className="drop-shadow-lg" />
              ) : tile.revealed ? (
                tile.hasTrap ? (
                  // Icono de trampa
                  <div className="text-red-500 text-5xl drop-shadow-lg">💥</div>
                ) : (
                  // Icono de éxito - solo en casillas completadas donde NO está el token
                  <div className="text-green-400 text-5xl drop-shadow-lg">✅</div>
                )
              ) : (
                // Casilla no revelada
                <div className="text-white text-4xl drop-shadow-lg opacity-70">❓</div>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto p-4 mt-12">
      <div className="relative">
        {/* Indicador de progreso con scroll */}
        <div className="mb-6 text-center">
          <span className="text-sm text-white font-semibold">
            Viewing tiles {startIndex + 1}-{Math.min(startIndex + 4, tiles.length)} of {tiles.length}
          </span>
        </div>
        
        {/* Contenedor con overflow para el efecto de deslizamiento */}
        <div className="relative overflow-hidden mb-6">
          {isSliding ? (
            // Durante la animación, mostrar ambos grupos
            <div className="relative">
              {/* Grupo anterior deslizándose hacia la izquierda */}
              <div className="absolute inset-0 slide-out-left">
                {renderTileGroup(previousGroup.visibleTiles, previousGroup.startIndex)}
              </div>
              {/* Nuevo grupo deslizándose desde la derecha */}
              <div className="slide-in-right">
                {renderTileGroup(visibleTiles, startIndex)}
              </div>
            </div>
          ) : (
            // Vista normal sin animación
            renderTileGroup(visibleTiles, startIndex)
          )}
        </div>

        {/* Moving Token - layer superior */}
        {isMovingToken && previousPosition !== undefined && (() => {
          const tilesPerView = 4;
          const previousViewGroup = Math.floor(previousPosition / tilesPerView);
          const currentViewGroup = Math.floor(currentPosition / tilesPerView);
          
          // Solo mostrar MovingToken si ambas posiciones están en la misma vista
          if (previousViewGroup === currentViewGroup) {
            return (
              <MovingToken
                fromIndex={previousPosition % tilesPerView}
                toIndex={currentPosition % tilesPerView}
                isMoving={isMovingToken}
                onAnimationComplete={handleMoveComplete}
                gridCols={4}
              />
            );
          }
          
          // Si hay cambio de vista, completar la animación inmediatamente
          setTimeout(() => handleMoveComplete(), 100);
          return null;
        })()}
      </div>
      
      {/* Barra de progreso */}
      <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
        <div
          className="bg-primary h-3 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${(tiles.filter(t => t.revealed && !t.hasTrap).length / tiles.length) * 100}%`
          }}
        />
      </div>
      
      <p className="text-center text-sm text-white font-semibold mb-8">
        {isAnimating 
          ? "🏃 Moving to next tile..." 
          : `Progress: ${tiles.filter(t => t.revealed && !t.hasTrap).length} / ${tiles.length} tiles`
        }
      </p>
    </div>
  );
}