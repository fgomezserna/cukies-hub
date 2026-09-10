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
import {
  FALLBACK_COORDINATOR,
  useWalletCoordinator,
} from '@/providers/wallet-coordinator-context';
import type { AppRuntimeServiceStatus, AppRuntimeStatus } from '@/lib/app-runtime/types';
import { UKI_PRESALE_CHAIN_ID } from '@/components/landing/sale-config';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import type { AccountSummary } from '@/lib/account-summary-types';

export type AppRuntimeResource =
  | 'runtime-status'
  | 'dashboard'
  | 'master'
  | 'master-nft'
  | 'credits'
  | 'pool'
  | 'account-summary'
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

export type AppRuntimeStakingExpectation = {
  wallet: string;
  chainId: number;
  stakedUkiRaw: string;
};

export type AppRuntimeProjectionSync = {
  state: 'idle' | 'syncing' | 'delayed';
  wallet: string | null;
  chainId: number | null;
  expectedStakedUkiRaw: string | null;
  attempt: number;
  error: 'offline' | 'request_failed' | 'not_converged' | null;
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
  accountSummary: {
    data: AccountSummary | undefined;
    state: 'idle' | 'loading' | 'ready' | 'stale' | 'unavailable';
    error: Error | null;
    refresh: () => Promise<unknown>;
  };
  requestAccountSummary: () => void;
  projectionSync: AppRuntimeProjectionSync;
  registerStakingExpectation: (expectation: AppRuntimeStakingExpectation) => void;
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
  'account-summary': '/api/account/v1/summary',
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
  if (resource === 'master' || resource === 'master-nft' || resource === 'credits' || resource === 'runtime-status' || resource === 'account-summary') {
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
  const resources = new Set<string>(['master', 'credits', 'dashboard', 'account-summary']);
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

// The indexer and economy scheduler run asynchronously. Keep retries sparse and
// bounded so a receipt never turns into a burst of requests or a false success.
const PROJECTION_SYNC_BACKOFF_MS = [2_000, 5_000, 10_000, 15_000, 30_000, 50_000] as const;
const PROJECTION_SYNC_DEADLINE_MS = 120_000;

function waitForProjectionRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(true), delayMs);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      resolve(false);
    }, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAccountSummaryPayload(value: unknown): value is AccountSummary {
  if (!isRecord(value) || typeof value.walletNormalized !== 'string') return false;
  if (value.chainId !== null && value.chainId !== 56 && value.chainId !== 97) return false;
  if (!isRecord(value.network)
    || (value.network.chainId !== null && value.network.chainId !== 56 && value.network.chainId !== 97)
    || value.network.chainId !== value.chainId) return false;
  if (value.uki !== null && (!isRecord(value.uki)
    || typeof value.uki.balance !== 'string'
    || typeof value.uki.balanceRaw !== 'string'
    || value.uki.decimals !== 18
    || value.uki.symbol !== 'UKI'
    || value.uki.source !== 'wallet')) return false;
  const nullableNonNegativeInteger = (candidate: unknown) => (
    candidate === null || (Number.isSafeInteger(candidate) && (candidate as number) >= 0)
  );
  if (value.credits !== null) {
    const materializationStates = new Set(['ready', 'blocked', 'unknown', 'too_large', 'stale']);
    const credits = value.credits;
    if (!isRecord(credits)
      || !nullableNonNegativeInteger(credits.availableCredits)
      || !nullableNonNegativeInteger(credits.reservedCredits)
      || !nullableNonNegativeInteger(credits.spentCredits)
      || typeof credits.blocked !== 'boolean'
      || !materializationStates.has(String(credits.materialization))
      || credits.source !== 'account') return false;
  }
  if (value.cukies !== null) {
    const countFields = ['total', 'inWallet', 'available', 'onSale', 'inPool', 'inCukieMaster', 'otherInUse'] as const;
    const cukies = value.cukies;
    if (!isRecord(cukies)
      || countFields.some((field) => !nullableNonNegativeInteger(cukies[field]))
      || cukies.coverage !== 'complete'
      || cukies.source !== 'collection') return false;
  }
  return true;
}

function canonicalRaw(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
}

