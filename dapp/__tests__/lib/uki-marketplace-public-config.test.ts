import { resolveUkiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

const marketplace = '0x1111111111111111111111111111111111111111';
const collection = '0x2222222222222222222222222222222222222222';
const uki = '0x3333333333333333333333333333333333333333';
const router = '0x4444444444444444444444444444444444444444';
const wbnb = '0x5555555555555555555555555555555555555555';
const usdt = '0x6666666666666666666666666666666666666666';
const asm = '0x7777777777777777777777777777777777777777';

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

  it('habilita el checkout solo con tokens, router y rutas completas de Stage', () => {
    expect(resolveUkiMarketplacePublicConfig({
      appEnvironment: 'staging',
      chainId: '97',
      marketplaceAddress: marketplace,
      collectionAddress: collection,
      ukiTokenAddress: uki,
      routerAddress: router,
      wrappedNativeAddress: wbnb,
      usdtTokenAddress: usdt,
      bnbPaymentPath: `${wbnb},${asm},${uki}`,
      usdtPaymentPath: `${usdt},${asm},${uki}`,
    })).toMatchObject({
      ready: true,
      checkoutReady: true,
      ukiTokenAddress: uki,
      routerAddress: router,
      wrappedNativeAddress: wbnb,
      usdtTokenAddress: usdt,
      bnbPaymentPath: [wbnb, asm, uki],
      usdtPaymentPath: [usdt, asm, uki],
      checkoutIssues: [],
    });
  });

  it('mantiene consulta y venta disponibles pero bloquea compras con rutas incoherentes', () => {
    const result = resolveUkiMarketplacePublicConfig({
      appEnvironment: 'staging',
      chainId: '97',
      marketplaceAddress: marketplace,
      collectionAddress: collection,
      ukiTokenAddress: uki,
      routerAddress: router,
      wrappedNativeAddress: wbnb,
      usdtTokenAddress: usdt,
      bnbPaymentPath: `${usdt},${uki}`,
      usdtPaymentPath: `${usdt},${uki}`,
    });
    expect(result.ready).toBe(true);
    expect(result.checkoutReady).toBe(false);
    expect(result.checkoutIssues.join(' ')).toContain('BNB → UKI');
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
