'use client';

import { useMemo, type ReactNode } from 'react';
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

import { Panel } from '@/components/landing/primitives';
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
    && isNonNegativeInteger(value.reservedCredits)
    && isNonNegativeInteger(value.spentCredits)
    && isNonNegativeInteger(value.poolDepositedCredits)
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

const MODULE_LABELS: Record<DashboardModuleId, string> = {
  cukieMaster: 'Cukie Master',
  credits: 'Créditos',
  cukiePool: 'Pool de Cukies',
  rewards: 'Premios',
  marketplace: 'Marketplace',
  vesting: 'Vesting',
  game: 'Juego y ranking',
};

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
    if (dashboardResource.state === 'stale' || dashboardResource.state === 'unavailable') return { state: 'unavailable', summary: dashboardResource.data ?? null };
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
  const master = summary ? moduleData(summary.modules.cukieMaster) : null;
  const masterDataReady = Boolean(
    master
    && master.routes.uki.sourceComplete
    && master.routes.uki.projectionFresh
    && !master.routes.uki.synchronizing
    && master.routes.nft.sourceComplete
    && master.routes.nft.projectionFresh
    && !master.routes.nft.synchronizing,
  );
  const credits = summary ? moduleData(summary.modules.credits) : null;
  const pool = summary ? moduleData(summary.modules.cukiePool) : null;
  const rewards = summary ? moduleData(summary.modules.rewards) : null;
  const marketplace = summary ? moduleData(summary.modules.marketplace) : null;
  const vesting = summary ? moduleData(summary.modules.vesting) : null;
  const game = summary ? moduleData(summary.modules.game) : null;

  return (
    <section id="wallet-economy-overview" className="relative z-[2] w-full scroll-mt-24 pb-5">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Actividad</p>
            <h2 className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)]">
              Datos clave
            </h2>
          </div>
          {hasSignedEvmSession ? (
            <button
              type="button"
              onClick={() => void dashboardResource.refresh()}
              disabled={request.state === 'loading'}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${request.state === 'loading' ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          ) : null}
        </div>

        {!authLoading && !hasSignedEvmSession ? (
          <div className="mt-6 rounded-[8px] border border-white/10 bg-black/20 p-5">
            <p className="font-black text-[var(--uki-cream)]">
              {walletNeedsSignature ? 'Firma tu wallet' : 'Conecta tu wallet'}
            </p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              {walletNeedsSignature
                ? 'Firma el acceso para consultar tus activos y continuar jugando.'
                : 'Conecta tu wallet para consultar tus activos y continuar jugando.'}
            </p>
            <LandingWalletConnectButton
              evmOnly
              className="mt-4"
              label={walletNeedsSignature ? 'Firmar wallet' : 'Conectar wallet'}
              showCompactText={false}
            />
          </div>
        ) : null}

        {authLoading || (request.state === 'loading' && !summary) ? (
          <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
            Cargando tu cuenta…
          </p>
        ) : null}

        {request.state === 'unavailable' ? (
          <div
            role={summary ? 'status' : 'alert'}
            className="mt-6 rounded-[8px] border border-red-400/30 bg-red-500/10 p-5"
          >
            <p className="font-black text-red-200">
              {summary ? 'No hemos podido actualizar tu cuenta' : 'No podemos cargar tu cuenta ahora'}
            </p>
            <p className="mt-1 text-sm font-semibold text-red-100/80">
              {summary
                ? 'Mostramos la última lectura disponible. Inténtalo de nuevo en unos instantes.'
                : 'Inténtalo de nuevo en unos instantes.'}
            </p>
          </div>
        ) : null}

        {summary ? (
          <>
            <div className="mt-6 flex flex-col gap-2 rounded-[10px] border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-black text-[var(--uki-cream)]">
                {summary.identity.username || 'Tu cuenta'}
                <span className="ml-2 font-semibold text-[var(--uki-muted)]">{shortWallet(summary.identity.walletNormalized)}</span>
              </p>
              <div className="flex flex-col gap-1 sm:items-end">
                <p className="text-xs font-semibold text-[var(--uki-muted)]">BNB Smart Chain</p>
                <time
                  dateTime={summary.generatedAt}
                  className="text-[11px] font-semibold text-[var(--uki-muted)]"
                >
                  Actualizado {new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(summary.generatedAt))}
                </time>
              </div>
            </div>

            {unavailableModules.length > 0 ? (
              <div role="status" className="mt-4 rounded-[8px] border border-amber-300/25 bg-amber-400/10 p-4">
                <p className="font-black text-amber-100">Algunos datos no están disponibles</p>
                <p className="mt-1 text-xs font-semibold text-amber-100/75">
                  Ahora mismo no podemos mostrar: {unavailableModules.map((alert) => MODULE_LABELS[alert.module]).join(', ')}.
                  Puedes seguir usando el resto de tu cuenta.
                </p>
              </div>
            ) : null}
            {reviewModules.length > 0 ? (
              <div role="status" className="mt-4 rounded-[8px] border border-amber-300/25 bg-amber-400/10 p-4">
                <p className="font-black text-amber-100">Algunos datos requieren atención</p>
                <p className="mt-1 text-xs font-semibold text-amber-100/75">
                  Puedes consultar los datos de {reviewModules.map((alert) => MODULE_LABELS[alert.module]).join(', ')}.
                  Revisa sus avisos antes de continuar.
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <DashboardCard
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
              />
              <DashboardCard
                icon={Coins}
                title="Créditos"
                module={summary.modules.credits}
                href="/credits"
                action="Usar o aportar"
                value={credits ? integerLabel(credits.availableCredits) : null}
                label="créditos disponibles"
                details={credits ? [
                  `${integerLabel(credits.poolAvailableCredits)} disponibles en el pool`,
                  `${integerLabel(credits.poolDepositedCredits)} aportados · ${integerLabel(credits.spentCredits)} usados`,
                ] : []}
              />
              <DashboardCard
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
              <DashboardCard
                id="rewards-summary"
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
              <DashboardCard
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
                  marketplace.attentionListings > 0
                    ? `${integerLabel(marketplace.attentionListings)} requieren atención`
                    : 'Ningún anuncio requiere atención',
                ] : []}
              />
              <DashboardCard
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
                  ...(vesting.configFrozen ? [] : ['El calendario de liberación está pendiente de confirmación']),
                ] : []}
              />
              <DashboardCard
                icon={Gamepad2}
                title="Juego y ranking"
                module={summary.modules.game}
                href="/games/treasure-hunt"
                action="Abrir Treasure Hunt"
                value={game ? integerLabel(game.attemptsRemaining) : null}
                label="intentos disponibles"
                details={game ? [
                  game.enabled ? 'Juego disponible' : 'Juego no disponible ahora',
                  game.bestRank === null ? 'Sin posición en ranking' : `Mejor posición: #${integerLabel(game.bestRank)}`,
                  game.totalTickets === null ? 'Tickets no aplicables' : `${integerLabel(game.totalTickets)} tickets`,
                ] : []}
              />
            </div>
          </>
        ) : null}
      </Panel>
    </section>
  );
}

