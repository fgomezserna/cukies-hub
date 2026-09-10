import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePathname } from 'next/navigation';
import {
  appRuntimeEndpoint,
  appRuntimeProjectionMatches,
  appRuntimeQueryKey,
  AppRuntimeProvider,
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

function TransactionRefreshProbe() {
  const runtime = useAppRuntime();
  const query = useAppRuntimeResource<{ value: string }>('master');
  const [completed, setCompleted] = React.useState(false);
  return <><span data-testid="transaction-resource">{query.data?.value ?? query.state}</span><span data-testid="transaction-refresh">{completed ? 'done' : 'idle'}</span><button onClick={async () => { await runtime.refreshAfterTransaction('master'); setCompleted(true); }}>refresh after transaction</button></>;
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
