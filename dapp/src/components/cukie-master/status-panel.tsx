'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { formatUnits } from 'viem';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { LandingButton, Panel } from '@/components/landing/primitives';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UkiRoutePreview } from '@/components/cukie-master/types';
import { useAuth } from '@/providers/auth-provider';
import { CUKIE_MASTER_DAILY_CREDITS_PER_SLOT } from '@/lib/uki-economy/rules';

const MAX_ROUTE_SLOTS = 5;
const CUKIE_MASTER_REFRESH_EVENT = 'cukies:cukie-master:refresh';
const STAKING_REFRESH_DELAYS_MS = [
  0,
  3_000,
  8_000,
  15_000,
  30_000,
  60_000,
  90_000,
  120_000,
  180_000,
] as const;
const SYNCHRONIZATION_POLL_MS = 10_000;
const SYNCHRONIZATION_POLL_WINDOW_MS = 180_000;
const INITIAL_LOAD_RETRY_DELAYS_MS = [750, 2_000, 5_000] as const;

type RouteKey = 'uki' | 'nft';

type PublicSlot = {
  route: RouteKey;
  ordinal: number;
  eligibilityEpoch: number;
  status: 'qualifying' | 'active' | 'grace' | 'inactive';
  creditEligibleFrom: string;
  graceEndsAt: string | null;
};

type Requirement = { route: 'uki'; ukiRaw: string } | { route: 'nft'; nftPoints: number };

type PublicRoute = {
  position: null | {
    status: string;
    desiredSlots: number;
    allocatedSlots: number;
    protectedSlots: number;
    graceEndsAt: string | null;
  };
  currentRequirement: Requirement;
  pendingRequirement: Requirement | null;
  requirementGraceEndsAt: string | null;
  projectionFresh?: boolean;
  synchronizing?: boolean;
  previewSlots?: number | null;
  balanceQualifiedSlots?: number | null;
  deficitToNextSlot: Requirement | null;
  deficitToPreserveSlots: Requirement | null;
  slots: PublicSlot[];
  source: {
    complete: boolean;
    status: 'available' | 'unavailable';
    route?: RouteKey;
    totalUkiRaw?: string;
    presaleLockedRaw?: string;
    stakedUkiRaw?: string;
    originalCukiePoints?: number;
  };
};

type PublicNft = {
  assetId: string;
  tokenId: string | null;
  imageUrl: string | null;
  rarity: string;
  rarityPoints: number | null;
  contributesToCukieMaster: boolean;
  contributionPoints: number;
  state: string;
  blockers: string[];
  lock: null | { lockId: string; fencingToken: number };
  canSoftStake: boolean;
  canUnstake: boolean;
};

type PublicStatus = {
  walletNormalized: string;
  routes: { uki: PublicRoute; nft: PublicRoute };
  totals: { desiredSlots: number; allocatedSlots: number; maxPotentialSlots: 10 };
  nftInventory: PublicNft[];
  nftCustody?: { mode: 'legacy' | 'custodial' | 'invalid' };
};

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function slotCounts(route: PublicRoute) {
  return route.slots.reduce(
    (counts, slot) => ({ ...counts, [slot.status]: counts[slot.status] + 1 }),
    { active: 0, qualifying: 0, grace: 0, inactive: 0 },
  );
}

function visibleRouteSlots(route: PublicRoute) {
  if (route.source.complete) {
    return route.balanceQualifiedSlots
      ?? route.previewSlots
      ?? route.position?.allocatedSlots
      ?? 0;
  }
  return route.position?.allocatedSlots ?? 0;
}

function summarySlotCounts(route: PublicRoute) {
  const counts = slotCounts(route);
  const knownSlots = counts.active + counts.qualifying + counts.grace + counts.inactive;
  if (knownSlots > 0 || !route.position?.allocatedSlots) return counts;

  const fallback = { ...counts };
  if (route.position.status === 'active') fallback.active = route.position.allocatedSlots;
  else if (route.position.status === 'qualifying') fallback.qualifying = route.position.allocatedSlots;
  else if (route.position.status === 'grace') fallback.grace = route.position.allocatedSlots;
  return fallback;
}

