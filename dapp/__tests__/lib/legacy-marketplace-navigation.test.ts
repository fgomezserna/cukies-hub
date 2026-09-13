import { legacyMarketplaceRoutes } from '@/lib/legacy-marketplace/config';

describe('legacy marketplace navigation', () => {
  it('does not publish bridge routes in the navigable route catalogue', () => {
    expect(
      legacyMarketplaceRoutes.some(({ path }) => /bridge/i.test(path)),
    ).toBe(false);
  });
});
