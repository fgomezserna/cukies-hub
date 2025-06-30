'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameResult } from '@/types/game';
import { Trophy, AlertTriangle, RotateCcw, DollarSign } from 'lucide-react';

interface GameResultProps {
  result: GameResult;
  betAmount: number;
  onPlayAgain: () => void;
}

export function GameResultComponent({ result, betAmount, onPlayAgain }: GameResultProps) {
  const isWin = result.success;
  const profit = result.finalAmount - betAmount;

  return (
    <Card className={`w-full max-w-md mx-auto ${isWin ? 'border-green-500' : 'border-red-500'}`}>
      <CardHeader className="text-center">
        <div className={`mx-auto mb-4 p-4 rounded-full ${isWin ? 'bg-green-100' : 'bg-red-100'}`}>
          {isWin ? (
            <Trophy className="h-8 w-8 text-green-600" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-red-600" />
          )}
        </div>
        <CardTitle className={`text-2xl ${isWin ? 'text-green-600' : 'text-red-600'}`}>
          {isWin ? 'Congratulations!' : 'Oh no!'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            {isWin 
              ? 'You have successfully completed the game' 
              : `You stepped on a trap at tile ${result.trapPosition! + 1}`
            }
          </p>
          
          <div className="space-y-3 py-4">
            {/* Información de la partida */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Initial bet:</span>
              <span className="font-mono">${betAmount.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Final multiplier:</span>
              <span className="font-mono font-bold text-primary">
                {result.multiplier.toFixed(1)}x
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Tiles completed:</span>
              <span className="font-mono">{result.stepsCompleted}</span>
            </div>
            
            <div className="border-t pt-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Final result:</span>
                <div className={`flex items-center gap-1 ${isWin ? 'text-green-600' : 'text-red-600'}`}>
                  <DollarSign className="h-5 w-5" />
                  <span className="font-mono">{result.finalAmount.toFixed(2)}</span>
                </div>
              </div>
              
              {isWin && profit > 0 && (
                <div className="flex justify-between items-center text-sm text-green-600 mt-1">
                  <span>Profit:</span>
                  <span className="font-mono">+${profit.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <Button onClick={onPlayAgain} className="w-full" size="lg">
          <RotateCcw className="h-5 w-5 mr-2" />
          Play Again
        </Button>
      </CardContent>
    </Card>
  );
}