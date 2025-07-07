'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { GameResult } from '@/types/game';

interface GameResultProps {
  result: GameResult;
  betAmount: number;
  onPlayAgain: () => void;
}

export function GameResultComponent({ result, betAmount, onPlayAgain }: GameResultProps) {
  const isWin = result.success;
  const profit = result.finalAmount - betAmount;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">

      {/* Contenedor principal con caja pixel art */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        {/* Caja principal usando asset PNG */}
        <div 
          className="relative p-8 min-h-[500px] flex flex-col items-center justify-center"
          style={{
            backgroundImage: 'url(/assets/images/box_446x362.png)',
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        >
          {/* Título de victoria */}
          <div className="text-center space-y-6 animate-fade-in">
            <div className="relative">
              {/* Sombra del texto */}
              <h1 
                className="absolute top-2 left-2 text-5xl md:text-7xl font-bold text-black pixellari-title opacity-50"
                style={{ 
                  textShadow: '4px 4px 0px rgba(0,0,0,0.8)',
                  filter: 'blur(1px)'
                }}
              >
                VICTORY!
              </h1>
              {/* Texto principal */}
              <h1 
                className="relative text-5xl md:text-7xl font-bold text-yellow-400 pixellari-title"
                style={{ 
                  textShadow: '4px 4px 0px rgba(184, 134, 11, 0.8), 8px 8px 0px rgba(0, 0, 0, 0.6)'
                }}
              >
                VICTORY!
              </h1>
            </div>

            {/* Icono de victoria */}
            <div className="text-8xl multiplier-expand">🏆</div>

            {/* Mensaje de éxito */}
            <div className="pixellari-title text-xl md:text-2xl text-white space-y-2">
              <p className="drop-shadow-lg">Congratulations!</p>
              <p 
                className="text-green-300 text-lg md:text-xl"
                style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
              >
                YOU COMPLETED ALL TILES SAFELY!
              </p>
            </div>
          </div>

          {/* Detalles de la partida ganadora */}
          <div className="absolute bottom-8 left-8 right-8">
            <div 
              className="p-6 space-y-4 border-4 border-yellow-600"
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                borderStyle: 'solid',
                borderImage: 'linear-gradient(45deg, #DAA520, #FFD700) 1',
                boxShadow: 'inset 0 0 20px rgba(255, 215, 0, 0.3)'
              }}
            >
              <div className="pixellari-title text-white space-y-3 text-lg">
            <div className="flex justify-between items-center">
                  <span>INITIAL BET:</span>
                  <span className="text-yellow-400">${betAmount.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center">
                  <span>MULTIPLIER:</span>
                  <span className="text-orange-400 font-bold text-xl">
                {result.multiplier.toFixed(1)}x
              </span>
            </div>
            
            <div className="flex justify-between items-center">
                  <span>TILES COMPLETED:</span>
                  <span className="text-blue-400">{result.stepsCompleted}</span>
            </div>
            
                <div className="border-t-2 border-yellow-600 pt-3">
                  <div className="flex justify-between items-center text-green-400 font-bold text-2xl">
                    <span>WON:</span>
                    <span>+${profit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-yellow-400 font-bold text-xl mt-1">
                    <span>TOTAL:</span>
                    <span>${result.finalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              {/* Botón de jugar de nuevo */}
              <div className="pt-4 text-center">
                <Button 
                  onClick={onPlayAgain} 
                  className="pixellari-title text-lg px-8 py-3 bg-green-600 hover:bg-green-700 border-2 border-green-400"
                >
                  🎮 PLAY AGAIN 🎮
                </Button>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}