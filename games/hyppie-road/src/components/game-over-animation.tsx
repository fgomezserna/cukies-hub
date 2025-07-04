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
  const [showDetails, setShowDetails] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [showMainContent, setShowMainContent] = useState(true); // Inmediato
  const [showHippieFall, setShowHippieFall] = useState(false);

  useEffect(() => {
    // Mostrar detalles después de 1 segundo
    const detailsTimer = setTimeout(() => {
      setShowDetails(true);
    }, 1000);

    // Mostrar hippie cayendo después de 1.5 segundos
    const hippieTimer = setTimeout(() => {
      setShowHippieFall(true);
    }, 1500);

    // Mostrar botón después de 2 segundos
    const buttonTimer = setTimeout(() => {
      setShowButton(true);
    }, 2000);

    return () => {
      clearTimeout(detailsTimer);
      clearTimeout(hippieTimer);
      clearTimeout(buttonTimer);
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        backgroundImage: 'url(/assets/images/background-playing.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Efecto de caída del hippie */}
      {showHippieFall && (
        <div 
          className="absolute inset-0 z-20 pointer-events-none"
          style={{ overflow: 'hidden' }}
        >
          <div 
            className="absolute left-1/2 transform -translate-x-1/2 hippie-falling"
            style={{
              width: '300px',
              height: '300px',
              backgroundImage: 'url(/assets/images/hippie_fall.png)',
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              zIndex: 20
            }}
          />
        </div>
      )}

      {/* Contenedor principal con caja pixel art */}
      {showMainContent && (
        <div className="relative z-10 max-w-2xl mx-auto px-4">
        {/* Caja principal usando asset PNG */}
        <div 
          className="relative px-16 py-12 w-full max-w-xl min-h-[320px] flex flex-col items-center justify-center"
          style={{
            backgroundImage: 'url(/assets/images/box_game_over.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        >
          {/* Título Game Over con efecto mejorado */}
          <div className="text-center space-y-6 animate-fade-in">
            <h1 
              className="text-6xl md:text-8xl font-bold text-red-400 pixellari-title screen-shake"
              style={{ 
                textShadow: '4px 4px 0px rgba(139, 0, 0, 0.8), 8px 8px 0px rgba(0, 0, 0, 0.6)',
                filter: 'drop-shadow(0 0 10px rgba(255, 0, 0, 0.5))'
              }}
            >
              GAME OVER
            </h1>



            {/* Mensaje de trampa */}
            <div className="pixellari-title text-xl md:text-2xl text-white space-y-2">
              <p className="drop-shadow-lg">You stepped on a trap!</p>
              <p 
                className="text-red-300 text-lg md:text-xl"
                style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
              >
                TILE #{result.trapPosition! + 1} WAS DANGEROUS
              </p>
            </div>
          </div>


        </div>

        {/* Detalles de la partida - aparecen después */}
        {showDetails && (
          <div 
            className="mt-6 animate-fade-in"
            style={{ animationDelay: '0.5s' }}
          >
            <div 
              className="p-6 space-y-3 border-4 border-red-800"
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                borderStyle: 'solid',
                borderImage: 'linear-gradient(45deg, #8B0000, #DC143C) 1',
                boxShadow: 'inset 0 0 20px rgba(255, 0, 0, 0.3)'
              }}
            >
              <div className="pixellari-title text-white space-y-2 text-lg">
                <div className="flex justify-between items-center">
                  <span>BET AMOUNT:</span>
                  <span className="text-yellow-400">${betAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>TILES REACHED:</span>
                  <span className="text-blue-400">{result.stepsCompleted}</span>
                </div>
                <div className="border-t-2 border-red-800 pt-2">
                  <div className="flex justify-between items-center text-red-400 font-bold text-xl">
                    <span>LOST:</span>
                    <span>-${betAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botón OK */}
        {showButton && (
          <div className="mt-6 text-center animate-fade-in">
            <Button 
              onClick={onReturnToMenu}
              className="pixellari-title text-xl px-8 py-3 bg-red-600 hover:bg-red-700 border-2 border-red-400"
              style={{
                textShadow: '2px 2px 0px rgba(0,0,0,0.8)',
                boxShadow: '4px 4px 0px rgba(0,0,0,0.3)',
                imageRendering: 'pixelated'
              }}
            >
              OK
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  );
} 