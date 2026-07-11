import { createDeterministicRandom } from '../../../games/sybil-slayer/src/lib/random';
import { isTreasureHuntMultiplayerEnabled } from '../../../games/sybil-slayer/src/lib/multiplayer-feature';

describe('Treasure Hunt deterministic streams', () => {
  it('repeats each named gameplay stream for the same shared seed', () => {
    const first = createDeterministicRandom('shared-seed');
    const second = createDeterministicRandom('shared-seed');
    const streams = [
      'positive-assets', // item selection
      'grid-cell', // treasure/item placement grid
      'rune-selection',
      'ray-orientation', // hazard direction
    ];

    for (const stream of streams) {
      expect([first.next(stream), first.next(stream), first.next(stream)]).toEqual([
        second.next(stream),
        second.next(stream),
        second.next(stream),
      ]);
    }
  });

  it('keeps named streams independent from consumption in another stream', () => {
    const baseline = createDeterministicRandom('shared-seed');
    const noisy = createDeterministicRandom('shared-seed');
    const expected = [baseline.next('rune-selection'), baseline.next('rune-selection')];

    noisy.next('ray-orientation');
    noisy.next('ray-orientation');
    expect([noisy.next('rune-selection'), noisy.next('rune-selection')]).toEqual(expected);
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
