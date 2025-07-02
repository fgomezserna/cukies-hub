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
              "aspect-[3/4] flex items-center justify-center text-sm font-bold transition-all duration-500 cursor-pointer relative overflow-hidden"
            )}
            style={{
              backgroundImage: `url(/assets/images/${tile.isActive && tile.hasTrap ? 'section02.png' : 'section01.png'})`,
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
                tile.hasTrap ? (
                  // Token cayendo en trampa - usar imagen fall.png SIN animaciones
                  <div 
                    className="w-32 h-32 bg-center bg-no-repeat drop-shadow-lg"
                    style={{
                      backgroundImage: 'url(/assets/images/fall.png)',
                      backgroundSize: 'contain',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat'
                    }}
                  />
                ) : (
                  // Token animado normal - solo cuando NO hay trampa
                  !isMovingToken && <AnimatedToken isMoving={false} className="drop-shadow-lg" />
                )
              ) : tile.revealed ? (
                tile.hasTrap ? (
                  // Casilla revelada con trampa (ya pasada)
                  <div className="relative">
                    <div className="text-red-400 text-4xl drop-shadow-lg opacity-60">💥</div>
                    <div className="absolute inset-0 bg-red-800 rounded-full opacity-20"></div>
                  </div>
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
    <div className="w-full max-w-4xl mx-auto p-2 overflow-hidden">
      <div className="relative overflow-hidden">
        {/* Indicador de progreso con scroll */}
        <div className="mb-2 text-center">
          <span className="text-xs text-white font-semibold">
            Viewing tiles {startIndex + 1}-{Math.min(startIndex + 4, tiles.length)} of {tiles.length}
          </span>
        </div>
        
        {/* Contenedor con overflow para el efecto de deslizamiento */}
        <div className="relative overflow-hidden mb-2">
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
      

    </div>
  );
}