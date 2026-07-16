import type { GameStatus } from '../types/game';

interface DirectionalTouchControlState {
  inputAvailable: boolean;
  gameStatus: GameStatus;
  hasBlockingOverlay: boolean;
}

/**
 * Directional input belongs to the active runtime, never to menu navigation.
 * Multiplayer authority may lock pause/reset UI while directional input remains valid.
 */
export const shouldRenderDirectionalTouchControls = ({
  inputAvailable,
  gameStatus,
  hasBlockingOverlay,
}: DirectionalTouchControlState): boolean =>
  inputAvailable && gameStatus === 'playing' && !hasBlockingOverlay;
