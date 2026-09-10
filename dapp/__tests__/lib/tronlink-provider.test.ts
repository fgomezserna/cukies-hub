import {
  TRON_MAINNET_CHAIN_ID,
  TRON_NILE_CHAIN_ID,
  TRON_SHASTA_CHAIN_ID,
  chainIdFromTronHost,
  clearRegisteredTronProvider,
  registerTronProvider,
  resolveTronAddress,
  resolveTronChainId,
  resolveTronProvider,
  resolveTronWeb,
  tronNetworkFromChainId,
} from '@/lib/tronlink-provider';

describe('tronlink-provider', () => {
  afterEach(() => {
    clearRegisteredTronProvider();
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

  it('rechaza un anuncio EIP-6963 exclusivamente EVM aunque tenga request y eventos', () => {
    const evmProvider = {
      request: jest.fn(),
      on: jest.fn(),
    };

    expect(registerTronProvider(evmProvider, {
      name: 'MetaMask',
      rdns: 'io.metamask',
    })).toBeNull();
    expect(registerTronProvider({
      ...evmProvider,
      isTronLink: true,
    }, {
      name: 'TronLink',
      rdns: 'org.tronlink.www',
    })).toBeNull();
    expect(resolveTronProvider()).toBeNull();
    expect(resolveTronWeb()).toBeNull();
  });

  it('acepta un anuncio TronLink con identidad oficial y capacidad tronWeb explícita', () => {
    const address = 'TValid111111111111111111111111111111111';
    const tronWeb = { defaultAddress: { base58: address } };
    const provider = {
      request: jest.fn(),
      on: jest.fn(),
      tronWeb,
    };

    expect(registerTronProvider(provider, {
      name: 'TronLink',
      rdns: 'org.tronlink.www',
    })).toBe(provider);
    expect(resolveTronProvider()).toBe(provider);
    expect(resolveTronWeb()).toBe(tronWeb);
    expect(resolveTronAddress()).toBe(address);
  });

  it('mantiene el global TronLink como fuente prioritaria frente a un anuncio EVM', () => {
    const tronAddress = 'TGlobal111111111111111111111111111111111';
    const globalProvider = {
      selectedAddress: tronAddress,
      tronWeb: { defaultAddress: { base58: tronAddress } },
      request: jest.fn(),
    };
    Object.defineProperty(window, 'tron', { configurable: true, value: globalProvider });

    expect(registerTronProvider({ request: jest.fn(), on: jest.fn() }, {
      name: 'MetaMask',
      rdns: 'io.metamask',
    })).toBeNull();
    expect(resolveTronProvider()).toBe(globalProvider);
    expect(resolveTronAddress()).toBe(tronAddress);
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
