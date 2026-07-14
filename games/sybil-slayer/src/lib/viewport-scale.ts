export interface ViewportMetricSources {
  innerWidth: number;
  innerHeight: number;
  rootWidth?: number;
  rootHeight?: number;
  visualWidth?: number;
  visualHeight?: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

const smallestPositive = (values: Array<number | undefined>): number => {
  const validValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );

  return validValues.length > 0 ? Math.min(...validValues) : 1;
};

/**
 * Returns the visible layout box available to the game.
 *
 * Mobile browsers may expose the top-level visualViewport from inside an iframe.
 * Clamping it against the iframe layout dimensions prevents the fixed 11:8 stage
 * from being scaled to a larger, clipped box.
 */
export const resolveGameViewportSize = (sources: ViewportMetricSources): ViewportSize => ({
  width: smallestPositive([
    sources.innerWidth,
    sources.rootWidth,
    sources.visualWidth,
  ]),
  height: smallestPositive([
    sources.innerHeight,
    sources.rootHeight,
    sources.visualHeight,
  ]),
});

export const calculateContainScale = (
  viewport: ViewportSize,
  baseWidth: number,
  baseHeight: number,
): number => Math.min(viewport.width / baseWidth, viewport.height / baseHeight);
