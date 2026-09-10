'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Crown,
  Gamepad2,
  Gift,
  Layers3,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { formatUnits } from 'viem';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import type {
  DashboardModule,
  DashboardModuleId,
  DashboardModulePayloads,
  DashboardSummary,
} from '@/lib/dashboard/summary';
import { useAuth } from '@/providers/auth-provider';
import { useAppRuntime, useAppRuntimeResource } from '@/providers/app-runtime-provider';

type RequestState =
  | { state: 'idle'; summary: null }
  | { state: 'loading'; summary: DashboardSummary | null }
  | { state: 'ready'; summary: DashboardSummary }
  | { state: 'stale'; summary: DashboardSummary }
  | { state: 'unavailable'; summary: DashboardSummary | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown) {
  return value === null || isNonNegativeInteger(value);
}

function isCanonicalRaw(value: unknown) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
}

function isTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isSlotRoute(value: unknown) {
  return isRecord(value)
    && isNonNegativeInteger(value.allocatedSlots)
    && isNonNegativeInteger(value.desiredSlots)
    && typeof value.sourceComplete === 'boolean'
    && typeof value.projectionFresh === 'boolean'
    && typeof value.synchronizing === 'boolean';
}

const MODULE_DATA_VALIDATORS: Record<DashboardModuleId, (value: unknown) => boolean> = {
  cukieMaster: (value) => isRecord(value)
    && isNonNegativeInteger(value.allocatedSlots)
    && isNonNegativeInteger(value.desiredSlots)
    && value.maxPotentialSlots === 10
    && isRecord(value.routes)
    && isSlotRoute(value.routes.uki)
    && isSlotRoute(value.routes.nft),
  credits: (value) => isRecord(value)
    && isNonNegativeInteger(value.availableCredits)
    && isNullableNonNegativeInteger(value.reservedCredits)
    && isNullableNonNegativeInteger(value.spentCredits)
    && isNullableNonNegativeInteger(value.poolDepositedCredits)
    && isNonNegativeInteger(value.poolAvailableCredits)
    && isNonNegativeInteger(value.activeReservations),
  cukiePool: (value) => isRecord(value)
    && isNonNegativeInteger(value.positions)
    && isNonNegativeInteger(value.activePositions)
    && isNonNegativeInteger(value.gamesRemaining),
  rewards: (value) => isRecord(value)
    && isCanonicalRaw(value.claimableRaw)
    && isNonNegativeInteger(value.allocations)
    && isNonNegativeInteger(value.claims)
    && typeof value.claimPublished === 'boolean'
    && isNonNegativeInteger(value.blockedAllocations),
  marketplace: (value) => isRecord(value)
    && isNonNegativeInteger(value.inventory)
    && isNonNegativeInteger(value.listingEligible)
    && isNonNegativeInteger(value.activeListings)
    && isNonNegativeInteger(value.attentionListings),
  vesting: (value) => isRecord(value)
    && (value.chainId === 56 || value.chainId === 97)
    && typeof value.configFrozen === 'boolean'
    && typeof value.hasPosition === 'boolean'
    && isCanonicalRaw(value.totalAmountRaw)
    && isCanonicalRaw(value.releasedAmountRaw)
    && isCanonicalRaw(value.releasableRaw)
    && isCanonicalRaw(value.lockedAmountRaw)
    && typeof value.progressBps === 'number'
    && isNonNegativeInteger(value.progressBps)
    && value.progressBps <= 10_000,
  game: (value) => isRecord(value)
    && typeof value.configured === 'boolean'
    && typeof value.enabled === 'boolean'
    && typeof value.phase === 'string'
    && (value.campaignId === null || typeof value.campaignId === 'string')
    && (value.eligibilityKind === null || typeof value.eligibilityKind === 'string')
    && isNullableNonNegativeInteger(value.attemptsGranted)
    && isNullableNonNegativeInteger(value.attemptsUsed)
    && isNullableNonNegativeInteger(value.attemptsRemaining)
    && isNullableNonNegativeInteger(value.bestRank)
    && isNullableNonNegativeInteger(value.totalTickets),
};

