import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePathname } from 'next/navigation';
import {
  appRuntimeEndpoint,
  appRuntimeProjectionMatches,
  appRuntimeQueryKey,
  AppRuntimeProvider,
  type AppRuntimeNftExpectation,
  useAppRuntime,
  useAppRuntimeResource,
  useGuardedOperation,
} from '@/providers/app-runtime-provider';
import { useAuth } from '@/providers/auth-provider';
import { UKI_PRESALE_CHAIN_ID } from '@/components/landing/sale-config';

jest.mock('wagmi');
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/contracts/uki-nft-vaults', () => ({ ukiNftVaults: { chainId: 97 } }));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockFetch = global.fetch as jest.MockedFunction<typeof global.fetch>;

const user = { walletAddress: '0xaaa', username: 'alice' } as never;
const runtimeStatus = {
  status: 'ok',
  data: {
    checkedAt: '2026-09-09T00:00:00.000Z',
    services: {
      indexer: { status: 'ready', checkedAt: '2026-09-09T00:00:00.000Z', lastSuccessAt: null, code: null },
      master: { status: 'ready', checkedAt: '2026-09-09T00:00:00.000Z', lastSuccessAt: null, code: null },
      credits: { status: 'ready', checkedAt: '2026-09-09T00:00:00.000Z', lastSuccessAt: null, code: null },
    },
  },
};

function response(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response;
}

function Shell({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } }), []);
  return <QueryClientProvider client={client}><AppRuntimeProvider>{children}</AppRuntimeProvider></QueryClientProvider>;
}

function ResourceProbe({ resource = 'master' as const }: { resource?: 'master' | 'master-nft' }) {
  const query = useAppRuntimeResource<{ value: string }>(resource);
  return <span data-testid="resource">{query.data?.value ?? query.state}</span>;
}

function DualResourceProbe() {
  return <><ResourceProbe resource="master" /><ResourceProbe resource="master-nft" /></>;
}

function RefreshProbe() {
  const query = useAppRuntimeResource<{ value: string }>('master');
  return <><span data-testid="resource">{query.data?.value ?? 'empty'}</span><span data-testid="state">{query.state}</span><button onClick={() => void query.refresh()}>refresh</button></>;
}

function RuntimeRefreshProbe() {
  const runtime = useAppRuntime();
  const master = useAppRuntimeResource<{ value: string }>('master');
  const pool = useAppRuntimeResource<{ value: string }>('pool');
  return <><span data-testid="master-resource">{master.data?.value ?? master.state}</span><span data-testid="pool-resource">{pool.data?.value ?? pool.state}</span><button onClick={() => { void runtime.refreshAfterTransaction('pool'); void runtime.refreshAfterTransaction('master'); }}>refresh dependencies</button></>;
}

function SlowDependencyRefreshProbe() {
  const runtime = useAppRuntime();
  const master = useAppRuntimeResource<{ value: string }>('master');
  const dashboard = useAppRuntimeResource<{ value: string }>('dashboard');
  return <><span data-testid="slow-master">{master.data?.value ?? master.state}</span><span data-testid="slow-dashboard">{dashboard.data?.value ?? dashboard.state}</span><button onClick={() => void runtime.refreshAfterTransaction('master')}>refresh slow dependencies</button></>;
}

function InactiveCacheRefreshProbe() {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();
  const [result, setResult] = React.useState('idle');
  const cacheKey = React.useMemo(() => [
    ...appRuntimeQueryKey('master', '0xaaa', 97),
    appRuntimeEndpoint('master', '0xaaa'),
    '',
  ] as const, []);
  return <><span data-testid="inactive-result">{result}</span><button onClick={async () => {
    queryClient.setQueryData(cacheKey, { value: 'cached' });
    await runtime.refreshAfterTransaction('master');
    setResult(queryClient.getQueryState(cacheKey)?.isInvalidated ? 'invalidated' : 'not-invalidated');
  }}>refresh inactive cache</button></>;
}

function AccountSummaryRefreshProbe() {
  const runtime = useAppRuntime();
  const requested = React.useRef(false);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    runtime.requestAccountSummary();
  }, [runtime]);
  return <><span data-testid="account-refresh">{done ? 'done' : runtime.accountSummary.data?.uki?.balance ?? runtime.accountSummary.state}</span><button onClick={async () => { await runtime.refreshAfterTransaction('master'); setDone(true); }}>refresh account summary</button></>;
}

function ProjectionSyncProbe() {
  const runtime = useAppRuntime();
  const registered = React.useRef(false);
  React.useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    runtime.registerStakingExpectation({ wallet: '0xaaa', chainId: 97, stakedUkiRaw: '20000' });
    void runtime.refreshAfterTransaction('master');
  }, [runtime]);
  return <span data-testid="projection-state">{runtime.projectionSync.state}</span>;
}

function ProjectionControlProbe({ includePool = false }: { includePool?: boolean }) {
  const runtime = useAppRuntime();
  const pool = useAppRuntimeResource<{ value: string }>('pool', { enabled: includePool });
  const registered = React.useRef(false);
  React.useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    runtime.registerStakingExpectation({ wallet: '0xaaa', chainId: 97, stakedUkiRaw: '20000' });
    void runtime.refreshAfterTransaction('master');
  }, [runtime]);
  return <><span data-testid="projection-state">{runtime.projectionSync.state}</span><span data-testid="pool-state">{pool.state}</span><button onClick={() => void runtime.refreshAfterTransaction('pool')}>refresh pool</button><button onClick={() => void runtime.refreshAfterTransaction('master')}>retry projection</button></>;
}

