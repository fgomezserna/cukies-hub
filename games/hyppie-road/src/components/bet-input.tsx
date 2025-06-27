'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_GAME_CONFIG } from '@/types/game';

interface BetInputProps {
  onStartGame: (betAmount: number) => void;
  disabled?: boolean;
}

export function BetInput({ onStartGame, disabled = false }: BetInputProps) {
  const [betAmount, setBetAmount] = useState<string>('10');
  const [error, setError] = useState<string>('');

  const handleStartGame = () => {
    const amount = parseFloat(betAmount);
    
    // Validaciones
    if (isNaN(amount)) {
      setError('Por favor ingresa un número válido');
      return;
    }
    
    if (amount < DEFAULT_GAME_CONFIG.minBet) {
      setError(`La apuesta mínima es $${DEFAULT_GAME_CONFIG.minBet}`);
      return;
    }
    
    if (amount > DEFAULT_GAME_CONFIG.maxBet) {
      setError(`La apuesta máxima es $${DEFAULT_GAME_CONFIG.maxBet}`);
      return;
    }
    
    setError('');
    onStartGame(amount);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBetAmount(e.target.value);
    setError(''); // Limpiar error al cambiar valor
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleStartGame();
    }
  };

  // Botones de apuesta rápida
  const quickBets = [5, 10, 25, 50, 100];

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Iniciar Nueva Partida</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="bet-amount" className="text-sm font-medium">
            Cantidad a apostar ($)
          </label>
          <Input
            id="bet-amount"
            type="number"
            value={betAmount}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={`Entre $${DEFAULT_GAME_CONFIG.minBet} y $${DEFAULT_GAME_CONFIG.maxBet}`}
            min={DEFAULT_GAME_CONFIG.minBet}
            max={DEFAULT_GAME_CONFIG.maxBet}
            step="0.01"
            disabled={disabled}
            className={error ? 'border-red-500' : ''}
          />
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Botones de apuesta rápida */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Apuestas rápidas:</p>
          <div className="flex flex-wrap gap-2">
            {quickBets.map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                onClick={() => setBetAmount(amount.toString())}
                disabled={disabled}
                className="flex-1 min-w-0"
              >
                ${amount}
              </Button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleStartGame}
          disabled={disabled || !betAmount || !!error}
          className="w-full"
          size="lg"
        >
          {disabled ? 'Cargando...' : 'Comenzar Juego'}
        </Button>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Apuesta mínima: ${DEFAULT_GAME_CONFIG.minBet}</p>
          <p>Apuesta máxima: ${DEFAULT_GAME_CONFIG.maxBet}</p>
        </div>
      </CardContent>
    </Card>
  );
}