function isDashboardSummary(value: unknown, expectedWallet?: string | null): value is DashboardSummary {
  if (
    !isRecord(value)
    || value.schemaVersion !== 'dashboard-v1'
    || !isTimestamp(value.generatedAt)
    || (value.overallState !== 'ready' && value.overallState !== 'partial')
    || !isRecord(value.identity)
    || typeof value.identity.walletNormalized !== 'string'
    || (expectedWallet !== undefined
      && expectedWallet !== null
      && value.identity.walletNormalized.toLowerCase() !== expectedWallet.toLowerCase())
    || (value.identity.username !== null && typeof value.identity.username !== 'string')
    || !isTimestamp(value.identity.sessionExpiresAt)
    || !isRecord(value.network)
    || !(
      (value.network.environment === 'staging' && value.network.chainId === 97)
      || (value.network.environment === 'production' && value.network.chainId === 56)
    )
    || !Array.isArray(value.alerts)
    || !value.alerts.every((alert) => isRecord(alert)
      && typeof alert.module === 'string'
      && Object.hasOwn(MODULE_DATA_VALIDATORS, alert.module)
      && (alert.severity === 'warning' || alert.severity === 'error')
      && (alert.code === 'MODULE_DEGRADED' || alert.code === 'MODULE_UNAVAILABLE'))
  ) return false;
  const modules = value.modules;
  if (!isRecord(modules)) return false;
  const modulesAreValid = [
    'cukieMaster',
    'credits',
    'cukiePool',
    'rewards',
    'marketplace',
    'vesting',
    'game',
  ].every((key) => {
    const moduleValue = modules[key];
    return isRecord(moduleValue)
      && ['ready', 'degraded', 'unavailable'].includes(String(moduleValue.state))
      && isTimestamp(moduleValue.generatedAt)
      && (moduleValue.sourceObservedAt === null || isTimestamp(moduleValue.sourceObservedAt))
      && Array.isArray(moduleValue.issues)
      && moduleValue.issues.every((issue) => typeof issue === 'string')
      && (moduleValue.state === 'unavailable'
        ? moduleValue.data === null
        : MODULE_DATA_VALIDATORS[key as DashboardModuleId](moduleValue.data));
  });
  if (!modulesAreValid) return false;
  const vesting = modules.vesting;
  return isRecord(vesting)
    && (vesting.state === 'unavailable'
      || (isRecord(vesting.data) && vesting.data.chainId === value.network.chainId));
}

function shortWallet(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function integerLabel(value: number | null | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)
    : 'No disponible';
}

function ukiLabel(raw: string | null | undefined) {
  if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw)) return 'No disponible';
  try {
    const amount = formatUnits(BigInt(raw), 18);
    const [integer, fraction = ''] = amount.split('.');
    const visibleFraction = fraction.slice(0, 4).replace(/0+$/, '');
    const grouped = BigInt(integer).toLocaleString('es-ES');
    return visibleFraction ? `${grouped},${visibleFraction} UKI` : `${grouped} UKI`;
  } catch {
    return 'No disponible';
  }
}

function moduleData<K extends DashboardModuleId>(module: DashboardModule<K>) {
  return module.state === 'unavailable' ? null : module.data;
}

function isMasterDataReady(module: DashboardModule<'cukieMaster'> | null | undefined) {
  if (!module || module.state === 'unavailable') return false;
  return module.data.routes.uki.sourceComplete
    && module.data.routes.uki.projectionFresh
    && !module.data.routes.uki.synchronizing
    && module.data.routes.nft.sourceComplete
    && module.data.routes.nft.projectionFresh
    && !module.data.routes.nft.synchronizing;
}

const MODULE_LABELS: Record<DashboardModuleId, string> = {
  cukieMaster: 'Cukie Master',
  credits: 'Créditos',
  cukiePool: 'Pool de Cukies',
  rewards: 'Premios',
  marketplace: 'Marketplace',
  vesting: 'Vesting',
  game: 'Juego y ranking',
};

const MODULE_ANCHORS: Record<DashboardModuleId, string> = {
  cukieMaster: 'dashboard-module-cukie-master',
  credits: 'dashboard-module-credits',
  cukiePool: 'dashboard-module-cukie-pool',
  rewards: 'dashboard-module-rewards',
  marketplace: 'dashboard-module-marketplace',
  vesting: 'dashboard-module-vesting',
  game: 'dashboard-module-game',
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function hasPositiveRaw(value: string | null | undefined) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) > BigInt(0);
}

function moduleStateLabel(state: DashboardModule<DashboardModuleId>['state']) {
  if (state === 'ready') return 'Listo';
  if (state === 'degraded') return 'Revisar';
  return 'No disponible';
}

function moduleStateClass(state: DashboardModule<DashboardModuleId>['state']) {
  if (state === 'ready') return 'border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]';
  if (state === 'degraded') return 'border-amber-300/35 bg-amber-300/10 text-amber-200';
  return 'border-red-300/35 bg-red-300/10 text-red-200';
}

function moduleAttention<K extends DashboardModuleId>(module: DashboardModule<K>, data: DashboardModulePayloads[K] | null) {
  if (module.state === 'unavailable') return 'No podemos consultar este dato ahora.';
  if (module.state === 'degraded') {
    if (module.issues.includes('SOURCE_NOT_FRESH')) return 'Lectura pendiente de actualizar.';
    return 'Lectura parcial: revisa este apartado antes de actuar.';
  }
  if (module.state === 'ready' && module.issues.length > 0) return 'Hay una nota de servicio en esta lectura.';
  if (module.state === 'ready' && data && 'configFrozen' in data && data.configFrozen === false) {
    return 'El calendario de liberación está pendiente de confirmación.';
  }
  return null;
}

