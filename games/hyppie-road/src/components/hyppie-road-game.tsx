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
  const [previousPosition, setPreviousPosition] = React.useState<number | undefined>(undefined);

  // Manejar inicio del juego
  const handleStartGame = useCallback((amount: number) => {
    try {
      setGameResult(null);
      initGame(amount);
    } catch (error) {
      console.error('Error starting game:', error);
      alert(error instanceof Error ? error.message : 'Error starting the game');
    }
  }, [initGame]);

  // Manejar avance
  const handleAdvance = useCallback(async () => {
    if (!canAdvance()) return;
    
    // Guardar posición actual antes del avance
    setPreviousPosition(position);
    setIsAnimating(true);
    
    // Hacer el avance inmediatamente para actualizar el estado
    try {
      const result = makeAdvance();
      if (result) {
        setGameResult(result);
        setIsAnimating(false);
      }
    } catch (error) {
      console.error('Error advancing:', error);
      alert(error instanceof Error ? error.message : 'Error advancing');
      setIsAnimating(false);
    }
  }, [canAdvance, makeAdvance, setIsAnimating, position]);

  // Callback para cuando termina la animación de movimiento
  const handleMoveAnimationComplete = useCallback(() => {
    setIsAnimating(false);
    setPreviousPosition(undefined);
  }, []);

  // Manejar retiro
  const handleCashOut = useCallback(() => {
    if (!canCashOut()) return;
    
    try {
      const result = makeCashOut();
      setGameResult(result);
    } catch (error) {
      console.error('Error cashing out:', error);
      alert(error instanceof Error ? error.message : 'Error cashing out');
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
            <h1 className="text-6xl font-bold text-white pixellari-title">Hyppie Road</h1>
            <p className="text-lg text-muted-foreground">
              Navigate the crypto road, avoid traps and multiply your rewards
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
    <div className="w-full max-w-[98vw] mx-auto p-2 min-h-screen overflow-hidden">
      <div className="space-y-2">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white pixellari-title">Hyppie Road</h1>
          <p className="text-muted-foreground">Bet: ${betAmount.toFixed(2)}</p>
        </div>

        {/* Tablero del juego */}
        <GameBoard
          tiles={tiles}
          isAnimating={isAnimating}
          currentPosition={position}
          previousPosition={previousPosition}
          onMoveAnimationComplete={handleMoveAnimationComplete}
        />

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