function projectionPayloads(stakedUkiRaw: string, slotStatus: 'qualifying' | 'active' = 'active') {
  return {
    master: {
      walletNormalized: '0xaaa',
      routes: {
        uki: { source: { complete: true, stakedUkiRaw }, projectionFresh: true, slots: [{ route: 'uki', ordinal: 1, eligibilityEpoch: 2, status: slotStatus }] },
        nft: { source: { complete: true }, projectionFresh: true, slots: [] },
      },
    },
    credits: {
      walletNormalized: '0xaaa',
      configurations: [{ route: 'uki', ordinal: 1, eligibilityEpoch: 2, status: slotStatus }],
    },
    dashboard: {
      identity: { walletNormalized: '0xaaa' },
      network: { chainId: 97 },
    },
  };
}

const STAKED_25K_RAW = (BigInt(25_000) * BigInt(10) ** BigInt(18)).toString();
const STAKED_5K_RAW = (BigInt(5_000) * BigInt(10) ** BigInt(18)).toString();
const O2_WALLET = '0x0000000000000000000000000000000000000aaa';
const O2_CHAIN_ID = 56;
const NFT_COLLECTION = '0x00000000000000000000000000000000000000c1';
const NFT_COLLECTION_2 = '0x00000000000000000000000000000000000000c2';
const NFT_VAULT = '0x00000000000000000000000000000000000000b1';
const NFT_ASSET_ID = `${O2_CHAIN_ID}:${NFT_COLLECTION.toLowerCase()}:1`;
const NFT_ASSET_ID_2 = `${O2_CHAIN_ID}:${NFT_COLLECTION_2.toLowerCase()}:2`;
const NFT_TX_HASH = `0x${'1'.repeat(64)}` as `0x${string}`;
const NFT_TX_HASH_2 = `0x${'2'.repeat(64)}` as `0x${string}`;
const NFT_EXPECTATION = {
  version: 1,
  chainId: O2_CHAIN_ID,
  walletAddress: O2_WALLET,
  vaultAddress: NFT_VAULT,
  assetId: NFT_ASSET_ID,
  collectionAddress: NFT_COLLECTION,
  tokenId: '1',
  depositEpoch: '7',
  action: 'withdraw',
  phase: 'syncing_projection',
  txHash: NFT_TX_HASH,
  createdAt: 1,
  updatedAt: 1,
} satisfies AppRuntimeNftExpectation;
const NFT_EXPECTATION_2 = {
  ...NFT_EXPECTATION,
  assetId: NFT_ASSET_ID_2,
  collectionAddress: NFT_COLLECTION_2,
  tokenId: '2',
  txHash: NFT_TX_HASH_2,
} satisfies AppRuntimeNftExpectation;

function o2ReadbackPayload(input: {
  stakedUkiRaw: string;
  originalCukiePoints: number;
  desiredSlots: number;
  allocatedSlots: number;
  protectedSlots: number;
  slotStatus: 'active' | 'grace';
  nftInventoryMode: 'vault' | 'wallet' | 'none';
  includeSecondNft?: boolean;
}) {
  const nftSlots = Array.from({ length: input.allocatedSlots }, (_, index) => ({
    route: 'nft',
    ordinal: index + 1,
    eligibilityEpoch: 4,
    status: input.slotStatus,
  }));
  const slots = [
    {
      route: 'uki',
      ordinal: 1,
      eligibilityEpoch: 2,
      status: input.slotStatus,
    },
    ...nftSlots,
  ];
  const custody = input.nftInventoryMode === 'vault'
    ? 'cukie_master_nft_vault'
    : input.nftInventoryMode === 'wallet'
      ? 'wallet'
      : null;
  const nftInventory = custody
    ? [
      {
        assetId: NFT_ASSET_ID,
        collectionAddress: NFT_COLLECTION,
        tokenId: '1',
        custody,
        depositEpoch: '7',
      },
      ...(input.includeSecondNft ? [{
        assetId: NFT_ASSET_ID_2,
        collectionAddress: NFT_COLLECTION_2,
        tokenId: '2',
        custody,
        depositEpoch: '7',
      }] : []),
    ]
    : [];
  const master = {
    walletNormalized: O2_WALLET,
    chainId: O2_CHAIN_ID,
    nftCustody: {
      mode: 'custodial',
      chainId: O2_CHAIN_ID,
      vaultAddress: NFT_VAULT,
      collectionAddresses: [NFT_COLLECTION, ...(input.includeSecondNft ? [NFT_COLLECTION_2] : [])],
    },
    nftInventory,
    routes: {
      uki: {
        source: {
          complete: true,
          stakedUkiRaw: input.stakedUkiRaw,
        },
        projectionFresh: true,
        slots: [slots[0]],
      },
      nft: {
        source: {
          complete: true,
          originalCukiePoints: input.originalCukiePoints,
          desiredSlots: input.desiredSlots,
          allocatedSlots: input.allocatedSlots,
          protectedSlots: input.protectedSlots,
        },
        position: {
          status: input.slotStatus,
          desiredSlots: input.desiredSlots,
          allocatedSlots: input.allocatedSlots,
          protectedSlots: input.protectedSlots,
        },
        projectionFresh: true,
        slots: nftSlots,
      },
    },
  };
  return {
    master,
    credits: {
      walletNormalized: O2_WALLET,
      chainId: O2_CHAIN_ID,
      balance: {
        grantedCredits: 400,
        availableCredits: 240,
        reservedCredits: 160,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        materialization: 'ready',
      },
      configurations: slots.map((slot) => ({
        route: slot.route,
        ordinal: slot.ordinal,
        eligibilityEpoch: slot.eligibilityEpoch,
        status: slot.status,
      })),
    },
    dashboard: {
      identity: { walletNormalized: O2_WALLET },
      network: { chainId: O2_CHAIN_ID },
    },
  };
}