function payloadMatchesIdentity(resource: string, payload: unknown, wallet: string, chainId: number) {
  if (!isRecord(payload)) return false;
  if (resource === 'dashboard') {
    const identity = isRecord(payload.identity) ? payload.identity : null;
    const network = isRecord(payload.network) ? payload.network : null;
    return typeof identity?.walletNormalized === 'string'
      && identity.walletNormalized.toLowerCase() === wallet
      && network?.chainId === chainId;
  }
  if (typeof payload.walletNormalized !== 'string' || payload.walletNormalized.toLowerCase() !== wallet) return false;
  return payload.chainId === undefined || payload.chainId === chainId;
}

function projectionMatches(
  master: unknown,
  credits: unknown,
  expectedStakedUkiRaw: string,
) {
  if (!isRecord(master) || !isRecord(credits)) return false;
  const routes = master.routes;
  if (!isRecord(routes) || !isRecord(routes.uki) || !isRecord(routes.nft)) return false;
  const uki = routes.uki;
  const ukiSource = isRecord(uki.source) ? uki.source : null;
  if (!ukiSource || ukiSource.complete !== true || ukiSource.stakedUkiRaw !== expectedStakedUkiRaw) return false;
  const masterRouteEntries = [routes.uki, routes.nft];
  if (!masterRouteEntries.every((route) => isRecord(route)
    && isRecord(route.source)
    && route.source.complete === true
    && route.projectionFresh === true
    && Array.isArray(route.slots))) return false;
  const masterSlots = masterRouteEntries.flatMap((route) => route.slots);

  const expectedSlots = masterSlots
    .filter(isRecord)
    .filter((slot) => ['qualifying', 'active', 'grace'].includes(String(slot.status)))
    .map((slot) => `${String(slot.route ?? 'uki')}:${String(slot.ordinal)}:${String(slot.eligibilityEpoch)}:${String(slot.status)}`)
    .sort();
  const configurations = credits.configurations;
  if (!Array.isArray(configurations)) return false;
  const actualSlots = configurations
    .filter(isRecord)
    .filter((configuration) => ['qualifying', 'active', 'grace'].includes(String(configuration.status)))
    .map((configuration) => `${String(configuration.route)}:${String(configuration.ordinal)}:${String(configuration.eligibilityEpoch)}:${String(configuration.status)}`)
    .sort();
  return expectedSlots.length === actualSlots.length
    && expectedSlots.every((slot, index) => slot === actualSlots[index]);
}

