import { act, renderHook } from '@testing-library/react';

import { useTronLink } from '@/hooks/use-tronlink';
import { clearRegisteredTronProvider } from '@/lib/tronlink-provider';

const tronAddress = 'TJEAyJ111111111111111111111111111VjhM';

describe('useTronLink', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'tron', {
      configurable: true,
      value: {
        selectedAddress: tronAddress,
        defaultAddress: { base58: tronAddress },
        on: jest.fn(),
        removeListener: jest.fn(),
      },
      writable: true,
    });
    Object.defineProperty(window, 'tronWeb', {
      configurable: true,
      value: {
        ready: true,
        defaultAddress: { base58: tronAddress },
      },
      writable: true,
    });
  });

  afterEach(() => {
    clearRegisteredTronProvider();
    window.localStorage.clear();
    delete window.tron;
    delete window.tronWeb;
  });

  it('keeps every hook instance disconnected until an explicit reconnect', async () => {
    const first = renderHook(() => useTronLink());
    const second = renderHook(() => useTronLink());

    expect(first.result.current.address).toBe(tronAddress);
    expect(second.result.current.address).toBe(tronAddress);

    act(() => first.result.current.disconnect());

    expect(first.result.current.isConnected).toBe(false);
    expect(second.result.current.isConnected).toBe(false);
    expect(window.localStorage.getItem('cukies:tronlink:disconnected')).toBe('1');

    first.unmount();
    const remounted = renderHook(() => useTronLink());
    expect(remounted.result.current.isConnected).toBe(false);
    expect(remounted.result.current.address).toBeNull();

    await act(async () => {
      await remounted.result.current.connect();
    });

    expect(remounted.result.current.isConnected).toBe(true);
    expect(remounted.result.current.address).toBe(tronAddress);
    expect(window.localStorage.getItem('cukies:tronlink:disconnected')).toBeNull();

    second.unmount();
    remounted.unmount();
  });

  it('ignora un anuncio EIP-6963 exclusivamente EVM y no expone TRON como instalado', () => {
    delete window.tron;
    delete window.tronWeb;
    const evmProvider = {
      request: jest.fn(),
      on: jest.fn(),
      isTronLink: true,
    };
    const { result, unmount } = renderHook(() => useTronLink());

    act(() => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { name: 'MetaMask', rdns: 'io.metamask' },
          provider: evmProvider,
        },
      }));
    });

    expect(result.current.isInstalled).toBe(false);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(evmProvider.request).not.toHaveBeenCalled();
    unmount();
  });

  it('registra un anuncio TIP-6963 TronLink válido con tronWeb anidado', () => {
    delete window.tron;
    delete window.tronWeb;
    const address = 'TAnnounced1111111111111111111111111111111';
    const provider = {
      selectedAddress: address,
      request: jest.fn(),
      on: jest.fn(),
      tronWeb: {
        defaultAddress: { base58: address },
        fullNode: { host: 'https://api.trongrid.io' },
      },
    };
    const { result, unmount } = renderHook(() => useTronLink());

    act(() => {
      window.dispatchEvent(new CustomEvent('TIP6963:announceProvider', {
        detail: {
          info: { name: 'TronLink', rdns: 'org.tronlink.www' },
          provider,
        },
      }));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBe(address);
    expect(result.current.network).toBe('mainnet');
    unmount();
  });
});
