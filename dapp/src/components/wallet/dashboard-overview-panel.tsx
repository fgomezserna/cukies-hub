'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { useAccount, useSwitchChain } from 'wagmi';

import { Panel } from '@/components/landing/primitives';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import type {
  DashboardModule,
  DashboardModuleId,
  DashboardModulePayloads,
  DashboardSummary,
} from '@/lib/dashboard/summary';
import { useAuth } from '@/providers/auth-provider';

type RequestState =
  | { state: 'idle'; summary: null }
  | { state: 'loading'; summary: DashboardSummary | null }
  | { state: 'ready'; summary: DashboardSummary }
  | { state: 'unavailable'; summary: null };

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
    && value.chainId === 97
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

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (
    !isRecord(value)
    || value.schemaVersion !== 'dashboard-staging-v1'
    || !isTimestamp(value.generatedAt)
    || (value.overallState !== 'ready' && value.overallState !== 'partial')
    || !isRecord(value.identity)
    || typeof value.identity.walletNormalized !== 'string'
    || (value.identity.username !== null && typeof value.identity.username !== 'string')
    || !isTimestamp(value.identity.sessionExpiresAt)
    || !isRecord(value.network)
    || value.network.environment !== 'staging'
    || value.network.chainId !== 97
    || !Array.isArray(value.alerts)
    || !value.alerts.every((alert) => isRecord(alert)
      && typeof alert.module === 'string'
      && Object.hasOwn(MODULE_DATA_VALIDATORS, alert.module)
      && (alert.severity === 'warning' || alert.severity === 'error')
      && (alert.code === 'MODULE_DEGRADED' || alert.code === 'MODULE_UNAVAILABLE'))
  ) return false;
  const modules = value.modules;
  if (!isRecord(modules)) return false;
  return [
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

function timestampLabel(sourceObservedAt: string | null, generatedAt: string) {
  const value = sourceObservedAt ?? generatedAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Freshness de fuente no válida';
  return `${sourceObservedAt ? 'Fuente' : 'Consulta'}: ${new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function moduleData<K extends DashboardModuleId>(module: DashboardModule<K>) {
  return module.state === 'unavailable' ? null : module.data;
}

const MODULE_LABELS: Record<DashboardModuleId, string> = {
  cukieMaster: 'Cukie Master',
  credits: 'Créditos',
  cukiePool: 'Pool de Cukies',
  rewards: 'Rewards',
  marketplace: 'Marketplace y Cukies',
  vesting: 'Vesting',
  game: 'Juego y ranking',
};

export function DashboardOverviewPanel() {
  const { user, walletType, isLoading: authLoading } = useAuth();
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const [request, setRequest] = useState<RequestState>({ state: 'idle', summary: null });
  const [reloadNonce, setReloadNonce] = useState(0);
  const hasSignedEvmSession = Boolean(user && walletType === 'evm');

  useEffect(() => {
    if (authLoading) return;
    if (!hasSignedEvmSession) {
      setRequest({ state: 'idle', summary: null });
      return;
    }
    const controller = new AbortController();
    setRequest((current) => ({ state: 'loading', summary: current.summary }));
    fetch('/api/dashboard/v1/summary', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (
          !response.ok
          || !isRecord(body)
          || body.status !== 'ok'
          || !isDashboardSummary(body.data)
        ) throw new Error('DASHBOARD_RESPONSE_INVALID');
        setRequest({ state: 'ready', summary: body.data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setRequest({ state: 'unavailable', summary: null });
      });
    return () => controller.abort();
  }, [authLoading, hasSignedEvmSession, reloadNonce]);

  const summary = request.summary;
  const wrongChain = Boolean(isConnected && chainId !== 97);
  const master = summary ? moduleData(summary.modules.cukieMaster) : null;
  const credits = summary ? moduleData(summary.modules.credits) : null;
  const pool = summary ? moduleData(summary.modules.cukiePool) : null;
  const rewards = summary ? moduleData(summary.modules.rewards) : null;
  const marketplace = summary ? moduleData(summary.modules.marketplace) : null;
  const vesting = summary ? moduleData(summary.modules.vesting) : null;
  const game = summary ? moduleData(summary.modules.game) : null;

  return (
    <section id="wallet-economy-overview" className="uki-container relative z-[2] scroll-mt-28 pb-5">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Stage · BSC Testnet</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Estado operativo
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Una sola lectura autenticada reúne tus cupos, créditos, Cukies, vesting, juego y rewards.
              Cada fuente conserva su estado y timestamp sin convertir errores en saldos cero.
            </p>
          </div>
          {hasSignedEvmSession ? (
            <button
              type="button"
              onClick={() => setReloadNonce((current) => current + 1)}
              disabled={request.state === 'loading'}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-cyan)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${request.state === 'loading' ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          ) : null}
        </div>

        {!authLoading && !hasSignedEvmSession ? (
          <div className="mt-6 rounded-[8px] border border-white/10 bg-black/20 p-5">
            <p className="font-black text-[var(--uki-cream)]">Conecta y firma una wallet EVM</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              El endpoint privado deriva la identidad de la sesión firmada; no acepta otra wallet por URL.
            </p>
            <LandingWalletConnectButton evmOnly className="mt-4" showCompactText={false} />
          </div>
        ) : null}

        {authLoading || (request.state === 'loading' && !summary) ? (
          <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" />
            Verificando identidad y fuentes…
          </p>
        ) : null}

        {request.state === 'unavailable' ? (
          <div role="alert" className="mt-6 rounded-[8px] border border-red-400/30 bg-red-500/10 p-5">
            <p className="font-black text-red-200">Dashboard no disponible</p>
            <p className="mt-1 text-sm font-semibold text-red-100/80">
              No se ha podido validar el contrato agregado. No se muestran datos parciales sin procedencia.
            </p>
          </div>
        ) : null}

        {summary ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <IdentityFact label="Cuenta" value={summary.identity.username || 'Sin username'} />
              <IdentityFact label="Wallet firmante" value={shortWallet(summary.identity.walletNormalized)} />
              <IdentityFact
                label="Red"
                value={wrongChain ? `Chain ${chainId ?? 'desconocida'} · requerida 97` : 'BSC Testnet · chain 97'}
                warning={wrongChain}
              />
            </div>

            {wrongChain ? (
              <div role="alert" className="mt-4 flex flex-col gap-3 rounded-[8px] border border-amber-300/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black text-amber-200">Wallet conectada a una red incorrecta</p>
                  <p className="mt-1 text-xs font-semibold text-amber-100/80">Las acciones quedan bloqueadas hasta usar BSC Testnet 97.</p>
                </div>
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: 97 })}
                  disabled={isSwitchingChain}
                  className="text-xs font-black uppercase tracking-[0.08em] text-amber-100 disabled:opacity-50"
                >
                  {isSwitchingChain ? 'Cambiando…' : 'Cambiar a chain 97'}
                </button>
              </div>
            ) : null}

            {summary.alerts.length > 0 ? (
              <div role="status" className="mt-4 rounded-[8px] border border-amber-300/25 bg-amber-400/10 p-4">
                <p className="font-black text-amber-100">Lectura parcial</p>
                <p className="mt-1 text-xs font-semibold text-amber-100/75">
                  Revisa: {summary.alerts.map((alert) => MODULE_LABELS[alert.module]).join(', ')}.
                  Los demás módulos siguen siendo válidos.
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DashboardCard
                icon={Crown}
                title="Cukie Master"
                module={summary.modules.cukieMaster}
                href="/cukie-master#mi-estado"
                action="Gestionar cupos"
                value={master ? `${integerLabel(master.allocatedSlots)} / ${integerLabel(master.maxPotentialSlots)}` : null}
                label="cupos activos"
                details={master ? [
                  `${integerLabel(master.routes.uki.allocatedSlots)} por UKI`,
                  `${integerLabel(master.routes.nft.allocatedSlots)} por Cukies Originales`,
                ] : []}
              />
              <DashboardCard
                icon={Coins}
                title="Créditos"
                module={summary.modules.credits}
                href="/cukie-master#competition-credits"
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
                  `${integerLabel(pool.positions)} posiciones visibles`,
                  `${integerLabel(pool.gamesRemaining)} partidas legacy restantes`,
                ] : []}
              />
              <DashboardCard
                id="rewards-summary"
                icon={Gift}
                title="Rewards"
                module={summary.modules.rewards}
                value={rewards ? ukiLabel(rewards.claimableRaw) : null}
                label="reclamables confirmados"
                details={rewards ? [
                  `${integerLabel(rewards.allocations)} asignaciones visibles`,
                  rewards.claimPublished
                    ? `${integerLabel(rewards.claims)} claims confirmados`
                    : 'Sin batch publicado para esta wallet',
                ] : []}
              />
              <DashboardCard
                icon={Store}
                title="Marketplace y Cukies"
                module={summary.modules.marketplace}
                href="/marketplace#marketplace-uki"
                action="Abrir marketplace"
                value={marketplace ? integerLabel(marketplace.inventory) : null}
                label="Cukies en inventario canónico"
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
                  `Campaña: ${game.phase}`,
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

function IdentityFact({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-[8px] border p-4 ${warning ? 'border-amber-300/30 bg-amber-400/10' : 'border-white/10 bg-black/20'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">{label}</p>
      <p className={`mt-1 break-all text-sm font-black ${warning ? 'text-amber-200' : 'text-[var(--uki-cream)]'}`}>{value}</p>
    </div>
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
          <Icon className="h-5 w-5 shrink-0 text-[var(--uki-cyan)]" />
          <h3 className="font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{title}</h3>
        </div>
        {module.state === 'ready' ? <CheckCircle2 aria-label="Fuente saludable" className="h-4 w-4 text-[var(--uki-cyan)]" /> : null}
        {module.state === 'degraded' ? <AlertTriangle aria-label="Fuente degradada" className="h-4 w-4 text-amber-300" /> : null}
      </div>
      {available ? (
        <>
          <p className="mt-5 break-words font-headline text-3xl font-black text-[var(--uki-cyan)]">{value}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">{label}</p>
          <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
            {details.map((detail, index) => <li key={index}>{detail}</li>)}
          </ul>
        </>
      ) : (
        <div className="mt-5">
          <p className="font-headline text-xl font-black uppercase text-amber-300">No disponible</p>
          <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">La fuente falló; no se ha sustituido por cero.</p>
        </div>
      )}
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--uki-muted)]">
        {timestampLabel(module.sourceObservedAt, module.generatedAt)}
      </p>
      {href && action ? (
        <Link href={href} className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-gold)]">
          {action}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <p className="mt-5 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">Vista de solo lectura</p>
      )}
    </article>
  );
}
