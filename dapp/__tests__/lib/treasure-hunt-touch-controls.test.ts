import { shouldRenderDirectionalTouchControls } from '../../../games/sybil-slayer/src/lib/touch-controls';

describe('Treasure Hunt directional touch controls', () => {
  it('does not mount gameplay controls over menu navigation', () => {
    expect(
      shouldRenderDirectionalTouchControls({
        inputAvailable: true,
        gameStatus: 'idle',
        hasBlockingOverlay: false,
      }),
    ).toBe(false);
  });

  it('keeps directional touch input active during a playing runtime', () => {
    expect(
      shouldRenderDirectionalTouchControls({
        inputAvailable: true,
        gameStatus: 'playing',
        hasBlockingOverlay: false,
      }),
    ).toBe(true);
  });

  it('removes gameplay controls while a blocking overlay is visible', () => {
    expect(
      shouldRenderDirectionalTouchControls({
        inputAvailable: true,
        gameStatus: 'playing',
        hasBlockingOverlay: true,
      }),
    ).toBe(false);
  });
});
