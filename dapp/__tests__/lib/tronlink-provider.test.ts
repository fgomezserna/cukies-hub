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
  resolveTronSignerWeb,
  resolveTronWeb,
  isTronWebSignerReady,
  isTronWebWalletSignerReady,
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

  it('prefiere el tronWeb signer frente a una instancia global de solo lectura', () => {
    const readOnlyAddress = 'TReadOnly1111111111111111111111111111111';
    const signerAddress = 'TSigner111111111111111111111111111111111';
    const readOnly = {
      defaultAddress: { base58: readOnlyAddress },
      contract: jest.fn(),
    };
    const signer = {
      defaultAddress: { base58: signerAddress },
      contract: jest.fn(),
      trx: { sign: jest.fn() },
    };
    Object.defineProperty(window, 'tronWeb', { configurable: true, value: readOnly });
    Object.defineProperty(window, 'tronLink', {
      configurable: true,
      value: { request: jest.fn(), tronWeb: signer },
    });

    expect(isTronWebSignerReady(readOnly)).toBe(false);
    expect(resolveTronWeb()).toBe(signer);
    expect(isTronWebSignerReady(signer)).toBe(true);
    expect(resolveTronSignerWeb()).toBe(signer);
    expect(isTronWebWalletSignerReady(signer)).toBe(true);
    expect(resolveTronAddress()).toBe(signerAddress);
  });

  it('no acredita como wallet un TronWeb SDK con forma signer pero sin proveedor asociado', () => {
    const sdkReader = {
      defaultAddress: { base58: 'TReader11111111111111111111111111111111' },
      contract: jest.fn(),
      trx: { sign: jest.fn() },
    };
    Object.defineProperty(window, 'tronWeb', { configurable: true, value: sdkReader });

    expect(isTronWebSignerReady(sdkReader)).toBe(false);
    expect(isTronWebWalletSignerReady(sdkReader)).toBe(false);
    expect(resolveTronSignerWeb()).toBeNull();
  });

  it('deja de considerar signer a un TronLink bloqueado aunque conserve la forma SDK', () => {
    const signer = {
      ready: false,
      defaultAddress: { base58: 'TLocked1111111111111111111111111111111' },
      contract: jest.fn(),
      trx: { sign: jest.fn() },
    };
    Object.defineProperty(window, 'tron', {
      configurable: true,
      value: { request: jest.fn(), tronWeb: signer },
    });

    expect(resolveTronSignerWeb()).toBeNull();
    expect(isTronWebSignerReady(signer)).toBe(false);
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
