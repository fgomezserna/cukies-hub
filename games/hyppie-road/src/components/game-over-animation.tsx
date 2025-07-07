'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { GameResult } from '@/types/game';

interface GameOverAnimationProps {
  result: GameResult;
  betAmount: number;
  onReturnToMenu: () => void;
}

export function GameOverAnimation({ result, betAmount, onReturnToMenu }: GameOverAnimationProps) {
  const [showButton, setShowButton] = useState(false);
  const [showMainContent, setShowMainContent] = useState(true); // Inmediato
  const [showHippie, setShowHippie] = useState(false);

  useEffect(() => {
    // Mostrar hippie después de 200ms
    const hippieTimer = setTimeout(() => {
      setShowHippie(true);
    }, 200);

    // Mostrar botón después de 800ms
    const buttonTimer = setTimeout(() => {
      setShowButton(true);
    }, 800);

    return () => {
      clearTimeout(hippieTimer);
      clearTimeout(buttonTimer);
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/20"
    >
      {/* Contenedor principal con caja pixel art */}
      {showMainContent && (
        <div className="relative z-10 max-w-2xl mx-auto px-4">
          
          {/* Efecto de caída del hippie - relativo a la caja */}
          {showHippie && (
            <div 
              className="absolute top-0 -right-24 z-20 pointer-events-none"
            >
              <div 
                className="hippie-falling"
                style={{
                  width: '280px',
                  height: '280px',
                  backgroundImage: 'url(/assets/images/hippie_fall.png)',
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  imageRendering: 'pixelated'
                }}
              />
            </div>
          )}
        {/* Caja principal usando asset PNG */}
        <div 
          className="relative px-16 py-12 w-full max-w-xl min-h-[400px] flex flex-col items-center justify-between"
          style={{
            backgroundImage: 'url(/assets/images/box_game_over.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        >
          {/* Título Game Over */}
          <div className="text-center space-y-6 pt-8">
            <h1 
              className="text-6xl md:text-8xl font-bold text-red-400 pixellari-title"
              style={{ 
                textShadow: '4px 4px 0px rgba(139, 0, 0, 0.8)'
              }}
            >
              GAME OVER
            </h1>

            {/* Mensaje de pérdida */}
            <div className="pixellari-title text-xl md:text-2xl text-white space-y-2">
              <p>You stepped on a trap!</p>
              <p 
                className="text-red-400 text-2xl md:text-3xl font-bold"
                style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
              >
                LOST: ${betAmount.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Botón OK dentro de la caja */}
          {showButton && (
            <div className="pb-8">
              <Button 
                onClick={onReturnToMenu}
                className="game-over-button pixellari-title text-2xl px-12 py-4 border-none text-white font-bold hover:scale-105 transition-transform"
                style={{
                  minWidth: '250px',
                  height: '70px',
                  textShadow: '2px 2px 0px rgba(0,0,0,0.8)'
                }}
              >
                OK
              </Button>
            </div>
          )}

        </div>
        </div>
      )}
    </div>
  );
} 