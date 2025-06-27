import { create } from 'zustand';
import { Game, GameResult, UIState, DEFAULT_GAME_CONFIG } from '@/types/game';
import { startGame, advance, cashOut, canAdvance, canCashOut } from '@/lib/game-logic';

interface GameStore extends Game, UIState {
  // Actions
  initGame: (betAmount: number) => void;
  makeAdvance: () => GameResult | null;
  makeCashOut: () => GameResult;
  resetGame: () => void;
  setIsAnimating: (animating: boolean) => void;
  
  // Computed values
  canAdvance: () => boolean;
  canCashOut: () => boolean;
  isGameActive: () => boolean;
}

const initialState: Game & UIState = {
  betAmount: 0,
  multiplier: 1.0,
  position: 0,
  tiles: [],
  gameState: "waiting",
  potentialWinning: 0,
  isAdvanceDisabled: false,
  isCashOutDisabled: true,
  showConfirmation: false,
  isAnimating: false,
};

export const useGameState = create<GameStore>((set, get) => ({
  ...initialState,
  
  initGame: (betAmount: number) => {
    if (betAmount < DEFAULT_GAME_CONFIG.minBet || betAmount > DEFAULT_GAME_CONFIG.maxBet) {
      throw new Error(`La apuesta debe estar entre $${DEFAULT_GAME_CONFIG.minBet} y $${DEFAULT_GAME_CONFIG.maxBet}`);
    }
    
    const newGame = startGame(betAmount);
    set({
      ...newGame,
      isAdvanceDisabled: false,
      isCashOutDisabled: true,
      showConfirmation: false,
      isAnimating: false,
    });
  },
  
  makeAdvance: () => {
    const state = get();
    if (!state.canAdvance()) {
      return null;
    }
    
    const { game: updatedGame, result } = advance(state);
    set({
      ...updatedGame,
      isAdvanceDisabled: !canAdvance(updatedGame),
      isCashOutDisabled: !canCashOut(updatedGame),
    });
    
    return result;
  },
  
  makeCashOut: () => {
    const state = get();
    if (!state.canCashOut()) {
      throw new Error("No se puede retirar en este momento");
    }
    
    const { game: updatedGame, result } = cashOut(state);
    set({
      ...updatedGame,
      isAdvanceDisabled: true,
      isCashOutDisabled: true,
    });
    
    return result;
  },
  
  resetGame: () => {
    set(initialState);
  },
  
  setIsAnimating: (animating: boolean) => {
    set({ isAnimating: animating });
  },
  
  canAdvance: () => {
    const state = get();
    return canAdvance(state);
  },
  
  canCashOut: () => {
    const state = get();
    return canCashOut(state);
  },
  
  isGameActive: () => {
    const state = get();
    return state.gameState === "playing";
  },
}));