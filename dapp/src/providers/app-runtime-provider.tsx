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
import { notifyManager, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
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
import {
  masterProjectionMatchesPendingOperation,
} from '@/lib/nft-vault/pending-reconciliation';
import {
  canonicalNftVaultAssetId,
  pendingNftVaultOperationAssetKey,
  type NftVaultPendingOperation,
} from '@/lib/nft-vault/pending-operations';

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

export type AppRuntimeNftExpectation = Pick<
  NftVaultPendingOperation,
  | 'version'
  | 'chainId'
  | 'walletAddress'
  | 'vaultAddress'
  | 'assetId'
  | 'collectionAddress'
  | 'tokenId'
  | 'depositEpoch'
  | 'action'
  | 'phase'
  | 'txHash'
  | 'createdAt'
  | 'updatedAt'
>;

export type AppRuntimeProjectionSync = {
  state: 'idle' | 'syncing' | 'delayed';
  wallet: string | null;
  chainId: number | null;
  expectedStakedUkiRaw: string | null;
  attempt: number;
  error: 'offline' | 'request_failed' | 'not_converged' | null;
};

const MAX_NFT_PROJECTION_EXPECTATIONS = 16;

class ProjectionReadSupersededError extends Error {
  constructor() {
    super('PROJECTION_READ_SUPERSEDED');
    this.name = 'ProjectionReadSupersededError';
  }
}

function isProjectionReadSupersededError(error: unknown): error is ProjectionReadSupersededError {
  return error instanceof ProjectionReadSupersededError;
}

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
  projectionGeneration: number;
  projectionIdentity: string;
  isProjectionReadCurrent: (wallet: string, chainId: number | undefined, generation: number, identity?: string) => boolean;
  registerNftExpectation: (expectation: AppRuntimeNftExpectation) => void;
  unregisterNftExpectation: (expectation: AppRuntimeNftExpectation) => void;
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
const ACCOUNT_SUMMARY_STALE_TIME = 15_000;

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

function nftExpectationKey(expectation: Pick<AppRuntimeNftExpectation, 'chainId' | 'walletAddress' | 'vaultAddress' | 'assetId' | 'collectionAddress' | 'tokenId' | 'action' | 'txHash'>) {
  return [
    expectation.chainId,
    expectation.walletAddress.toLowerCase(),
    expectation.vaultAddress.toLowerCase(),
    pendingNftVaultOperationAssetKey(expectation),
    expectation.collectionAddress.toLowerCase(),
    expectation.tokenId,
    expectation.action,
    expectation.txHash.toLowerCase(),
  ].join(':');
}

function nftExpectationAssetKey(expectation: Pick<AppRuntimeNftExpectation, 'chainId' | 'walletAddress' | 'vaultAddress' | 'assetId' | 'collectionAddress' | 'tokenId'>) {
  return [
    expectation.chainId,
    expectation.walletAddress.toLowerCase(),
    expectation.vaultAddress.toLowerCase(),
    pendingNftVaultOperationAssetKey(expectation),
    expectation.collectionAddress.toLowerCase(),
    expectation.tokenId,
  ].join(':');
}

function nftExpectationsEqual(
  left: AppRuntimeNftExpectation | null,
  right: AppRuntimeNftExpectation,
  wallet: string,
) {
  return Boolean(
    left
    && left.walletAddress.toLowerCase() === wallet
    && left.chainId === right.chainId
    && left.vaultAddress.toLowerCase() === right.vaultAddress.toLowerCase()
    && left.assetId === right.assetId
    && left.collectionAddress.toLowerCase() === right.collectionAddress.toLowerCase()
    && left.tokenId === right.tokenId
    && left.depositEpoch === right.depositEpoch
    && left.action === right.action
    && left.phase === right.phase
    && left.txHash.toLowerCase() === right.txHash.toLowerCase(),
  );
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
  expectedStakedUkiRaw?: string,
) {
  if (!isRecord(master) || !isRecord(credits)) return false;
  const routes = master.routes;
  if (!isRecord(routes) || !isRecord(routes.uki) || !isRecord(routes.nft)) return false;
  const uki = routes.uki;
  const ukiSource = isRecord(uki.source) ? uki.source : null;
  if (!ukiSource || ukiSource.complete !== true) return false;
  if (expectedStakedUkiRaw !== undefined && ukiSource.stakedUkiRaw !== expectedStakedUkiRaw) return false;
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

export function appRuntimeReadbackMatches(master: unknown, credits: unknown) {
  return projectionMatches(master, credits);
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
  const projectionIdentity = `${address ?? ''}:${connectedAddressNormalized ?? ''}:${chainId ?? ''}:${sessionReady ? 'ready' : 'unready'}`;
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const projectionExpectationRef = useRef<AppRuntimeStakingExpectation | null>(null);
  const nftExpectationsRef = useRef(new Map<string, AppRuntimeNftExpectation>());
  const projectionAbortRef = useRef<AbortController | null>(null);
  const projectionRunRef = useRef<Promise<void> | null>(null);
  const projectionIdentityRef = useRef<string | null>(null);
  const currentProjectionIdentityRef = useRef(projectionIdentity);
  const projectionGenerationRef = useRef(0);
  const projectionIdentityTransitionRef = useRef<{ identity: string; previousGeneration: number } | null>(null);
  const currentAddressRef = useRef(address);
  const currentConnectedAddressRef = useRef(connectedAddressNormalized);
  const currentChainIdRef = useRef(chainId);
  const currentSessionReadyRef = useRef(sessionReady);
  currentAddressRef.current = address;
  currentConnectedAddressRef.current = connectedAddressNormalized;
  currentChainIdRef.current = chainId;
  currentSessionReadyRef.current = sessionReady;
  currentProjectionIdentityRef.current = projectionIdentity;
  const isProjectionReadCurrent = useCallback((wallet: string, readChainId: number | undefined, generation: number, readIdentity?: string) => {
    const normalizedWallet = wallet.toLowerCase();
    const identityMatches = readIdentity === undefined || readIdentity === currentProjectionIdentityRef.current;
    const generationMatches = projectionGenerationRef.current === generation
      || Boolean(
        readIdentity
        && readIdentity === currentProjectionIdentityRef.current
        && projectionIdentityTransitionRef.current?.identity === readIdentity
        && projectionIdentityTransitionRef.current.previousGeneration === generation,
      );
    return identityMatches
      && generationMatches
      && currentAddressRef.current === normalizedWallet
      && currentConnectedAddressRef.current === normalizedWallet
      && currentSessionReadyRef.current
      && (readChainId === undefined || currentChainIdRef.current === readChainId);
  }, []);
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
  const accountSummaryEndpoint = appRuntimeEndpoint('account-summary', address);
  const accountSummaryQueryKey = useMemo(
    () => [
      ...appRuntimeQueryKey('account-summary', address, accountSummaryChainId),
      accountSummaryEndpoint,
      '',
    ] as const,
    [accountSummaryChainId, accountSummaryEndpoint, address],
  );
  const requestAccountSummary = useCallback(() => {
    if (!accountSummaryIdentity) return;

    // The menu stays mounted across routes, so opening it again does not
    // remount the query. Revalidate only this wallet/chain key when its
    // cached result is stale, invalidated, or errored; the first request is
    // enabled by the state transition below and is therefore fetched once.
    if (accountSummaryRequested) {
      const queryState = queryClient.getQueryState(accountSummaryQueryKey);
      const isFetching = queryState?.fetchStatus === 'fetching';
      const hasExpired = Boolean(
        queryState
        && queryState.dataUpdatedAt > 0
        && Date.now() - queryState.dataUpdatedAt >= ACCOUNT_SUMMARY_STALE_TIME,
      );
      const needsRefresh = Boolean(
        queryState
        && !isFetching
        && (
          queryState.isInvalidated
          || queryState.status === 'error'
          || Boolean(queryState.error)
          || hasExpired
        ),
      );
      if (needsRefresh) {
        void queryClient.invalidateQueries({
          queryKey: accountSummaryQueryKey,
          exact: true,
          refetchType: 'active',
        });
      }
    }

    setAccountSummaryRequestedFor((current) => (
      current === accountSummaryIdentity ? current : accountSummaryIdentity
    ));
  }, [accountSummaryIdentity, accountSummaryQueryKey, accountSummaryRequested, queryClient]);

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
    if (online || (!projectionExpectationRef.current && nftExpectationsRef.current.size === 0)) return;
    projectionAbortRef.current?.abort();
    setProjectionSync((current) => current.state === 'idle'
      ? current
      : { ...current, state: 'delayed', error: 'offline' });
  }, [online]);

  useEffect(() => {
    if (projectionIdentityRef.current === null) {
      projectionIdentityRef.current = projectionIdentity;
      return;
    }
    if (projectionIdentityRef.current === projectionIdentity) return;
    projectionIdentityRef.current = projectionIdentity;
    const previousGeneration = projectionGenerationRef.current;
    projectionGenerationRef.current += 1;
    projectionIdentityTransitionRef.current = { identity: projectionIdentity, previousGeneration };
    projectionAbortRef.current?.abort();
    projectionAbortRef.current = null;
    projectionExpectationRef.current = null;
    nftExpectationsRef.current.clear();
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

  const accountSummaryQuery = useQuery<AccountSummary>({
    queryKey: accountSummaryQueryKey,
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
    staleTime: ACCOUNT_SUMMARY_STALE_TIME,
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
    if (!address || !sessionReady) return;

    const requestedResources = resources;
    const refreshIdentity = {
      address,
      connectedAddress: connectedAddressNormalized,
      chainId,
      sessionReady,
    };
    const isRefreshCurrent = () => currentAddressRef.current === refreshIdentity.address
      && currentConnectedAddressRef.current === refreshIdentity.connectedAddress
      && currentChainIdRef.current === refreshIdentity.chainId
      && currentSessionReadyRef.current === refreshIdentity.sessionReady;
    const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (!isRuntimeResourceQuery(queryKey) || queryKey[2] !== address) return false;
      if (isRuntimeStatusQuery(queryKey)) return true;
      return !requestedResources || requestedResources.has(String(queryKey[4]));
    };
    const queries = queryClient.getQueryCache().findAll({ predicate });
    await Promise.all(queries.map(async (query) => {
      if (!isRefreshCurrent()) return;
      if (waitForInFlight && query.state.fetchStatus === 'fetching') {
        await Promise.allSettled([query.promise]);
      }
      if (!isRefreshCurrent()) return;
      if (shouldInvalidate) {
        await queryClient.invalidateQueries({
          queryKey: query.queryKey,
          exact: true,
          refetchType: 'none',
        });
      }
      if (!isRefreshCurrent()) return;
      await queryClient.refetchQueries(
        { queryKey: query.queryKey, exact: true, type: 'active' },
        { cancelRefetch: false },
      );
    }));
  }, [address, chainId, connectedAddressNormalized, queryClient, sessionReady]);

  const fetchCanonicalResource = useCallback(async (
    resource: AppRuntimeResource,
    wallet: string,
    targetChainId: number | null,
    syncSignal: AbortSignal,
    payloadChainId = targetChainId ?? configuredBscChain() ?? 0,
    options: { publish?: boolean; generation?: number } = {},
  ) => {
    const canonical = canonicalResource(resource);
    const endpoint = appRuntimeEndpoint(canonical, wallet);
    const queryKey = [...appRuntimeQueryKey(canonical, wallet, targetChainId), endpoint, ''] as const;
    const fetchData = async (signal: AbortSignal) => {
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
    };
    if (options.publish !== false) {
      return queryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => fetchData(signal),
        staleTime: 0,
        retry: false,
      });
    }
    if (options.generation !== undefined && projectionGenerationRef.current !== options.generation) {
      throw new Error('PROJECTION_READBACK_SUPERSEDED');
    }
    return fetchData(syncSignal);
  }, [queryClient]);

  const coordinateProjectionSync = useCallback(async (requestedGeneration = projectionGenerationRef.current) => {
    if (projectionRunRef.current) return projectionRunRef.current;
    const stakingExpectation = projectionExpectationRef.current;
    const nftExpectations = [...nftExpectationsRef.current.values()];
    const expectationWallet = stakingExpectation?.wallet ?? nftExpectations[0]?.walletAddress.toLowerCase();
    const expectationChainId = stakingExpectation?.chainId ?? nftExpectations[0]?.chainId;
    const nftExpectationsCurrent = () => (
      nftExpectations.length === nftExpectationsRef.current.size
      && nftExpectations.every((expectation) => (
        nftExpectationsRef.current.get(nftExpectationKey(expectation)) === expectation
      ))
    );
    if (
      (!stakingExpectation && nftExpectations.length === 0)
      || !expectationWallet
      || expectationChainId === undefined
      || !address
      || !sessionReady
      || address !== expectationWallet
      || !runtimeRouteActive
      || requestedGeneration !== projectionGenerationRef.current
    ) return;
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
          if (requestedGeneration !== projectionGenerationRef.current) return;
          if (
            projectionExpectationRef.current !== stakingExpectation
            || !nftExpectationsCurrent()
          ) return;
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
          setProjectionSync((current) => current.wallet === expectationWallet
            ? {
              ...current,
              state: 'syncing',
              attempt,
              error: null,
              expectedStakedUkiRaw: stakingExpectation?.stakedUkiRaw ?? null,
            }
            : current);
          try {
            const [masterResult, creditsResult, dashboardResult] = await Promise.allSettled([
              fetchCanonicalResource(
                'master',
                expectationWallet,
                expectationChainId,
                controller.signal,
                expectationChainId,
                { publish: false, generation: requestedGeneration },
              ),
              fetchCanonicalResource(
                'credits',
                expectationWallet,
                expectationChainId,
                controller.signal,
                expectationChainId,
                { publish: false, generation: requestedGeneration },
              ),
              // Dashboard is part of the transaction readback group, but it
              // must not prevent the Master+Credits proof from committing.
              fetchCanonicalResource(
                'dashboard',
                expectationWallet,
                null,
                controller.signal,
                expectationChainId,
                { publish: false, generation: requestedGeneration },
              ),
            ]);
            if (
              requestedGeneration !== projectionGenerationRef.current
              || projectionExpectationRef.current !== stakingExpectation
              || !nftExpectationsCurrent()
              || (controller.signal.aborted && !deadlineReached)
            ) return;
            if (masterResult.status !== 'fulfilled' || creditsResult.status !== 'fulfilled') {
              throw new Error('PROJECTION_RESOURCE_UNAVAILABLE');
            }
            const slotsMatch = stakingExpectation
              ? appRuntimeProjectionMatches(masterResult.value, creditsResult.value, stakingExpectation.stakedUkiRaw)
              : appRuntimeReadbackMatches(masterResult.value, creditsResult.value);
            const nftMatch = nftExpectations.every((expectation) => (
              masterProjectionMatchesPendingOperation(expectation, masterResult.value)
            ));
            if (slotsMatch && nftMatch) {
              const masterQueryKey = [
                ...appRuntimeQueryKey('master', expectationWallet, expectationChainId),
                appRuntimeEndpoint('master', expectationWallet),
                '',
              ] as const;
              const creditsQueryKey = [
                ...appRuntimeQueryKey('credits', expectationWallet, expectationChainId),
                appRuntimeEndpoint('credits', expectationWallet),
                '',
              ] as const;
              const dashboardQueryKey = [
                ...appRuntimeQueryKey('dashboard', expectationWallet, null),
                appRuntimeEndpoint('dashboard', expectationWallet),
                '',
              ] as const;
              notifyManager.batch(() => {
                queryClient.setQueryData(masterQueryKey, masterResult.value);
                queryClient.setQueryData(creditsQueryKey, creditsResult.value);
                if (dashboardResult.status === 'fulfilled') {
                  queryClient.setQueryData(dashboardQueryKey, dashboardResult.value);
                }
              });
              if (projectionExpectationRef.current === stakingExpectation) projectionExpectationRef.current = null;
              for (const expectation of nftExpectations) {
                const key = nftExpectationKey(expectation);
                if (nftExpectationsRef.current.get(key) === expectation) nftExpectationsRef.current.delete(key);
              }
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
            if (
              (controller.signal.aborted && !deadlineReached)
              || requestedGeneration !== projectionGenerationRef.current
              || projectionExpectationRef.current !== stakingExpectation
              || !nftExpectationsCurrent()
            ) return;
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
      if (
        requestedGeneration !== projectionGenerationRef.current
        || projectionExpectationRef.current !== stakingExpectation
        || !nftExpectationsCurrent()
        || (controller.signal.aborted && !deadlineReached)
      ) return;
      setProjectionSync((current) => current.wallet === expectationWallet
        ? { ...current, state: 'delayed', attempt: PROJECTION_SYNC_BACKOFF_MS.length + 1, error: lastError ?? 'not_converged' }
        : current);
    })();
    const runPromise = run.finally(() => {
      if (projectionRunRef.current === runPromise) projectionRunRef.current = null;
      if (projectionAbortRef.current === controller) projectionAbortRef.current = null;
    });
    projectionRunRef.current = runPromise;
    return runPromise;
  }, [address, fetchCanonicalResource, online, queryClient, runtimeRouteActive, sessionReady]);

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
    projectionGenerationRef.current += 1;
    projectionIdentityTransitionRef.current = null;
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

  const registerNftExpectation = useCallback((expectation: AppRuntimeNftExpectation) => {
    const currentAddress = currentAddressRef.current;
    const currentConnectedAddress = currentConnectedAddressRef.current;
    const currentChainId = currentChainIdRef.current;
    if (!currentAddress
      || !currentSessionReadyRef.current
      || !currentConnectedAddress
      || currentConnectedAddress !== currentAddress
      || expectation.walletAddress.toLowerCase() !== currentAddress
      || currentChainId !== expectation.chainId
      || expectation.phase !== 'syncing_projection'
      || !/^0x[0-9a-f]{64}$/i.test(expectation.txHash)
      || !canonicalNftVaultAssetId(expectation)
      || (expectation.depositEpoch !== undefined && !canonicalRaw(expectation.depositEpoch))) return;
    const normalizedExpectation = {
      ...expectation,
      walletAddress: currentAddress,
    } satisfies AppRuntimeNftExpectation;
    const expectationKey = nftExpectationKey(normalizedExpectation);
    if (nftExpectationsEqual(
      nftExpectationsRef.current.get(expectationKey) ?? null,
      normalizedExpectation,
      currentAddress,
    )) return;
    const expectationAssetKey = nftExpectationAssetKey(normalizedExpectation);
    for (const [key, current] of nftExpectationsRef.current) {
      if (nftExpectationAssetKey(current) === expectationAssetKey && key !== expectationKey) {
        nftExpectationsRef.current.delete(key);
      }
    }
    projectionGenerationRef.current += 1;
    projectionIdentityTransitionRef.current = null;
    projectionAbortRef.current?.abort();
    projectionRunRef.current = null;
    nftExpectationsRef.current.set(expectationKey, normalizedExpectation);
    while (nftExpectationsRef.current.size > MAX_NFT_PROJECTION_EXPECTATIONS) {
      const oldestKey = nftExpectationsRef.current.keys().next().value;
      if (oldestKey === undefined) break;
      nftExpectationsRef.current.delete(oldestKey);
    }
    setProjectionSync({
      state: 'syncing',
      wallet: currentAddress,
      chainId: expectation.chainId,
      expectedStakedUkiRaw: projectionExpectationRef.current?.stakedUkiRaw ?? null,
      attempt: 0,
      error: null,
    });
  }, []);

  const unregisterNftExpectation = useCallback((expectation: AppRuntimeNftExpectation) => {
    const currentAddress = currentAddressRef.current;
    const currentConnectedAddress = currentConnectedAddressRef.current;
    const currentChainId = currentChainIdRef.current;
    if (!currentAddress
      || !currentSessionReadyRef.current
      || !currentConnectedAddress
      || currentConnectedAddress !== currentAddress
      || expectation.walletAddress.toLowerCase() !== currentAddress
      || currentChainId !== expectation.chainId) return;
    const normalizedExpectation = {
      ...expectation,
      walletAddress: currentAddress,
    } satisfies AppRuntimeNftExpectation;
    const expectationKey = nftExpectationKey(normalizedExpectation);
    if (!nftExpectationsRef.current.has(expectationKey)) return;
    projectionGenerationRef.current += 1;
    projectionIdentityTransitionRef.current = null;
    projectionAbortRef.current?.abort();
    projectionAbortRef.current = null;
    projectionRunRef.current = null;
    nftExpectationsRef.current.delete(expectationKey);
    if (projectionExpectationRef.current || nftExpectationsRef.current.size > 0) return;
    setProjectionSync({
      state: 'idle',
      wallet: null,
      chainId: null,
      expectedStakedUkiRaw: null,
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
    const requestedResources = transactionResources(resource);
    const canonical = resource ? canonicalResource(resource) : null;
    const projectionExpectationActive = Boolean(projectionExpectationRef.current || nftExpectationsRef.current.size > 0);
    const coordinatedReadback = projectionExpectationActive && (
      !resource || canonical === 'master' || canonical === 'credits'
    );
    if (!coordinatedReadback) {
      const backgroundResources = projectionExpectationActive
        ? new Set([...requestedResources].filter((item) => item !== 'master' && item !== 'credits'))
        : requestedResources;
      await runRefresh(backgroundResources, true, true);
      return;
    }

    const generation = ++projectionGenerationRef.current;
    projectionIdentityTransitionRef.current = null;
    projectionAbortRef.current?.abort();
    projectionRunRef.current = null;
    const currentAddress = currentAddressRef.current;
    const isPairQuery = ({ queryKey }: { queryKey: readonly unknown[] }) => (
      isRuntimeResourceQuery(queryKey)
      && queryKey[2] === currentAddress
      && (queryKey[4] === 'master' || queryKey[4] === 'credits')
    );
    // A query started before the receipt belongs to the previous generation.
    // Cancel/revert it immediately and mark it stale without waiting for its
    // transport promise; the live guard in useAppRuntimeResource handles RPCs
    // that ignore AbortSignal.
    void queryClient.cancelQueries({ predicate: isPairQuery });
    void queryClient.invalidateQueries({ predicate: isPairQuery, refetchType: 'none' });
    if (generation !== projectionGenerationRef.current) return;

    const backgroundResources = new Set([...requestedResources]
      .filter((item) => item !== 'master' && item !== 'credits'));
    const resourceRefresh = runRefresh(backgroundResources, true, true);
    await Promise.allSettled([coordinateProjectionSync(generation), resourceRefresh]);
  }, [coordinateProjectionSync, queryClient, runRefresh]);

  useEffect(() => {
    if ((!projectionExpectationRef.current && nftExpectationsRef.current.size === 0) || projectionSync.state === 'idle' || !runtimeRouteActive) return;
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

  useEffect(() => {
    const refreshAccountSummary = () => {
      // Transaction receipts stay authoritative in their caller. This is a
      // background cache refresh for the mounted account-summary only.
      void refreshAfterTransaction('account-summary');
    };
    const events = [
      'cukies:legacy-marketplace:refresh',
      'cukies:uki-marketplace:refresh',
      'cukies:rewards:refresh',
      'cukies:vesting:refresh',
    ] as const;
    events.forEach((event) => window.addEventListener(event, refreshAccountSummary));
    return () => {
      events.forEach((event) => window.removeEventListener(event, refreshAccountSummary));
    };
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
    projectionGeneration: projectionGenerationRef.current,
    projectionIdentity,
    isProjectionReadCurrent,
    registerNftExpectation,
    unregisterNftExpectation,
    registerStakingExpectation,
    refresh,
    refreshAfterTransaction,
    invalidate,
    expectedChainId,
    readiness,
    switchTo,
    queryKey: (resource, wallet = address, targetChainId = expectedChainId('dashboard')) => appRuntimeQueryKey(resource, wallet?.toLowerCase() ?? null, targetChainId ?? null),
  }), [accountSummaryQuery.data, accountSummaryQuery.error, accountSummaryQuery.isError, accountSummaryQuery.isPending, accountSummaryQuery.isRefetchError, accountSummaryQuery.refetch, accountSummaryRequested, address, authLoading, chainId, connectedAddress, expectedChainId, invalidate, isConnected, isProjectionReadCurrent, online, projectionIdentity, projectionSync, readiness, refresh, refreshAfterTransaction, registerNftExpectation, registerStakingExpectation, requestAccountSummary, runtimeQuery.data, runtimeQuery.error, runtimeQuery.isError, runtimeQuery.isFetching, runtimeQuery.isPending, runtimeQuery.isRefetchError, runtimeRouteActive, sessionReady, switchTo, unregisterNftExpectation, user, walletType]);

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
  const queryClient = useQueryClient();
  const wallet = options.walletAddress === undefined ? runtime.address : options.walletAddress?.toLowerCase() ?? null;
  const sessionWalletMatches = Boolean(wallet && runtime.sessionReady && runtime.address === wallet);
  const targetChainId = options.targetChainId === undefined
    ? sourceChainForResource(resource)
    : options.targetChainId;
  const endpoint = options.endpoint ?? appRuntimeEndpoint(resource, wallet);
  const resourceQueryKey = [...appRuntimeQueryKey(resource, wallet, targetChainId), endpoint, options.cacheKeySuffix ?? ''] as const;
  const requestGeneration = runtime.projectionGeneration;
  const requestChainId = runtime.chainId;
  const requestIdentity = runtime.projectionIdentity;
  const queryOptions = {
    queryKey: resourceQueryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const { response, body } = await fetchRuntime<{ status?: string; data?: T }>(endpoint, signal);
      if (!response.ok || (body.status !== undefined && body.status !== 'ok') || body.data === undefined || (options.validate && !options.validate(body.data))) {
        throw new Error(`${resource.toUpperCase()}_UNAVAILABLE`);
      }
      const canonical = canonicalResource(resource);
      const pairResource = canonical === 'master' || canonical === 'credits';
      if (pairResource && (!wallet || !runtime.isProjectionReadCurrent(wallet, requestChainId, requestGeneration, requestIdentity))) {
        const previous = queryClient.getQueryData<T>(resourceQueryKey);
        if (previous !== undefined) return previous;
        throw new ProjectionReadSupersededError();
      }
      if (pairResource && runtime.projectionSync?.state !== 'idle') {
        const previous = queryClient.getQueryData<T>(resourceQueryKey);
        if (previous !== undefined) return previous;
        throw new ProjectionReadSupersededError();
      }
      return body.data;
    },
    enabled: runtime.runtimeRouteActive && sessionWalletMatches && !runtime.authLoading && runtime.online && options.enabled !== false,
    staleTime: options.staleTime ?? 15_000,
    retry: (failureCount: number, error: unknown) => !isProjectionReadSupersededError(error) && failureCount < 2,
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
