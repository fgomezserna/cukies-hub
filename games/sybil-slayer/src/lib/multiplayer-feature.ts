export interface MultiplayerFeatureEnvironment {
  readonly NODE_ENV?: string;
  readonly NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED?: string;
}

export type TreasureHuntMultiplayerEntryState =
  | 'disabled'
  | 'connecting'
  | 'hub'
  | 'ready';

export function resolveTreasureHuntMultiplayerEntryState({
  enabled,
  authorityReady,
  standaloneRuntime,
  hubUrlAvailable,
}: {
  readonly enabled: boolean;
  readonly authorityReady: boolean;
  readonly standaloneRuntime: boolean;
  readonly hubUrlAvailable: boolean;
}): TreasureHuntMultiplayerEntryState {
  if (!enabled) return 'disabled';
  if (authorityReady) return 'ready';
  if (standaloneRuntime && hubUrlAvailable) return 'hub';
  return 'connecting';
}

export function isTreasureHuntMultiplayerEnabled(
  environment: MultiplayerFeatureEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED:
      process.env.NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED,
  },
): boolean {
  return (
    environment.NODE_ENV !== 'production' ||
    environment.NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED === 'true'
  );
}

export function shouldBlockLocalGameControls(
  isMultiplayerMode: boolean,
  hasCanonicalResult: boolean,
  hasNonTerminalMatch = false,
  isJoinPending = false,
): boolean {
  return isJoinPending || hasCanonicalResult || hasNonTerminalMatch || isMultiplayerMode;
}

export function canChangeTreasureHuntGameMode(
  hasCanonicalResult: boolean,
  hasNonTerminalMatch: boolean,
  isJoinPending = false,
): boolean {
  return !isJoinPending && !hasCanonicalResult && !hasNonTerminalMatch;
}

export function isTreasureHuntMatchNonTerminal(
  status: string | null | undefined,
): boolean {
  return Boolean(status && status !== 'finished' && status !== 'abandoned');
}

export function getSuddenDeathObjectiveCopy(
  chasingPlayerId: string | null | undefined,
  localPlayerId: string | null | undefined,
  targetScore: number,
): string {
  return chasingPlayerId && chasingPlayerId === localPlayerId
    ? `Debes superar ${targetScore} pts`
    : `El rival debe superar ${targetScore} pts`;
}
