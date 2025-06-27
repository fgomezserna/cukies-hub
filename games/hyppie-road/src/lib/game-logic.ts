import { Game, Tile, GameState, GameResult, MULTIPLIERS, TOTAL_TILES, TRAP_PROBABILITY } from '@/types/game';

/**
 * Genera las casillas del juego con trampas aleatorias
 */
export function generateTiles(): Tile[] {
  const tiles: Tile[] = [];
  
  for (let i = 0; i < TOTAL_TILES; i++) {
    // La primera casilla nunca tiene trampa
    const hasTrap = i === 0 ? false : Math.random() < TRAP_PROBABILITY;
    
    tiles.push({
      index: i,
      hasTrap,
      revealed: false,
      isActive: i === 0, // Solo la primera casilla está activa al inicio
    });
  }
  
  return tiles;
}

/**
 * Inicia una nueva partida
 */
export function startGame(betAmount: number): Game {
  const tiles = generateTiles();
  
  return {
    betAmount,
    multiplier: MULTIPLIERS[0],
    position: 0,
    tiles,
    gameState: "playing" as GameState,
    potentialWinning: betAmount * MULTIPLIERS[0],
  };
}

/**
 * Avanza una casilla en el juego
 */
export function advance(game: Game): { game: Game; result: GameResult | null } {
  if (game.gameState !== "playing") {
    throw new Error("El juego no está en estado de juego");
  }
  
  const nextPosition = game.position + 1;
  
  // Verificar si se puede avanzar más
  if (nextPosition >= TOTAL_TILES) {
    // El jugador ha llegado al final
    const finalAmount = game.betAmount * game.multiplier;
    return {
      game: { ...game, gameState: "won" },
      result: {
        success: true,
        finalAmount,
        multiplier: game.multiplier,
        stepsCompleted: game.position,
      },
    };
  }
  
  const nextTile = game.tiles[nextPosition];
  const newMultiplier = MULTIPLIERS[nextPosition];
  
  // Revelar la casilla siguiente
  const updatedTiles = game.tiles.map((tile, index) => ({
    ...tile,
    revealed: index <= nextPosition,
    isActive: index === nextPosition,
  }));
  
  // Verificar si la casilla tiene una trampa
  if (nextTile.hasTrap) {
    // El jugador ha pisado una trampa
    return {
      game: {
        ...game,
        position: nextPosition,
        tiles: updatedTiles,
        gameState: "lost",
      },
      result: {
        success: false,
        finalAmount: 0,
        multiplier: 0,
        stepsCompleted: nextPosition,
        trapPosition: nextPosition,
      },
    };
  }
  
  // El jugador avanza exitosamente
  const updatedGame: Game = {
    ...game,
    position: nextPosition,
    multiplier: newMultiplier,
    tiles: updatedTiles,
    potentialWinning: game.betAmount * newMultiplier,
  };
  
  return { game: updatedGame, result: null };
}

/**
 * El jugador decide retirarse y cobrar sus ganancias
 */
export function cashOut(game: Game): { game: Game; result: GameResult } {
  if (game.gameState !== "playing") {
    throw new Error("El juego no está en estado de juego");
  }
  
  const finalAmount = game.betAmount * game.multiplier;
  
  return {
    game: { ...game, gameState: "won" },
    result: {
      success: true,
      finalAmount,
      multiplier: game.multiplier,
      stepsCompleted: game.position,
    },
  };
}

/**
 * Verifica si el jugador puede avanzar más
 */
export function canAdvance(game: Game): boolean {
  return game.gameState === "playing" && game.position < TOTAL_TILES - 1;
}

/**
 * Verifica si el jugador puede retirarse
 */
export function canCashOut(game: Game): boolean {
  return game.gameState === "playing" && game.position > 0;
}

/**
 * Calcula las estadísticas del juego actual
 */
export function getGameStats(game: Game) {
  const completionPercentage = (game.position / (TOTAL_TILES - 1)) * 100;
  const nextMultiplier = game.position < TOTAL_TILES - 1 ? MULTIPLIERS[game.position + 1] : null;
  const nextPotentialWinning = nextMultiplier ? game.betAmount * nextMultiplier : null;
  
  return {
    completionPercentage,
    nextMultiplier,
    nextPotentialWinning,
    currentStep: game.position + 1,
    totalSteps: TOTAL_TILES,
  };
}