export function CukieMasterStatusPanel({
  onUkiRouteData,
  overview = false,
  ukiOnly = false,
}: {
  onUkiRouteData?: (preview: UkiRoutePreview | null) => void;
  overview?: boolean;
  ukiOnly?: boolean;
} = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'stale' | 'unavailable'>('idle');
  const [activeRoute, setActiveRoute] = useState<RouteKey>('uki');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mutatingAsset, setMutatingAsset] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const hasReadyStatusRef = useRef(false);
  const loadedWalletRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const refreshTimersRef = useRef<number[]>([]);
  const synchronizationStartedAtRef = useRef<number | null>(null);
  const initialRetryCountRef = useRef(0);
  const retryWalletRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.walletAddress) {
      requestIdRef.current += 1;
      hasReadyStatusRef.current = false;
      loadedWalletRef.current = null;
      initialRetryCountRef.current = 0;
      retryWalletRef.current = null;
      setStatus(null);
      setState('idle');
      setIsRefreshing(false);
      return;
    }
    const walletNormalized = user.walletAddress.toLowerCase();
    if (retryWalletRef.current !== walletNormalized) {
      retryWalletRef.current = walletNormalized;
      initialRetryCountRef.current = 0;
    }
    const backgroundRefresh = hasReadyStatusRef.current
      && loadedWalletRef.current === walletNormalized;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    let retryTimer: number | null = null;
    if (backgroundRefresh) setIsRefreshing(true);
    else {
      setStatus(null);
      setState('loading');
    }
    fetch(
      `/api/economy/v1/cukie-master?walletAddress=${encodeURIComponent(user.walletAddress)}`,
      { cache: 'no-store', credentials: 'same-origin', signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json() as { data?: PublicStatus };
        if (!response.ok || !body.data) throw new Error('CUKIE_MASTER_UNAVAILABLE');
        if (requestIdRef.current !== requestId) return;
        hasReadyStatusRef.current = true;
        loadedWalletRef.current = walletNormalized;
        initialRetryCountRef.current = 0;
        setStatus(body.data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (requestIdRef.current !== requestId) return;
        if (backgroundRefresh) {
          setState('stale');
        } else {
          hasReadyStatusRef.current = false;
          loadedWalletRef.current = null;
          setStatus(null);
          setState('unavailable');
        }
        const retryDelay = INITIAL_LOAD_RETRY_DELAYS_MS[initialRetryCountRef.current];
        if (retryDelay !== undefined) {
          initialRetryCountRef.current += 1;
          retryTimer = window.setTimeout(
            () => setReloadNonce((value) => value + 1),
            retryDelay,
          );
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsRefreshing(false);
      });
    return () => {
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [authLoading, reloadNonce, user?.walletAddress]);

  useEffect(() => {
    const clearRefreshTimers = () => {
      refreshTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      refreshTimersRef.current = [];
    };
    const refresh = () => {
      clearRefreshTimers();
      refreshTimersRef.current = STAKING_REFRESH_DELAYS_MS.map((delay) => window.setTimeout(
        () => setReloadNonce((value) => value + 1),
        delay,
      ));
    };
    window.addEventListener(CUKIE_MASTER_REFRESH_EVENT, refresh);
    return () => {
      window.removeEventListener(CUKIE_MASTER_REFRESH_EVENT, refresh);
      clearRefreshTimers();
    };
  }, []);

  useEffect(() => {
    const needsSynchronization = state === 'ready' && Boolean(status) && (
      status!.routes.uki.synchronizing
      || !status!.routes.uki.source.complete
      || (!ukiOnly && (
        status!.routes.nft.synchronizing
        || !status!.routes.nft.source.complete
      ))
    );
    if (!needsSynchronization) {
      synchronizationStartedAtRef.current = null;
      return;
    }
    const startedAt = synchronizationStartedAtRef.current ?? Date.now();
    synchronizationStartedAtRef.current = startedAt;
    if (Date.now() - startedAt >= SYNCHRONIZATION_POLL_WINDOW_MS) return;
    const timer = window.setTimeout(
      () => setReloadNonce((value) => value + 1),
      SYNCHRONIZATION_POLL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state, status, ukiOnly]);

  useEffect(() => {
    const route = status?.routes.uki;
    if (
      state !== 'ready'
      || !route?.source.complete
      || route.currentRequirement.route !== 'uki'
      || route.source.presaleLockedRaw === undefined
      || route.source.stakedUkiRaw === undefined
    ) {
      onUkiRouteData?.(null);
      return;
    }
    onUkiRouteData?.({
      currentRequirementRaw: route.currentRequirement.ukiRaw,
      presaleLockedRaw: route.source.presaleLockedRaw,
      indexedStakedRaw: route.source.stakedUkiRaw,
      allocatedSlots: route.position?.allocatedSlots ?? 0,
    });
  }, [onUkiRouteData, state, status]);

  const inventory = useMemo(() => [...(status?.nftInventory ?? [])].sort((left, right) => {
    if (left.contributesToCukieMaster !== right.contributesToCukieMaster) {
      return left.contributesToCukieMaster ? -1 : 1;
    }
    if (left.canSoftStake !== right.canSoftStake) return left.canSoftStake ? -1 : 1;
    return (right.rarityPoints ?? -1) - (left.rarityPoints ?? -1)
      || left.assetId.localeCompare(right.assetId);
  }), [status?.nftInventory]);

  async function mutateNft(asset: PublicNft, operation: 'soft_stake' | 'unstake') {
    if (!user?.walletAddress || mutatingAsset) return;
    setMutatingAsset(asset.assetId);
    setMutationError(null);
    try {
      const idempotencyKey = `cukie-master-ui:${user.walletAddress.toLowerCase()}:${operation}:${asset.assetId}:${crypto.randomUUID()}`;
      const response = await fetch('/api/economy/v1/cukie-master', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          operation,
          assetId: asset.assetId,
          ...(operation === 'unstake' && asset.lock ? {
            lockId: asset.lock.lockId,
            expectedFencingToken: asset.lock.fencingToken,
          } : {}),
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('NFT_OPERATION_FAILED');
      setReloadNonce((value) => value + 1);
    } catch {
      setMutationError('No se pudo completar la operación. El estado del NFT no ha cambiado; inténtalo de nuevo.');
    } finally {
      setMutatingAsset(null);
    }
  }

  const totalCounts = status ? {
    active: slotCounts(status.routes.uki).active + slotCounts(status.routes.nft).active,
    qualifying: slotCounts(status.routes.uki).qualifying + slotCounts(status.routes.nft).qualifying,
    grace: slotCounts(status.routes.uki).grace + slotCounts(status.routes.nft).grace,
  } : null;
  const visibleAllocatedSlots = status
    ? (status.routes.uki.position?.allocatedSlots ?? 0)
      + (status.routes.nft.position?.allocatedSlots ?? 0)
    : 0;
  const visibleOverviewSlots = status
    ? visibleRouteSlots(status.routes.uki) + visibleRouteSlots(status.routes.nft)
    : 0;
  const overviewHeading = state === 'ready' || state === 'stale'
    ? visibleOverviewSlots > 0
      ? `Tienes ${visibleOverviewSlots} ${visibleOverviewSlots === 1 ? 'cupo' : 'cupos'} Cukie Master`
      : 'Consigue tu primer cupo'
    : state === 'loading'
      ? 'Estamos comprobando tu posición'
      : 'Comprueba tu posición';
  const overviewDescription = state === 'ready' || state === 'stale'
    ? visibleOverviewSlots > 0
      ? 'Aquí ves qué cupos ya cuentan, cuáles están validándose y qué puedes hacer ahora.'
      : 'Puedes conseguir cupos depositando UKI o usando tus Cukies Originales.'
    : 'Conecta y firma tu wallet para ver tus cupos, créditos y siguiente acción.';

  return (
    <section id="mi-estado" className="relative z-[2] w-full min-w-0 scroll-mt-24 pb-8">
      <Panel className="min-w-0" innerClassName="min-w-0 p-5 sm:p-7">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Tu estado personal</p>
            <h2 className="mt-2 break-words font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
              {overview ? overviewHeading : 'Tu posición Cukie Master'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {overview
                ? overviewDescription
                : ukiOnly
                ? 'Tus UKI de preventa pendientes y tus UKI en staking se suman automáticamente.'
                : 'Revisamos vesting, staking e inventario antes de recomendarte ninguna acción.'}
            </p>
          </div>
          {status ? (
            <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
              <p className="max-w-full truncate text-xs font-semibold text-[var(--uki-muted)]">
                Wallet {shortWallet(status.walletNormalized)}
              </p>
              <button
                type="button"
                disabled={isRefreshing}
                onClick={() => setReloadNonce((value) => value + 1)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[7px] border border-white/10 px-3 text-xs font-black uppercase text-[var(--uki-text)] hover:border-[var(--uki-lilac-border)] hover:text-[var(--uki-lilac)] disabled:cursor-wait disabled:opacity-60"
              >
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {isRefreshing ? 'Actualizando' : 'Actualizar estado'}
              </button>
            </div>
          ) : null}
        </div>

        {authLoading || state === 'loading' ? (
          overview ? <CukieMasterOverviewSkeleton /> : (
            <div role="status" aria-live="polite" className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" />
              Verificando tus UKI…
            </div>
          )
        ) : null}

        {!authLoading && state === 'idle' ? (
          <div className="mt-6 grid min-w-0 gap-4 rounded-[10px] border border-[var(--uki-lilac-border)] bg-black/20 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <p className="font-headline text-lg font-black text-[var(--uki-cream)]">Conecta tu wallet</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                Usa una wallet EVM y firma el acceso para consultar tu posición y tus saldos.
              </p>
            </div>
            <LandingWalletConnectButton
              className="min-h-11 justify-center"
              evmOnly
              label="Conectar wallet"
              compactLabel="Conectar"
              showCompactText={false}
            />
          </div>
        ) : null}

        {state === 'unavailable' ? (
          <div role="alert" className="mt-6 flex flex-col gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4 sm:flex-row sm:items-center">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                No podemos verificar tu estado económico ahora mismo. No mostramos cifras sin confirmar y reintentaremos automáticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                initialRetryCountRef.current = 0;
                setReloadNonce((value) => value + 1);
              }}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[7px] border border-amber-200/30 px-3 text-xs font-black uppercase text-amber-100"
            >
              Reintentar ahora
            </button>
          </div>
        ) : null}

        {state === 'stale' && status ? (
          <div role="alert" className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
            <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              La última actualización no respondió. Conservamos tu última lectura confirmada mientras reintentamos; las estimaciones sensibles permanecen desactivadas hasta recuperar la conexión.
            </p>
          </div>
        ) : null}

        {(state === 'ready' || state === 'stale') && status && totalCounts ? (
          overview ? (
            <CukieMasterOverview status={status} />
          ) : ukiOnly ? (
            <UkiOnlyStatus route={status.routes.uki} />
          ) : (
            <>
            <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-3">
              <StatusMetric
                label="Cupos activos"
                value={`${totalCounts.active}/${status.totals.maxPotentialSlots}`}
                helper={`${visibleAllocatedSlots} asignados entre las dos rutas`}
                tone="lilac"
              />
              <StatusMetric
                label="En validación"
                value={String(totalCounts.qualifying)}
                helper="Pendientes del siguiente periodo elegible"
              />
              <StatusMetric
                label="En gracia"
                value={String(totalCounts.grace)}
                helper="Cupos que aún puedes conservar ajustando activos"
                tone={totalCounts.grace > 0 ? 'warning' : 'neutral'}
              />
            </div>

            <Tabs value={activeRoute} onValueChange={(value) => setActiveRoute(value as RouteKey)} className="mt-5 min-w-0">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Elige una ruta</p>
                  <h3 className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)]">Estado y siguiente acción</h3>
                </div>
                <p className="text-xs font-semibold text-[var(--uki-muted)]">Máximo {MAX_ROUTE_SLOTS} cupos por ruta</p>
              </div>
              <TabsList className="mt-4 grid h-auto w-full min-w-0 grid-cols-1 gap-3 bg-transparent p-0 sm:grid-cols-2">
                <RouteTab value="uki" label="Ruta UKI" route={status.routes.uki} />
                <RouteTab value="nft" label="Ruta Cukies" route={status.routes.nft} />
              </TabsList>

              <TabsContent value="uki" className="mt-4 min-w-0">
                <RouteDetail label="Ruta UKI" route={status.routes.uki} />
                <div className="mt-4 flex flex-col gap-3 rounded-[8px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-[var(--uki-cream)]">¿Te faltan UKI para el siguiente cupo?</p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">El vesting ya está incluido. Deposita únicamente el déficit que quieras cubrir.</p>
                  </div>
                  <LandingButton href="#uki-staking" className="shrink-0">Gestionar staking</LandingButton>
                </div>
              </TabsContent>

              <TabsContent value="nft" className="mt-4 min-w-0">
                <RouteDetail label="Ruta Cukies" route={status.routes.nft} />
                {status.nftCustody?.mode === 'custodial' ? (
                  <div className="mt-4 flex flex-col gap-3 rounded-[8px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-[var(--uki-cream)]">Gestiona tus Cukies depositados desde esta misma página</p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                        Elige y deposita tus Cukies Originales en el apartado siguiente. Los de Segunda Generación no aparecen como disponibles; una posición ya custodiada seguirá visible para que puedas retirarla.
                      </p>
                    </div>
                    <LandingButton href="#cukie-master-nft-staking" className="shrink-0">Gestionar Cukies</LandingButton>
                  </div>
                ) : (
                  <NftInventory
                    assets={inventory}
                    activePoints={status.routes.nft.source.originalCukiePoints}
                    mutatingAsset={mutatingAsset}
                    mutationError={mutationError}
                    onMutate={mutateNft}
                  />
                )}
              </TabsContent>
            </Tabs>
            </>
          )
        ) : null}
      </Panel>
    </section>
  );
}

function CukieMasterOverviewSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Cargando tu resumen Cukie Master" className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-[8px] bg-white/[0.06]" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-[10px] bg-white/[0.06]" />
    </div>
  );
}

