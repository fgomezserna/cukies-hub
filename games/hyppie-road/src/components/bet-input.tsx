'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_GAME_CONFIG } from '@/types/game';
import { useAudio } from '@/hooks/useAudio';

interface BetInputProps {
  onStartGame: (betAmount: number) => void;
  disabled?: boolean;
}

export function BetInput({ onStartGame, disabled = false }: BetInputProps) {
  const [betAmount, setBetAmount] = useState<string>('10');
  const [error, setError] = useState<string>('');
  const { playSound } = useAudio();

  const handleStartGame = () => {
    const amount = parseFloat(betAmount);
    
    console.log('🎮 handleStartGame called, disabled:', disabled, 'amount:', amount);
    
    // Validations
    if (isNaN(amount)) {
      setError('Please enter a valid number');
      return;
    }
    
    if (amount < DEFAULT_GAME_CONFIG.minBet) {
      setError(`Minimum bet is $${DEFAULT_GAME_CONFIG.minBet}`);
      return;
    }
    
    if (amount > DEFAULT_GAME_CONFIG.maxBet) {
      setError(`Maximum bet is $${DEFAULT_GAME_CONFIG.maxBet}`);
      return;
    }
    
    setError('');
    
    // Reproducir sonido SIEMPRE, antes de cualquier otra acción
    console.log('🔊 Intentando reproducir sonido del botón Start Game...');
    try {
      playSound('button_click');
      console.log('✅ Sonido reproducido exitosamente');
    } catch (error) {
      console.error('❌ Error reproduciendo sonido:', error);
    }
    
    // Llamar a onStartGame después de un pequeño delay para asegurar que el sonido se reproduce
    setTimeout(() => {
      onStartGame(amount);
    }, 50);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBetAmount(e.target.value);
    setError(''); // Clear error when changing value
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleStartGame();
    }
  };

  const handleQuickBetClick = (amount: number) => {
    // Reproducir sonido solo si no está disabled
    if (!disabled) {
      playSound('button_click');
    }
    setBetAmount(amount.toString());
  };

  // Quick bet buttons
  const quickBets = [5, 10, 25, 50, 100];

    return (
    <div className="w-full space-y-4">
      <div 
        className="w-full max-w-[600px] mx-auto relative"
        style={{ 
          backgroundImage: 'url(/assets/images/box_446x362.png)',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          height: '400px',
          aspectRatio: '600/400'
        }}
      >
        <div className="absolute inset-0 px-16 py-8 flex flex-col justify-center">
        <div className="space-y-4">
          <div>
            <h3 className="text-4xl font-semibold leading-none tracking-tight text-center mb-6 mt-2 pixellari-title text-white" style={{ marginTop: '5px' }}>
              Start New Game
            </h3>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="bet-amount" className="text-sm font-medium">
              Bet Amount ($)
            </label>
            <Input
              id="bet-amount"
              type="number"
              value={betAmount}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={`Between $${DEFAULT_GAME_CONFIG.minBet} and $${DEFAULT_GAME_CONFIG.maxBet}`}
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

          {/* Quick bet buttons */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Quick bets:</p>
            <div className="flex flex-wrap gap-3">
              {quickBets.map((amount) => (
                <Button
                  key={amount}
                  onClick={() => handleQuickBetClick(amount)}
                  disabled={disabled}
                  disableSound={true} // Desactivamos el sonido automático porque lo manejamos manualmente
                  className="flex-1 min-w-0 text-black font-bold bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-100 hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-md"
                  style={{
                    height: '55px',
                    fontSize: '16px'
                  }}
                >
                  ${amount}
                </Button>
              ))}
            </div>
          </div>

          <div
            onClick={disabled || !betAmount || !!error ? undefined : handleStartGame}
            onMouseDown={() => {
              // Reproducir sonido también en mouseDown para mayor garantía
              if (!disabled && betAmount && !error) {
                console.log('🔊 Sonido desde mouseDown');
                playSound('button_click');
              }
            }}
            className={`w-full max-w-[316px] mx-auto cursor-pointer transition-transform duration-200 ${
              disabled || !betAmount || !!error 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:scale-105 active:scale-95'
            }`}
            style={{ 
              backgroundImage: 'url(/assets/images/button_44x316.png)',
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              height: '44px',
              aspectRatio: '316/44'
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <span className={`font-bold text-white drop-shadow-lg text-sm ${disabled ? 'text-gray-300' : ''}`}>
                {disabled ? 'Loading...' : 'Start Game'}
              </span>
            </div>
          </div>

          </div>
        </div>
      </div>

      {/* Min/Max bet info outside the box */}
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold text-white">Minimum bet: ${DEFAULT_GAME_CONFIG.minBet}</p>
        <p className="text-lg font-semibold text-white">Maximum bet: ${DEFAULT_GAME_CONFIG.maxBet}</p>
      </div>
    </div>
  );
}