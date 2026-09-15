'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Coins,
  Database,
  Flame,
  Loader2,
  Network,
  RefreshCcw,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useAccount, useReadContract } from 'wagmi';

import { Button } from '@/components/ui/button';
import { useTronLink } from '@/hooks/use-tronlink';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import { legacyMarketplaceBscAbis } from '@/lib/legacy-marketplace/abis';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { legacyMarketplaceRuntime } from '@/lib/legacy-marketplace/runtime';
import {
  LEGACY_TRON_MAINNET_RPC_URL,
  getLegacyTronWeb,
  getLegacyTronReadWeb,
  getLegacyTronWalletRpcOrigin,
  isLegacyTronWalletOnRpc,
  readLegacyTronContract,
} from '@/lib/legacy-marketplace/tron';
import type {
  LegacyCukiePointsResponse,
  LegacyCukiePointsTransaction,
} from '@/lib/legacy-marketplace/types';

import { shortWallet } from './format';

type PointsNetworkFilter = 'ALL' | 'BSC' | 'TRON';
type PointsScope = 'wallet' | 'global';
type PointsFeedStatus = 'loading' | 'ready' | 'empty' | 'unavailable';

type TronPointsSnapshot = {
  balance: string | null;
  total: string | null;
  emitted: string | null;
  burned: string | null;
};

type TronSnapshotStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'unknown';

const EMPTY_TRON_SNAPSHOT: TronPointsSnapshot = {
  balance: null,
  total: null,
  emitted: null,
  burned: null,
};

const TRON_READ_ERROR_MESSAGE =
  'No se pudo verificar TRON ahora. Algunos datos no están disponibles.';

const bscPointsAddress = legacyMarketplaceContracts.bsc.contracts.points;
const tronPointsAddress = legacyMarketplaceContracts.tron.contracts.points;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown CukiePoints error';
}

function formatPointValue(value?: bigint | number | string | null) {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'bigint') return value.toLocaleString('en-US');

  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('en-US')
    : String(value);
}

function formatIndexedPointValue(
  value: bigint | number | string | null | undefined,
  source: LegacyCukiePointsResponse['source'] | undefined,
) {
  if (source === 'empty') return 'No disponible';
  return formatPointValue(value);
}

function getPointTypeLabel(value: string) {
  if (value === 'ALL') return 'Todas';
  if (value === 'Unstake') return 'Retirada';
  if (value === 'Breeding') return 'Crías';
  return value;
}

function formatPointDate(timestamp: number | null) {
  if (!timestamp) return '-';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function TransactionRow({ item }: { item: LegacyCukiePointsTransaction }) {
  return (
    <div className="grid gap-3 border-b border-white/10 px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[8rem_7rem_8rem_minmax(0,1fr)_8rem_2rem] lg:items-center">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-lilac-300" />
        <span className="font-black text-[var(--uki-cream)]">{item.type}</span>
      </div>
      <span className="font-mono font-black text-[var(--uki-lilac)]">
        {formatPointValue(item.points)}
      </span>
      <span className="font-semibold text-[var(--uki-text)]">{item.network ?? '-'}</span>
      <span className="min-w-0 truncate font-mono text-xs text-[var(--uki-muted)]">
        {shortWallet(item.address)}
      </span>
      <span className="text-xs text-[var(--uki-muted)]">
        {formatPointDate(item.date)}
      </span>
      {item.explorerUrl ? (
        <a
          href={item.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)] transition hover:border-[var(--uki-lilac)]"
          aria-label="Open transaction"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
      ) : (
        <span className="text-[var(--uki-muted)]">-</span>
      )}
    </div>
  );
}

