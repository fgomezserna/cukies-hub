'use client';

import React from 'react';
import { Tile } from '@/types/game';
import { cn } from '@/lib/utils';

interface GameBoardProps {
  tiles: Tile[];
  isAnimating: boolean;
  onTileClick?: (index: number) => void;
}

export function GameBoard({ tiles, isAnimating, onTileClick }: GameBoardProps) {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4">
        {tiles.map((tile, index) => (
          <div
            key={index}
            className={cn(
              "aspect-square rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all duration-300 cursor-pointer relative overflow-hidden",
              // Estados de la casilla
              tile.isActive && "ring-4 ring-primary ring-offset-2 scale-105 shadow-lg",
              tile.revealed && !tile.hasTrap && "bg-green-100 border-green-500 text-green-800",
              tile.revealed && tile.hasTrap && "bg-red-100 border-red-500 text-red-800",
              !tile.revealed && !tile.isActive && "bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200",
              // Animaciones
              isAnimating && "animate-pulse",
              // Estados de hover
              tile.isActive && "hover:scale-110"
            )}
            onClick={() => onTileClick?.(index)}
          >
            {/* Número de casilla */}
            <span className="absolute top-1 left-1 text-xs opacity-60">
              {index + 1}
            </span>
            
            {/* Contenido principal */}
            <div className="flex flex-col items-center justify-center">
              {tile.revealed ? (
                tile.hasTrap ? (
                  // Icono de trampa
                  <div className="text-red-600 text-lg">💥</div>
                ) : (
                  // Icono de éxito
                  <div className="text-green-600 text-lg">✅</div>
                )
              ) : tile.isActive ? (
                // Casilla activa
                <div className="text-primary text-lg">👤</div>
              ) : (
                // Casilla no revelada
                <div className="text-gray-400 text-lg">❓</div>
              )}
            </div>
            
            {/* Efecto de brillo para casilla activa */}
            {tile.isActive && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            )}
          </div>
        ))}
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
      
      <p className="text-center text-sm text-muted-foreground">
        Progreso: {tiles.filter(t => t.revealed && !t.hasTrap).length} / {tiles.length} casillas
      </p>
    </div>
  );
}