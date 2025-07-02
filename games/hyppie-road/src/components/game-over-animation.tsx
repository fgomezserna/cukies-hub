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
  useEffect(() => {
    // Auto-redirect después de 2.5 segundos total
    const redirectTimer = setTimeout(() => {
      onReturnToMenu();
    }, 2500);
    return () => clearTimeout(redirectTimer);
  }, [onReturnToMenu]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      {/* Mensaje de Game Over Simple */}
      <div className="text-center space-y-6 animate-fade-in">
        <div className="space-y-4">
          <h1 className="text-8xl font-bold text-red-500 pixellari-title">
            GAME OVER
          </h1>
          <div className="text-2xl text-white space-y-2">
            <p>💥 You stepped on a trap!</p>
            <p className="text-xl text-red-400">
              Tile #{result.trapPosition! + 1} was dangerous
            </p>
          </div>
        </div>
        
        <div className="bg-black/60 rounded-lg p-6 space-y-3 max-w-md mx-auto border border-red-500/30">
          <div className="text-white space-y-2">
            <div className="flex justify-between">
              <span>Bet Amount:</span>
              <span className="font-mono">${betAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tiles Reached:</span>
              <span className="font-mono">{result.stepsCompleted}</span>
            </div>
            <div className="flex justify-between text-red-400 font-bold text-lg border-t border-red-500/30 pt-2">
              <span>Lost:</span>
              <span className="font-mono">-${betAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="text-lg text-gray-400 animate-pulse">
          Returning to menu...
        </div>
      </div>
    </div>
  );
} 