export function CukiePointsClient() {
  const { address } = useAccount();
  const {
    address: tronAddress,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const { requestWallet } = useWalletCoordinator();
  const [network, setNetwork] = useState<PointsNetworkFilter>('ALL');
  const [scope, setScope] = useState<PointsScope>('wallet');
  const [type, setType] = useState('ALL');
  const [pointsData, setPointsData] =
    useState<LegacyCukiePointsResponse | null>(null);
  const [pointsFeedStatus, setPointsFeedStatus] =
    useState<PointsFeedStatus>('loading');
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [pointsDataStale, setPointsDataStale] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const pointsDataRef = useRef<LegacyCukiePointsResponse | null>(null);
  const pointsRequestRef = useRef(0);
  const tronRequestRef = useRef(0);
  const [tronSnapshot, setTronSnapshot] =
    useState<TronPointsSnapshot>(EMPTY_TRON_SNAPSHOT);
  const [tronSnapshotStatus, setTronSnapshotStatus] =
    useState<TronSnapshotStatus>('idle');

  const connectedWallets = useMemo(
    () =>
      [address, tronAddress].filter((wallet): wallet is string =>
        Boolean(wallet),
      ),
    [address, tronAddress],
  );
  const tronWeb = getLegacyTronWeb();
  const tronWalletRpcOrigin = getLegacyTronWalletRpcOrigin(tronWeb);
  const effectiveScope: PointsScope =
    connectedWallets.length > 0 ? scope : 'global';

  const { data: bscBalance, isLoading: isLoadingBscBalance } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getPoints',
    args: address ? [address] : undefined,
    chainId: 56,
    query: {
      enabled:
        legacyMarketplaceRuntime.legacyMainnetReadEnabled && Boolean(address),
    },
  });
  const { data: bscTotal } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getTotalPoints',
    chainId: 56,
    query: {
      enabled: legacyMarketplaceRuntime.legacyMainnetReadEnabled,
    },
  });
  const { data: bscEmitted } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getTotalPointsEmited',
    chainId: 56,
    query: {
      enabled: legacyMarketplaceRuntime.legacyMainnetReadEnabled,
    },
  });
  const { data: bscBurned } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getTotalPointsBurned',
    chainId: 56,
    query: {
      enabled: legacyMarketplaceRuntime.legacyMainnetReadEnabled,
    },
  });

  const refreshTronSnapshot = useCallback(async () => {
    const requestId = tronRequestRef.current + 1;
    tronRequestRef.current = requestId;
    const currentTronWeb = getLegacyTronWeb();
    const requestAddress = tronAddress;
    const requestRpcOrigin = getLegacyTronWalletRpcOrigin(currentTronWeb);
    const contextIsCurrent = () => {
      const latestTronWeb = getLegacyTronWeb();
      const latestAddress =
        latestTronWeb?.defaultAddress?.base58
        ?? latestTronWeb?.defaultAddress?.hex;
      return (
        requestId === tronRequestRef.current
        && (!latestAddress || latestAddress === requestAddress)
        && requestRpcOrigin === getLegacyTronWalletRpcOrigin(latestTronWeb)
        && isLegacyTronWalletOnRpc(latestTronWeb, LEGACY_TRON_MAINNET_RPC_URL)
      );
    };

    setTronSnapshot(EMPTY_TRON_SNAPSHOT);
    setTronSnapshotStatus('loading');
    setStatus(null);

    if (
      !legacyMarketplaceRuntime.legacyMainnetReadEnabled ||
      !requestAddress ||
      !currentTronWeb ||
      !isLegacyTronWalletOnRpc(currentTronWeb, LEGACY_TRON_MAINNET_RPC_URL)
    ) {
      setTronSnapshotStatus('unknown');
      if (
        requestAddress
        && currentTronWeb
        && tronWalletRpcOrigin !== LEGACY_TRON_MAINNET_RPC_URL
      ) {
        setStatus('Cambia TronLink a TRON Mainnet para consultar tus puntos.');
      }
      return;
    }

    const readTronWeb = getLegacyTronReadWeb(requestAddress);
    if (!readTronWeb) {
      setTronSnapshotStatus('unknown');
      setStatus(TRON_READ_ERROR_MESSAGE);
      return;
    }

    try {
      const results = await Promise.allSettled([
        readLegacyTronContract<unknown>(readTronWeb, 'points', 'getPoints', [
          requestAddress,
        ]),
        readLegacyTronContract<unknown>(
          readTronWeb,
          'points',
          'getTotalPoints',
        ),
        readLegacyTronContract<unknown>(
          readTronWeb,
          'points',
          'getTotalPointsEmited',
        ),
        readLegacyTronContract<unknown>(
          readTronWeb,
          'points',
          'getTotalPointsBurned',
        ),
      ]);

      if (!contextIsCurrent()) return;

      const valueFor = (result: PromiseSettledResult<unknown>) => {
        if (result.status !== 'fulfilled' || result.value === null || result.value === undefined) {
          return null;
        }

        return formatPointValue(String(result.value));
      };
      const failedCount = results.filter((result) => (
        result.status === 'rejected'
        || (result.status === 'fulfilled'
          && (result.value === null || result.value === undefined))
      )).length;
      setTronSnapshot({
        balance: valueFor(results[0]),
        total: valueFor(results[1]),
        emitted: valueFor(results[2]),
        burned: valueFor(results[3]),
      });
      setTronSnapshotStatus(
        failedCount === 0 ? 'ready' : failedCount === results.length ? 'unknown' : 'partial',
      );
      setStatus(failedCount > 0 ? TRON_READ_ERROR_MESSAGE : null);
    } catch {
      if (!contextIsCurrent()) return;
      setTronSnapshot(EMPTY_TRON_SNAPSHOT);
      setTronSnapshotStatus('unknown');
      setStatus(TRON_READ_ERROR_MESSAGE);
    }
  }, [tronAddress, tronWalletRpcOrigin]);

  const buildPointsQuery = useCallback(
    (offset: number) => {
      const query = new URLSearchParams({
        limit: '24',
        offset: String(offset),
      });

      if (effectiveScope === 'wallet') {
        for (const wallet of connectedWallets) query.append('wallet', wallet);
      }

      if (network !== 'ALL') query.set('network', network);
      if (type !== 'ALL') query.set('type', type);

      return query;
    },
    [connectedWallets, effectiveScope, network, type],
  );

  const refreshPoints = useCallback(async () => {
    const requestId = pointsRequestRef.current + 1;
    pointsRequestRef.current = requestId;
    const previousData = pointsDataRef.current;
    setIsLoadingPoints(true);
    setPointsError(null);

    try {
      const response = await fetch(
        `/api/cukies/points?${buildPointsQuery(0)}`,
        {
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        throw new Error('No se ha podido cargar CukiePoints.');
      }
      const payload = (await response.json()) as LegacyCukiePointsResponse;
      if (requestId !== pointsRequestRef.current) return;
      if (payload.source === 'empty') {
        if (!previousData) {
          setPointsData(payload);
          pointsDataRef.current = payload;
        }
        setPointsFeedStatus('unavailable');
        setPointsDataStale(Boolean(previousData));
      } else {
        setPointsData(payload);
        pointsDataRef.current = payload;
        setPointsFeedStatus(payload.items.length > 0 ? 'ready' : 'empty');
        setPointsDataStale(false);
      }
    } catch (error) {
      if (requestId !== pointsRequestRef.current) return;
      setPointsError(getErrorMessage(error));
      setPointsFeedStatus(
        previousData
          ? previousData.items.length > 0
            ? 'ready'
            : 'empty'
          : 'unavailable',
      );
      setPointsDataStale(Boolean(previousData));
    } finally {
      if (requestId === pointsRequestRef.current) setIsLoadingPoints(false);
    }
  }, [buildPointsQuery]);

  const loadMorePoints = useCallback(async () => {
    if (!pointsData || pointsData.items.length >= pointsData.total) return;

    const requestId = pointsRequestRef.current;
    const queryKey = buildPointsQuery(pointsData.items.length).toString();
    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/cukies/points?${queryKey}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('No se han podido cargar mas movimientos.');
      }
      const payload = (await response.json()) as LegacyCukiePointsResponse;
      if (
        requestId !== pointsRequestRef.current
        || queryKey !== buildPointsQuery(pointsData.items.length).toString()
      ) return;
      if (payload.source === 'empty') {
        setPointsError('No se ha podido verificar más actividad de Cukie Points.');
        setPointsDataStale(true);
        return;
      }
      const nextData = {
        ...payload,
        items: [...pointsData.items, ...payload.items],
      };
      setPointsData(nextData);
      pointsDataRef.current = nextData;
    } catch (error) {
      if (requestId === pointsRequestRef.current) {
        setPointsError(getErrorMessage(error));
        setPointsDataStale(true);
      }
    } finally {
      if (requestId === pointsRequestRef.current) setIsLoadingMore(false);
    }
  }, [buildPointsQuery, pointsData]);

  useEffect(() => {
    setPointsData(null);
    pointsDataRef.current = null;
    setPointsFeedStatus('loading');
    setPointsDataStale(false);
    void refreshPoints();
  }, [refreshPoints]);

  useEffect(() => {
    void refreshTronSnapshot();
  }, [refreshTronSnapshot]);

  const pointsSummary = pointsData?.summary;
  const typeOptions = useMemo(() => {
    const indexedTypes =
      pointsSummary?.facets.types
        .map((facet) => facet.value)
        .filter((value) => value.length > 0) ?? [];

    return [
      'ALL',
      ...Array.from(
        new Set(
          indexedTypes.length > 0 ? indexedTypes : ['Breeding', 'Unstake'],
        ),
      ),
    ];
  }, [pointsSummary]);
  const canLoadMore = Boolean(
    pointsData && pointsData.items.length < pointsData.total,
  );

  return (
    <div className="grid gap-6">
      {!legacyMarketplaceRuntime.legacyMainnetReadEnabled && (
        <div className="rounded-[12px] border border-amber-300/25 bg-[#120d13] p-4 text-sm font-semibold text-amber-100">
          No podemos consultar tus puntos ahora. Los datos sin verificar se
          mostrarán como no disponibles, nunca como cero.
        </div>
      )}
      {legacyMarketplaceRuntime.legacyMainnetReadEnabled && (
        <div className="rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac-soft)] p-4 text-sm font-semibold text-[var(--uki-cream)]">
          Tus puntos se consultan por separado en BNB Smart Chain y TRON.
        </div>
      )}
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[14px] border border-white/10 bg-[#0d0914] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
            <Wallet className="mb-4 h-5 w-5 text-lilac-200" />
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              En BNB Smart Chain
            </p>
            <p className="mt-2 font-headline text-3xl font-black text-[var(--uki-cream)]">
              {isLoadingBscBalance
                ? '-'
                : formatPointValue(bscBalance as bigint)}
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">
              {address ? shortWallet(address) : 'Conecta tu wallet BSC'}
            </p>
          </div>

          <div className="rounded-[14px] border border-white/10 bg-[#0d0914] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
            <Network className="mb-4 h-5 w-5 text-[var(--uki-lilac)]" />
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              En TRON
            </p>
            <p className="mt-2 font-headline text-3xl font-black text-[var(--uki-cream)]">
              {tronSnapshot.balance ?? '-'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--uki-muted)]">
              <span>
                {tronAddress
                  ? shortWallet(tronAddress)
                  : 'TronLink no conectado'}
              </span>
              {legacyMarketplaceRuntime.legacyMainnetReadEnabled &&
                !isTronConnected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void requestWallet({
                      kind: 'tron',
                      targetTronNetwork: 'mainnet',
                      reason: 'Conecta TronLink en TRON Mainnet para consultar tus puntos.',
                    }).catch((error) => setStatus(getErrorMessage(error)))}
                    disabled={!isTronInstalled}
                    className="h-7 border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac-soft)] px-2 text-xs text-[var(--uki-cream)] hover:bg-[var(--uki-lilac)]/20"
                  >
                    Conectar TRON
                  </Button>
              )}
            </div>
            <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]" role="status">
              {tronSnapshotStatus === 'loading'
                ? 'Verificando lectura TRON…'
                : tronSnapshotStatus === 'ready'
                ? 'Lectura TRON verificada.'
                : tronSnapshotStatus === 'partial'
                ? 'Lectura TRON parcial; algunos datos están sin verificar.'
                : tronSnapshotStatus === 'unknown'
                ? 'Lectura TRON sin verificar.'
                : null}
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-[14px] border border-[var(--uki-lilac)]/25 bg-[#0d0914] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
                Total de esta consulta
              </p>
              <p className="mt-1 font-headline text-2xl font-black text-[var(--uki-cream)]">
                {formatIndexedPointValue(
                  pointsSummary?.totalPoints,
                  pointsData?.source,
                )}
              </p>
            </div>
            <Database className="h-5 w-5 text-lilac-200" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
              <p className="text-[var(--uki-muted)]">Movimientos</p>
              <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
                {formatIndexedPointValue(
                  pointsSummary?.totalTransactions,
                  pointsData?.source,
                )}
              </p>
            </div>
            <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
              <p className="text-[var(--uki-muted)]">Total BSC</p>
              <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
                {formatPointValue(bscTotal as bigint)}
              </p>
            </div>
            <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
              <p className="text-[var(--uki-muted)]">Total TRON</p>
              <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
                {tronSnapshot.total ?? '-'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <details className="group rounded-[12px] border border-white/10 bg-[#0d0914]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-[var(--uki-cream)] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)]">
          <span>Cómo se compone el total</span>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--uki-muted)]">
            Puntos emitidos y utilizados
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <section className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-4">
          <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
            <Sparkles className="mb-3 h-4 w-4 text-lilac-200" />
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              Emitidos BSC
            </p>
            <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
              {formatPointValue(bscEmitted as bigint)}
            </p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
            <Flame className="mb-3 h-4 w-4 text-amber-200" />
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              Quemados BSC
            </p>
            <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
              {formatPointValue(bscBurned as bigint)}
            </p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
            <Sparkles className="mb-3 h-4 w-4 text-[var(--uki-lilac)]" />
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              Emitidos TRON
            </p>
            <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
              {tronSnapshot.emitted ?? '-'}
            </p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-black/25 p-3">
            <Flame className="mb-3 h-4 w-4 text-rose-200" />
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              Quemados TRON
            </p>
            <p className="mt-1 font-mono font-black text-[var(--uki-cream)]">
              {tronSnapshot.burned ?? '-'}
            </p>
          </div>
        </section>
      </details>

      <section className="overflow-hidden rounded-[14px] border border-white/10 bg-[#0d0914] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h2 className="font-headline text-2xl font-black text-[var(--uki-cream)]">
              Tus movimientos
            </h2>
            <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
              Empieza por tus wallets y amplía a la actividad global cuando lo necesites.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={isLoadingPoints}
            onClick={() => void refreshPoints()}
            className="border-lilac-300/25 bg-lilac-300/10 text-lilac-100 hover:bg-lilac-300/20"
          >
            {isLoadingPoints ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            {pointsError ? 'Reintentar' : 'Actualizar'}
          </Button>
        </div>

        {pointsData?.coverage === 'legacy-historical' && (
          <div
            role="status"
            className="mx-4 mt-4 rounded-[10px] border border-amber-300/20 bg-[#120d13] p-3 text-sm font-semibold text-amber-100"
          >
            Mostramos el historial disponible. Algunos movimientos antiguos
            pueden faltar mientras terminamos de recuperarlos.
          </div>
        )}

        {pointsError && (
          <div
            role="status"
            className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100"
          >
            <span>
              {pointsDataStale
                ? `${pointsError} Se muestra la última lectura disponible.`
                : pointsError}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoadingPoints}
              onClick={() => void refreshPoints()}
              className="border-amber-200/30 bg-amber-200/10 text-amber-50"
            >
              Reintentar
            </Button>
          </div>
        )}

        <div className="grid gap-3 border-b border-white/10 p-4 lg:grid-cols-[auto_auto_auto_1fr]">
          <div className="inline-flex rounded-[10px] border border-white/10 bg-black/25 p-1">
            {(['wallet', 'global'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setScope(item)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                  effectiveScope === item
                    ? 'bg-[var(--uki-lilac)] text-[#09060f]'
                    : 'text-[var(--uki-muted)] hover:bg-white/10 hover:text-[var(--uki-cream)]'
                }`}
              >
                {item === 'wallet' ? 'Mis wallets' : 'Global'}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-[10px] border border-white/10 bg-black/25 p-1">
            {(['ALL', 'BSC', 'TRON'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setNetwork(item)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                  network === item
                    ? 'bg-[var(--uki-cream)] text-[#09060f]'
                    : 'text-[var(--uki-muted)] hover:bg-white/10 hover:text-[var(--uki-cream)]'
                }`}
              >
                {item === 'ALL' ? 'Todas' : item}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-[10px] border border-white/10 bg-black/25 p-1">
            {typeOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                  type === item
                    ? 'bg-[var(--uki-cream)] text-[#09060f]'
                    : 'text-[var(--uki-muted)] hover:bg-white/10 hover:text-[var(--uki-cream)]'
                }`}
              >
                {getPointTypeLabel(item)}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center justify-end text-xs font-semibold text-[var(--uki-muted)]">
            {effectiveScope === 'wallet'
              ? `${connectedWallets.length} wallets conectadas`
              : 'Mostrando actividad global'}
          </div>
        </div>

        <div className="hidden border-b border-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)] lg:grid lg:grid-cols-[8rem_7rem_8rem_minmax(0,1fr)_8rem_2rem]">
          <span>Tipo</span>
          <span>Puntos</span>
          <span>Red</span>
          <span>Wallet</span>
          <span>Fecha</span>
          <span>Tx</span>
        </div>

        {isLoadingPoints && !pointsData ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-12 rounded-[10px] border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : pointsFeedStatus === 'unavailable' &&
          (!pointsData || pointsData.source === 'empty') ? (
          <div className="p-6 text-sm text-amber-100">
            No se puede verificar la actividad de Cukie Points ahora. Tus
            métricas no se han convertido en cero.
          </div>
        ) : pointsData && pointsData.items.length > 0 ? (
          <div>
            {pointsData.items.map((item, index) => (
              <TransactionRow
                key={`${item.id}-${item.txId ?? 'no-tx'}-${index}`}
                item={item}
              />
            ))}
            {canLoadMore && (
              <div className="p-4">
                <Button
                  variant="outline"
                  disabled={isLoadingMore}
                  onClick={() => void loadMorePoints()}
                  className="w-full border-white/10 bg-white/[0.03] text-[var(--uki-text)] hover:bg-white/10"
                >
                  {isLoadingMore && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cargar más movimientos
                </Button>
              </div>
            )}
          </div>
        ) : pointsFeedStatus === 'empty' ? (
          <div className="p-6 text-sm font-semibold text-[var(--uki-muted)]">
            {pointsData?.coverage === 'legacy-historical'
              ? 'No se han encontrado movimientos en el historial disponible para estos filtros.'
              : 'No hay actividad de Cukie Points para estos filtros.'}
          </div>
        ) : null}
        {isLoadingPoints && pointsData && (
          <p className="border-t border-white/10 px-4 py-2 text-xs font-semibold text-[var(--uki-muted)]">
            Actualizando esta consulta…
          </p>
        )}
      </section>
      {status && (
        <div className="rounded-[12px] border border-amber-300/20 bg-[#120d13] p-3 text-sm font-semibold text-amber-100">
          {status}
        </div>
      )}
    </div>
  );
}
