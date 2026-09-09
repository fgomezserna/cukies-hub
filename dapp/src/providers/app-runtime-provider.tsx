'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/providers/auth-provider';
import type { AppRuntimeServiceStatus, AppRuntimeStatus } from '@/lib/app-runtime/types';
import { UKI_PRESALE_CHAIN_ID } from '@/components/landing/sale-config';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';

export type AppRuntimeResource =
  | 'runtime-status'
  | 'dashboard'
  | 'master'
  | 'master-nft'
  | 'credits'
  | 'pool'
  | (string & {});

export type AppRuntimeOperation =
  | 'dashboard'
  | 'master'
  | 'credits'
  | 'pool'
  | 'nft'
  | 'recovery'
  | 'uki'
  | 'master-write'
  | 'pool-write'
  | 'nft-write'
  | 'recovery-write'
  | 'uki-write'
  | 'legacy-bsc'
  | 'tron';

export type AppRuntimeReadiness = {
  ready: boolean;
  reason: 'ready' | 'offline' | 'wallet_required' | 'signature_required' | 'wrong_chain' | 'service_unavailable';
  targetChainId: 56 | 97 | null;
  service: AppRuntimeServiceStatus | null;
};

type RuntimeContextValue = {
  address: string | null;
  walletType: 'evm' | 'tron' | null;
  authenticated: boolean;
  authLoading: boolean;
  sessionReady: boolean;
  connected: boolean;
  chainId: number | undefined;
  online: boolean;
  runtimeRouteActive: boolean;
  status: AppRuntimeStatus | null;
  statusState: 'idle' | 'loading' | 'ready' | 'stale' | 'syncing' | 'unavailable';
  isRefreshing: boolean;
  refresh: () => Promise<unknown>;
  refreshAfterTransaction: (resource?: AppRuntimeResource) => Promise<void>;
  invalidate: (resource?: AppRuntimeResource) => Promise<void>;
  expectedChainId: (operation: AppRuntimeOperation) => 56 | 97 | null;
  readiness: (operation: AppRuntimeOperation) => AppRuntimeReadiness;
  switchTo: (operation: AppRuntimeOperation) => Promise<boolean>;
  queryKey: (resource: AppRuntimeResource, wallet?: string | null, targetChainId?: number | null) => QueryKey;
};

const RuntimeContext = createContext<RuntimeContextValue | null>(null);
const RESOURCE_ENDPOINTS: Record<string, string> = {
  'runtime-status': '/api/economy/v1/runtime-status',
  dashboard: '/api/dashboard/v1/summary',
  master: '/api/economy/v1/cukie-master',
  'master-nft': '/api/economy/v1/cukie-master',
  credits: '/api/economy/v1/credits',
  pool: '/api/economy/v1/cukie-pool',
};

function configuredBscChain(): 56 | 97 | null {
  return (UKI_PRESALE_CHAIN_ID === 56 || UKI_PRESALE_CHAIN_ID === 97)
    ? UKI_PRESALE_CHAIN_ID
    : null;
}

function canonicalResource(resource: AppRuntimeResource) {
  return resource === 'master-nft' ? 'master' : resource;
}

function sourceChainForResource(resource: AppRuntimeResource): 56 | 97 | null {
  if (resource === 'pool') return ukiNftVaults.chainId;
  if (resource === 'master' || resource === 'master-nft' || resource === 'credits' || resource === 'runtime-status') {
    return configuredBscChain();
  }
  return null;
}

function isRuntimeResourceQuery(queryKey: readonly unknown[]) {
  return queryKey[0] === 'app-runtime' && queryKey[1] === 'resource';
}

function isRuntimeStatusQuery(queryKey: readonly unknown[]) {
  return isRuntimeResourceQuery(queryKey) && queryKey[4] === 'runtime-status';
}

function transactionResources(resource?: AppRuntimeResource) {
  const resources = new Set<string>(['master', 'credits', 'dashboard']);
  const canonical = resource ? canonicalResource(resource) : null;
  if (canonical === 'pool' || canonical === 'pool-write') resources.add('pool');
  if (canonical === 'nft' || canonical === 'nft-write' || canonical === 'recovery' || canonical === 'recovery-write') resources.add('master');
  return resources;
}

function statusStateFor(status: AppRuntimeStatus | null): 'ready' | 'syncing' | 'unavailable' {
  if (!status) return 'unavailable';
  const services = Object.values(status.services);
  if (services.some((service) => service.status === 'unavailable' || service.status === 'disabled')) return 'unavailable';
  if (services.some((service) => service.status === 'syncing')) return 'syncing';
  return 'ready';
}

