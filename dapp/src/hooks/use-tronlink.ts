'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import {
  resolveTronAddress,
  resolveTronProvider,
  resolveTronWeb,
  resolveTronChainId,
  registerTronProvider,
  tronNetworkFromChainId,
  tronNodeHost,
  type TronNetwork,
} from '@/lib/tronlink-provider';

export type TronLinkState = {
  isInstalled: boolean;
  isConnected: boolean;
  address: string | null;
  chainId: string | null;
  network: TronNetwork;
  rpcHost: string | null;
  isLoading: boolean;
  error: string | null;
};

const TRONLINK_DISCONNECTED_STORAGE_KEY = 'cukies:tronlink:disconnected';
const INITIAL_STATE: TronLinkState = {
  isInstalled: false,
  isConnected: false,
  address: null,
  chainId: null,
  network: 'unknown',
  rpcHost: null,
  isLoading: true,
  error: null,
};

let snapshot = INITIAL_STATE;
let manuallyDisconnected = false;
const subscribers = new Set<() => void>();
let cleanupListeners: (() => void) | null = null;

function isManualDisconnectActive() {
  if (manuallyDisconnected) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRONLINK_DISCONNECTED_STORAGE_KEY) === '1';
  } catch {
    return manuallyDisconnected;
  }
}

function setManualDisconnect(active: boolean) {
  manuallyDisconnected = active;
  if (typeof window === 'undefined') return;
  try {
    if (active) window.localStorage.setItem(TRONLINK_DISCONNECTED_STORAGE_KEY, '1');
    else window.localStorage.removeItem(TRONLINK_DISCONNECTED_STORAGE_KEY);
  } catch {
    // The in-memory flag remains authoritative for this tab.
  }
}

function emit(next: Partial<TronLinkState>) {
  const nextSnapshot = { ...snapshot, ...next };
  if (
    snapshot.isInstalled === nextSnapshot.isInstalled
    && snapshot.isConnected === nextSnapshot.isConnected
    && snapshot.address === nextSnapshot.address
    && snapshot.chainId === nextSnapshot.chainId
    && snapshot.network === nextSnapshot.network
    && snapshot.rpcHost === nextSnapshot.rpcHost
    && snapshot.isLoading === nextSnapshot.isLoading
    && snapshot.error === nextSnapshot.error
  ) return;
  snapshot = nextSnapshot;
  subscribers.forEach((listener) => listener());
}

function syncConnection() {
  if (typeof window === 'undefined') return;
  const provider = resolveTronProvider();
  const tronWeb = resolveTronWeb();
  const isInstalled = Boolean(provider || tronWeb);
  const chainId = resolveTronChainId(provider, tronWeb);
  const address = resolveTronAddress(tronWeb);
  if (isManualDisconnectActive()) {
    emit({
      isInstalled,
      isConnected: false,
      address: null,
      chainId,
      network: tronNetworkFromChainId(chainId),
      rpcHost: tronNodeHost(tronWeb),
      isLoading: false,
    });
    return;
  }
  emit({
    isInstalled,
    isConnected: Boolean(address),
    address,
    chainId,
    network: tronNetworkFromChainId(chainId),
    rpcHost: tronNodeHost(tronWeb),
    isLoading: false,
    error: address ? null : snapshot.error,
  });
}

function onMessage(event: MessageEvent) {
  const message = event.data?.message ?? event.data;
  const action = message?.action;
  if (
    typeof message?.data?.address === 'string'
    || action === 'accountsChanged'
    || action === 'connect'
    || action === 'disconnect'
    || action === 'setAccount'
    || action === 'setNode'
  ) {
    syncConnection();
  }
}

function installListeners() {
  if (cleanupListeners || typeof window === 'undefined') return;
  const provider = resolveTronProvider();
  const handleAccountsChanged = () => syncConnection();
  const handleChainChanged = () => syncConnection();
  const handleConnected = () => syncConnection();
  const handleAnnouncedProvider = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: unknown; provider?: unknown }>).detail;
    registerTronProvider(detail?.provider, detail?.info);
    syncConnection();
  };

  provider?.on?.('accountsChanged', handleAccountsChanged);
  provider?.on?.('chainChanged', handleChainChanged);
  provider?.on?.('connect', handleConnected);
  provider?.on?.('disconnect', handleConnected);
  window.addEventListener('message', onMessage);
  window.addEventListener('focus', syncConnection);
  window.addEventListener('storage', syncConnection);
  window.addEventListener('tronlink:connected', syncConnection);
  window.addEventListener('tronlink:disconnected', syncConnection);
  window.addEventListener('TIP6963:announceProvider', handleAnnouncedProvider);
  window.addEventListener('eip6963:announceProvider', handleAnnouncedProvider);
  window.dispatchEvent(new Event('TIP6963:requestProvider'));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  const interval = window.setInterval(syncConnection, 1000);
  syncConnection();

  cleanupListeners = () => {
    provider?.removeListener?.('accountsChanged', handleAccountsChanged);
    provider?.removeListener?.('chainChanged', handleChainChanged);
    provider?.removeListener?.('connect', handleConnected);
    provider?.removeListener?.('disconnect', handleConnected);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('focus', syncConnection);
    window.removeEventListener('storage', syncConnection);
    window.removeEventListener('tronlink:connected', syncConnection);
    window.removeEventListener('tronlink:disconnected', syncConnection);
    window.removeEventListener('TIP6963:announceProvider', handleAnnouncedProvider);
    window.removeEventListener('eip6963:announceProvider', handleAnnouncedProvider);
    window.clearInterval(interval);
    cleanupListeners = null;
  };
}

function subscribe(listener: () => void) {
  subscribers.add(listener);
  installListeners();
  syncConnection();
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) cleanupListeners?.();
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return INITIAL_STATE;
}

async function connectTronLink() {
  if (typeof window === 'undefined') return null;
  setManualDisconnect(false);
  emit({ isLoading: true, error: null });
  const provider = resolveTronProvider();
  const existingAddress = resolveTronAddress();
  if (existingAddress) {
    syncConnection();
    emit({ address: existingAddress, isConnected: true, isLoading: false, error: null });
    window.dispatchEvent(new Event('tronlink:connected'));
    return existingAddress;
  }
  if (!provider?.request) {
    emit({ isInstalled: false, isConnected: false, address: null, isLoading: false, error: 'Instala o activa la extension TronLink.' });
    return null;
  }

  try {
    let result: unknown;
    try {
      result = await provider.request({ method: 'eth_requestAccounts' });
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code !== 4200) throw error;
      result = await provider.request({ method: 'tron_requestAccounts' });
    }

    if (Array.isArray(result) && typeof result[0] === 'string') {
      syncConnection();
      if (!snapshot.address) emit({ address: result[0], isConnected: true });
      window.dispatchEvent(new Event('tronlink:connected'));
      return snapshot.address ?? result[0];
    }
    syncConnection();
    if (!snapshot.address) throw new Error('TronLink no ha devuelto ninguna wallet. Confirma la conexión y vuelve a intentarlo.');
    return snapshot.address;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo conectar TronLink.';
    emit({ isConnected: false, address: null, isLoading: false, error: message });
    return null;
  }
}

function disconnectTronLink() {
  setManualDisconnect(true);
  emit({ isConnected: false, address: null, isLoading: false });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tronlink:disconnected'));
}

export function useTronLink() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    syncConnection();
  }, []);
  const connect = useCallback(() => connectTronLink(), []);
  const disconnect = useCallback(() => disconnectTronLink(), []);
  return { ...state, connect, disconnect };
}

export function getCurrentTronWeb() {
  return resolveTronWeb();
}