type PrimaryAction = {
  href: string;
  label: string;
  title: string;
  description: string;
};

function choosePrimaryAction(input: {
  game: DashboardModule<'game'> | null;
  credits: DashboardModule<'credits'> | null;
  master: DashboardModule<'cukieMaster'> | null;
  rewards: DashboardModule<'rewards'> | null;
  vesting: DashboardModule<'vesting'> | null;
  hasPartialData: boolean;
}) : PrimaryAction {
  if (input.game?.state === 'ready'
    && input.game.data.enabled
    && input.game.data.attemptsRemaining !== null
    && input.game.data.attemptsRemaining > 0) {
    return {
      href: '/games/treasure-hunt',
      label: 'Jugar ahora',
      title: 'Tienes una partida lista',
      description: `${integerLabel(input.game.data.attemptsRemaining)} intentos disponibles. Entra cuando quieras y revisa tus créditos antes de comenzar.`,
    };
  }
  if (input.rewards?.state === 'ready'
    && hasPositiveRaw(input.rewards.data.claimableRaw)
    && input.rewards.data.claimPublished) {
    return {
      href: '/premios',
      label: 'Reclamar premios',
      title: 'Tienes premios confirmados',
      description: 'Consulta el detalle y reclama solo los importes que ya estén publicados.',
    };
  }
  if (input.rewards?.state === 'ready'
    && hasPositiveRaw(input.rewards.data.claimableRaw)
    && !input.rewards.data.claimPublished) {
    return {
      href: '/premios',
      label: 'Consultar premios',
      title: 'Tus premios están en preparación',
      description: 'Consulta el detalle; todavía no hay importes publicados para reclamar.',
    };
  }
  if (input.credits?.state === 'ready' && input.credits.data.availableCredits > 0) {
    return {
      href: '/credits',
      label: 'Ver créditos',
      title: 'Tus créditos están listos',
      description: `${integerLabel(input.credits.data.availableCredits)} créditos personales disponibles para jugar. El saldo del pool se muestra por separado.`,
    };
  }
  if (input.master?.state === 'ready'
    && isMasterDataReady(input.master)
    && input.master.data.allocatedSlots === 0
    && input.master.data.desiredSlots > 0) {
    return {
      href: '/cukie-master#mi-estado',
      label: 'Revisar cupos',
      title: 'Aún no tienes cupos activos',
      description: 'Consulta las dos rutas de acceso y los recursos que necesitas para obtener un cupo.',
    };
  }
  if (input.vesting?.state === 'ready'
    && hasPositiveRaw(input.vesting.data.releasableRaw)
    && input.vesting.data.configFrozen) {
    return {
      href: '/vesting',
      label: 'Ver desbloqueo',
      title: 'Hay UKI disponibles para liberar',
      description: 'Revisa el calendario y confirma el estado antes de iniciar cualquier acción.',
    };
  }
  if (input.vesting?.state === 'ready'
    && hasPositiveRaw(input.vesting.data.releasableRaw)
    && !input.vesting.data.configFrozen) {
    return {
      href: '/vesting',
      label: 'Consultar vesting',
      title: 'El calendario está pendiente',
      description: 'Consulta el calendario; la liberación seguirá bloqueada hasta confirmar la configuración.',
    };
  }
  if (input.hasPartialData) {
    return {
      href: '#dashboard-data-status',
      label: 'Revisar estado',
      title: 'Algunos datos necesitan revisión',
      description: 'Consulta los apartados afectados antes de tomar una decisión.',
    };
  }
  return {
    href: '/credits',
    label: 'Explorar recursos',
    title: 'Descubre cómo seguir',
    description: 'Consulta tus recursos y las rutas disponibles para preparar tu próxima partida.',
  };
}

