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
  hasFallenInTrap: false,
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
      hasFallenInTrap: false,
    });
  },
  
  makeAdvance: () => {
    const state = get();
    if (!state.canAdvance()) {
      return null;
    }
    
    const { game: updatedGame, result } = advance(state);
    
    // Si hay trampa, marcar hasFallenInTrap y NO actualizar el estado del juego aún
    if (result && !result.success && result.trapPosition !== undefined) {
      console.log('🕳️ TRAMPA DETECTADA - Desactivando Cash Out');
      // Solo actualizar la posición y tiles para mostrar efectos visuales
      // Y marcar que cayó en trampa para desactivar cash out
      set({
        ...state,
        position: updatedGame.position,
        tiles: updatedGame.tiles,
        hasFallenInTrap: true,
        // gameState sigue siendo "playing" para mantener la vista del juego
      });
    } else {
      // Para victorias o avances normales, actualizar todo
      set({
        ...updatedGame,
        isAdvanceDisabled: !canAdvance(updatedGame),
        isCashOutDisabled: !canCashOut(updatedGame),
        hasFallenInTrap: false,
      });
    }
    
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
      hasFallenInTrap: false,
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
    if (state.hasFallenInTrap) {
      return false;
    }
    return canCashOut(state);
  },
  
  isGameActive: () => {
    const state = get();
    return state.gameState === "playing";
  },
}));