function CukieMasterOverview({ status }: { status: PublicStatus }) {
  const ukiSlots = visibleRouteSlots(status.routes.uki);
  const nftSlots = visibleRouteSlots(status.routes.nft);
  const totalSlots = ukiSlots + nftSlots;
  const ukiCounts = summarySlotCounts(status.routes.uki);
  const nftCounts = summarySlotCounts(status.routes.nft);
  const counts = {
    active: ukiCounts.active + nftCounts.active,
    qualifying: ukiCounts.qualifying + nftCounts.qualifying,
    grace: ukiCounts.grace + nftCounts.grace,
  };
  const dailyCredits = counts.active * CUKIE_MASTER_DAILY_CREDITS_PER_SLOT;
  const isSynchronizing = Boolean(
    status.routes.uki.synchronizing || status.routes.nft.synchronizing,
  );
  const preserveDeficit = status.routes.uki.deficitToPreserveSlots
    ?? status.routes.nft.deficitToPreserveSlots;
  const nextUkiDeficit = status.routes.uki.deficitToNextSlot;

  const nextAction = (() => {
    if (counts.grace > 0) {
      return {
        eyebrow: 'Necesita atención',
        title: `Protege ${counts.grace === 1 ? 'tu cupo' : 'tus cupos'} en gracia`,
        description: preserveDeficit
          ? `Añade ${requirementLabel(preserveDeficit)} antes de que termine el periodo de gracia.`
          : 'Revisa la vía afectada y ajusta tus activos antes de que termine el periodo de gracia.',
        primary: preserveDeficit?.route === 'nft'
          ? { href: '#cukie-master-nft-staking', label: 'Gestionar Cukies' }
          : { href: '#uki-staking', label: 'Gestionar staking UKI' },
        secondary: { href: '#competition-credits', label: 'Ver mis créditos' },
        warning: true,
      };
    }
    if (isSynchronizing) {
      return {
        eyebrow: 'Actualizando',
        title: 'Estamos confirmando tus últimos cambios',
        description: 'No repitas ninguna operación. Tu resumen se actualizará automáticamente cuando termine la comprobación.',
        primary: { href: '#uki-staking', label: 'Ver staking UKI' },
        secondary: { href: '#cukie-master-nft-staking', label: 'Ver mis Cukies' },
        warning: false,
      };
    }
    if (totalSlots === 0) {
      return {
        eyebrow: 'Siguiente paso',
        title: 'Consigue tu primer cupo',
        description: 'Deposita UKI o usa puntos de rareza de tus Cukies Originales. Puedes combinar ambas vías sin perder sus límites independientes.',
        primary: { href: '#uki-staking', label: 'Conseguirlo con UKI' },
        secondary: { href: '#cukie-master-nft-staking', label: 'Usar mis Cukies' },
        warning: false,
      };
    }
    if (counts.active === 0 && counts.qualifying > 0) {
      return {
        eyebrow: 'En validación',
        title: `${counts.qualifying === 1 ? 'Tu cupo está' : 'Tus cupos están'} madurando`,
        description: 'Cada cupo empieza a generar créditos cuando completa sus primeras 24 horas y llega al siguiente corte diario.',
        primary: { href: '#competition-credits', label: 'Ver mis créditos' },
        secondary: { href: '#uki-staking', label: 'Revisar staking' },
        warning: false,
      };
    }
    if (totalSlots >= status.totals.maxPotentialSlots) {
      return {
        eyebrow: 'Máximo alcanzado',
        title: 'Ya tienes todos tus cupos disponibles',
        description: 'Revisa tus créditos y decide cuánto quieres conservar para jugar y cuánto aportar al pool.',
        primary: { href: '#competition-credits', label: 'Gestionar créditos' },
        secondary: { href: '#uki-staking', label: 'Revisar staking' },
        warning: false,
      };
    }
    return {
      eyebrow: 'Siguiente paso',
      title: nextUkiDeficit?.route === 'uki'
        ? `Te faltan ${requirementLabel(nextUkiDeficit)} para otro cupo`
        : 'Puedes aumentar tus cupos',
      description: 'Tu vesting ya está incluido. Deposita únicamente la cantidad que quieras añadir a tu posición.',
      primary: { href: '#uki-staking', label: 'Gestionar staking UKI' },
      secondary: { href: '#competition-credits', label: 'Gestionar créditos' },
      warning: false,
    };
  })();

  return (
    <div className="mt-6 min-w-0" data-cukie-master-overview>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
        <OverviewMetric
          label="Tus cupos"
          value={`${totalSlots}/${status.totals.maxPotentialSlots}`}
          helper={`${ukiSlots} con UKI · ${nftSlots} con Cukies`}
          emphasized
        />
        <OverviewMetric
          label="Estado actual"
          value={`${counts.active} activos`}
          helper={`${counts.qualifying} validando · ${counts.grace} en gracia`}
        />
        <OverviewMetric
          label="Créditos diarios"
          value={dailyCredits.toLocaleString('es-ES')}
          helper={`${CUKIE_MASTER_DAILY_CREDITS_PER_SLOT} por cada cupo activo`}
        />
      </div>

      <div className={`mt-4 grid min-w-0 gap-5 rounded-[10px] border p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center ${
        nextAction.warning
          ? 'border-amber-300/30 bg-amber-300/10'
          : 'border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)]'
      }`}>
        <div className="min-w-0">
          <p className={`text-xs font-black tracking-[0.08em] ${nextAction.warning ? 'text-amber-200' : 'text-[var(--uki-lilac)]'}`}>
            {nextAction.eyebrow}
          </p>
          <h3 className="mt-2 text-balance font-headline text-xl font-black text-[var(--uki-cream)] sm:text-2xl">
            {nextAction.title}
          </h3>
          <p className="mt-2 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            {nextAction.description}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
          <LandingButton href={nextAction.primary.href} className="justify-center">
            {nextAction.primary.label}
          </LandingButton>
          <LandingButton href={nextAction.secondary.href} variant="secondary" className="justify-center">
            {nextAction.secondary.label}
          </LandingButton>
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({
  emphasized = false,
  helper,
  label,
  value,
}: {
  emphasized?: boolean;
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`min-w-0 rounded-[8px] p-4 ${
      emphasized
        ? 'border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)]'
        : 'border border-white/10 bg-black/20'
    }`}>
      <p className="text-sm font-semibold text-[var(--uki-muted)]">{label}</p>
      <p className={`mt-2 font-headline text-3xl font-black tabular-nums ${
        emphasized ? 'text-[var(--uki-lilac)]' : 'text-[var(--uki-cream)]'
      }`}>{value}</p>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{helper}</p>
    </div>
  );
}

function UkiOnlyStatus({ route }: { route: PublicRoute }) {
  const breakdown = getUkiBreakdown(route);
  const displayedSlots = route.source.complete
    ? route.balanceQualifiedSlots
      ?? route.previewSlots
      ?? route.position?.allocatedSlots
      ?? 0
    : 0;
  const deficit = route.deficitToPreserveSlots ?? route.deficitToNextSlot;
  const nextStep = displayedSlots >= MAX_ROUTE_SLOTS
    ? 'Has alcanzado el máximo de 5 Cukie Masters mediante UKI.'
    : deficit
      ? `Te faltan ${requirementLabel(deficit)} para desbloquear tu próximo Cukie Master.`
      : 'Deposita UKI para avanzar hacia tu próximo Cukie Master.';

  return (
    <div className="mt-6 min-w-0">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusMetric
          label="UKI en vesting"
          value={breakdown?.locked ?? 'No disponible'}
          helper="Asignación de preventa aún no reclamada"
        />
        <StatusMetric
          label="UKI en staking"
          value={breakdown?.staked ?? 'No disponible'}
          helper="Depositados en el contrato UKIStaking"
        />
        <StatusMetric
          label="Total computable"
          value={breakdown?.total ?? 'No disponible'}
          helper="Vesting y staking"
          tone="lilac"
        />
        <StatusMetric
          label="Tus Cukie Masters"
          value={`${displayedSlots}/${MAX_ROUTE_SLOTS}`}
          helper="Preventa pendiente + staking · máximo 5"
          tone="lilac"
        />
      </div>

      <div className="mt-4 rounded-[8px] border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-4 text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          <span>Tu progreso</span>
          <span>{displayedSlots} de {MAX_ROUTE_SLOTS}</span>
        </div>
        <span
          role="progressbar"
          aria-label="Progreso Cukie Master por UKI"
          aria-valuemin={0}
          aria-valuemax={MAX_ROUTE_SLOTS}
          aria-valuenow={displayedSlots}
          className="mt-3 block h-2 overflow-hidden rounded-full bg-white/10"
        >
          <span
            className="block h-full rounded-full bg-[var(--uki-lilac)]"
            style={{ width: `${Math.min(100, displayedSlots * 20)}%` }}
          />
        </span>
        <p className="mt-3 text-sm font-semibold text-[var(--uki-text)]">{nextStep}</p>
      </div>
    </div>
  );
}

function StatusMetric({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'lilac' | 'warning' | 'neutral';
}) {
  const valueClass = tone === 'lilac'
    ? 'text-[var(--uki-lilac)]'
    : tone === 'warning'
      ? 'text-amber-300'
      : 'text-[var(--uki-cream)]';
  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">{label}</p>
      <p className={`mt-2 font-headline text-3xl font-black ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{helper}</p>
    </div>
  );
}

function RouteTab({ value, label, route }: { value: RouteKey; label: string; route: PublicRoute }) {
  const allocated = route.position?.allocatedSlots ?? 0;
  const displayed = route.synchronizing ? route.previewSlots ?? 0 : allocated;
  const counts = slotCounts(route);
  return (
    <TabsTrigger
      value={value}
      className="group min-h-[7.5rem] min-w-0 whitespace-normal rounded-[10px] border border-white/10 bg-black/20 p-4 text-left text-[var(--uki-text)] shadow-none data-[state=active]:border-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)]"
    >
      <span className="block min-w-0 w-full">
        <span className="flex items-center justify-between gap-3">
          <span className="font-headline text-lg font-black uppercase">{label}</span>
          {route.source.complete
            ? route.synchronizing
              ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" />
              : <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
            : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />}
        </span>
        <span className="mt-2 flex items-end justify-between gap-3">
          <span className="font-headline text-2xl font-black text-[var(--uki-gold)]">{displayed}/{MAX_ROUTE_SLOTS}</span>
          <span className="text-xs font-semibold text-[var(--uki-muted)]">
            {route.synchronizing
              ? `${displayed} detectados · sincronizando`
              : `${counts.active} activos · ${counts.qualifying} validando`}
          </span>
        </span>
        <span
          role="progressbar"
          aria-label={`Progreso ${label}`}
          aria-valuemin={0}
          aria-valuemax={MAX_ROUTE_SLOTS}
          aria-valuenow={displayed}
          aria-valuetext={`${displayed} de ${MAX_ROUTE_SLOTS} cupos${route.synchronizing ? ' detectados, sincronizando' : ''}`}
          className="mt-3 block h-2 overflow-hidden rounded-full bg-white/10"
        >
          <span className="block h-full rounded-full bg-[var(--uki-lilac)]" style={{ width: `${Math.min(100, displayed * 20)}%` }} />
        </span>
      </span>
    </TabsTrigger>
  );
}

function RouteDetail({ label, route }: { label: string; route: PublicRoute }) {
  const ukiBreakdown = getUkiBreakdown(route);
  const counts = slotCounts(route);
  const deficit = route.deficitToPreserveSlots ?? route.deficitToNextSlot;
  return (
    <div className="min-w-0 rounded-[10px] border border-white/10 bg-black/20 p-4 sm:p-5">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="font-headline text-xl font-black uppercase text-[var(--uki-cream)]">{label}</h4>
            <span className="w-fit rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase text-[var(--uki-muted)]">
              {counts.active} activos · {counts.qualifying} en validación · {counts.grace} en gracia
            </span>
          </div>

          {!route.source.complete ? (
            <div role="alert" className="mt-4 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">Estamos verificando la última información de esta ruta. Los cupos anteriores permanecen ocultos hasta completar la comprobación.</p>
            </div>
          ) : (
            <>
              {route.synchronizing ? (
                <div role="status" className="mt-4 flex gap-3 rounded-[8px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-3">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" />
                  <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                    Hemos detectado el cambio. Estamos actualizando tus cupos y su periodo de validación; no repitas la operación.
                  </p>
                </div>
              ) : null}
              {ukiBreakdown ? (
                <div className="mt-4 rounded-[8px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">UKI que ya cuentan</p>
                  <p className="mt-2 break-words text-base font-black text-[var(--uki-cream)]">
                    {ukiBreakdown.total} = {ukiBreakdown.locked} en vesting + {ukiBreakdown.staked} en staking
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-[8px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Puntos que ya cuentan</p>
                  <p className="mt-2 text-2xl font-black text-[var(--uki-gold)]">{route.source.originalCukiePoints ?? 0} puntos</p>
                </div>
              )}
            </>
          )}

          <dl className="mt-4 grid min-w-0 gap-3 text-sm font-semibold sm:grid-cols-2">
            <RouteMetric label="Requisito vigente" value={requirementLabel(route.currentRequirement)} />
            <RouteMetric
              label={route.deficitToPreserveSlots ? 'Déficit para conservar' : 'Déficit siguiente cupo'}
              value={deficit
                ? requirementLabel(deficit)
                : route.source.complete ? 'Máximo alcanzado' : 'No disponible'}
            />
            {(route.position?.protectedSlots ?? 0) > 0 || counts.grace > 0 ? (
              <RouteMetric label="Cupos conservados en gracia" value={String(route.position?.protectedSlots ?? 0)} />
            ) : null}
            {ukiBreakdown ? <RouteMetric label="Margen tras cupos" value={ukiBreakdown.excess} /> : null}
          </dl>

          {route.pendingRequirement ? (
            <div className="mt-4 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-3 text-xs font-semibold leading-relaxed text-amber-100">
              Próximo requisito: {requirementLabel(route.pendingRequirement)}. Puedes ajustarte hasta {dateLabel(route.requirementGraceEndsAt) ?? 'el final de la ventana de 48 horas'}.
            </div>
          ) : null}
        </div>

        <div className="min-w-0 border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Estado de cada cupo</p>
          <div className="mt-3 space-y-2">
            {route.slots.length === 0 ? (
              <p className="text-sm font-semibold text-[var(--uki-muted)]">
                {route.synchronizing
                  ? 'Los cupos aparecerán aquí cuando termine la sincronización.'
                  : 'Todavía no hay cupos asignados en esta ruta.'}
              </p>
            ) : route.slots.map((slot) => (
              <div key={`${slot.route}:${slot.ordinal}:${slot.eligibilityEpoch}`} className="flex min-w-0 items-start justify-between gap-3 rounded-[7px] border border-white/10 px-3 py-2.5 text-xs font-semibold">
                <span className="shrink-0 text-[var(--uki-text)]">Cupo {slot.ordinal}</span>
                <span className="flex min-w-0 items-start gap-1.5 text-right text-[var(--uki-muted)]">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{slotStatusLabel(slot)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[7px] border border-white/10 p-3">
      <dt className="text-xs text-[var(--uki-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-[var(--uki-text)]">{value}</dd>
    </div>
  );
}

function NftInventory({
  assets,
  activePoints,
  mutatingAsset,
  mutationError,
  onMutate,
}: {
  assets: PublicNft[];
  activePoints?: number;
  mutatingAsset: string | null;
  mutationError: string | null;
  onMutate: (asset: PublicNft, operation: 'soft_stake' | 'unstake') => Promise<void>;
}) {
  const availablePoints = assets.reduce(
    (total, asset) => total + (asset.canSoftStake ? asset.rarityPoints ?? 0 : 0),
    0,
  );
  return (
    <section aria-labelledby="cukie-master-inventory-title" className="mt-4 min-w-0 rounded-[10px] border border-white/10 bg-black/20 p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Inventario Original BSC</p>
          <h4 id="cukie-master-inventory-title" className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)]">Elige qué Cukies usar</h4>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Usar un Cukie bloquea su uso económico, pero no transfiere el NFT ni firma por ti.
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <MiniMetric label="Activos" value={`${activePoints ?? 0} pts`} />
          <MiniMetric label="Disponibles" value={`+${availablePoints} pts`} />
        </div>
      </div>

      {mutationError ? <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">{mutationError}</p> : null}
      {mutatingAsset ? <p role="status" aria-live="polite" className="mt-3 text-xs font-semibold text-[var(--uki-lilac)]">Actualizando el inventario de forma segura…</p> : null}

      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {assets.length === 0 ? (
          <p className="text-sm font-semibold text-[var(--uki-muted)]">No hay Cukies Originales BSC disponibles para esta wallet.</p>
        ) : assets.map((asset) => {
          const name = `Cukie #${asset.tokenId ?? asset.assetId.slice(-8)}`;
          const points = asset.rarityPoints;
          const isMutating = mutatingAsset === asset.assetId;
          return (
            <article key={asset.assetId} className="min-w-0 overflow-hidden rounded-[10px] border border-white/10 bg-[#07131d]">
              <div className="relative aspect-[4/3] min-w-0 overflow-hidden bg-black/25">
                <CukiImage src={asset.imageUrl} alt={name} sizes="(min-width: 1280px) 24vw, (min-width: 640px) 44vw, 90vw" className="object-contain p-3" />
                <span className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-xs font-black uppercase ${rarityClass(asset.rarity)}`}>
                  {rarityLabel(asset.rarity)}
                </span>
                {asset.contributesToCukieMaster ? (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-[var(--uki-lilac-border)] bg-[#160a22]/90 px-2.5 py-1 text-xs font-black text-[var(--uki-lilac)]">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> En uso
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h5 className="truncate text-base font-black text-[var(--uki-cream)]">{name}</h5>
                    <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{stateLabel(asset.state)}</p>
                  </div>
                  <span className="shrink-0 text-right font-headline text-lg font-black text-[var(--uki-gold)]">
                    {points === null ? '—' : `${points} pts`}
                  </span>
                </div>

                <div className={`mt-3 flex min-h-11 items-center gap-2 rounded-[7px] border p-3 text-xs font-semibold ${
                  asset.contributesToCukieMaster
                    ? 'border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] text-[var(--uki-text)]'
                    : 'border-white/10 text-[var(--uki-muted)]'
                }`}>
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                  {asset.contributesToCukieMaster
                    ? `Aporta ${pointsLabel(asset.contributionPoints)} a tu ruta`
                    : points === null
                      ? 'Puntuación no verificable'
                      : asset.canSoftStake
                        ? `Puede aportar ${pointsLabel(points)}`
                        : blockerLabel(asset.blockers[0])}
                </div>

                {asset.canSoftStake ? (
                  <button
                    type="button"
                    disabled={Boolean(mutatingAsset)}
                    onClick={() => void onMutate(asset, 'soft_stake')}
                    aria-label={`Usar ${name} para Cukie Master`}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-[var(--uki-lilac-border)] px-3 py-2 text-center text-xs font-black uppercase text-[var(--uki-lilac)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                    Usar para Cukie Master
                  </button>
                ) : asset.canUnstake ? (
                  <button
                    type="button"
                    disabled={Boolean(mutatingAsset)}
                    onClick={() => void onMutate(asset, 'unstake')}
                    aria-label={`Dejar de usar ${name} para Cukie Master`}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-white/15 px-3 py-2 text-center text-xs font-black uppercase text-[var(--uki-text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                    Dejar de usar
                  </button>
                ) : (
                  <p className="mt-3 flex min-h-11 items-center justify-center rounded-[7px] border border-white/10 px-3 text-center text-xs font-black uppercase text-[var(--uki-muted)]">
                    {asset.contributesToCukieMaster ? 'Aportación mantenida' : 'No disponible'}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2 text-right">
      <p className="text-xs font-semibold text-[var(--uki-muted)]">{label}</p>
      <p className="mt-1 font-black text-[var(--uki-cream)]">{value}</p>
    </div>
  );
}

function getUkiBreakdown(route: PublicRoute) {
  if (
    !route.source.complete
    || route.source.route !== 'uki'
    || route.source.totalUkiRaw === undefined
    || route.source.presaleLockedRaw === undefined
    || route.source.stakedUkiRaw === undefined
    || route.currentRequirement.route !== 'uki'
  ) return null;

  try {
    const total = BigInt(route.source.totalUkiRaw);
    const requirement = BigInt(route.currentRequirement.ukiRaw);
    if (requirement <= BigInt(0)) return null;
    const qualifyingSlots = total / requirement > BigInt(MAX_ROUTE_SLOTS)
      ? BigInt(MAX_ROUTE_SLOTS)
      : total / requirement;
    const excess = total - (qualifyingSlots * requirement);
    return {
      total: requirementLabel({ route: 'uki', ukiRaw: total.toString() }),
      excess: requirementLabel({ route: 'uki', ukiRaw: excess.toString() }),
      locked: requirementLabel({ route: 'uki', ukiRaw: route.source.presaleLockedRaw }),
      staked: requirementLabel({ route: 'uki', ukiRaw: route.source.stakedUkiRaw }),
    };
  } catch {
    return null;
  }
}

function slotStatusLabel(slot: PublicSlot) {
  if (slot.status === 'active') return 'Activo';
  if (slot.status === 'grace') return `En gracia hasta ${dateLabel(slot.graceEndsAt) ?? 'fecha pendiente'}`;
  if (slot.status === 'qualifying') return `Activo desde ${dateLabel(slot.creditEligibleFrom) ?? 'el siguiente periodo elegible'}`;
  return 'Inactivo';
}

function rarityLabel(rarity: string) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
  } as Record<string, string>)[rarity] ?? 'Sin verificar';
}

function pointsLabel(points: number) {
  return `${points} ${points === 1 ? 'punto' : 'puntos'}`;
}

function rarityClass(rarity: string) {
  return ({
    common: 'border-white/20 bg-black/70 text-[var(--uki-text)]',
    uncommon: 'border-emerald-300/30 bg-emerald-950/80 text-emerald-200',
    rare: 'border-lilac-300/30 bg-lilac-950/80 text-lilac-200',
    epic: 'border-purple-300/30 bg-purple-950/80 text-purple-200',
    legendary: 'border-amber-300/30 bg-amber-950/80 text-amber-200',
    goat: 'border-pink-300/30 bg-pink-950/80 text-pink-200',
  } as Record<string, string>)[rarity] ?? 'border-white/20 bg-black/70 text-[var(--uki-muted)]';
}

function stateLabel(state: string) {
  return ({
    available: 'Disponible',
    soft_staked: 'Usado en Cukie Master',
    assigned_to_game: 'Asignado temporalmente a una partida',
    in_pool: 'Depositado en un pool',
    listed: 'Listado en marketplace',
    bridging: 'En proceso de bridge',
    invalidated: 'Pendiente de revisión',
  } as Record<string, string>)[state] ?? 'Estado no verificable';
}

function blockerLabel(blocker?: string) {
  return ({
    missing_rarity: 'Rareza pendiente de verificar',
    missing_generation: 'Generación pendiente de verificar',
    second_generation: 'Solo cuentan Cukies Originales',
    listed: 'Retíralo del marketplace para usarlo',
    bridging: 'Espera a que termine el bridge',
    already_locked: 'Ya está reservado para otro uso',
    in_pool: 'Retíralo del pool para usarlo',
    assigned_to_game: 'Está asignado a una partida',
    invalidated: 'Requiere revisión de inventario',
    unknown_state: 'Estado pendiente de verificar',
    unsupported_network: 'Solo cuentan activos en BSC',
  } as Record<string, string>)[blocker ?? ''] ?? 'No puede usarse en este momento';
}

function requirementLabel(requirement: Requirement) {
  if (requirement.route === 'nft') return `${requirement.nftPoints} puntos`;
  const formatted = formatUnits(BigInt(requirement.ukiRaw), 18);
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(Number(formatted))} UKI`;
}