function TransactionRefreshProbe() {
  const runtime = useAppRuntime();
  const query = useAppRuntimeResource<{ value: string }>('master');
  const [completed, setCompleted] = React.useState(false);
  return <><span data-testid="transaction-resource">{query.data?.value ?? query.state}</span><span data-testid="transaction-refresh">{completed ? 'done' : 'idle'}</span><button onClick={async () => { await runtime.refreshAfterTransaction('master'); setCompleted(true); }}>refresh after transaction</button></>;
}

function O2ReadbackProbe() {
  const runtime = useAppRuntime();
  const master = useAppRuntimeResource<Record<string, unknown>>('master');
  const credits = useAppRuntimeResource<Record<string, unknown>>('credits');
  const masterRoutes = master.data?.routes as Record<string, unknown> | undefined;
  const nftRoute = masterRoutes?.nft as Record<string, unknown> | undefined;
  const nftSource = nftRoute?.source as Record<string, unknown> | undefined;
  const ukiRoute = masterRoutes?.uki as Record<string, unknown> | undefined;
  const ukiSource = ukiRoute?.source as Record<string, unknown> | undefined;
  const creditBalance = credits.data?.balance as Record<string, unknown> | undefined;
  const configurations = Array.isArray(credits.data?.configurations) ? credits.data.configurations : [];
  const graceCount = configurations.filter((configuration) => (
    Boolean(configuration)
    && typeof configuration === 'object'
    && (configuration as Record<string, unknown>).status === 'grace'
  )).length;
  return (
    <>
      <span data-testid="o2-staked">{String(ukiSource?.stakedUkiRaw ?? master.state)}</span>
      <span data-testid="o2-points">{String(nftSource?.originalCukiePoints ?? master.state)}</span>
      <span data-testid="o2-desired">{String(nftSource?.desiredSlots ?? master.state)}</span>
      <span data-testid="o2-granted">{String(creditBalance?.grantedCredits ?? credits.state)}</span>
      <span data-testid="o2-grace-count">{String(graceCount)}</span>
      <button type="button" onClick={() => {
        runtime.registerStakingExpectation({ wallet: O2_WALLET, chainId: O2_CHAIN_ID, stakedUkiRaw: STAKED_5K_RAW });
        void runtime.refreshAfterTransaction('master');
      }}>read UKI O2</button>
      <button type="button" onClick={() => {
        runtime.registerNftExpectation(NFT_EXPECTATION);
        runtime.registerNftExpectation(NFT_EXPECTATION_2);
        void runtime.refreshAfterTransaction('master-nft');
      }}>read NFT O2</button>
    </>
  );
}

function OnlyResourceProbe({ resource }: { resource: 'master' | 'credits' }) {
  const runtime = useAppRuntime();
  const query = useAppRuntimeResource<Record<string, unknown>>(resource);
  return (
    <>
      <span data-testid="only-resource">{query.data ? JSON.stringify(query.data) : query.state}</span>
      <button type="button" onClick={() => {
        runtime.registerStakingExpectation({ wallet: O2_WALLET, chainId: O2_CHAIN_ID, stakedUkiRaw: STAKED_5K_RAW });
        void runtime.refreshAfterTransaction(resource);
      }}>trigger {resource} readback</button>
    </>
  );
}

function ResourceKeyProbe() {
  const query = useAppRuntimeResource<{ value: string }>('credits');
  return <span data-testid="resource-key">{String(query.queryKey[3])}</span>;
}

function AccountSummaryProbe() {
  const runtime = useAppRuntime();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <span data-testid="account-summary-value">{runtime.accountSummary.data?.uki?.balance ?? runtime.accountSummary.state}</span>
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) runtime.requestAccountSummary();
        }}
      >
        toggle account menu
      </button>
    </>
  );
}

function accountSummaryPayload(walletAddress: string, balance: string) {
  const chainId = UKI_PRESALE_CHAIN_ID === 97 ? 97 : 56;
  return {
    walletNormalized: walletAddress.toLowerCase(),
    chainId,
    network: { chainId, label: 'BNB Smart Chain' },
    uki: { balance, balanceRaw: '0', decimals: 18, symbol: 'UKI', source: 'wallet' },
    credits: null,
    cukies: null,
  };
}

function ManualRefreshProbe() {
  const query = useAppRuntimeResource<{ value: string }>('credits', { enabled: false });
  const [result, setResult] = React.useState('idle');
  return <><span data-testid="manual-result">{result}</span><button onClick={async () => { const refreshed = await query.refresh(); setResult(refreshed.data?.value ?? 'missing'); }}>manual refresh</button></>;
}

function SwitchProbe({ onSign }: { onSign: () => void }) {
  const operation = useGuardedOperation('nft-write');
  const [result, setResult] = React.useState('idle');
  return <><span data-testid="readiness">{operation.reason}</span><button onClick={async () => { if (!operation.ready) { setResult(String(await operation.switchToTarget())); return; } onSign(); }}>execute</button><span data-testid="switch-result">{result}</span></>;
}

function configureWallet(address: string | undefined = '0xaaa', pathname = '/dashboard', chainId = 97) {
  mockUseAuth.mockReturnValue({ user: address ? user : null, walletType: address ? 'evm' : null, isLoading: false } as never);
  mockUseAccount.mockReturnValue({ address, isConnected: Boolean(address), chainId } as never);
  mockUsePathname.mockReturnValue(pathname);
  mockUseSwitchChain.mockReturnValue({ switchChainAsync: jest.fn() } as never);
}