function DashboardCard<K extends DashboardModuleId>({
  id,
  icon: Icon,
  title,
  module,
  href,
  action,
  value,
  label,
  details,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  module: DashboardModule<K>;
  href?: string;
  action?: string;
  value: string | null;
  label: string;
  details: ReactNode[];
}) {
  const available = module.state !== 'unavailable' && value !== null;
  return (
    <article id={id} className="min-w-0 rounded-[10px] border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-[var(--uki-lilac)]" />
          <h3 className="font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{title}</h3>
        </div>
        {module.state === 'ready' ? <CheckCircle2 aria-label="Datos disponibles" className="h-4 w-4 text-[var(--uki-lilac)]" /> : null}
        {module.state === 'degraded' ? <AlertTriangle aria-label="Datos con avisos" className="h-4 w-4 text-amber-300" /> : null}
      </div>
      {available ? (
        <>
          <p className="mt-5 break-words font-headline text-3xl font-black text-[var(--uki-lilac)]">{value}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">{label}</p>
          <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
            {details.map((detail, index) => <li key={index}>{detail}</li>)}
          </ul>
        </>
      ) : (
        <div className="mt-5">
          <p className="font-headline text-xl font-black uppercase text-amber-300">No disponible</p>
          <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">Inténtalo de nuevo más tarde.</p>
        </div>
      )}
      {href && action ? (
        <Link href={href} className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)]">
          {action}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <p className="mt-5 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">Información</p>
      )}
    </article>
  );
}
