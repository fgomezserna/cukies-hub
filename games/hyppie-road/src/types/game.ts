export type GameState = "waiting" | "playing" | "won" | "lost";

export interface Tile {
  index: number;
  hasTrap: boolean;
  revealed: boolean;
  isActive?: boolean; // Casilla actual del jugador
}

export interface Game {
  betAmount: number;
  multiplier: number;
  position: number;
  tiles: Tile[];
  gameState: GameState;
  potentialWinning: number; // betAmount * multiplier
}

// Multiplicadores predefinidos escalonados
export const MULTIPLIERS = [
  1.0,   // Posición 0 (inicio)
  1.2,   // Posición 1
  1.5,   // Posición 2
  2.0,   // Posición 3
  2.5,   // Posición 4
  3.2,   // Posición 5
  4.0,   // Posición 6
  5.0,   // Posición 7
  6.5,   // Posición 8
  8.0,   // Posición 9
  10.0,  // Posición 10
  12.5,  // Posición 11
  15.0,  // Posición 12
  20.0,  // Posición 13
  25.0,  // Posición 14
  30.0   // Posición 15 (máximo)
];

export const TOTAL_TILES = MULTIPLIERS.length;
export const TRAP_PROBABILITY = 0.3; // 30% de probabilidad de trampa por casilla

// Configuración del juego
export interface GameConfig {
  totalTiles: number;
  trapProbability: number;
  minBet: number;
  maxBet: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  totalTiles: TOTAL_TILES,
  trapProbability: TRAP_PROBABILITY,
  minBet: 1,
  maxBet: 1000,
};

// Resultado del juego
export interface GameResult {
  success: boolean;
  finalAmount: number;
  multiplier: number;
  stepsCompleted: number;
  trapPosition?: number; // Posición donde se activó la trampa (si aplica)
}

// Estado de la UI
export interface UIState {
  isAdvanceDisabled: boolean;
  isCashOutDisabled: boolean;
  showConfirmation: boolean;
  isAnimating: boolean;
}