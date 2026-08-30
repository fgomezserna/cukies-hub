import { resolveUkiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

const marketplace = '0x1111111111111111111111111111111111111111';
const collection = '0x2222222222222222222222222222222222222222';

describe('configuración pública del marketplace UKI', () => {
  it('acepta únicamente una identidad completa de Stage en chain 97', () => {
    expect(resolveUkiMarketplacePublicConfig({
      appEnvironment: 'staging',
      chainId: '97',
      marketplaceAddress: marketplace,
      collectionAddress: collection,
    })).toMatchObject({
      ready: true,
      chainId: 97,
      marketplaceAddress: marketplace,
      collectionAddresses: [collection],
      explorerBaseUrl: 'https://testnet.bscscan.com',
      issues: [],
    });
  });

  it.each([
    [{ appEnvironment: 'staging', chainId: '56' }, 'chainId 97'],
    [{ marketplaceAddress: '' }, 'address pública'],
    [{ collectionAddress: '' }, 'colecciones UKI'],
    [{ appEnvironment: '' }, 'entorno público'],
  ])('falla cerrado si la identidad pública es incoherente', (override, issue) => {
    const result = resolveUkiMarketplacePublicConfig({
      appEnvironment: 'staging',
      chainId: '97',
      marketplaceAddress: marketplace,
      collectionAddress: collection,
      ...override,
    });
    expect(result.ready).toBe(false);
    expect(result.issues.join(' ')).toContain(issue);
  });
});
