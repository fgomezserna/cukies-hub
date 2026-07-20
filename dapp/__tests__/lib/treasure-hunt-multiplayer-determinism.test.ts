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
  generateId(prefix?: string): string;
  getRandomObstacleType(level?: number): 'fee' | 'bug' | 'hacker';
}

// Runtime import is intentional: dapp's tsconfig owns a different `@/` alias,
// while Jest executes these factories in the Sybil Slayer module graph.
const {
  createEnergyCollectible,
  createObstacle,
  createRuneCollectible,
  createTreasureCollectible,
  generateId,
  getRandomObstacleType,
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

  it('resets gameplay object ids when the match seed is applied again', () => {
    randomManager.setSeed(seed);
    expect(generateId('hazard')).toBe('hazard-1');
    expect(generateId('hazard')).toBe('hazard-2');

    randomManager.setSeed(seed);
    expect(generateId('hazard')).toBe('hazard-1');
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

  it('keeps the next real item spawn indexed when item actions consume variable draws', () => {
    randomManager.setSeed(seed);
    createEnergyCollectible('item-0', width, height);
    const expectedNextSpawn = createEnergyCollectible('item-1', width, height);

    randomManager.setSeed(seed);
    createEnergyCollectible('item-0', width, height);
    for (let draw = 0; draw < 50; draw += 1) {
      randomManager.random(GAMEPLAY_RANDOM_STREAMS.ITEMS);
    }
    const actualNextSpawn = createEnergyCollectible('item-1', width, height);

    expect(actualNextSpawn).toEqual(expectedNextSpawn);
  });

  it('keeps the next real spawn stable when placement retries vary for the prior entity', () => {
    randomManager.setSeed(seed);
    createEnergyCollectible('retry-item-0', width, height);
    const expectedNextSpawn = createEnergyCollectible('retry-item-1', width, height);

    randomManager.setSeed(seed);
    for (let retry = 0; retry < 20; retry += 1) {
      createEnergyCollectible('retry-item-0', width, height);
    }
    const actualNextSpawn = createEnergyCollectible('retry-item-1', width, height);

    expect(actualNextSpawn).toEqual(expectedNextSpawn);
  });

  it('keeps an indexed logical decision stable after raw draws in the same stream', () => {
    randomManager.setSeed(seed);
    const expected = randomManager.indexedInt(
      25_000,
      35_001,
      GAMEPLAY_RANDOM_STREAMS.ITEMS,
      'heart-interval',
    );

    randomManager.setSeed(seed);
    for (let draw = 0; draw < 50; draw += 1) {
      randomManager.random(GAMEPLAY_RANDOM_STREAMS.ITEMS);
    }
    const actual = randomManager.indexedInt(
      25_000,
      35_001,
      GAMEPLAY_RANDOM_STREAMS.ITEMS,
      'heart-interval',
    );

    expect(actual).toBe(expected);
  });

  it('keeps the real obstacle-type decision stable after same-stream noise', () => {
    randomManager.setSeed(0);
    const expected = getRandomObstacleType(3);

    randomManager.setSeed(0);
    randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS);
    const actual = getRandomObstacleType(3);

    expect(actual).toBe(expected);
  });

  it('does not let extra decisions from one item subsystem shift another subsystem', () => {
    randomManager.setSeed(seed);
    const expectedHeart = randomManager.indexedInt(
      25_000,
      35_001,
      GAMEPLAY_RANDOM_STREAMS.ITEMS,
      'heart-interval',
    );

    randomManager.setSeed(seed);
    for (let index = 0; index < 10; index += 1) {
      randomManager.indexedInt(
        15_000,
        25_001,
        GAMEPLAY_RANDOM_STREAMS.ITEMS,
        'mega-node-interval',
      );
    }
    const actualHeart = randomManager.indexedInt(
      25_000,
      35_001,
      GAMEPLAY_RANDOM_STREAMS.ITEMS,
      'heart-interval',
    );

    expect(actualHeart).toBe(expectedHeart);
  });

  it('does not let extra events from one entity shift another entity', () => {
    randomManager.setSeed(seed);
    const expectedSecondFee = randomManager.indexedRandom(
      GAMEPLAY_RANDOM_STREAMS.HAZARDS,
      'fee-bounce-variation:fee-b',
    );

    randomManager.setSeed(seed);
    for (let bounce = 0; bounce < 20; bounce += 1) {
      randomManager.indexedRandom(
        GAMEPLAY_RANDOM_STREAMS.HAZARDS,
        'fee-bounce-variation:fee-a',
      );
    }
    const actualSecondFee = randomManager.indexedRandom(
      GAMEPLAY_RANDOM_STREAMS.HAZARDS,
      'fee-bounce-variation:fee-b',
    );

    expect(actualSecondFee).toBe(expectedSecondFee);
  });

  it('keeps the nth indexed event stable when the prior event consumes variable draws', () => {
    randomManager.setSeed(seed);
    randomManager.withIndexedEvent(GAMEPLAY_RANDOM_STREAMS.HAZARDS, 'fee-speed', () => {
      randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS);
    });
    const expected = randomManager.withIndexedEvent(
      GAMEPLAY_RANDOM_STREAMS.HAZARDS,
      'fee-speed',
      () => randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS),
    );

    randomManager.setSeed(seed);
    randomManager.withIndexedEvent(GAMEPLAY_RANDOM_STREAMS.HAZARDS, 'fee-speed', () => {
      for (let draw = 0; draw < 50; draw += 1) {
        randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS);
      }
    });
    const actual = randomManager.withIndexedEvent(
      GAMEPLAY_RANDOM_STREAMS.HAZARDS,
      'fee-speed',
      () => randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS),
    );

    expect(actual).toBe(expected);
  });

  it('uses deterministic Fisher-Yates shuffles isolated from raw item draws', () => {
    const values = ['a', 'b', 'c', 'd', 'e'];
    randomManager.setSeed(seed);
    const expected = randomManager.indexedShuffle(
      values,
      GAMEPLAY_RANDOM_STREAMS.ITEMS,
      'vault-enemy-selection',
    );

    randomManager.setSeed(seed);
    for (let draw = 0; draw < 50; draw += 1) {
      randomManager.random(GAMEPLAY_RANDOM_STREAMS.ITEMS);
    }
    const actual = randomManager.indexedShuffle(
      values,
      GAMEPLAY_RANDOM_STREAMS.ITEMS,
      'vault-enemy-selection',
    );

    expect(actual).toEqual(expected);
    expect(actual).toEqual(expect.arrayContaining(values));
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
