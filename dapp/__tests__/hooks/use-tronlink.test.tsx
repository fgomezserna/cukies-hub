import { act, renderHook } from '@testing-library/react';

import { useTronLink } from '@/hooks/use-tronlink';

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
});
