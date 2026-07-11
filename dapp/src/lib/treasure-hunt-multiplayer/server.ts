import 'server-only';

import { MongoMatchRepository, type MongoMatchRepositoryOptions } from './mongo-repository';
import type { MatchRepository } from './repository';
import {
  TreasureHuntMultiplayerService,
  type MultiplayerServiceOptions,
} from './service';

export interface TreasureHuntMultiplayerRuntimeOptions {
  readonly repository?: MatchRepository;
  readonly mongoRepositoryOptions?: MongoMatchRepositoryOptions;
  readonly serviceOptions?: MultiplayerServiceOptions;
}

export function createTreasureHuntMultiplayerRuntime(
  options: TreasureHuntMultiplayerRuntimeOptions = {},
) {
  const repository =
    options.repository ?? new MongoMatchRepository(options.mongoRepositoryOptions);
  return new TreasureHuntMultiplayerService(repository, options.serviceOptions);
}

let defaultRuntime: TreasureHuntMultiplayerService | undefined;
let defaultSweepTimer: ReturnType<typeof setInterval> | undefined;
let defaultSweepInFlight = false;

function ensureDefaultSweeper(service: TreasureHuntMultiplayerService) {
  if (process.env.NODE_ENV === 'test' || defaultSweepTimer) {
    return;
  }

  defaultSweepTimer = setInterval(() => {
    if (defaultSweepInFlight) {
      return;
    }
    defaultSweepInFlight = true;
    void service
      .sweepDue()
      .catch(() => {
        console.error('Treasure Hunt multiplayer reconciliation sweep failed');
      })
      .finally(() => {
        defaultSweepInFlight = false;
      });
  }, 1_000);
  defaultSweepTimer.unref?.();
}

export function getTreasureHuntMultiplayerRuntime() {
  defaultRuntime ??= createTreasureHuntMultiplayerRuntime();
  ensureDefaultSweeper(defaultRuntime);
  return defaultRuntime;
}

export * from './index';
export * from './mongo-repository';
export * from './service';
