'use client';

import React, { useCallback, useEffect } from 'react';
import { useChildConnection } from '@hyppie/game-bridge';
import { useGameState } from '@/hooks/useGameState';
import { getGameStats } from '@/lib/game-logic';
import { BetInput } from './bet-input';
import { GameBoard } from './game-board';
import { GameControls } from './game-controls';
import { GameStats } from './game-stats';
import { GameResultComponent } from './game-result';
import { GameOverAnimation } from './game-over-animation';
import { AudioControls } from './audio-controls';
import { GameResult } from '@/types/game';
import { useAudio } from '@/hooks/useAudio';

export function HyppieRoadGame() {
  const { isAuthenticated, user } = useChildConnection();
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
  const [showGameOverAnimation, setShowGameOverAnimation] = React.useState(false);
  const { playSound, playBackgroundMusic, stopMusic, playMusic } = useAudio();

  // Asegurar música de fondo cuando el juego esté activo
  useEffect(() => {
    if (isGameActive()) {
      console.log('🎵 Juego activo - Asegurando música de fondo');
      playBackgroundMusic();
    }
  }, [isGameActive, playBackgroundMusic]);

  // Log para verificar la recepción de datos de autenticación
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('Hyppie Road received auth state from Dapp:', { isAuthenticated, user });
    }
  }, [isAuthenticated, user]);

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
        // Si es una derrota por trampa, reproducir sonido de caída
        if (!result.success && result.trapPosition !== undefined) {
          console.log('🕳️ Token cayó en trampa! Reproduciendo sonido fall_hole...');
          try {
            playSound('fall_hole');
            console.log('✅ Sonido fall_hole reproducido exitosamente');
          } catch (error) {
            console.error('❌ Error reproduciendo sonido fall_hole:', error);
          }
          
          // Detener música de fondo y cambiar a Game Over después de un delay
          setTimeout(() => {
            console.log('🎵 Deteniendo música de fondo y cambiando a Game Over');
            stopMusic();
            playMusic('gameover_road');
          }, 1000);
          
          // NO actualizar gameResult, solo mostrar efectos visuales
          // Después de ver los efectos, establecer resultado y volver al menú
          setTimeout(() => {
            setGameResult(result);
          }, 2000); // 2 segundos para ver el efecto visual
        } else {
          // Victoria o retiro exitoso - detener música de fondo
          console.log('🎵 Juego terminado exitosamente - Deteniendo música');
          stopMusic();
          setGameResult(result);
        }
        
        setIsAnimating(false);
      }
    } catch (error) {
      console.error('Error advancing:', error);
      alert(error instanceof Error ? error.message : 'Error advancing');
      setIsAnimating(false);
    }
  }, [canAdvance, makeAdvance, setIsAnimating, position, playSound, stopMusic, playMusic]);

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
    console.log('🎮 NUEVO JUEGO - Deteniendo toda la música...');
    
    // FUERZA DETENER TODA LA MÚSICA directamente desde el DOM
    try {
      const allAudioElements = document.querySelectorAll('audio');
      let stoppedCount = 0;
      
      allAudioElements.forEach((audio, index) => {
        console.log(`🎵 NUEVO JUEGO Audio ${index}: src=${audio.src}, paused=${audio.paused}`);
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
          stoppedCount++;
          console.log(`🔇 ✅ NUEVO JUEGO Audio detenido: ${index}`);
        }
      });
      
      console.log(`🔇 ✅ NUEVO JUEGO Detenidos ${stoppedCount} audios antes de empezar`);
    } catch (error) {
      console.error('❌ NUEVO JUEGO Error deteniendo audios:', error);
    }
    
    // También usar el método del hook por si acaso
    try {
      stopMusic();
    } catch (error) {
      console.error('❌ NUEVO JUEGO Error con stopMusic():', error);
    }
    
    setGameResult(null);
    setShowGameOverAnimation(false);
    resetGame();
  }, [resetGame, stopMusic]);

  // Manejar retorno al menú desde Game Over
  const handleReturnToMenu = useCallback(() => {
    console.log('🏠 RETORNO AL MENÚ - Deteniendo toda la música...');
    
    // FUERZA DETENER TODA LA MÚSICA directamente desde el DOM
    try {
      const allAudioElements = document.querySelectorAll('audio');
      let stoppedCount = 0;
      
      allAudioElements.forEach((audio, index) => {
        console.log(`🎵 MENÚ Audio ${index}: src=${audio.src}, paused=${audio.paused}`);
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
          stoppedCount++;
          console.log(`🔇 ✅ MENÚ Audio detenido: ${index}`);
        }
      });
      
      console.log(`🔇 ✅ MENÚ Detenidos ${stoppedCount} audios antes de ir al menú`);
    } catch (error) {
      console.error('❌ MENÚ Error deteniendo audios:', error);
    }
    
    // También usar el método del hook por si acaso
    try {
      stopMusic();
    } catch (error) {
      console.error('❌ MENÚ Error con stopMusic():', error);
    }
    
    setShowGameOverAnimation(false);
    setGameResult(null);
    resetGame();
  }, [resetGame, stopMusic]);

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



  // Si hay un resultado, mostrar el componente apropiado
  if (gameResult) {
    // Para game over (derrota), mostrar GameOverAnimation
    if (!gameResult.success && gameResult.trapPosition !== undefined) {
      return (
        <div className="relative">
          <GameOverAnimation
            result={gameResult}
            betAmount={betAmount}
            onReturnToMenu={handleReturnToMenu}
          />
          {/* Controles de audio - siempre visibles */}
          <AudioControls />
        </div>
      );
    }
    
    // Para victoria o retiro exitoso, mostrar GameResultComponent
    return (
      <div className="container mx-auto p-4 min-h-screen flex items-center justify-center relative">
        <GameResultComponent
          result={gameResult}
          betAmount={betAmount}
          onPlayAgain={handlePlayAgain}
        />
        {/* Controles de audio - siempre visibles */}
        <AudioControls />
      </div>
    );
  }

  // Si el juego no está activo, mostrar entrada de apuesta
  if (!isGameActive()) {
    return (
      <div className="container mx-auto p-4 min-h-screen flex items-center justify-center relative">
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
        {/* Controles de audio - siempre visibles */}
        <AudioControls />
      </div>
    );
  }

  // Juego activo
  return (
    <div className="w-full max-w-[98vw] mx-auto p-2 min-h-screen relative" style={{ marginTop: '150px' }}>
      {/* Sky independiente - exactamente igual que el contenedor de tiles */}
      <div className="absolute w-full max-w-4xl mx-auto p-2 pointer-events-none" style={{ top: '-200px', left: '0', right: '0', zIndex: -1 }}>
        <div 
          style={{
            backgroundImage: 'url(/assets/images/BAck_ground_sky.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            height: '400px'
          }}
        />
      </div>

      {/* Título por delante del sky */}
      <div className="absolute w-full text-center" style={{ top: '-120px', left: '0', right: '0', zIndex: 10 }}>
        <h1 className="text-5xl font-bold text-white pixellari-title">Hyppie Road</h1>
      </div>
      
      <div className="space-y-6">

        {/* Tablero del juego - SIEMPRE visible */}
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

        {/* Controles de audio - siempre visibles */}
        <AudioControls />

      </div>


    </div>
  );
}