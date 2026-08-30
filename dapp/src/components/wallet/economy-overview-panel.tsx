'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Crown,
  Gift,
  Layers3,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { formatUnits } from 'viem';

import { Panel } from '@/components/landing/primitives';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { useAuth } from '@/providers/auth-provider';

type ModuleState<T> =
  | { state: 'loading'; data: null }
  | { state: 'ready'; data: T }
  | { state: 'unavailable'; data: null };

type CukieMasterSummary = {
  allocatedSlots: number;
  desiredSlots: number;
  maxPotentialSlots: number;
  healthy: boolean;
};

type CreditSummary = {
  availableCredits: number;
  spentCredits: number;
  poolDepositedCredits: number;
  poolAvailableCredits: number;
  healthy: boolean;
};

type CukiePoolSummary = {
  positions: number;
  activePositions: number;
  gamesRemaining: number;
  healthy: boolean;
};

type RewardSummary = {
  claimableRaw: string;
  allocations: number;
  claims: number;
  claimPublished: boolean;
  healthy: boolean;
};

type EconomySummary = {
  cukieMaster: ModuleState<CukieMasterSummary>;
  credits: ModuleState<CreditSummary>;
  cukiePool: ModuleState<CukiePoolSummary>;
  rewards: ModuleState<RewardSummary>;
};

const loadingModule = { state: 'loading', data: null } as const;

function loadingSummary(): EconomySummary {
  return {
    cukieMaster: loadingModule,
    credits: loadingModule,
    cukiePool: loadingModule,
    rewards: loadingModule,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function canonicalRaw(value: unknown) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? value : null;
}

function parseCukieMaster(value: unknown): CukieMasterSummary | null {
  if (!isRecord(value) || !isRecord(value.totals) || !isRecord(value.routes)) return null;
  const allocatedSlots = safeNonNegativeInteger(value.totals.allocatedSlots);
  const desiredSlots = safeNonNegativeInteger(value.totals.desiredSlots);
  const maxPotentialSlots = safeNonNegativeInteger(value.totals.maxPotentialSlots);
  const uki = isRecord(value.routes.uki) ? value.routes.uki : null;
  const nft = isRecord(value.routes.nft) ? value.routes.nft : null;
  if (allocatedSlots === null || desiredSlots === null || maxPotentialSlots === null || !uki || !nft) return null;
  const routeHealthy = (route: Record<string, unknown>) => {
    const source = isRecord(route.source) ? route.source : null;
    return source?.complete === true && route.synchronizing !== true;
  };
  return {
    allocatedSlots,
    desiredSlots,
    maxPotentialSlots,
    healthy: routeHealthy(uki) && routeHealthy(nft),
  };
}

function parseCredits(value: unknown): CreditSummary | null {
  if (!isRecord(value) || !isRecord(value.balance) || !isRecord(value.pool) || !isRecord(value.grants)) return null;
  const availableCredits = safeNonNegativeInteger(value.balance.availableCredits);
  const spentCredits = safeNonNegativeInteger(value.balance.spentCredits);
  const poolDepositedCredits = safeNonNegativeInteger(value.balance.poolDepositedCredits);
  const poolAvailableCredits = safeNonNegativeInteger(value.pool.availableCredits);
  if (
    availableCredits === null
    || spentCredits === null
    || poolDepositedCredits === null
    || poolAvailableCredits === null
  ) return null;
  return {
    availableCredits,
    spentCredits,
    poolDepositedCredits,
    poolAvailableCredits,
    healthy: value.grants.healthy === true
      && value.balance.blocked === false
      && value.pool.blocked === false,
  };
}

function parseCukiePool(value: unknown): CukiePoolSummary | null {
  if (!isRecord(value) || !Array.isArray(value.positions) || typeof value.sourceHealthy !== 'boolean') return null;
  let activePositions = 0;
  let gamesRemaining = 0;
  for (const position of value.positions) {
    if (!isRecord(position)) return null;
    if (position.status === 'active') activePositions += 1;
    const remaining = safeNonNegativeInteger(position.gamesRemaining);
    if (remaining === null) return null;
    gamesRemaining += remaining;
  }
  return {
    positions: value.positions.length,
    activePositions,
    gamesRemaining,
    healthy: value.sourceHealthy,
  };
}

function parseRewards(value: unknown): RewardSummary | null {
  if (!isRecord(value) || !Array.isArray(value.allocations) || !Array.isArray(value.claims)) return null;
  const claimableRaw = canonicalRaw(value.claimableRaw);
  if (claimableRaw === null || typeof value.claimPublished !== 'boolean' || typeof value.healthy !== 'boolean') return null;
  return {
    claimableRaw,
    allocations: value.allocations.length,
    claims: value.claims.length,
    claimPublished: value.claimPublished,
    healthy: value.healthy,
  };
}

async function requestSummary<T>(
  url: string,
  parser: (value: unknown) => T | null,
  signal: AbortSignal,
): Promise<ModuleState<T>> {
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal });
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body) || body.status !== 'ok') return { state: 'unavailable', data: null };
    const parsed = parser(body.data);
    return parsed ? { state: 'ready', data: parsed } : { state: 'unavailable', data: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { state: 'unavailable', data: null };
  }
}

