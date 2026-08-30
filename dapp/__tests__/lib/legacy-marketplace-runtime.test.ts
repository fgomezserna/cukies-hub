import {
  buildLegacyMarketplaceRuntime,
  getLegacyPointExplorerUrl,
} from '@/lib/legacy-marketplace/runtime';

describe('legacy marketplace runtime safety', () => {
  it('emula Stage sin montar lecturas, enlaces ni acciones de mainnet', () => {
    const runtime = buildLegacyMarketplaceRuntime({
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: 'staging',
    });

    expect(runtime).toMatchObject({
      appEnv: 'staging',
      legacyMainnetEnabled: false,
      bscChainId: null,
      bscExplorerBaseUrl: null,
      tronExplorerBaseUrl: null,
    });
    expect(runtime.reason).toContain('Stage/Testnet');
  });

  it('solo mantiene el marketplace legacy en el entorno de produccion', () => {
    const runtime = buildLegacyMarketplaceRuntime({
      APP_ENV: 'production',
      NEXT_PUBLIC_APP_ENV: 'production',
    });

    expect(runtime).toEqual({
      appEnv: 'production',
      legacyMainnetEnabled: true,
      bscChainId: 56,
      bscExplorerBaseUrl: 'https://bscscan.com',
      tronExplorerBaseUrl: 'https://tronscan.org',
      reason: null,
    });
  });

  it('falla cerrado si el entorno falta o no esta reconocido', () => {
    expect(buildLegacyMarketplaceRuntime({})).toMatchObject({
      appEnv: 'unknown',
      legacyMainnetEnabled: false,
      bscChainId: null,
    });
    expect(buildLegacyMarketplaceRuntime({ APP_ENV: 'preview' })).toMatchObject({
      appEnv: 'unknown',
      legacyMainnetEnabled: false,
      bscChainId: null,
    });
  });

  it('prioriza la identidad publica y falla cerrado ante valores contradictorios', () => {
    const runtime = buildLegacyMarketplaceRuntime({
      APP_ENV: 'production',
      NEXT_PUBLIC_APP_ENV: 'staging',
    });

    expect(runtime).toMatchObject({
      appEnv: 'staging',
      legacyMainnetEnabled: false,
    });
  });

  it('usa BscScan Testnet para eventos 97 y no filtra enlaces mainnet en Stage', () => {
    const staging = buildLegacyMarketplaceRuntime({ APP_ENV: 'staging' });

    expect(getLegacyPointExplorerUrl(staging, 'BSC', 97, '0xtest')).toBe(
      'https://testnet.bscscan.com/tx/0xtest',
    );
    expect(getLegacyPointExplorerUrl(staging, 'BSC', 56, '0xmain')).toBeNull();
    expect(getLegacyPointExplorerUrl(staging, 'BSC', null, '0xlegacy')).toBeNull();
    expect(getLegacyPointExplorerUrl(staging, 'TRON', null, 'tron-main')).toBeNull();
  });

  it('conserva los exploradores legacy exclusivamente en produccion', () => {
    const production = buildLegacyMarketplaceRuntime({ APP_ENV: 'production' });

    expect(getLegacyPointExplorerUrl(production, 'BSC', 56, '0xbsc')).toBe(
      'https://bscscan.com/tx/0xbsc',
    );
    expect(getLegacyPointExplorerUrl(production, 'TRON', null, 'tron')).toBe(
      'https://tronscan.org/#/transaction/tron',
    );
  });
});
