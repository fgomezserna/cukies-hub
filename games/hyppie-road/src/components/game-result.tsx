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
  const profit = result.finalAmount - betAmount;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/20">
      {/* Contenedor principal con caja pixel art */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        {/* Caja principal usando asset PNG */}
        <div 
          className="relative px-16 py-12 w-full max-w-xl min-h-[400px] flex flex-col items-center justify-between"
          style={{
            backgroundImage: 'url(/assets/images/box_446x362.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        >
          {/* Título de victoria */}
          <div className="text-center space-y-6 pt-8">
            <h1 
              className="text-6xl md:text-8xl font-bold text-yellow-400 pixellari-title"
              style={{ 
                textShadow: '4px 4px 0px rgba(184, 134, 11, 0.8)'
              }}
            >
              VICTORY!
            </h1>

            {/* Icono de victoria */}
            <div className="text-6xl">🏆</div>

            {/* Mensaje de ganancia */}
            <div className="pixellari-title text-xl md:text-2xl text-white space-y-2">
              <p>Congratulations!</p>
              <p 
                className="text-green-400 text-2xl md:text-3xl font-bold"
                style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
              >
                WON: +${profit.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Botón PLAY AGAIN dentro de la caja */}
          <div className="pb-8">
            <Button 
              onClick={onPlayAgain}
              className="pixellari-title text-xl px-8 py-3 bg-green-600 hover:bg-green-700 border-2 border-green-400"
            >
              🎮 PLAY AGAIN 🎮
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}