import {
  buildCanonicalCukieReadFilter,
  isCanonicalCukieReadDocument,
} from '@/lib/cukies-data/canonical-projection';

describe('lectura canónica del inventario Cukies', () => {
  it('excluye el snapshot metadata `_id=tokenId` y conserva la proyección por cadena', () => {
    expect(buildCanonicalCukieReadFilter()).toEqual({
      $nor: [{
        metadataSource: 'legacy.cukies',
        legacyProjectionKind: { $ne: 'canonical' },
      }],
    });
    expect(isCanonicalCukieReadDocument({
      metadataSource: 'legacy.cukies',
    })).toBe(false);
    expect(isCanonicalCukieReadDocument({
      metadataSource: 'legacy.cukies',
      legacyProjectionKind: 'canonical',
    })).toBe(true);
  });

  it('no oculta los documentos V2 que no proceden del snapshot legacy', () => {
    expect(isCanonicalCukieReadDocument({})).toBe(true);
    expect(isCanonicalCukieReadDocument({ metadataSource: 'onchain' })).toBe(true);
  });
});
