'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
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
import { legacyMarketplaceBscAbis } from '@/lib/legacy-marketplace/abis';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { legacyMarketplaceRuntime } from '@/lib/legacy-marketplace/runtime';
import { readLegacyTronContract } from '@/lib/legacy-marketplace/tron';
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
        <span className="font-semibold text-white">{item.type}</span>
      </div>
      <span className="font-mono font-semibold text-emerald-200">
        {formatPointValue(item.points)}
      </span>
      <span className="text-slate-300">{item.network ?? '-'}</span>
      <span className="min-w-0 truncate font-mono text-xs text-slate-400">
        {shortWallet(item.address)}
      </span>
      <span className="text-xs text-slate-400">
        {formatPointDate(item.date)}
      </span>
      {item.explorerUrl ? (
        <a
          href={item.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-lilac-300/20 bg-lilac-300/10 text-lilac-100 transition hover:border-lilac-200/60"
          aria-label="Open transaction"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
      ) : (
        <span className="text-slate-600">-</span>
      )}
    </div>
  );
}

export function CukiePointsClient() {
  const { address } = useAccount();
  const {
    address: tronAddress,
    connect: connectTron,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
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
  const [tronSnapshot, setTronSnapshot] = useState<TronPointsSnapshot>({
    balance: null,
    total: null,
    emitted: null,
    burned: null,
  });

  const connectedWallets = useMemo(
    () =>
      [address, tronAddress].filter((wallet): wallet is string =>
        Boolean(wallet),
      ),
    [address, tronAddress],
  );
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
        legacyMarketplaceRuntime.legacyMainnetEnabled && Boolean(address),
    },
  });
  const { data: bscTotal } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getTotalPoints',
    chainId: 56,
    query: {
      enabled: legacyMarketplaceRuntime.legacyMainnetEnabled,
    },
  });
  const { data: bscEmitted } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getTotalPointsEmited',
    chainId: 56,
    query: {
      enabled: legacyMarketplaceRuntime.legacyMainnetEnabled,
    },
  });
  const { data: bscBurned } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getTotalPointsBurned',
    chainId: 56,
    query: {
      enabled: legacyMarketplaceRuntime.legacyMainnetEnabled,
    },
  });

  const refreshTronSnapshot = useCallback(async () => {
    const requestId = tronRequestRef.current + 1;
    tronRequestRef.current = requestId;
    if (
      !legacyMarketplaceRuntime.legacyMainnetEnabled ||
      !tronAddress ||
      !window.tronWeb
    ) {
      setTronSnapshot({
        balance: null,
        total: null,
        emitted: null,
        burned: null,
      });
      return;
    }

    try {
      const [balance, total, emitted, burned] = await Promise.all([
        readLegacyTronContract<unknown>(window.tronWeb, 'points', 'getPoints', [
          tronAddress,
        ]),
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'points',
          'getTotalPoints',
        ),
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'points',
          'getTotalPointsEmited',
        ),
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'points',
          'getTotalPointsBurned',
        ),
      ]);
      if (requestId !== tronRequestRef.current) return;
      setTronSnapshot({
        balance: formatPointValue(String(balance)),
        total: formatPointValue(String(total)),
        emitted: formatPointValue(String(emitted)),
        burned: formatPointValue(String(burned)),
      });
    } catch (error) {
      if (requestId !== tronRequestRef.current) return;
      setStatus(getErrorMessage(error));
    }
  }, [tronAddress]);

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
      {!legacyMarketplaceRuntime.legacyMainnetEnabled && (
        <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
          Puedes consultar tus puntos y movimientos. Las acciones están pausadas
          temporalmente mientras completamos la actualización del servicio.
        </div>
      )}
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[8px] border border-white/10 bg-black/30 p-4">
            <Wallet className="mb-4 h-5 w-5 text-lilac-200" />
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Saldo BSC de tu wallet
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-white">
              {isLoadingBscBalance
                ? '-'
                : formatPointValue(bscBalance as bigint)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {address ? shortWallet(address) : 'Conecta tu wallet BSC'}
            </p>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-4">
            <Network className="mb-4 h-5 w-5 text-emerald-200" />
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Saldo TRON de tu wallet
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-white">
              {tronSnapshot.balance ?? '-'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                {tronAddress
                  ? shortWallet(tronAddress)
                  : 'TronLink no conectado'}
              </span>
              {legacyMarketplaceRuntime.legacyMainnetEnabled &&
                !isTronConnected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void connectTron()}
                    disabled={!isTronInstalled}
                    className="h-7 border-emerald-300/25 bg-emerald-300/10 px-2 text-xs text-emerald-100 hover:bg-emerald-300/20"
                  >
                    Conectar TRON
                  </Button>
                )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[8px] border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Total Cukie Points de esta consulta
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-white">
                {formatIndexedPointValue(
                  pointsSummary?.totalPoints,
                  pointsData?.source,
                )}
              </p>
            </div>
            <Database className="h-5 w-5 text-lilac-200" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-slate-500">Movimientos</p>
              <p className="mt-1 font-mono font-semibold text-white">
                {formatIndexedPointValue(
                  pointsSummary?.totalTransactions,
                  pointsData?.source,
                )}
              </p>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-slate-500">Total BSC</p>
              <p className="mt-1 font-mono font-semibold text-white">
                {formatPointValue(bscTotal as bigint)}
              </p>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-slate-500">Total TRON</p>
              <p className="mt-1 font-mono font-semibold text-white">
                {tronSnapshot.total ?? '-'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-[8px] border border-white/10 bg-black/25 p-4 md:grid-cols-4">
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
          <Sparkles className="mb-3 h-4 w-4 text-lilac-200" />
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Emitidos BSC
          </p>
          <p className="mt-1 font-mono font-semibold text-white">
            {formatPointValue(bscEmitted as bigint)}
          </p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
          <Flame className="mb-3 h-4 w-4 text-amber-200" />
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Quemados BSC
          </p>
          <p className="mt-1 font-mono font-semibold text-white">
            {formatPointValue(bscBurned as bigint)}
          </p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
          <Sparkles className="mb-3 h-4 w-4 text-emerald-200" />
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Emitidos TRON
          </p>
          <p className="mt-1 font-mono font-semibold text-white">
            {tronSnapshot.emitted ?? '-'}
          </p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
          <Flame className="mb-3 h-4 w-4 text-rose-200" />
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Quemados TRON
          </p>
          <p className="mt-1 font-mono font-semibold text-white">
            {tronSnapshot.burned ?? '-'}
          </p>
        </div>
      </section>

      <section className="rounded-[8px] border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h2 className="font-headline text-2xl font-bold text-white">
              Actividad de Cukie Points
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Tus movimientos aparecen primero; la actividad global es
              secundaria.
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
          <div className="inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] p-1">
            {(['wallet', 'global'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setScope(item)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                  effectiveScope === item
                    ? 'bg-lilac-300 text-slate-950'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item === 'wallet' ? 'Mis wallets' : 'Global'}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] p-1">
            {(['ALL', 'BSC', 'TRON'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setNetwork(item)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                  network === item
                    ? 'bg-white text-slate-950'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item === 'ALL' ? 'Todas' : item}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] p-1">
            {typeOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                  type === item
                    ? 'bg-white text-slate-950'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {getPointTypeLabel(item)}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center justify-end text-xs text-slate-500">
            {effectiveScope === 'wallet'
              ? `${connectedWallets.length} wallets conectadas`
              : 'Mostrando actividad global'}
          </div>
        </div>

        <div className="hidden border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[8rem_7rem_8rem_minmax(0,1fr)_8rem_2rem]">
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
                className="h-12 rounded-[8px] border border-white/10 bg-white/[0.03]"
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
                  className="w-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
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
          <div className="p-6 text-sm text-slate-400">
            No hay actividad de Cukie Points para estos filtros.
          </div>
        ) : null}
        {isLoadingPoints && pointsData && (
          <p className="border-t border-white/10 px-4 py-2 text-xs text-slate-500">
            Actualizando esta consulta…
          </p>
        )}
      </section>
      {status && (
        <div className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
          {status}
        </div>
      )}
    </div>
  );
}