function integerLabel(value: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value);
}

function ukiLabel(raw: string) {
  try {
    const value = Number(formatUnits(BigInt(raw), 18));
    if (!Number.isFinite(value)) return 'No disponible';
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(value)} UKI`;
  } catch {
    return 'No disponible';
  }
}

export function EconomyOverviewPanel() {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [summary, setSummary] = useState<EconomySummary | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress || walletType !== 'evm') {
      setSummary(null);
      return;
    }
    const controller = new AbortController();
    const query = encodeURIComponent(walletAddress);
    setSummary(loadingSummary());
    Promise.all([
      requestSummary(`/api/economy/v1/cukie-master?walletAddress=${query}`, parseCukieMaster, controller.signal),
      requestSummary(`/api/economy/v1/credits?walletAddress=${query}`, parseCredits, controller.signal),
      requestSummary(`/api/economy/v1/cukie-pool?walletAddress=${query}&limit=50`, parseCukiePool, controller.signal),
      requestSummary(`/api/economy/v1/rewards?walletAddress=${query}&limit=50`, parseRewards, controller.signal),
    ])
      .then(([cukieMaster, credits, cukiePool, rewards]) => {
        setSummary({ cukieMaster, credits, cukiePool, rewards });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSummary({
          cukieMaster: { state: 'unavailable', data: null },
          credits: { state: 'unavailable', data: null },
          cukiePool: { state: 'unavailable', data: null },
          rewards: { state: 'unavailable', data: null },
        });
      });
    return () => controller.abort();
  }, [authLoading, reloadNonce, walletAddress, walletType]);

  const loading = authLoading || Boolean(summary && Object.values(summary).some((module) => module.state === 'loading'));

  return (
    <section id="wallet-economy-overview" className="uki-container relative z-[2] scroll-mt-28 pb-5">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Estado canónico de wallet</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Resumen de economía
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Solo se muestran datos confirmados por los servicios de Stage. Si una fuente no es saludable,
              ese módulo se bloquea sin inventar saldos ni estimaciones.
            </p>
          </div>
          {summary ? (
            <button
              type="button"
              onClick={() => setReloadNonce((current) => current + 1)}
              disabled={loading}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-cyan)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          ) : null}
        </div>

        {!authLoading && (!walletAddress || walletType !== 'evm') ? (
          <div className="mt-6 rounded-[8px] border border-white/10 bg-black/20 p-5">
            <p className="font-black text-[var(--uki-cream)]">Conecta y firma una wallet EVM</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Los balances, cupos, posiciones y rewards son privados y solo se consultan para la wallet autenticada.
            </p>
            <LandingWalletConnectButton evmOnly className="mt-4" showCompactText={false} />
          </div>
        ) : null}

        {authLoading ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--uki-cyan)]" />
            Verificando la wallet…
          </div>
        ) : null}

        {summary ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SummaryCard
              icon={Crown}
              title="Cukie Master"
              module={summary.cukieMaster}
              href="/cukie-master#mi-estado"
              action="Gestionar cupos"
              render={(data) => ({
                value: `${integerLabel(data.allocatedSlots)} / ${integerLabel(data.maxPotentialSlots)}`,
                label: 'cupos activos',
                details: [
                  `${integerLabel(data.desiredSlots)} cupos calculados`,
                  data.healthy ? 'Fuentes sincronizadas' : 'Alguna ruta está sincronizando',
                ],
                healthy: data.healthy,
              })}
            />
            <SummaryCard
              icon={Coins}
              title="Créditos"
              module={summary.credits}
              href="/cukie-master#competition-credits"
              action="Usar o aportar"
              render={(data) => ({
                value: integerLabel(data.availableCredits),
                label: 'créditos disponibles',
                details: [
                  `${integerLabel(data.poolAvailableCredits)} disponibles en el pool`,
                  `${integerLabel(data.poolDepositedCredits)} aportados · ${integerLabel(data.spentCredits)} usados`,
                ],
                healthy: data.healthy,
              })}
            />
            <SummaryCard
              icon={Layers3}
              title="Pool de Cukies"
              module={summary.cukiePool}
              href="/cukie-hodler#mi-cukie-pool"
              action="Gestionar Cukies"
              render={(data) => ({
                value: integerLabel(data.activePositions),
                label: 'posiciones activas',
                details: [
                  `${integerLabel(data.positions)} posiciones visibles`,
                  `${integerLabel(data.gamesRemaining)} partidas restantes`,
                ],
                healthy: data.healthy,
              })}
            />
            <SummaryCard
              id="rewards-summary"
              icon={Gift}
              title="Rewards"
              module={summary.rewards}
              render={(data) => ({
                value: ukiLabel(data.claimableRaw),
                label: 'reclamables confirmados',
                details: [
                  `${integerLabel(data.allocations)} asignaciones visibles`,
                  data.claimPublished
                    ? `${integerLabel(data.claims)} claims confirmados`
                    : 'No hay batch publicado para esta wallet',
                ],
                healthy: data.healthy,
              })}
            />
          </div>
        ) : null}
      </Panel>
    </section>
  );
}

function SummaryCard<T>({
  id,
  icon: Icon,
  title,
  module,
  href,
  action,
  render,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  module: ModuleState<T>;
  href?: string;
  action?: string;
  render: (data: T) => {
    value: string;
    label: string;
    details: ReactNode[];
    healthy: boolean;
  };
}) {
  const content = module.state === 'ready' ? render(module.data) : null;
  return (
    <article id={id} className="min-w-0 rounded-[10px] border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-[var(--uki-cyan)]" />
          <h3 className="truncate font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{title}</h3>
        </div>
        {content ? (
          content.healthy
            ? <CheckCircle2 aria-label="Fuente saludable" className="h-4 w-4 shrink-0 text-[var(--uki-cyan)]" />
            : <AlertTriangle aria-label="Fuente sincronizando" className="h-4 w-4 shrink-0 text-amber-300" />
        ) : null}
      </div>

      {module.state === 'loading' ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" />
          Consultando…
        </p>
      ) : null}

      {module.state === 'unavailable' ? (
        <div className="mt-5">
          <p className="font-headline text-xl font-black uppercase text-amber-300">No disponible</p>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
            La fuente no ha podido verificarse. No se muestra ninguna estimación.
          </p>
        </div>
      ) : null}

      {content ? (
        <>
          <p className="mt-5 break-words font-headline text-3xl font-black text-[var(--uki-cyan)]">{content.value}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">{content.label}</p>
          <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
            {content.details.map((detail, index) => <li key={index}>{detail}</li>)}
          </ul>
        </>
      ) : null}

      {href && action ? (
        <a href={href} className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-gold)]">
          {action}
          <ArrowRight className="h-4 w-4" />
        </a>
      ) : (
        <p className="mt-5 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">Vista de solo lectura</p>
      )}
    </article>
  );
}
