import { useRef, useCallback } from 'react';

interface GameTimeState {
  gameStartTime: number | null;
  totalPausedTime: number;
  lastPauseStartTime: number | null;
  isPaused: boolean;
}

export function useGameTime() {
  const timeStateRef = useRef<GameTimeState>({
    gameStartTime: null,
    totalPausedTime: 0,
    lastPauseStartTime: null,
    isPaused: false
  });

  // Obtener el tiempo actual del juego (pausable)
  const getGameTime = useCallback((): number => {
    const realNow = Date.now();
    const state = timeStateRef.current;
    
    if (!state.gameStartTime) {
      return realNow; // Si no hay juego iniciado, devolver tiempo real
    }
    
    let pausedTime = state.totalPausedTime;
    
    // Si estamos pausados actualmente, añadir el tiempo pausado actual
    if (state.isPaused && state.lastPauseStartTime) {
      pausedTime += realNow - state.lastPauseStartTime;
    }
    
    // Tiempo del juego = tiempo real - tiempo total pausado
    return realNow - pausedTime;
  }, []);

  // Obtener tiempo transcurrido desde el inicio del juego (en milisegundos)
  const getElapsedTime = useCallback((): number => {
    const state = timeStateRef.current;
    if (!state.gameStartTime) {
      return 0;
    }
    
    return getGameTime() - state.gameStartTime;
  }, [getGameTime]);

  // Obtener tiempo transcurrido en segundos
  const getElapsedSeconds = useCallback((): number => {
    return getElapsedTime() / 1000;
  }, [getElapsedTime]);

  // Iniciar el juego
  const startGame = useCallback(() => {
    const now = Date.now();
    timeStateRef.current = {
      gameStartTime: now,
      totalPausedTime: 0,
      lastPauseStartTime: null,
      isPaused: false
    };
    console.log('[GAME_TIME] Juego iniciado en:', now);
  }, []);

  // Pausar el juego
  const pauseGame = useCallback(() => {
    const now = Date.now();
    const state = timeStateRef.current;
    
    if (!state.isPaused) {
      state.isPaused = true;
      state.lastPauseStartTime = now;
      console.log('[GAME_TIME] Juego pausado en:', now);
    }
  }, []);

  // Reanudar el juego
  const resumeGame = useCallback(() => {
    const now = Date.now();
    const state = timeStateRef.current;
    
    if (state.isPaused && state.lastPauseStartTime) {
      const pauseDuration = now - state.lastPauseStartTime;
      state.totalPausedTime += pauseDuration;
      state.isPaused = false;
      state.lastPauseStartTime = null;
      console.log('[GAME_TIME] Juego reanudado. Duración de pausa:', pauseDuration, 'ms. Total pausado:', state.totalPausedTime, 'ms');
    }
  }, []);

  // Resetear el tiempo
  const resetTime = useCallback(() => {
    timeStateRef.current = {
      gameStartTime: null,
      totalPausedTime: 0,
      lastPauseStartTime: null,
      isPaused: false
    };
    console.log('[GAME_TIME] Tiempo reseteado');
  }, []);

  // Obtener timestamp ajustado (para usar en lugar de Date.now())
  const getAdjustedTimestamp = useCallback((originalTimestamp: number): number => {
    const state = timeStateRef.current;
    if (!state.gameStartTime) {
      return originalTimestamp;
    }
    
    // Ajustar timestamp restando el tiempo pausado
    return originalTimestamp - state.totalPausedTime;
  }, []);

  return {
    getGameTime,
    getElapsedTime,
    getElapsedSeconds,
    startGame,
    pauseGame,
    resumeGame,
    resetTime,
    getAdjustedTimestamp,
    isPaused: () => timeStateRef.current.isPaused,
    getGameStartTime: () => timeStateRef.current.gameStartTime,
    getTotalPausedTime: () => timeStateRef.current.totalPausedTime
  };
} 