'use client';

import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    tron?: any;
    tronWeb?: any;
    tronLink?: any;
  }
}

interface TronLinkState {
  isInstalled: boolean;
  isConnected: boolean;
  address: string | null;
  isLoading: boolean;
  error: string | null;
}

function getTronWeb() {
  if (typeof window === 'undefined') return null;
  return window.tronWeb ?? window.tronLink?.tronWeb ?? window.tron?.tronWeb ?? null;
}

function getTronProvider() {
  if (typeof window === 'undefined') return null;
  return window.tron ?? window.tronLink ?? window.tronWeb ?? null;
}

function getTronAddress() {
  const tronWeb = getTronWeb();
  return (
    window.tron?.selectedAddress ??
    window.tron?.defaultAddress?.base58 ??
    tronWeb?.defaultAddress?.base58 ??
    tronWeb?.defaultAddress?.hex ??
    window.tronLink?.tronWeb?.defaultAddress?.base58 ??
    window.tronLink?.selectedAddress ??
    null
  );
}

function isTronReady() {
  const tronWeb = getTronWeb();
  return Boolean((tronWeb?.ready || getTronAddress()) && getTronAddress());
}

async function waitForTronAddress(timeoutMs = 12_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (isTronReady()) {
      return getTronAddress();
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

export function useTronLink() {
  const [state, setState] = useState<TronLinkState>({
    isInstalled: false,
    isConnected: false,
    address: null,
    isLoading: true,
    error: null,
  });

  const syncConnection = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const address = getTronAddress();
      setState((prev) => ({
        ...prev,
        isInstalled: Boolean(window.tron || window.tronWeb || window.tronLink),
        isConnected: Boolean(address),
        address,
        error: address ? null : prev.error,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Error checking TronLink connection:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkTronLink = () => {
        const isInstalled = !!(window.tron || window.tronWeb || window.tronLink);
        const address = getTronAddress();
        setState((prev) => ({
          ...prev,
          isInstalled,
          isConnected: Boolean(address),
          address,
          isLoading: false,
        }));
      };

      checkTronLink();

      const interval = setInterval(checkTronLink, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMessage = (event: MessageEvent) => {
      const action = event.data?.message?.action ?? event.data?.action;
      const address = event.data?.message?.data?.address;
      if (typeof address === 'string') {
        setState((prev) => ({
          ...prev,
          isInstalled: true,
          isConnected: true,
          address,
          error: null,
          isLoading: false,
        }));
        return;
      }

      if (
        !action ||
        action === 'accountsChanged' ||
        action === 'connect' ||
        action === 'disconnect' ||
        action === 'setAccount' ||
        action === 'setNode'
      ) {
        syncConnection();
      }
    };

    syncConnection();

    const tron = window.tron;
    const handleAccountsChanged = (accounts: unknown) => {
      const [address] = Array.isArray(accounts) ? accounts : [];
      setState((prev) => ({
        ...prev,
        isInstalled: true,
        isConnected: typeof address === 'string',
        address: typeof address === 'string' ? address : null,
        error: typeof address === 'string' ? null : prev.error,
        isLoading: false,
      }));
    };

    tron?.on?.('accountsChanged', handleAccountsChanged);
    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', syncConnection);
    window.addEventListener('tronlink:connected', syncConnection);

    const interval = setInterval(syncConnection, 1000);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', syncConnection);
      window.removeEventListener('tronlink:connected', syncConnection);
      tron?.removeListener?.('accountsChanged', handleAccountsChanged);
      clearInterval(interval);
    };
  }, [state.isInstalled, syncConnection]);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined') {
      setState((prev) => ({
        ...prev,
        error: 'TronLink no esta disponible',
      }));
      return null;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (isTronReady()) {
        const address = getTronAddress();
        setState((prev) => ({
          ...prev,
          isConnected: true,
          address,
          error: null,
          isLoading: false,
        }));
        return address;
      }

      const provider = getTronProvider();

      if (!provider?.request) {
        setState((prev) => ({
          ...prev,
          isInstalled: false,
          isConnected: false,
          address: null,
          isLoading: false,
          error: 'Instala o activa la extension TronLink',
        }));
        return null;
      }

      let response: unknown;
      try {
        response = await provider.request({
          method: 'eth_requestAccounts',
        });
      } catch (modernError: any) {
        if (modernError?.code && modernError.code !== 4200) {
          throw modernError;
        }

        response = await provider.request({
          method: 'tron_requestAccounts',
          params: {
            websiteName: 'Cukies World',
            websiteIcon: `${window.location.origin}/Cukie_logo_first.png`,
          },
        });
      }

      if (Array.isArray(response) && typeof response[0] === 'string') {
        const address = response[0];
        setState((prev) => ({
          ...prev,
          isInstalled: true,
          isConnected: true,
          address,
          isLoading: false,
          error: null,
        }));
        window.dispatchEvent(new Event('tronlink:connected'));
        return address;
      }

      if (
        response &&
        typeof response === 'object' &&
        'code' in response &&
        response.code !== 200
      ) {
        const record = response as { code?: number; message?: string; error?: string };
        const message =
          record.message || record.error || 'Conexion cancelada en TronLink';
        throw new Error(message);
      }

      const address = await waitForTronAddress();

      if (!address) {
        throw new Error(
          'TronLink no ha devuelto ninguna wallet. Desbloquea la extension, confirma la conexion y vuelve a intentarlo.',
        );
      }

      setState((prev) => ({
        ...prev,
        isInstalled: true,
        isConnected: true,
        address,
        isLoading: false,
        error: null,
      }));
      window.dispatchEvent(new Event('tronlink:connected'));

      return address;
    } catch (error: any) {
      console.error('Error connecting to TronLink:', error);
      setState((prev) => ({
        ...prev,
        isConnected: false,
        address: null,
        isLoading: false,
        error: error?.message || 'Failed to connect to TronLink',
      }));

      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnected: false,
      address: null,
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
  };
}