export function appRuntimeProjectionMatches(
  master: unknown,
  credits: unknown,
  expectedStakedUkiRaw: string,
) {
  return canonicalRaw(expectedStakedUkiRaw) && projectionMatches(master, credits, expectedStakedUkiRaw);
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
  const { requestWallet } = useWalletCoordinator();
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
  const projectionExpectationRef = useRef<AppRuntimeStakingExpectation | null>(null);
  const projectionAbortRef = useRef<AbortController | null>(null);
  const projectionRunRef = useRef<Promise<void> | null>(null);
  const projectionIdentityRef = useRef<string | null>(null);
  const currentAddressRef = useRef(address);
  const currentConnectedAddressRef = useRef(connectedAddressNormalized);
  const currentChainIdRef = useRef(chainId);
  const currentSessionReadyRef = useRef(sessionReady);
  currentAddressRef.current = address;
  currentConnectedAddressRef.current = connectedAddressNormalized;
  currentChainIdRef.current = chainId;
  currentSessionReadyRef.current = sessionReady;
  const [projectionSync, setProjectionSync] = useState<AppRuntimeProjectionSync>({
    state: 'idle',
    wallet: null,
    chainId: null,
    expectedStakedUkiRaw: null,
    attempt: 0,
    error: null,
  });
  const accountSummaryChainId = configuredBscChain();
  const accountSummaryIdentity = address && sessionReady
    ? `${address}:${accountSummaryChainId ?? ''}`
    : null;
  const [accountSummaryRequestedFor, setAccountSummaryRequestedFor] = useState<string | null>(null);
  const accountSummaryRequested = accountSummaryIdentity !== null
    && accountSummaryRequestedFor === accountSummaryIdentity;
  const requestAccountSummary = useCallback(() => {
    if (accountSummaryIdentity) setAccountSummaryRequestedFor(accountSummaryIdentity);
  }, [accountSummaryIdentity]);

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

  useEffect(() => {
    if (online || !projectionExpectationRef.current) return;
    projectionAbortRef.current?.abort();
    setProjectionSync((current) => current.state === 'idle'
      ? current
      : { ...current, state: 'delayed', error: 'offline' });
  }, [online]);

  const projectionIdentity = `${address ?? ''}:${connectedAddressNormalized ?? ''}:${chainId ?? ''}:${sessionReady ? 'ready' : 'unready'}`;

  useEffect(() => {
    if (projectionIdentityRef.current === null) {
      projectionIdentityRef.current = projectionIdentity;
      return;
    }
    if (projectionIdentityRef.current === projectionIdentity) return;
    projectionIdentityRef.current = projectionIdentity;
    projectionAbortRef.current?.abort();
    projectionAbortRef.current = null;
    projectionExpectationRef.current = null;
    setProjectionSync({
      state: 'idle',
      wallet: null,
      chainId: null,
      expectedStakedUkiRaw: null,
      attempt: 0,
      error: null,
    });
  }, [chainId, connectedAddressNormalized, projectionIdentity, queryClient, sessionReady]);

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

  const accountSummaryEndpoint = appRuntimeEndpoint('account-summary', address);
  const accountSummaryQuery = useQuery<AccountSummary>({
    queryKey: [
      ...appRuntimeQueryKey('account-summary', address, accountSummaryChainId),
      accountSummaryEndpoint,
      '',
    ],
    queryFn: async ({ signal }) => {
      if (!address) throw new Error('ACCOUNT_SUMMARY_WALLET_REQUIRED');
      const { response, body } = await fetchRuntime<{ status?: string; data?: unknown }>(accountSummaryEndpoint, signal);
      if (
        !response.ok
        || body.status !== 'ok'
        || !isAccountSummaryPayload(body.data)
        || body.data.walletNormalized.toLowerCase() !== address
        || !payloadMatchesIdentity('account-summary', body.data, address, accountSummaryChainId ?? 0)
      ) {
        throw new Error('ACCOUNT_SUMMARY_UNAVAILABLE');
      }
      return body.data;
    },
    enabled: accountSummaryRequested && !authLoading && online,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: (failureCount: number) => failureCount < 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
    refetchInterval: false,
  });

  useEffect(() => {
    void queryClient.removeQueries({
      predicate: ({ queryKey }: { queryKey: readonly unknown[] }) => (
        isRuntimeResourceQuery(queryKey)
        && queryKey[4] === 'account-summary'
        && (queryKey[2] !== address || queryKey[3] !== accountSummaryChainId)
      ),
    });
  }, [accountSummaryChainId, address, queryClient]);

  useEffect(() => {
    if (address && sessionReady && runtimeRouteActive) return;
    const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (!isRuntimeResourceQuery(queryKey)) return false;
      // The account menu stays mounted on public routes. Preserve its scoped
      // summary while the authenticated EVM identity remains unchanged.
      return queryKey[4] !== 'account-summary' || !address || !sessionReady;
    };
    void queryClient.cancelQueries({ predicate });
    void queryClient.removeQueries({ predicate });
    if (!address || !sessionReady) {
      void queryClient.removeQueries({
        predicate: ({ queryKey }: { queryKey: readonly unknown[] }) => (
          isRuntimeResourceQuery(queryKey) && queryKey[4] === 'account-summary'
        ),
      });
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
      if (requestWallet === FALLBACK_COORDINATOR.requestWallet) {
        await switchChainAsync({ chainId: targetChainId });
      } else {
        await requestWallet({
          kind: 'evm',
          targetChainId,
          reason: 'Cambia la wallet a la red configurada para continuar.',
        });
      }
      return true;
    } catch {
      return false;
    }
  }, [chainId, expectedChainId, requestWallet, switchChainAsync]);

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

  const fetchCanonicalResource = useCallback(async (
    resource: AppRuntimeResource,
    wallet: string,
    targetChainId: number | null,
    syncSignal: AbortSignal,
    payloadChainId = targetChainId ?? configuredBscChain() ?? 0,
  ) => {
    const canonical = canonicalResource(resource);
    const endpoint = appRuntimeEndpoint(canonical, wallet);
    const queryKey = [...appRuntimeQueryKey(canonical, wallet, targetChainId), endpoint, ''] as const;
    return queryClient.fetchQuery({
      queryKey,
      queryFn: async ({ signal }) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        syncSignal.addEventListener('abort', abort, { once: true });
        try {
          const { response, body } = await fetchRuntime<{ status?: string; data?: unknown }>(endpoint, controller.signal);
          if (!response.ok || (body.status !== undefined && body.status !== 'ok') || body.data === undefined || !payloadMatchesIdentity(canonical, body.data, wallet, payloadChainId)) {
            throw new Error(`${canonical.toUpperCase()}_UNAVAILABLE`);
          }
          return body.data;
        } finally {
          signal.removeEventListener('abort', abort);
          syncSignal.removeEventListener('abort', abort);
        }
      },
      staleTime: 0,
      retry: false,
    });
  }, [queryClient]);

  const coordinateProjectionSync = useCallback(async () => {
    if (projectionRunRef.current) return projectionRunRef.current;
    const expectation = projectionExpectationRef.current;
    if (!expectation || !address || !sessionReady || address !== expectation.wallet || !runtimeRouteActive) return;
    const controller = new AbortController();
    projectionAbortRef.current?.abort();
    projectionAbortRef.current = controller;
    const run = (async () => {
      let lastError: AppRuntimeProjectionSync['error'] = null;
      const startedAt = Date.now();
      let deadlineReached = false;
      const deadlineTimer = window.setTimeout(() => {
        deadlineReached = true;
        controller.abort();
      }, PROJECTION_SYNC_DEADLINE_MS);
      try {
        for (let attempt = 1; attempt <= PROJECTION_SYNC_BACKOFF_MS.length + 1; attempt += 1) {
          if (projectionExpectationRef.current !== expectation) return;
          if (controller.signal.aborted && !deadlineReached) return;
          if (Date.now() - startedAt >= PROJECTION_SYNC_DEADLINE_MS) {
            deadlineReached = true;
            lastError = 'not_converged';
            break;
          }
          if (!online) {
            lastError = 'offline';
            break;
          }
          setProjectionSync((current) => current.wallet === expectation.wallet
            ? { ...current, state: 'syncing', attempt, error: null }
            : current);
          try {
            const [masterResult, creditsResult] = await Promise.allSettled([
              fetchCanonicalResource('master', expectation.wallet, expectation.chainId, controller.signal),
              fetchCanonicalResource('credits', expectation.wallet, expectation.chainId, controller.signal),
              // Dashboard is refreshed with the group, but an unavailable or
              // partial module must not mask fundamental Master+Credits proof.
              fetchCanonicalResource('dashboard', expectation.wallet, null, controller.signal, expectation.chainId),
            ]).then(([master, credits]) => [master, credits] as const);
            if (projectionExpectationRef.current !== expectation || (controller.signal.aborted && !deadlineReached)) return;
            if (masterResult.status !== 'fulfilled' || creditsResult.status !== 'fulfilled') {
              throw new Error('PROJECTION_RESOURCE_UNAVAILABLE');
            }
            if (appRuntimeProjectionMatches(masterResult.value, creditsResult.value, expectation.stakedUkiRaw)) {
              projectionExpectationRef.current = null;
              setProjectionSync({
                state: 'idle',
                wallet: null,
                chainId: null,
                expectedStakedUkiRaw: null,
                attempt,
                error: null,
              });
              return;
            }
            lastError = 'not_converged';
          } catch {
            if (controller.signal.aborted && !deadlineReached || projectionExpectationRef.current !== expectation) return;
            lastError = 'request_failed';
          }
          if (deadlineReached) break;
          if (attempt <= PROJECTION_SYNC_BACKOFF_MS.length) {
            const shouldContinue = await waitForProjectionRetry(PROJECTION_SYNC_BACKOFF_MS[attempt - 1], controller.signal);
            if (!shouldContinue && !deadlineReached) return;
          }
        }
      } finally {
        window.clearTimeout(deadlineTimer);
      }
      if (projectionExpectationRef.current !== expectation || (controller.signal.aborted && !deadlineReached)) return;
      setProjectionSync((current) => current.wallet === expectation.wallet
        ? { ...current, state: 'delayed', attempt: PROJECTION_SYNC_BACKOFF_MS.length + 1, error: lastError ?? 'not_converged' }
        : current);
    })();
    const runPromise = run.finally(() => {
      if (projectionRunRef.current === runPromise) projectionRunRef.current = null;
      if (projectionAbortRef.current === controller) projectionAbortRef.current = null;
    });
    projectionRunRef.current = runPromise;
    return runPromise;
  }, [address, fetchCanonicalResource, online, runtimeRouteActive, sessionReady]);

  const registerStakingExpectation = useCallback((expectation: AppRuntimeStakingExpectation) => {
    const currentAddress = currentAddressRef.current;
    const currentConnectedAddress = currentConnectedAddressRef.current;
    const currentChainId = currentChainIdRef.current;
    if (!currentAddress
      || !currentSessionReadyRef.current
      || !currentConnectedAddress
      || currentConnectedAddress !== currentAddress
      || expectation.wallet.toLowerCase() !== currentAddress
      || currentChainId !== expectation.chainId
      || !canonicalRaw(expectation.stakedUkiRaw)) return;
    projectionAbortRef.current?.abort();
    projectionRunRef.current = null;
    const nextExpectation = {
      wallet: currentAddress,
      chainId: expectation.chainId,
      stakedUkiRaw: expectation.stakedUkiRaw,
    } satisfies AppRuntimeStakingExpectation;
    projectionExpectationRef.current = nextExpectation;
    setProjectionSync({
      state: 'syncing',
      wallet: nextExpectation.wallet,
      chainId: nextExpectation.chainId,
      expectedStakedUkiRaw: nextExpectation.stakedUkiRaw,
      attempt: 0,
      error: null,
    });
  }, []);

  const refresh = useCallback(() => runRefresh(), [runRefresh]);
  const invalidate = useCallback((resource?: AppRuntimeResource) => {
    const resources = resource ? new Set([canonicalResource(resource)]) : undefined;
    return runRefresh(resources, true);
  }, [runRefresh]);

  const refreshAfterTransaction = useCallback(async (resource?: AppRuntimeResource) => {
    const resourceRefresh = runRefresh(transactionResources(resource), true, true);
    if (projectionExpectationRef.current) {
      await Promise.allSettled([coordinateProjectionSync(), resourceRefresh]);
      return;
    }
    await resourceRefresh;
  }, [coordinateProjectionSync, runRefresh]);

  useEffect(() => {
    if (!projectionExpectationRef.current || projectionSync.state === 'idle' || !runtimeRouteActive) return;
    const timer = window.setInterval(() => { void coordinateProjectionSync(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [coordinateProjectionSync, projectionSync.state, runtimeRouteActive]);

  useEffect(() => {
    if (runtimeRouteActive) return;
    projectionAbortRef.current?.abort();
  }, [runtimeRouteActive]);

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
    accountSummary: {
      data: accountSummaryRequested && !authLoading && online ? accountSummaryQuery.data : undefined,
      state: !accountSummaryRequested || !address || !sessionReady || authLoading
        ? 'idle'
        : accountSummaryQuery.isPending
          ? 'loading'
          : accountSummaryQuery.isError || accountSummaryQuery.isRefetchError || Boolean(accountSummaryQuery.error)
            ? accountSummaryQuery.data ? 'stale' : 'unavailable'
            : accountSummaryQuery.data ? 'ready' : 'idle',
      error: accountSummaryQuery.error instanceof Error ? accountSummaryQuery.error : null,
      refresh: accountSummaryQuery.refetch,
    },
    requestAccountSummary,
    projectionSync,
    registerStakingExpectation,
    refresh,
    refreshAfterTransaction,
    invalidate,
    expectedChainId,
    readiness,
    switchTo,
    queryKey: (resource, wallet = address, targetChainId = expectedChainId('dashboard')) => appRuntimeQueryKey(resource, wallet?.toLowerCase() ?? null, targetChainId ?? null),
  }), [accountSummaryQuery.data, accountSummaryQuery.error, accountSummaryQuery.isError, accountSummaryQuery.isPending, accountSummaryQuery.isRefetchError, accountSummaryQuery.refetch, accountSummaryRequested, address, authLoading, chainId, connectedAddress, expectedChainId, invalidate, isConnected, online, projectionSync, readiness, refresh, refreshAfterTransaction, registerStakingExpectation, requestAccountSummary, runtimeQuery.data, runtimeQuery.error, runtimeQuery.isError, runtimeQuery.isFetching, runtimeQuery.isPending, runtimeQuery.isRefetchError, runtimeRouteActive, sessionReady, switchTo, user, walletType]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useAppRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error('useAppRuntime must be used within AppRuntimeProvider');
  return context;
}

export function useOptionalAppRuntime() {
  return useContext(RuntimeContext);
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
