import {
  GAMEPLAY_RANDOM_STREAMS,
  randomManager,
  type GameplayRandomStream,
} from '../../../games/sybil-slayer/src/lib/random';
import { isTreasureHuntMultiplayerEnabled } from '../../../games/sybil-slayer/src/lib/multiplayer-feature';

interface RuntimeFactories {
  createEnergyCollectible(id: string, width: number, height: number): unknown;
  createTreasureCollectible(
    id: string,
    width: number,
    height: number,
    gameTime?: number,
    treasureNumber?: number,
  ): unknown;
  createRuneCollectible(
    id: string,
    width: number,
    height: number,
    runeType?: unknown,
    gameTime?: number,
  ): unknown;
  createObstacle(id: string, type: 'fee', width: number, height: number): unknown;
}

// Runtime import is intentional: dapp's tsconfig owns a different `@/` alias,
// while Jest executes these factories in the Sybil Slayer module graph.
const {
  createEnergyCollectible,
  createObstacle,
  createRuneCollectible,
  createTreasureCollectible,
} = jest.requireActual<RuntimeFactories>('../../../games/sybil-slayer/src/lib/utils');

describe('Treasure Hunt deterministic streams', () => {
  const seed = 'shared-match-seed';
  const gameTime = 12_345;
  const width = 960;
  const height = 540;
  const factories: Record<GameplayRandomStream, () => unknown> = {
    [GAMEPLAY_RANDOM_STREAMS.ITEMS]: () =>
      createEnergyCollectible('item', width, height),
    [GAMEPLAY_RANDOM_STREAMS.CHESTS]: () =>
      createTreasureCollectible('chest', width, height, gameTime, 2),
    [GAMEPLAY_RANDOM_STREAMS.RUNES]: () =>
      createRuneCollectible('rune', width, height, undefined, gameTime),
    [GAMEPLAY_RANDOM_STREAMS.HAZARDS]: () =>
      createObstacle('hazard', 'fee', width, height),
  };

  const spawnRuntimeFrame = () => ({
    item: factories.items(),
    chest: factories.chests(),
    rune: factories.runes(),
    hazard: factories.hazards(),
  });

  afterEach(() => {
    jest.restoreAllMocks();
    randomManager.clear();
  });

  it('wires the real runtime factories to the four canonical streams', () => {
    randomManager.setSeed(seed);
    const randomSpy = jest.spyOn(randomManager, 'random');

    for (const stream of Object.values(GAMEPLAY_RANDOM_STREAMS)) {
      randomSpy.mockClear();
      factories[stream]();
      expect(new Set(randomSpy.mock.calls.map(([streamName]) => streamName))).toEqual(
        new Set([stream]),
      );
    }
  });

  it('replays real item, chest, rune and hazard output from the shared seed', () => {
    randomManager.setSeed(seed);
    const firstFrame = spawnRuntimeFrame();

    randomManager.setSeed(seed);
    const replayedFrame = spawnRuntimeFrame();

    expect(replayedFrame).toEqual(firstFrame);
  });

  it('keeps every runtime domain stable when the other domains consume retries', () => {
    for (const targetStream of Object.values(GAMEPLAY_RANDOM_STREAMS)) {
      randomManager.setSeed(seed);
      const expected = factories[targetStream]();

      randomManager.setSeed(seed);
      for (const noisyStream of Object.values(GAMEPLAY_RANDOM_STREAMS)) {
        if (noisyStream === targetStream) continue;
        factories[noisyStream]();
        factories[noisyStream]();
      }

      expect(factories[targetStream]()).toEqual(expected);
    }
  });
});

describe('Treasure Hunt multiplayer feature gate', () => {
  it('is enabled outside production and requires an explicit production flag', () => {
    expect(isTreasureHuntMultiplayerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isTreasureHuntMultiplayerEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(isTreasureHuntMultiplayerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isTreasureHuntMultiplayerEnabled({
        NODE_ENV: 'production',
        NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED: 'true',
      }),
    ).toBe(true);
  });
});
