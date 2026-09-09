import { selectLegacyMarketplaceOwner } from '@/lib/legacy-marketplace/live-marketplace';

describe('propietario autoritativo del marketplace Legacy', () => {
  it('conserva al vendedor del anuncio mientras el NFT está en escrow', () => {
    expect(selectLegacyMarketplaceOwner(
      'marketplace-contract',
      'listing-seller',
      true,
    )).toBe('listing-seller');
  });

  it('usa ownerOf cuando el NFT ya no está anunciado', () => {
    expect(selectLegacyMarketplaceOwner(
      'current-token-owner',
      'former-listing-seller',
      false,
    )).toBe('current-token-owner');
  });

  it('falla cerrado si una venta activa no expone vendedor', () => {
    expect(() => selectLegacyMarketplaceOwner(
      'marketplace-contract',
      '',
      true,
    )).toThrow('INVALID_LEGACY_MARKETPLACE_LISTING_OWNER');
  });
});
