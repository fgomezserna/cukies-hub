import {
  calculateContainScale,
  resolveGameViewportSize,
} from '../../../games/sybil-slayer/src/lib/viewport-scale';

describe('Treasure Hunt viewport scaling', () => {
  it('uses the iframe box when mobile visualViewport reports the larger parent viewport', () => {
    const viewport = resolveGameViewportSize({
      innerWidth: 1630,
      innerHeight: 752,
      rootWidth: 1630,
      rootHeight: 752,
      visualWidth: 1698,
      visualHeight: 866,
    });

    expect(viewport).toEqual({ width: 1630, height: 752 });

    const scale = calculateContainScale(viewport, 1100, 800);
    expect(scale).toBeCloseTo(0.94, 5);
    expect(800 * scale).toBeCloseTo(752, 5);
  });

  it('honours a smaller top-level visual viewport', () => {
    const viewport = resolveGameViewportSize({
      innerWidth: 844,
      innerHeight: 390,
      rootWidth: 844,
      rootHeight: 390,
      visualWidth: 844,
      visualHeight: 364,
    });

    expect(viewport).toEqual({ width: 844, height: 364 });
    expect(calculateContainScale(viewport, 1100, 800)).toBeCloseTo(0.455, 5);
  });
});
