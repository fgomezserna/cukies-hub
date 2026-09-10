import {
  TRON_MAINNET_CHAIN_ID,
  TRON_NILE_CHAIN_ID,
  TRON_SHASTA_CHAIN_ID,
  chainIdFromTronHost,
  resolveTronAddress,
  resolveTronChainId,
  resolveTronProvider,
  resolveTronWeb,
  tronNetworkFromChainId,
} from '@/lib/tronlink-provider';

describe('tronlink-provider', () => {
  afterEach(() => {
    delete window.tron;
    delete window.tronLink;
    delete window.tronWeb;
  });

  it('resuelve el provider TIP-6963 y el tronWeb anidado sin depender de una sola ruta', () => {
    const address = 'TAbCdEf1111111111111111111111111111';
    const tronWeb = {
      defaultAddress: { base58: address },
      fullNode: { host: 'https://api.trongrid.io' },
    };
    const provider = {
      selectedAddress: address,
      tronWeb,
      request: jest.fn(),
    };
    Object.defineProperty(window, 'tron', { configurable: true, value: provider });

    expect(resolveTronProvider()).toBe(provider);
    expect(resolveTronWeb()).toBe(tronWeb);
    expect(resolveTronAddress()).toBe(address);
    expect(resolveTronChainId(provider, tronWeb)).toBe(TRON_MAINNET_CHAIN_ID);
  });

  it.each([
    ['https://api.trongrid.io', TRON_MAINNET_CHAIN_ID, 'mainnet'],
    ['https://api.shasta.trongrid.io', TRON_SHASTA_CHAIN_ID, 'shasta'],
    ['https://nile.trongrid.io', TRON_NILE_CHAIN_ID, 'nile'],
  ] as const)('mapea %s a su chain id y red oficial', (host, chainId, network) => {
    expect(chainIdFromTronHost(host)).toBe(chainId);
    expect(tronNetworkFromChainId(chainId)).toBe(network);
  });
});