export function appRuntimeEndpoint(resource: AppRuntimeResource, wallet: string | null) {
  const endpoint = RESOURCE_ENDPOINTS[resource] ?? resource;
  if (!wallet || resource === 'dashboard') return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}walletAddress=${encodeURIComponent(wallet)}`;
}

export function appRuntimeQueryKey(resource: AppRuntimeResource, wallet: string | null, targetChainId: number | null) {
  return ['app-runtime', 'resource', wallet?.toLowerCase() ?? null, targetChainId ?? null, canonicalResource(resource)] as const;
}

function serviceForOperation(status: AppRuntimeStatus | null, operation: AppRuntimeOperation) {
  if (!status) return null;
  if (operation === 'credits') return status.services.credits;
  if (operation === 'master' || operation === 'master-write' || operation === 'nft' || operation === 'nft-write' || operation === 'recovery' || operation === 'recovery-write') return status.services.master;
  if (operation === 'dashboard' || operation === 'pool') return status.services.indexer;
  return null;
}

async function fetchRuntime<T = unknown>(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  let rejectAbort: ((reason?: unknown) => void) | null = null;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    controller.abort();
    rejectAbort?.(new DOMException('The request was aborted', 'AbortError'));
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      controller.abort();
      reject(new Error('APP_RUNTIME_TIMEOUT'));
    }, 20_000);
  });
  try {
    const request = fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    }).then(async (response) => ({
      response,
      body: await response.json() as T,
    }));
    return await Promise.race([request, timeoutPromise, abortPromise]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function AppRuntimeProvider({ children }: { children: React.ReactNode }) {
  const { user, walletType, isLoading: authLoading } = useAuth();
  const { address: connectedAddress, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const address = user?.walletAddress?.toLowerCase() ?? null;
  const connectedAddressNormalized = connectedAddress?.toLowerCase() ?? null;
  const signedWalletMatches = Boolean(address && connectedAddressNormalized && address === connectedAddressNormalized);
  const sessionReady = Boolean(user && walletType === 'evm' && signedWalletMatches);
  const runtimeRouteActive = pathname === '/dashboard'
    || pathname.startsWith('/credits')
    || pathname.startsWith('/cukie-master')
    || pathname.startsWith('/cukie-hodler')
    || pathname.startsWith('/cukies');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  const runtimeQuery = useQuery({
    queryKey: appRuntimeQueryKey('runtime-status', address, configuredBscChain()),
    queryFn: async ({ signal }) => {
      const { response, body } = await fetchRuntime<{ status?: string; data?: AppRuntimeStatus }>(appRuntimeEndpoint('runtime-status', address), signal);
      if (!response.ok || body.status !== 'ok' || !body.data) throw new Error('APP_RUNTIME_STATUS_UNAVAILABLE');
      return body.data;
    },
    enabled: Boolean(address && sessionReady) && !authLoading && online && runtimeRouteActive,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: (failureCount: number) => failureCount < 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
    refetchInterval: runtimeRouteActive ? 60_000 : false,
  });

  useEffect(() => {
    if (!runtimeRouteActive || !address || !sessionReady) {
      void queryClient.cancelQueries({ queryKey: ['app-runtime'] });
      void queryClient.removeQueries({ queryKey: ['app-runtime'] });
    }
  }, [address, queryClient, runtimeRouteActive, sessionReady]);

  const expectedChainId = useCallback((operation: AppRuntimeOperation): 56 | 97 | null => {
    if (operation === 'tron' || operation === 'dashboard' || operation === 'master' || operation === 'credits' || operation === 'pool' || operation === 'nft' || operation === 'recovery') return null;
    if (operation === 'legacy-bsc') return 56;
    if (operation === 'nft-write' || operation === 'recovery-write' || operation === 'pool-write') return ukiNftVaults.chainId;
    if (operation === 'master-write' || operation === 'uki-write') return configuredBscChain();
    return null;
  }, []);

  const readiness = useCallback((operation: AppRuntimeOperation): AppRuntimeReadiness => {
    const targetChainId = expectedChainId(operation);
    const service = serviceForOperation(runtimeQuery.data ?? null, operation);
    if (!online) return { ready: false, reason: 'offline', targetChainId, service };
    const isTronOperation = operation === 'tron';
    const walletPresent = isTronOperation ? Boolean(walletType && user) : Boolean(isConnected && connectedAddress);
    if (!walletPresent) return { ready: false, reason: 'wallet_required', targetChainId, service };
    if (!user || (!isTronOperation && !sessionReady) || (!isTronOperation && walletType !== 'evm') || (isTronOperation && walletType !== 'tron')) return { ready: false, reason: 'signature_required', targetChainId, service };
    if (targetChainId !== null && chainId !== targetChainId) {
      return { ready: false, reason: 'wrong_chain', targetChainId, service };
    }
    const requiresService = operation === 'dashboard' || operation === 'master' || operation === 'nft' || operation === 'recovery' || operation === 'credits' || operation === 'pool';
    if (requiresService && (
      runtimeQuery.status !== 'success'
      || runtimeQuery.isError
      || runtimeQuery.isRefetchError
      || Boolean(runtimeQuery.error)
      || !service
      || service.status !== 'ready'
    )) {
      return { ready: false, reason: 'service_unavailable', targetChainId, service };
    }
    return { ready: true, reason: 'ready', targetChainId, service };
  }, [chainId, connectedAddress, expectedChainId, isConnected, online, runtimeQuery.data, runtimeQuery.error, runtimeQuery.isError, runtimeQuery.isRefetchError, runtimeQuery.status, sessionReady, user, walletType]);

  const switchTo = useCallback(async (operation: AppRuntimeOperation) => {
    const targetChainId = expectedChainId(operation);
    if (!targetChainId || chainId === targetChainId) return targetChainId !== null;
    try {
      await switchChainAsync({ chainId: targetChainId });
      return true;
    } catch {
      return false;
    }
  }, [chainId, expectedChainId, switchChainAsync]);

  const runRefresh = useCallback(async (resources?: Set<string>, shouldInvalidate = false, waitForInFlight = false) => {
    if (!runtimeRouteActive || !address || !sessionReady) return;

    const requestedResources = resources;
    const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (!isRuntimeResourceQuery(queryKey) || queryKey[2] !== address) return false;
      if (isRuntimeStatusQuery(queryKey)) return true;
      return !requestedResources || requestedResources.has(String(queryKey[4]));
    };
    if (waitForInFlight) {
      const inFlight = queryClient.getQueryCache()
        .findAll({ predicate })
        .filter((query) => query.state.fetchStatus === 'fetching')
        .map((query) => query.promise);
      if (inFlight.length > 0) await Promise.allSettled(inFlight);
    }
    if (shouldInvalidate) {
      await queryClient.invalidateQueries({ predicate, refetchType: 'none' });
    }
    await queryClient.refetchQueries({ predicate }, { cancelRefetch: false });
  }, [address, queryClient, runtimeRouteActive, sessionReady]);

  const refresh = useCallback(() => runRefresh(), [runRefresh]);
  const invalidate = useCallback((resource?: AppRuntimeResource) => {
    const resources = resource ? new Set([canonicalResource(resource)]) : undefined;
    return runRefresh(resources, true);
  }, [runRefresh]);

  const refreshAfterTransaction = useCallback((resource?: AppRuntimeResource) => {
    return runRefresh(transactionResources(resource), true, true);
  }, [runRefresh]);

  useEffect(() => {
    const refreshMaster = () => { void refreshAfterTransaction('master'); };
    window.addEventListener('cukies:cukie-master:refresh', refreshMaster);
    return () => window.removeEventListener('cukies:cukie-master:refresh', refreshMaster);
  }, [refreshAfterTransaction]);

  const value = useMemo<RuntimeContextValue>(() => ({
    address,
    walletType,
    authenticated: Boolean(user),
    authLoading,
    sessionReady,
    connected: isConnected && Boolean(connectedAddress),
    chainId,
    online,
    runtimeRouteActive,
    status: sessionReady ? runtimeQuery.data ?? null : null,
    statusState: authLoading || !address || !sessionReady || !runtimeRouteActive
      ? 'idle'
      : runtimeQuery.isPending
        ? 'loading'
        : (runtimeQuery.isError || runtimeQuery.isRefetchError || Boolean(runtimeQuery.error))
          ? runtimeQuery.data ? 'stale' : 'unavailable'
          : statusStateFor(runtimeQuery.data ?? null),
    isRefreshing: runtimeQuery.isFetching,
    refresh,
    refreshAfterTransaction,
    invalidate,
    expectedChainId,
    readiness,
    switchTo,
    queryKey: (resource, wallet = address, targetChainId = expectedChainId('dashboard')) => appRuntimeQueryKey(resource, wallet?.toLowerCase() ?? null, targetChainId ?? null),
  }), [address, authLoading, chainId, connectedAddress, expectedChainId, invalidate, isConnected, online, readiness, refresh, refreshAfterTransaction, runtimeQuery.data, runtimeQuery.error, runtimeQuery.isError, runtimeQuery.isFetching, runtimeQuery.isPending, runtimeQuery.isRefetchError, runtimeRouteActive, sessionReady, switchTo, user, walletType]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useAppRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error('useAppRuntime must be used within AppRuntimeProvider');
  return context;
}

export function useAppRuntimeResource<T>(resource: AppRuntimeResource, options: {
  enabled?: boolean;
  endpoint?: string;
  walletAddress?: string | null;
  targetChainId?: number | null;
  cacheKeySuffix?: string;
  staleTime?: number;
  refetchInterval?: number | false;
  validate?: (value: unknown) => value is T;
} = {}) {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error('useAppRuntimeResource must be used within AppRuntimeProvider');
  const runtime = context;
  const wallet = options.walletAddress === undefined ? runtime.address : options.walletAddress?.toLowerCase() ?? null;
  const sessionWalletMatches = Boolean(wallet && runtime.sessionReady && runtime.address === wallet);
  const targetChainId = options.targetChainId === undefined
    ? sourceChainForResource(resource)
    : options.targetChainId;
  const endpoint = options.endpoint ?? appRuntimeEndpoint(resource, wallet);
  const resourceQueryKey = [...appRuntimeQueryKey(resource, wallet, targetChainId), endpoint, options.cacheKeySuffix ?? ''] as const;
  const queryOptions = {
    queryKey: resourceQueryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const { response, body } = await fetchRuntime<{ status?: string; data?: T }>(endpoint, signal);
      if (!response.ok || (body.status !== undefined && body.status !== 'ok') || body.data === undefined || (options.validate && !options.validate(body.data))) {
        throw new Error(`${resource.toUpperCase()}_UNAVAILABLE`);
      }
      return body.data;
    },
    enabled: runtime.runtimeRouteActive && sessionWalletMatches && !runtime.authLoading && runtime.online && options.enabled !== false,
    staleTime: options.staleTime ?? 15_000,
    retry: (failureCount: number) => failureCount < 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
    refetchInterval: options.refetchInterval ?? (resource === 'dashboard' || resource === 'master' || resource === 'master-nft' || resource === 'credits' || resource === 'pool' ? 30_000 : false),
  };
  const query = useQuery<T>(queryOptions as Parameters<typeof useQuery<T>>[0]);
  const queryRef = useRef(query);
  queryRef.current = query;
  const canRead = runtime.runtimeRouteActive && sessionWalletMatches && !runtime.authLoading && runtime.online;
  const queryEnabled = canRead && options.enabled !== false;
  const visibleData = !runtime.runtimeRouteActive || !sessionWalletMatches || runtime.authLoading || options.enabled === false
    ? undefined
    : query.data;
  const hasError = query.isError || query.isRefetchError || Boolean(query.error);
  const refetch = query.refetch;
  const refresh = useCallback<typeof refetch>((...args) => {
    if (!canRead) return Promise.resolve({ ...queryRef.current, data: undefined } as Awaited<ReturnType<typeof refetch>>);
    return refetch({ ...args[0], cancelRefetch: false });
  }, [canRead, refetch]);
  return {
    ...query,
    queryKey: resourceQueryKey,
    data: visibleData,
    state: !queryEnabled
      ? runtime.runtimeRouteActive && sessionWalletMatches && !runtime.authLoading && options.enabled !== false && !runtime.online && visibleData ? 'stale' as const : 'idle' as const
      : query.isPending ? 'loading' as const : hasError ? visibleData ? 'stale' as const : 'unavailable' as const : visibleData ? 'ready' as const : 'idle' as const,
    refresh,
  };
}

export function useOperationReadiness(operation: AppRuntimeOperation) {
  return useAppRuntime().readiness(operation);
}

export function useGuardedOperation(operation: AppRuntimeOperation) {
  const runtime = useAppRuntime();
  return {
    ...runtime.readiness(operation),
    switchToTarget: () => runtime.switchTo(operation),
    invalidate: runtime.invalidate,
  };
}