describe('AppRuntimeProvider shared resource contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureWallet();
  });

  it('deduplicates master and master-nft through one canonical key', () => {
    expect(appRuntimeQueryKey('master', '0xABC', null)).toEqual(appRuntimeQueryKey('master-nft', '0xabc', null));
  });

  it('isolates each wallet and target chain in the cache key', () => {
    expect(appRuntimeQueryKey('credits', '0xabc', null)).not.toEqual(appRuntimeQueryKey('credits', '0xdef', null));
    expect(appRuntimeQueryKey('credits', '0xabc', 56)).not.toEqual(appRuntimeQueryKey('credits', '0xabc', 97));
  });

  it('only accepts a projection when Master and Credits have converged', () => {
    const old = projectionPayloads('10000', 'qualifying');
    const next = projectionPayloads('20000', 'active');
    expect(appRuntimeProjectionMatches(old.master, next.credits, '20000')).toBe(false);
    expect(appRuntimeProjectionMatches(next.master, next.credits, '20000')).toBe(true);
  });

  it('coordinates canonical Master, Credits and Dashboard reads through convergence', async () => {
    const old = projectionPayloads('10000', 'qualifying');
    const next = projectionPayloads('20000', 'active');
    const calls = { master: 0, credits: 0 };
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return response(runtimeStatus);
      if (url.includes('cukie-master')) return response({ status: 'ok', data: calls.master++ === 0 ? old.master : next.master });
      if (url.includes('/credits')) return response({ status: 'ok', data: calls.credits++ === 0 ? old.credits : next.credits });
      return response({ status: 'ok', data: next.dashboard });
    });
    render(<Shell><ProjectionSyncProbe /></Shell>);
    await waitFor(() => expect(calls.master).toBe(2), { timeout: 5_000 });
    await waitFor(() => expect(screen.getByTestId('projection-state')).toHaveTextContent('idle'));
    expect(calls.master).toBe(2);
    expect(calls.credits).toBe(2);
  });

  it('pauses an in-flight projection when the browser goes offline', async () => {
    let masterSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
      if (url.includes('cukie-master')) {
        masterSignal = init?.signal ?? undefined;
        return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
      }
      return Promise.resolve(response({ status: 'ok', data: projectionPayloads('20000').credits }));
    });
    render(<Shell><ProjectionControlProbe /></Shell>);
    await waitFor(() => expect(masterSignal).toBeDefined());
    act(() => window.dispatchEvent(new Event('offline')));
    await waitFor(() => expect(masterSignal?.aborted).toBe(true));
    expect(screen.getByTestId('projection-state')).toHaveTextContent('delayed');
    act(() => window.dispatchEvent(new Event('online')));
  });

  it('pauses projection reads on the public landing and resumes after returning', async () => {
    let masterCalls = 0;
    let masterSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
      if (url.includes('cukie-master')) {
        masterCalls += 1;
        if (masterCalls === 1) {
          masterSignal = init?.signal ?? undefined;
          return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
        }
        return Promise.resolve(response({ status: 'ok', data: projectionPayloads('20000').master }));
      }
      if (url.includes('/credits')) return Promise.resolve(response({ status: 'ok', data: projectionPayloads('20000').credits }));
      return Promise.resolve(response({ status: 'ok', data: projectionPayloads('20000').dashboard }));
    });
    const view = render(<Shell><ProjectionControlProbe /></Shell>);
    await waitFor(() => expect(masterSignal).toBeDefined());
    configureWallet('0xaaa', '/');
    view.rerender(<Shell><ProjectionControlProbe /></Shell>);
    await waitFor(() => expect(masterSignal?.aborted).toBe(true));
    configureWallet('0xaaa', '/dashboard');
    view.rerender(<Shell><ProjectionControlProbe /></Shell>);
    fireEvent.click(screen.getByText('retry projection'));
    await waitFor(() => expect(masterCalls).toBe(2));
  });

  it('keeps the requested Pool refresh while UKI projection sync is pending', async () => {
    const payloads = projectionPayloads('10000');
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return response(runtimeStatus);
      if (url.includes('cukie-master')) return response({ status: 'ok', data: payloads.master });
      if (url.includes('/credits')) return response({ status: 'ok', data: payloads.credits });
      if (url.includes('dashboard')) return response({ status: 'ok', data: payloads.dashboard });
      if (url.includes('cukie-pool')) return response({ status: 'ok', data: { value: 'pool' } });
      return response({ status: 'ok', data: { value: 'other' } });
    });
    render(<Shell><ProjectionControlProbe includePool /></Shell>);
    await waitFor(() => expect(screen.getByTestId('pool-state')).toHaveTextContent('ready'));
    mockFetch.mockClear();
    fireEvent.click(screen.getByText('refresh pool'));
    await waitFor(() => expect(mockFetch.mock.calls.some(([input]) => String(input).includes('cukie-pool'))).toBe(true));
  });

  it('keeps wallet query parameters explicit and leaves dashboard aggregated', () => {
    expect(appRuntimeEndpoint('master', '0xABC')).toContain('walletAddress=0xABC');
    expect(appRuntimeEndpoint('credits', null)).toBe('/api/economy/v1/credits');
    expect(appRuntimeEndpoint('dashboard', '0xABC')).toBe('/api/dashboard/v1/summary');
  });

  it('does not fetch private runtime status on the public landing with a persisted session', () => {
    configureWallet('0xaaa', '/');
    mockFetch.mockResolvedValue(response(runtimeStatus));
    render(<Shell><ResourceProbe /></Shell>);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows an explicit refresh for a manually enabled history variant', async () => {
    mockFetch.mockImplementation(async (input) => String(input).includes('runtime-status') ? response(runtimeStatus) : response({ status: 'ok', data: { value: 'manual' } }));
    render(<Shell><ManualRefreshProbe /></Shell>);
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('/api/economy/v1/credits'))).toHaveLength(0);
    fireEvent.click(screen.getByText('manual refresh'));
    await waitFor(() => expect(screen.getByTestId('manual-result')).toHaveTextContent('manual'));
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('/api/economy/v1/credits'))).toHaveLength(1);
  });

  it('keeps the source chain in resource keys when the wallet changes network', async () => {
    mockFetch.mockImplementation(async (input) => String(input).includes('runtime-status') ? response(runtimeStatus) : response({ status: 'ok', data: { value: 'credits' } }));
    const view = render(<Shell><ResourceKeyProbe /></Shell>);
    const sourceChain = await screen.findByTestId('resource-key');
    const initialKey = sourceChain.textContent;
    configureWallet('0xaaa', '/dashboard', 56);
    view.rerender(<Shell><ResourceKeyProbe /></Shell>);
    expect(screen.getByTestId('resource-key')).toHaveTextContent(initialKey ?? '');
  });

  it('shares one GET between two mounted consumers', async () => {
    mockFetch.mockImplementation(async (input) => String(input).includes('runtime-status') ? response(runtimeStatus) : response({ status: 'ok', data: { value: 'shared' } }));
    render(<Shell><DualResourceProbe /></Shell>);
    await waitFor(() => expect(screen.getAllByTestId('resource')[0]).toHaveTextContent('shared'));
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('cukie-master'))).toHaveLength(1);
  });

  it('revalida el resumen al reabrir el menú después de que expire su TTL', async () => {
    const startedAt = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(startedAt);
    let accountCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return response(runtimeStatus);
      if (url.includes('/api/account/v1/summary')) {
        accountCalls += 1;
        return response({ status: 'ok', data: accountSummaryPayload('0xaaa', String(accountCalls)) });
      }
      return response({ status: 'ok', data: { value: 'other' } });
    });

    try {
      render(<Shell><AccountSummaryProbe /></Shell>);
      fireEvent.click(screen.getByRole('button', { name: 'toggle account menu' }));
      await waitFor(() => expect(screen.getByTestId('account-summary-value')).toHaveTextContent('1'));
      expect(accountCalls).toBe(1);

      fireEvent.click(screen.getByRole('button', { name: 'toggle account menu' }));
      nowSpy.mockReturnValue(startedAt + 15_001);
      fireEvent.click(screen.getByRole('button', { name: 'toggle account menu' }));

      await waitFor(() => expect(accountCalls).toBe(2));
      await waitFor(() => expect(screen.getByTestId('account-summary-value')).toHaveTextContent('2'));
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('descarta el resumen anterior cuando cambia la identidad de la cuenta', async () => {
    let accountCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return response(runtimeStatus);
      if (url.includes('/api/account/v1/summary')) {
        accountCalls += 1;
        const wallet = url.includes('0xbbb') ? '0xbbb' : '0xaaa';
        return response({ status: 'ok', data: accountSummaryPayload(wallet, wallet === '0xbbb' ? 'B' : 'A') });
      }
      return response({ status: 'ok', data: { value: 'other' } });
    });

    const view = render(<Shell><AccountSummaryProbe /></Shell>);
    fireEvent.click(screen.getByRole('button', { name: 'toggle account menu' }));
    await waitFor(() => expect(screen.getByTestId('account-summary-value')).toHaveTextContent('A'));
    fireEvent.click(screen.getByRole('button', { name: 'toggle account menu' }));

    mockUseAuth.mockReturnValue({ user: { walletAddress: '0xbbb', username: 'alice' }, walletType: 'evm', isLoading: false } as never);
    mockUseAccount.mockReturnValue({ address: '0xbbb', isConnected: true, chainId: 97 } as never);
    view.rerender(<Shell><AccountSummaryProbe /></Shell>);
    await waitFor(() => expect(screen.getByTestId('account-summary-value')).toHaveTextContent('idle'));
    expect(screen.getByTestId('account-summary-value')).not.toHaveTextContent('A');

    fireEvent.click(screen.getByRole('button', { name: 'toggle account menu' }));
    await waitFor(() => expect(screen.getByTestId('account-summary-value')).toHaveTextContent('B'));
    expect(accountCalls).toBe(2);
  });

  it('does not publish a late A response after wagmi moves to B while auth remains A', async () => {
    let resolveA: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation((input, init) => {
      if (String(input).includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
      return new Promise((resolve, reject) => {
        resolveA = resolve;
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    });
    const view = render(<Shell><ResourceProbe /></Shell>);
    await waitFor(() => expect(mockFetch.mock.calls.some(([input]) => String(input).includes('cukie-master'))).toBe(true));
    mockUseAccount.mockReturnValue({ address: '0xbbb', isConnected: true, chainId: 97 } as never);
    view.rerender(<Shell><ResourceProbe /></Shell>);
    await act(async () => resolveA?.(response({ status: 'ok', data: { value: 'stale-A' } })));
    expect(screen.getByTestId('resource')).not.toHaveTextContent('stale-A');
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('cukie-master'))).toHaveLength(1);
  });

  it('cancels private polling when leaving the runtime route after logout', async () => {
    let runtimeSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((input, init) => {
      if (!String(input).includes('runtime-status')) return Promise.resolve(response({ status: 'ok', data: { value: 'private' } }));
      runtimeSignal = init?.signal ?? undefined;
      return new Promise((resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    });
    const view = render(<Shell><ResourceProbe /></Shell>);
    await waitFor(() => expect(runtimeSignal).toBeDefined());
    configureWallet(undefined, '/');
    view.rerender(<Shell><ResourceProbe /></Shell>);
    await waitFor(() => expect(runtimeSignal?.aborted).toBe(true));
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('runtime-status'))).toHaveLength(1);
  });

  it('keeps confirmed data marked stale when a refresh fails', async () => {
    let masterCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('runtime-status')) return response(runtimeStatus);
      masterCalls += 1;
      return masterCalls === 1 ? response({ status: 'ok', data: { value: 'confirmed' } }) : response({}, false);
    });
    render(<Shell><RefreshProbe /></Shell>);
    await waitFor(() => expect(screen.getByTestId('resource')).toHaveTextContent('confirmed'));
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(screen.getByTestId('resource')).toHaveTextContent('confirmed'), { timeout: 5_000 });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('stale'), { timeout: 5_000 });
  });

  it('deduplicates concurrent dependency refreshes without dropping pool', async () => {
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('runtime-status')) return response(runtimeStatus);
      if (String(input).includes('cukie-pool')) return response({ status: 'ok', data: { value: 'pool' } });
      return response({ status: 'ok', data: { value: 'master' } });
    });
    render(<Shell><RuntimeRefreshProbe /></Shell>);
    await waitFor(() => expect(screen.getByTestId('pool-resource')).toHaveTextContent('pool'));
    mockFetch.mockClear();
    fireEvent.click(screen.getByText('refresh dependencies'));
    await waitFor(() => expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('cukie-pool'))).toHaveLength(1));
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('runtime-status'))).toHaveLength(1);
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('cukie-master'))).toHaveLength(1);
  });

  it('refresca Master aunque la consulta Dashboard posterior quede pendiente', async () => {
    let masterCalls = 0;
    let dashboardCalls = 0;
    let resolveDashboard: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return response(runtimeStatus);
      if (url.includes('cukie-master')) {
        masterCalls += 1;
        return response({ status: 'ok', data: { value: masterCalls === 1 ? 'old' : 'new' } });
      }
      if (url.includes('dashboard')) {
        dashboardCalls += 1;
        if (dashboardCalls === 1) return response({ status: 'ok', data: { value: 'dashboard-old' } });
        return new Promise<Response>((resolve) => { resolveDashboard = resolve; });
      }
      return response({ status: 'ok', data: { value: 'other' } });
    });
    render(<Shell><SlowDependencyRefreshProbe /></Shell>);
    await waitFor(() => expect(screen.getByTestId('slow-master')).toHaveTextContent('old'));
    await waitFor(() => expect(screen.getByTestId('slow-dashboard')).toHaveTextContent('dashboard-old'));

    fireEvent.click(screen.getByText('refresh slow dependencies'));
    await waitFor(() => expect(masterCalls).toBe(2));
    expect(screen.getByTestId('slow-master')).toHaveTextContent('new');
    expect(dashboardCalls).toBe(2);
    await act(async () => resolveDashboard?.(response({ status: 'ok', data: { value: 'dashboard-new' } })));
  });

  it('invalida una cache inactiva fuera de ruta sin iniciar lecturas ocultas', async () => {
    configureWallet('0xaaa', '/');
    mockFetch.mockResolvedValue(response(runtimeStatus));
    render(<Shell><InactiveCacheRefreshProbe /></Shell>);

    fireEvent.click(screen.getByText('refresh inactive cache'));
    await waitFor(() => expect(screen.getByTestId('inactive-result')).toHaveTextContent('invalidated'));
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('cukie-master'))).toHaveLength(0);
  });

  it('refresca account-summary activo aunque la ruta pública mantenga el menú montado', async () => {
    configureWallet('0xaaa', '/');
    let accountCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/account/v1/summary')) {
        accountCalls += 1;
        return response({ status: 'ok', data: accountSummaryPayload('0xaaa', String(accountCalls)) });
      }
      return response(runtimeStatus);
    });
    render(<Shell><AccountSummaryRefreshProbe /></Shell>);
    await waitFor(() => expect(screen.getByTestId('account-refresh')).toHaveTextContent('1'));
    fireEvent.click(screen.getByText('refresh account summary'));
    await waitFor(() => expect(accountCalls).toBe(2));
    expect(screen.getByTestId('account-refresh')).toHaveTextContent('done');
  });

  it('refresca el account-summary al recibir eventos de cobros y marketplace', async () => {
    configureWallet('0xaaa', '/');
    let accountCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/account/v1/summary')) {
        accountCalls += 1;
        return response({ status: 'ok', data: accountSummaryPayload('0xaaa', String(accountCalls)) });
      }
      return response(runtimeStatus);
    });
    render(<Shell><AccountSummaryRefreshProbe /></Shell>);
    await waitFor(() => expect(screen.getByTestId('account-refresh')).toHaveTextContent('1'));

    let expectedCalls = 1;
    for (const eventName of [
      'cukies:legacy-marketplace:refresh',
      'cukies:uki-marketplace:refresh',
      'cukies:rewards:refresh',
      'cukies:vesting:refresh',
    ]) {
      expectedCalls += 1;
      act(() => window.dispatchEvent(new Event(eventName)));
      await waitFor(() => expect(accountCalls).toBe(expectedCalls));
    }
    expect(accountCalls).toBe(5);
  });

  it('waits for a pre-transaction GET before issuing the post-transaction read', async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    let masterCalls = 0;
    mockFetch.mockImplementation((input) => {
      if (String(input).includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
      masterCalls += 1;
      if (masterCalls === 1) {
        return new Promise((resolve) => { resolveOld = resolve; });
      }
      return Promise.resolve(response({ status: 'ok', data: { value: 'saved' } }));
    });
    render(<Shell><TransactionRefreshProbe /></Shell>);
    await waitFor(() => expect(masterCalls).toBe(1));
    fireEvent.click(screen.getByText('refresh after transaction'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(masterCalls).toBe(1);
    await act(async () => resolveOld?.(response({ status: 'ok', data: { value: 'old' } })));
    await waitFor(() => expect(screen.getByTestId('transaction-resource')).toHaveTextContent('saved'));
    expect(screen.getByTestId('transaction-refresh')).toHaveTextContent('done');
    expect(masterCalls).toBe(2);
  });

  it('publica un único par Master+Credits al converger UKI y NFT aunque las respuestas lleguen desordenadas', async () => {
    const initial = o2ReadbackPayload({
      stakedUkiRaw: STAKED_25K_RAW,
      originalCukiePoints: 12,
      desiredSlots: 4,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'active',
      nftInventoryMode: 'vault',
      includeSecondNft: true,
    });
    const ukiTarget = o2ReadbackPayload({
      stakedUkiRaw: STAKED_5K_RAW,
      originalCukiePoints: 12,
      desiredSlots: 4,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'active',
      nftInventoryMode: 'vault',
      includeSecondNft: true,
    });
    const nftTarget = o2ReadbackPayload({
      stakedUkiRaw: STAKED_5K_RAW,
      originalCukiePoints: 10,
      desiredSlots: 3,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'grace',
      nftInventoryMode: 'wallet',
      includeSecondNft: true,
    });
    const nftPartial = {
      ...nftTarget,
      master: {
        ...nftTarget.master,
        nftInventory: nftTarget.master.nftInventory.slice(0, 1),
      },
    };
    mockUseAuth.mockReturnValue({ user: { walletAddress: O2_WALLET, username: 'alice' }, walletType: 'evm', isLoading: false } as never);
    mockUseAccount.mockReturnValue({ address: O2_WALLET, isConnected: true, chainId: O2_CHAIN_ID } as never);
    mockUsePathname.mockReturnValue('/dashboard');
    let masterCalls = 0;
    let creditsCalls = 0;
    let resolveUkiMaster: ((value: Response) => void) | undefined;
    let resolveUkiCredits: ((value: Response) => void) | undefined;
    let resolveNftMaster: ((value: Response) => void) | undefined;
    let resolveNftCredits: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
        if (url.includes('cukie-master')) {
          masterCalls += 1;
          if (masterCalls === 1) return Promise.resolve(response({ status: 'ok', data: initial.master }));
          if (masterCalls === 2) return new Promise((resolve) => { resolveUkiMaster = resolve; });
          if (masterCalls === 3) return new Promise((resolve) => { resolveNftMaster = resolve; });
          return new Promise((resolve) => { resolveNftMaster = resolve; });
      }
        if (url.includes('/credits')) {
          creditsCalls += 1;
          if (creditsCalls === 1) return Promise.resolve(response({ status: 'ok', data: initial.credits }));
          if (creditsCalls === 2) return new Promise((resolve) => { resolveUkiCredits = resolve; });
          if (creditsCalls === 3) return new Promise((resolve) => { resolveNftCredits = resolve; });
          return new Promise((resolve) => { resolveNftCredits = resolve; });
      }
      return Promise.resolve(response({ status: 'ok', data: initial.dashboard }));
    });

    render(<Shell><O2ReadbackProbe /></Shell>);
    await waitFor(() => {
      expect(screen.getByTestId('o2-staked')).toHaveTextContent(STAKED_25K_RAW);
      expect(screen.getByTestId('o2-points')).toHaveTextContent('12');
      expect(screen.getByTestId('o2-granted')).toHaveTextContent('400');
      expect(screen.getByTestId('o2-grace-count')).toHaveTextContent('0');
    });

    fireEvent.click(screen.getByRole('button', { name: 'read UKI O2' }));
    await waitFor(() => {
      expect(masterCalls).toBe(2);
      expect(creditsCalls).toBe(2);
    });
    await act(async () => resolveUkiCredits?.(response({ status: 'ok', data: ukiTarget.credits })));
    await waitFor(() => {
      expect(screen.getByTestId('o2-staked')).toHaveTextContent(STAKED_25K_RAW);
      expect(screen.getByTestId('o2-points')).toHaveTextContent('12');
    });
    await act(async () => resolveUkiMaster?.(response({ status: 'ok', data: ukiTarget.master })));
    await waitFor(() => {
      expect(screen.getByTestId('o2-staked')).toHaveTextContent(STAKED_5K_RAW);
      expect(screen.getByTestId('o2-points')).toHaveTextContent('12');
      expect(screen.getByTestId('o2-granted')).toHaveTextContent('400');
    });

    fireEvent.click(screen.getByRole('button', { name: 'read NFT O2' }));
    await waitFor(() => {
      expect(masterCalls).toBe(3);
      expect(creditsCalls).toBe(3);
    });
    await act(async () => resolveNftMaster?.(response({ status: 'ok', data: nftPartial.master })));
    await waitFor(() => {
      expect(screen.getByTestId('o2-staked')).toHaveTextContent(STAKED_5K_RAW);
      expect(screen.getByTestId('o2-points')).toHaveTextContent('12');
      expect(screen.getByTestId('o2-desired')).toHaveTextContent('4');
      expect(screen.getByTestId('o2-grace-count')).toHaveTextContent('0');
    });
    await act(async () => resolveNftCredits?.(response({ status: 'ok', data: nftTarget.credits })));
    await waitFor(() => {
      expect(screen.getByTestId('o2-points')).toHaveTextContent('12');
      expect(screen.getByTestId('o2-desired')).toHaveTextContent('4');
      expect(screen.getByTestId('o2-grace-count')).toHaveTextContent('0');
    });

    fireEvent.click(screen.getByRole('button', { name: 'read NFT O2' }));
    await waitFor(() => {
      expect(masterCalls).toBe(4);
      expect(creditsCalls).toBe(4);
    });
    await act(async () => resolveNftCredits?.(response({ status: 'ok', data: nftTarget.credits })));
    await waitFor(() => {
      expect(screen.getByTestId('o2-points')).toHaveTextContent('12');
      expect(screen.getByTestId('o2-desired')).toHaveTextContent('4');
      expect(screen.getByTestId('o2-grace-count')).toHaveTextContent('0');
    });
    await act(async () => resolveNftMaster?.(response({ status: 'ok', data: nftTarget.master })));
    await waitFor(() => {
      expect(screen.getByTestId('o2-staked')).toHaveTextContent(STAKED_5K_RAW);
      expect(screen.getByTestId('o2-points')).toHaveTextContent('10');
      expect(screen.getByTestId('o2-desired')).toHaveTextContent('3');
      expect(screen.getByTestId('o2-granted')).toHaveTextContent('400');
      expect(screen.getByTestId('o2-grace-count')).toHaveTextContent('5');
    });
  });

  it('ignora una lectura Master iniciada en idle cuando el recibo abre otra generación', async () => {
    const initial = o2ReadbackPayload({
      stakedUkiRaw: STAKED_25K_RAW,
      originalCukiePoints: 12,
      desiredSlots: 4,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'active',
      nftInventoryMode: 'vault',
      includeSecondNft: true,
    });
    const target = o2ReadbackPayload({
      stakedUkiRaw: STAKED_5K_RAW,
      originalCukiePoints: 12,
      desiredSlots: 4,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'active',
      nftInventoryMode: 'vault',
      includeSecondNft: true,
    });
    mockUseAuth.mockReturnValue({ user: { walletAddress: O2_WALLET, username: 'alice' }, walletType: 'evm', isLoading: false } as never);
    mockUseAccount.mockReturnValue({ address: O2_WALLET, isConnected: true, chainId: O2_CHAIN_ID } as never);
    mockUsePathname.mockReturnValue('/dashboard');
    let masterCalls = 0;
    let resolveInitialMaster: ((value: Response) => void) | undefined;
    let resolveTargetMaster: ((value: Response) => void) | undefined;
    let resolveTargetCredits: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
      if (url.includes('cukie-master')) {
        masterCalls += 1;
        if (masterCalls === 1) return new Promise((resolve) => { resolveInitialMaster = resolve; });
        return new Promise((resolve) => { resolveTargetMaster = resolve; });
      }
      if (url.includes('/credits')) return new Promise((resolve) => { resolveTargetCredits = resolve; });
      return Promise.resolve(response({ status: 'ok', data: target.dashboard }));
    });

    render(<Shell><OnlyResourceProbe resource="master" /></Shell>);
    await waitFor(() => expect(masterCalls).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'trigger master readback' }));
    await waitFor(() => expect(masterCalls).toBe(2));

    await act(async () => resolveInitialMaster?.(response({ status: 'ok', data: initial.master })));
    expect(screen.getByTestId('only-resource')).not.toHaveTextContent(STAKED_25K_RAW);
    await act(async () => resolveTargetCredits?.(response({ status: 'ok', data: target.credits })));
    await act(async () => resolveTargetMaster?.(response({ status: 'ok', data: target.master })));
    await waitFor(() => expect(screen.getByTestId('only-resource')).toHaveTextContent(STAKED_5K_RAW));
  });

  it('lee el readback completo aunque solo Credits esté montado', async () => {
    const initial = o2ReadbackPayload({
      stakedUkiRaw: STAKED_25K_RAW,
      originalCukiePoints: 12,
      desiredSlots: 4,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'active',
      nftInventoryMode: 'vault',
      includeSecondNft: true,
    });
    const target = o2ReadbackPayload({
      stakedUkiRaw: STAKED_5K_RAW,
      originalCukiePoints: 10,
      desiredSlots: 3,
      allocatedSlots: 4,
      protectedSlots: 4,
      slotStatus: 'grace',
      nftInventoryMode: 'wallet',
      includeSecondNft: true,
    });
    mockUseAuth.mockReturnValue({ user: { walletAddress: O2_WALLET, username: 'alice' }, walletType: 'evm', isLoading: false } as never);
    mockUseAccount.mockReturnValue({ address: O2_WALLET, isConnected: true, chainId: O2_CHAIN_ID } as never);
    mockUsePathname.mockReturnValue('/dashboard');
    let creditsCalls = 0;
    let resolveTargetMaster: ((value: Response) => void) | undefined;
    let resolveTargetCredits: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('runtime-status')) return Promise.resolve(response(runtimeStatus));
      if (url.includes('cukie-master')) return new Promise((resolve) => { resolveTargetMaster = resolve; });
      if (url.includes('/credits')) {
        creditsCalls += 1;
        if (creditsCalls === 1) return Promise.resolve(response({ status: 'ok', data: initial.credits }));
        return new Promise((resolve) => { resolveTargetCredits = resolve; });
      }
      return Promise.resolve(response({ status: 'ok', data: target.dashboard }));
    });

    render(<Shell><OnlyResourceProbe resource="credits" /></Shell>);
    await waitFor(() => expect(screen.getByTestId('only-resource')).toHaveTextContent('active'));
    fireEvent.click(screen.getByRole('button', { name: 'trigger credits readback' }));
    await waitFor(() => {
      expect(creditsCalls).toBe(2);
      expect(resolveTargetMaster).toBeDefined();
      expect(resolveTargetCredits).toBeDefined();
    });
    await act(async () => resolveTargetMaster?.(response({ status: 'ok', data: target.master })));
    expect(screen.getByTestId('only-resource')).not.toHaveTextContent('grace');
    await act(async () => resolveTargetCredits?.(response({ status: 'ok', data: target.credits })));
    await waitFor(() => expect(screen.getByTestId('only-resource')).toHaveTextContent('grace'));
  });

  it('reports a rejected contextual switch and never signs the transaction', async () => {
    configureWallet('0xaaa', '/cukie-master', 56);
    const switchChainAsync = jest.fn().mockRejectedValue(new Error('user rejected'));
    mockUseSwitchChain.mockReturnValue({ switchChainAsync } as never);
    const onSign = jest.fn();
    render(<Shell><SwitchProbe onSign={onSign} /></Shell>);
    expect(screen.getByTestId('readiness')).toHaveTextContent('wrong_chain');
    fireEvent.click(screen.getByText('execute'));
    await waitFor(() => expect(screen.getByTestId('switch-result')).toHaveTextContent('false'));
    expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 97 });
    expect(onSign).not.toHaveBeenCalled();
  });
});
