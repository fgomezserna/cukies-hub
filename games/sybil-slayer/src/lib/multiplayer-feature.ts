export interface MultiplayerFeatureEnvironment {
  readonly NODE_ENV?: string;
  readonly NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED?: string;
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
