'use client';

import React, { useCallback, useEffect } from 'react';
import { useGameState } from '@/hooks/useGameState';
import { getGameStats } from '@/lib/game-logic';
import { BetInput } from './bet-input';
import { GameBoard } from './game-board';
import { GameControls } from './game-controls';
import { GameStats } from './game-stats';
import { GameResultComponent } from './game-result';
import { GameResult } from '@/types/game';

export function HyppieRoadGame() {
  const {
    // State
    gameState,
    betAmount,
    tiles,
    position,
    multiplier,
    potentialWinning,
    isAnimating,
    // Actions
    initGame,
    makeAdvance,
    makeCashOut,
    resetGame,
    setIsAnimating,
    // Computed
    canAdvance,
    canCashOut,
    isGameActive
  } = useGameState();

  const [gameResult, setGameResult] = React.useState<GameResult | null>(null);

  // Manejar inicio del juego
  const handleStartGame = useCallback((amount: number) => {
    try {
      setGameResult(null);
      initGame(amount);
    } catch (error) {
      console.error('Error starting game:', error);
      alert(error instanceof Error ? error.message : 'Error al iniciar el juego');
    }
  }, [initGame]);

  // Manejar avance
  const handleAdvance = useCallback(async () => {
    if (!canAdvance()) return;
    
    setIsAnimating(true);
    
    // Pequeño delay para la animación
    setTimeout(() => {
      try {
        const result = makeAdvance();
        if (result) {
          setGameResult(result);
        }
      } catch (error) {
        console.error('Error advancing:', error);
        alert(error instanceof Error ? error.message : 'Error al avanzar');
      } finally {
        setIsAnimating(false);
      }
    }, 500);
  }, [canAdvance, makeAdvance, setIsAnimating]);

  // Manejar retiro
  const handleCashOut = useCallback(() => {
    if (!canCashOut()) return;
    
    try {
      const result = makeCashOut();
      setGameResult(result);
    } catch (error) {
      console.error('Error cashing out:', error);
      alert(error instanceof Error ? error.message : 'Error al retirar');
    }
  }, [canCashOut, makeCashOut]);

  // Manejar juego nuevo
  const handlePlayAgain = useCallback(() => {
    setGameResult(null);
    resetGame();
  }, [resetGame]);

  // Calcular estadísticas del juego
  const gameStats = React.useMemo(() => {
    if (!isGameActive()) return null;
    return getGameStats({ 
      gameState, 
      betAmount, 
      tiles, 
      position, 
      multiplier, 
      potentialWinning 
    });
  }, [gameState, betAmount, tiles, position, multiplier, potentialWinning, isGameActive]);

  // Si hay un resultado, mostrarlo
  if (gameResult) {
    return (
      <div className="container mx-auto p-4 min-h-screen flex items-center justify-center">
        <GameResultComponent
          result={gameResult}
          betAmount={betAmount}
          onPlayAgain={handlePlayAgain}
        />
      </div>
    );
  }

  // Si el juego no está activo, mostrar entrada de apuesta
  if (!isGameActive()) {
    return (
      <div className="container mx-auto p-4 min-h-screen flex items-center justify-center">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-gray-900">🛣️ Hyppie Road</h1>
            <p className="text-lg text-muted-foreground">
              Navega por el camino crypto, evita las trampas y multiplica tus recompensas
            </p>
          </div>
          <BetInput
            onStartGame={handleStartGame}
            disabled={isAnimating}
          />
        </div>
      </div>
    );
  }

  // Juego activo
  return (
    <div className="container mx-auto p-4 min-h-screen">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">🛣️ Hyppie Road</h1>
          <p className="text-muted-foreground">Apuesta: ${betAmount.toFixed(2)}</p>
        </div>

        {/* Estadísticas del juego */}
        {gameStats && (
          <GameStats
            betAmount={betAmount}
            currentStep={gameStats.currentStep}
            totalSteps={gameStats.totalSteps}
            completionPercentage={gameStats.completionPercentage}
            currentMultiplier={multiplier}
            potentialWinning={potentialWinning}
          />
        )}

        {/* Tablero del juego */}
        <GameBoard
          tiles={tiles}
          isAnimating={isAnimating}
        />

        {/* Controles del juego */}
        {gameStats && (
          <GameControls
            currentMultiplier={multiplier}
            potentialWinning={potentialWinning}
            nextMultiplier={gameStats.nextMultiplier}
            canAdvance={canAdvance()}
            canCashOut={canCashOut()}
            onAdvance={handleAdvance}
            onCashOut={handleCashOut}
            isAnimating={isAnimating}
          />
        )}
      </div>
    </div>
  );
}