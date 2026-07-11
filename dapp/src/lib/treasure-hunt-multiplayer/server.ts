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

export function getTreasureHuntMultiplayerRuntime() {
  defaultRuntime ??= createTreasureHuntMultiplayerRuntime();
  return defaultRuntime;
}

export * from './index';
export * from './mongo-repository';
export * from './service';