export function DashboardOverviewPanel() {
  const { user, walletType, isLoading: authLoading } = useAuth();
  const runtime = useAppRuntime();
  const hasSignedEvmSession = Boolean(user && walletType === 'evm');
  const walletNeedsSignature = Boolean(runtime.connected && !hasSignedEvmSession);
  const dashboardResource = useAppRuntimeResource<DashboardSummary>('dashboard', {
    enabled: hasSignedEvmSession,
    validate: (value) => isDashboardSummary(value, user?.walletAddress),
  });
  const request = useMemo<RequestState>(() => {
    if (dashboardResource.state === 'ready') return { state: 'ready', summary: dashboardResource.data! };
    if (dashboardResource.state === 'loading') return { state: 'loading', summary: dashboardResource.data ?? null };
    if (dashboardResource.state === 'stale' && dashboardResource.data) return { state: 'stale', summary: dashboardResource.data };
    if (dashboardResource.state === 'unavailable') return { state: 'unavailable', summary: dashboardResource.data ?? null };
    return { state: 'idle', summary: null };
  }, [dashboardResource.data, dashboardResource.state]);

  const currentWalletNormalized = user?.walletAddress?.toLowerCase();
  const summary = request.summary
    && !authLoading
    && hasSignedEvmSession
    && currentWalletNormalized
    && request.summary.identity.walletNormalized.toLowerCase() === currentWalletNormalized
    ? request.summary
    : null;
  const unavailableModules = summary?.alerts.filter((alert) => alert.code === 'MODULE_UNAVAILABLE') ?? [];
  const reviewModules = summary?.alerts.filter((alert) => alert.code === 'MODULE_DEGRADED') ?? [];
  const masterModule = summary?.modules.cukieMaster ?? null;
  const master = summary ? moduleData(summary.modules.cukieMaster) : null;
  const masterDataReady = isMasterDataReady(masterModule);
  const credits = summary ? moduleData(summary.modules.credits) : null;
  const pool = summary ? moduleData(summary.modules.cukiePool) : null;
  const rewards = summary ? moduleData(summary.modules.rewards) : null;
  const marketplace = summary ? moduleData(summary.modules.marketplace) : null;
  const vesting = summary ? moduleData(summary.modules.vesting) : null;
  const game = summary ? moduleData(summary.modules.game) : null;
  const primaryAction = summary ? choosePrimaryAction({
    game: summary.modules.game,
    credits: summary.modules.credits,
    master: masterModule,
    rewards: summary.modules.rewards,
    vesting: summary.modules.vesting,
    hasPartialData: summary.overallState === 'partial',
  }) : null;
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false);
  const isRefreshing = dashboardResource.isFetching || isManualRefreshPending;
  const refreshDashboardResource = dashboardResource.refresh;
  const refreshInFlightRef = useRef(false);
  const refreshDashboard = useCallback(() => {
    if (isRefreshing || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setIsManualRefreshPending(true);
    void Promise.resolve(refreshDashboardResource()).finally(() => {
      refreshInFlightRef.current = false;
      setIsManualRefreshPending(false);
    });
  }, [isRefreshing, refreshDashboardResource]);
  const showStandaloneRefresh = hasSignedEvmSession && !summary;

  return (
    <section id="wallet-economy-overview" className="relative z-[2] w-full scroll-mt-24 pb-5">
      {showStandaloneRefresh ? <RefreshButton isRefreshing={isRefreshing} onRefresh={refreshDashboard} /> : null}

      {!authLoading && !hasSignedEvmSession ? (
        <ConnectState walletNeedsSignature={walletNeedsSignature} />
      ) : null}

      {authLoading || (request.state === 'loading' && !summary) ? <DashboardSkeleton /> : null}

      {request.state === 'unavailable' && !summary ? <DashboardError /> : null}

      {summary ? (
        <div className="space-y-5">
          <header className="overflow-hidden rounded-[16px] border border-[var(--uki-lilac)]/25 bg-[radial-gradient(circle_at_84%_0%,rgba(228,92,255,0.18),transparent_32%),linear-gradient(135deg,rgba(20,10,32,0.96),rgba(7,28,34,0.92))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="max-w-2xl font-headline text-2xl font-black tracking-[-0.03em] text-[var(--uki-cream)] sm:text-4xl">
                  Hola, <span>{summary.identity.username || 'Cukie'}</span>
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:justify-end">
                <span
                  title={summary.identity.walletNormalized}
                  aria-label={`Wallet ${summary.identity.walletNormalized}`}
                  className="inline-flex min-h-8 max-w-full items-center rounded-full border border-white/15 bg-black/20 px-3 text-[11px] font-bold text-[var(--uki-cream)]"
                >
                  {shortWallet(summary.identity.walletNormalized)}
                </span>
                <span className="text-[11px] font-semibold text-[var(--uki-muted)]">BNB Smart Chain</span>
                <time dateTime={summary.generatedAt} className="text-[10px] font-semibold text-[var(--uki-muted)]">
                  Actualizado {formatUpdatedAt(summary.generatedAt)}
                </time>
                <RefreshButton isRefreshing={isRefreshing} onRefresh={refreshDashboard} compact />
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              {primaryAction ? <PrimaryActionPanel action={primaryAction} /> : null}
              <MetricStrip summary={summary} masterDataReady={masterDataReady} />
            </div>
          </header>

          {request.state === 'stale' ? (
            <div role="status" className="rounded-[10px] border border-amber-300/30 bg-amber-300/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                <div>
                  <p className="text-sm font-black text-amber-100">No hemos podido actualizar tu cuenta</p>
                  <p className="mt-1 text-xs font-semibold text-amber-100/75">Mostramos la última lectura disponible. Inténtalo de nuevo en unos instantes.</p>
                </div>
              </div>
            </div>
          ) : null}

          <DataHealthNotices unavailableModules={unavailableModules} reviewModules={reviewModules} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <section id="dashboard-play" aria-labelledby="dashboard-play-title" className="min-w-0">
              <SectionIntro titleId="dashboard-play-title" eyebrow="Ahora" title="Tu siguiente jugada" description="Comprueba tus intentos y créditos antes de jugar." />
              <PlayPanel module={summary.modules.game} game={game} credits={credits} />
            </section>

            <section id="dashboard-resources" aria-labelledby="dashboard-resources-title" className="min-w-0">
              <SectionIntro titleId="dashboard-resources-title" eyebrow="Recursos" title="Lo que tienes" description="Gestiona tus créditos, cupos y pool." />
              <div className="mt-4 space-y-3">
                <DashboardResourceRow
                  id={MODULE_ANCHORS.cukieMaster}
                  icon={Crown}
                  title="Cukie Master"
                  module={summary.modules.cukieMaster}
                  href="/cukie-master#mi-estado"
                  action="Gestionar cupos"
                  value={masterDataReady && master ? integerLabel(master.allocatedSlots) : null}
                  label="cupos activos"
                  details={masterDataReady && master ? [
                    `${integerLabel(master.routes.uki.allocatedSlots)} por UKI`,
                    `${integerLabel(master.routes.nft.allocatedSlots)} por Cukies Originales`,
                  ] : []}
                  attention={masterDataReady ? null : 'Estamos reconciliando las dos rutas de cupos.'}
                />
                <DashboardResourceRow
                  id={MODULE_ANCHORS.credits}
                  icon={Coins}
                  title="Créditos"
                  module={summary.modules.credits}
                  href="/credits"
                  action="Usar o aportar"
                  value={credits ? integerLabel(credits.availableCredits) : null}
                  label="créditos personales"
                  details={credits ? [
                    `${integerLabel(credits.poolAvailableCredits)} disponibles en el pool`,
                    `${integerLabel(credits.poolDepositedCredits)} aportados · ${integerLabel(credits.spentCredits)} usados`,
                  ] : []}
                />
                <DashboardResourceRow
                  id={MODULE_ANCHORS.cukiePool}
                  icon={Layers3}
                  title="Pool de Cukies"
                  module={summary.modules.cukiePool}
                  href="/cukie-hodler#mi-cukie-pool"
                  action="Gestionar pool"
                  value={pool ? integerLabel(pool.activePositions) : null}
                  label="posiciones activas"
                  details={pool ? [
                    `${integerLabel(pool.activePositions)} disponibles para partidas`,
                    `${integerLabel(pool.positions)} Cukies aportados en total`,
                  ] : []}
                />
              </div>
            </section>
          </div>

          <section id="dashboard-account-status" aria-labelledby="dashboard-account-status-title" className="min-w-0 border-t border-white/10 pt-5">
            <SectionIntro titleId="dashboard-account-status-title" eyebrow="Seguimiento" title="Cobros y colección" description="Consulta tus premios, vesting y colección." />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <DashboardResourceRow
                id={MODULE_ANCHORS.rewards}
                icon={Gift}
                title="Premios"
                module={summary.modules.rewards}
                href="/premios"
                action="Ver mis premios"
                value={rewards ? ukiLabel(rewards.claimableRaw) : null}
                label="reclamables confirmados"
                details={rewards ? [
                  `${integerLabel(rewards.allocations)} premios asignados`,
                  rewards.claimPublished
                    ? `${integerLabel(rewards.claims)} cobros confirmados`
                    : 'Todavía no hay premios listos para cobrar',
                ] : []}
              />
              <DashboardResourceRow
                id={MODULE_ANCHORS.vesting}
                icon={LockKeyhole}
                title="Vesting"
                module={summary.modules.vesting}
                href="/vesting"
                action="Ver vesting"
                value={vesting ? ukiLabel(vesting.totalAmountRaw) : null}
                label={vesting?.hasPosition ? 'asignación total' : 'sin asignación'}
                details={vesting ? [
                  `${ukiLabel(vesting.releasableRaw)} disponibles ahora`,
                  `${ukiLabel(vesting.lockedAmountRaw)} bloqueados`,
                  `${(vesting.progressBps / 100).toLocaleString('es-ES')}% liberado`,
                ] : []}
                attention={vesting && !vesting.configFrozen ? 'El calendario de liberación está pendiente de confirmación' : null}
              />
              <DashboardResourceRow
                id={MODULE_ANCHORS.marketplace}
                icon={Store}
                title="Marketplace"
                module={summary.modules.marketplace}
                href="/marketplace"
                action="Abrir marketplace"
                value={marketplace ? integerLabel(marketplace.inventory) : null}
                label="Cukies en tu inventario"
                details={marketplace ? [
                  `${integerLabel(marketplace.listingEligible)} disponibles para listar`,
                  `${integerLabel(marketplace.activeListings)} anuncios activos`,
                ] : []}
                attention={marketplace && marketplace.attentionListings > 0
                  ? `${integerLabel(marketplace.attentionListings)} anuncios requieren atención.`
                  : null}
              />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function RefreshButton({
  isRefreshing,
  onRefresh,
  compact = false,
}: {
  isRefreshing: boolean;
  onRefresh: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className={compact
        ? 'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-amber-200/30 px-3 text-xs font-black uppercase tracking-[0.08em] text-amber-100 transition hover:border-amber-100/60 disabled:cursor-wait disabled:opacity-60'
        : 'mb-4 ml-auto inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[var(--uki-lilac)]/35 bg-[var(--uki-lilac)]/10 px-4 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] transition hover:border-[var(--uki-lilac)]/70 hover:bg-[var(--uki-lilac)]/15 disabled:cursor-wait disabled:opacity-60'}
      aria-label="Actualizar"
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
      {isRefreshing ? 'Actualizando…' : 'Actualizar'}
    </button>
  );
}

function ConnectState({ walletNeedsSignature }: { walletNeedsSignature: boolean }) {
  return (
    <div className="rounded-[14px] border border-[var(--uki-lilac)]/25 bg-[linear-gradient(135deg,rgba(20,10,32,0.94),rgba(7,28,34,0.88))] p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="uki-label">Tu espacio</p>
          <h2 className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">
            {walletNeedsSignature ? <><span>Firma tu wallet</span> para entrar</> : <>Conecta tu wallet para empezar</>}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            {walletNeedsSignature
              ? 'La firma solo acredita tu sesión. Después podrás consultar tus activos y continuar jugando.'
              : 'Consulta tus activos, créditos y premios desde un único lugar.'}
          </p>
        </div>
        <LandingWalletConnectButton
          evmOnly
          className="uki-button uki-button-primary min-h-11 shrink-0 justify-center px-4"
          label={walletNeedsSignature ? 'Firmar wallet' : 'Conectar wallet'}
          showCompactText={false}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const skeleton = 'rounded-[5px] bg-white/[0.08] motion-safe:animate-pulse motion-reduce:animate-none';
  return (
    <div data-testid="dashboard-skeleton" aria-busy="true" aria-live="polite" className="space-y-5">
      <div className="rounded-[16px] border border-white/10 bg-black/20 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
            <Loader2 className="h-4 w-4 text-[var(--uki-lilac)] motion-safe:animate-spin" aria-hidden="true" />
            Cargando tu cuenta…
          </p>
          <span className={`${skeleton} h-8 w-36`} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <span className={`${skeleton} h-24 w-full`} />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-white/10 bg-white/10">
            {Array.from({ length: 4 }, (_, index) => <span key={index} className={`${skeleton} h-14 rounded-none bg-[#100b18]`} />)}
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-3">
            <span className={`${skeleton} block h-3 w-20`} />
            <span className={`${skeleton} block h-7 w-2/3`} />
            <span className={`${skeleton} block h-4 w-full`} />
            {Array.from({ length: index === 0 ? 1 : 3 }, (_, row) => <span key={row} className={`${skeleton} block h-24 w-full`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardError() {
  return (
    <div role="alert" className="rounded-[12px] border border-red-300/30 bg-red-500/10 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-200" aria-hidden="true" />
        <div>
          <p className="font-black text-red-100">No podemos cargar tu cuenta ahora</p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-red-100/75">Inténtalo de nuevo en unos instantes.</p>
        </div>
      </div>
    </div>
  );
}

function DataHealthNotices({
  unavailableModules,
  reviewModules,
}: {
  unavailableModules: DashboardSummary['alerts'];
  reviewModules: DashboardSummary['alerts'];
}) {
  if (unavailableModules.length === 0 && reviewModules.length === 0) return null;
  return (
    <div id="dashboard-data-status" className="grid gap-3 md:grid-cols-2">
      {unavailableModules.length > 0 ? (
        <DataHealthNotice
          title="Algunos datos no están disponibles"
          tone="error"
          description={<>Ahora mismo no podemos mostrar: {unavailableModules.map((alert) => MODULE_LABELS[alert.module]).join(', ')}. Puedes seguir usando el resto de tu cuenta.</>}
          modules={unavailableModules}
        />
      ) : null}
      {reviewModules.length > 0 ? (
        <DataHealthNotice
          title="Algunos datos requieren atención"
          tone="warning"
          description={<>Puedes consultar los datos de {reviewModules.map((alert) => MODULE_LABELS[alert.module]).join(', ')}. Revisa sus avisos antes de continuar.</>}
          modules={reviewModules}
        />
      ) : null}
    </div>
  );
}

function DataHealthNotice({
  title,
  description,
  modules,
  tone,
}: {
  title: string;
  description: ReactNode;
  modules: DashboardSummary['alerts'];
  tone: 'error' | 'warning';
}) {
  const toneClass = tone === 'error'
    ? 'border-red-300/25 bg-red-500/[0.08] text-red-100'
    : 'border-amber-300/25 bg-amber-400/[0.08] text-amber-100';
  return (
    <div role="status" className={`rounded-[10px] border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed opacity-75">{description}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {modules.map((alert) => (
              <a
                key={alert.module}
                href={`#${MODULE_ANCHORS[alert.module]}`}
                className="inline-flex min-h-8 items-center text-[11px] font-black uppercase tracking-[0.08em] underline decoration-current/40 underline-offset-2 transition hover:decoration-current"
              >
                Ver {MODULE_LABELS[alert.module]}
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  titleId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  titleId: string;
}) {
  return (
    <div>
      <p className="uki-label">{eyebrow}</p>
      <h2 id={titleId} className="mt-1 font-headline text-xl font-black tracking-[-0.02em] text-[var(--uki-cream)] sm:text-2xl">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{description}</p>
    </div>
  );
}

function PrimaryActionPanel({ action }: { action: PrimaryAction }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div className="min-w-0 flex-1">
        <p className="uki-label">Siguiente</p>
        <h3 className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)] sm:text-xl">{action.title}</h3>
        <p className="mt-1 max-w-lg text-xs font-semibold leading-relaxed text-[var(--uki-text)] sm:text-sm">{action.description}</p>
      </div>
      <Link href={action.href} className="uki-button uki-button-primary min-h-10 shrink-0 justify-center px-3 sm:px-4">
        <span>{action.label}</span>
        <span className="uki-button-icon" aria-hidden="true"><ArrowRight className="h-4 w-4" /></span>
      </Link>
    </div>
  );
}

function rewardsMetric(module: DashboardModule<'rewards'>) {
  if (module.state === 'unavailable') {
    return { value: 'No disponible', detail: 'Estado no confirmado' };
  }
  if (module.state === 'degraded') {
    return { value: 'En revisión', detail: 'Revisa el estado' };
  }

  const { claimableRaw, allocations, claimPublished } = module.data;
  const hasClaimable = hasPositiveRaw(claimableRaw);
  if (hasClaimable && claimPublished) {
    return { value: 'Listos para reclamar', detail: 'Importes confirmados' };
  }
  if (hasClaimable || allocations > 0) {
    return claimPublished
      ? { value: 'Sin saldo pendiente', detail: 'Importes confirmados' }
      : { value: 'En preparación', detail: 'Asignaciones pendientes' };
  }
  return claimPublished
    ? { value: 'Sin saldo pendiente', detail: 'Sin saldo pendiente' }
    : { value: 'Sin premios asignados', detail: 'Sin asignaciones' };
}

function MetricStrip({ summary, masterDataReady }: { summary: DashboardSummary; masterDataReady: boolean }) {
  const game = moduleData(summary.modules.game);
  const credits = moduleData(summary.modules.credits);
  const master = moduleData(summary.modules.cukieMaster);
  const rewards = moduleData(summary.modules.rewards);
  const rewardsStatus = rewardsMetric(summary.modules.rewards);
  const metrics = [
    {
      label: 'Para jugar',
      value: game
        ? game.enabled
          ? game.attemptsRemaining === null
            ? 'En revisión'
            : game.attemptsRemaining > 0 ? `${integerLabel(game.attemptsRemaining)} intentos` : 'Sin intentos'
          : 'No disponible'
        : 'No disponible',
      detail: game?.enabled ? 'Treasure Hunt' : 'Revisa el juego',
    },
    {
      label: 'Créditos',
      value: credits ? integerLabel(credits.availableCredits) : 'No disponible',
      detail: 'Disponibles · personales',
    },
    {
      label: 'Cupos activos',
      value: masterDataReady && master ? `${integerLabel(master.allocatedSlots)} / ${integerLabel(master.maxPotentialSlots)}` : 'No disponible',
      detail: masterDataReady ? 'Rutas UKI + Originales' : 'Pendientes de confirmar',
    },
    {
      label: 'Premios',
      value: rewardsStatus.value,
      detail: rewardsStatus.detail,
    },
  ];
  return (
    <div className="overflow-hidden rounded-[11px] border border-white/10 bg-black/20">
      <div className="grid grid-cols-2 divide-x divide-y divide-white/10">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 px-3 py-3 sm:px-4 sm:py-4">
            <p className="uki-label break-words leading-tight">{metric.label}</p>
            <p className="mt-1 break-words text-sm font-black text-[var(--uki-cream)]">{metric.value}</p>
            <p className="mt-1 text-[11px] font-semibold text-[var(--uki-muted)]">{metric.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayPanel({
  module,
  game,
  credits,
}: {
  module: DashboardModule<'game'>;
  game: DashboardModulePayloads['game'] | null;
  credits: DashboardModulePayloads['credits'] | null;
}) {
  const attemptsKnown = game?.attemptsRemaining !== null && game?.attemptsRemaining !== undefined;
  const canPlay = Boolean(game?.enabled && attemptsKnown && game.attemptsRemaining! > 0);
  const gameDescription = module.state === 'unavailable'
    ? 'No podemos consultar el juego ahora.'
    : !game?.configured
      ? 'El juego todavía no está configurado para esta cuenta.'
      : !game.enabled
        ? 'No hay una competición disponible ahora. Puedes revisar las reglas o volver más tarde.'
        : !attemptsKnown
          ? 'La disponibilidad de intentos está en revisión; no iniciamos nada hasta confirmarla.'
          : game.attemptsRemaining! > 0
            ? 'Tienes intentos disponibles. El consumo se confirma al terminar la partida.'
            : 'No tienes intentos disponibles ahora. Consulta tus créditos y el pool antes de volver a jugar.';
  return (
    <article id={MODULE_ANCHORS.game} className="mt-4 overflow-hidden rounded-[14px] border border-[#f2c34b]/30 bg-[radial-gradient(circle_at_90%_0%,rgba(242,195,75,0.18),transparent_38%),linear-gradient(135deg,rgba(24,17,25,0.96),rgba(15,30,34,0.92))] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.18)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-[#f2c34b]/35 bg-[#f2c34b]/10 text-[#f2c34b]">
            <Gamepad2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="uki-label">Treasure Hunt</p>
            <h3 className="mt-1 font-headline text-xl font-black text-[var(--uki-cream)]">Treasure Hunt</h3>
          </div>
        </div>
        <ModuleStatePill module={module} />
      </div>

      <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{gameDescription}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[9px] border border-white/10 bg-black/20 px-4 py-3">
          <p className="uki-label">Intentos disponibles</p>
          <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">
            {game && attemptsKnown ? `${integerLabel(game.attemptsRemaining)} intentos` : 'No disponible'}
          </p>
        </div>
        <div className="rounded-[9px] border border-white/10 bg-black/20 px-4 py-3">
          <p className="uki-label">Créditos personales</p>
          <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">
            {credits ? `${integerLabel(credits.availableCredits)} disponibles` : 'No disponible'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {canPlay ? (
          <Link href="/games/treasure-hunt/rankings" className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#f2c34b] transition hover:text-[var(--uki-cream)]">
            Ver ranking <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/credits" className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] transition hover:text-[var(--uki-cream)]">
            Ver créditos <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <Link href="/games/treasure-hunt/rules" className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] transition hover:text-[var(--uki-cream)]">
          Ver reglas <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {game?.bestRank !== null && game?.bestRank !== undefined ? <span className="text-xs font-semibold text-[var(--uki-muted)]">Mejor posición #{integerLabel(game.bestRank)}</span> : null}
      </div>
    </article>
  );
}

function ModuleStatePill<K extends DashboardModuleId>({ module }: { module: DashboardModule<K> }) {
  return (
    <span className={`inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-black uppercase tracking-[0.08em] ${moduleStateClass(module.state)}`}>
      {module.state === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
      {moduleStateLabel(module.state)}
    </span>
  );
}

function DashboardResourceRow<K extends DashboardModuleId>({
  id,
  icon: Icon,
  title,
  module,
  href,
  action,
  value,
  label,
  details,
  attention,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  module: DashboardModule<K>;
  href: string;
  action: string;
  value: string | null;
  label: string;
  details: ReactNode[];
  attention?: string | null;
}) {
  const data = moduleData(module);
  const available = module.state !== 'unavailable' && value !== null;
  const note = attention ?? moduleAttention(module, data);
  return (
    <article id={id} className="group min-w-0 rounded-[12px] border border-white/10 bg-black/20 p-4 transition duration-300 hover:border-[var(--uki-lilac)]/35 hover:bg-white/[0.025] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.08] text-[var(--uki-lilac)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-headline text-base font-black text-[var(--uki-cream)]">{title}</h3>
            <ModuleStatePill module={module} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          {available ? (
            <>
              <p className="break-words font-headline text-2xl font-black text-[var(--uki-lilac)]">{value}</p>
              <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">{label}</p>
            </>
          ) : (
            <p className="font-headline text-sm font-black uppercase text-amber-200">No disponible</p>
          )}
        </div>
      </div>

      {available && details.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
          {details.map((detail, index) => <li key={index}>{detail}</li>)}
        </ul>
      ) : null}
      {!available ? <p className="mt-3 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">Inténtalo de nuevo más tarde.</p> : null}
      {note ? <p className="mt-3 border-l-2 border-amber-300/45 pl-3 text-xs font-semibold leading-relaxed text-amber-100/80">{note}</p> : null}

      <Link href={href} className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] transition hover:text-[var(--uki-cream)]">
        {action}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
