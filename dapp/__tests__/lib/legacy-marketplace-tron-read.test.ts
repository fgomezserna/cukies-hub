import { getLegacyTronReadWeb } from '@/lib/legacy-marketplace/tron';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';

describe('Legacy TRON read provider', () => {
  it('uses the configured read RPC and does not replace the wallet provider', () => {
    const walletWeb = {
      fullNode: { host: 'https://api.trongrid.io' },
      defaultAddress: { base58: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8' },
      contract: jest.fn(),
    };
    Object.defineProperty(window, 'tronWeb', {
      configurable: true,
      value: walletWeb,
    });

    const readWeb = getLegacyTronReadWeb();

    expect(readWeb).not.toBe(walletWeb);
    expect(readWeb?.fullNode?.host).toBe(legacyMarketplaceContracts.tron.readRpcUrl);
    expect((window as Window & { tronWeb?: unknown }).tronWeb).toBe(walletWeb);
  });
});
