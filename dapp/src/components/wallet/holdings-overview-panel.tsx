'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Store,
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

type MarketplaceSummary = {
  inventory: number;
  listingEligible: number;
  activeListings: number;
  attentionListings: number;
};

type VestingSummary = {
  chainId: 56 | 97;
  configFrozen: boolean;
  hasPosition: boolean;
  totalAmountRaw: string;
  releasedAmountRaw: string;
  releasableRaw: string;
  lockedAmountRaw: string;
  progressBps: number;
};

type HoldingsSummary = {
  marketplace: ModuleState<MarketplaceSummary>;
  vesting: ModuleState<VestingSummary>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalRaw(value: unknown) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? value : null;
}

function unavailable<T>(): ModuleState<T> {
  return { state: 'unavailable', data: null };
}

async function requestMarketplace(walletAddress: string, signal: AbortSignal): Promise<ModuleState<MarketplaceSummary>> {
  try {
    const query = encodeURIComponent(walletAddress);
    const [inventoryResponse, ordersResponse] = await Promise.all([
      fetch(`/api/marketplace/v1/inventory?walletAddress=${query}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      }),
      fetch(`/api/marketplace/v1/orders?scope=seller&walletAddress=${query}&limit=50`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      }),
    ]);
    const [inventoryBody, ordersBody]: unknown[] = await Promise.all([
      inventoryResponse.json(),
      ordersResponse.json(),
    ]);
    if (
      !inventoryResponse.ok
      || !ordersResponse.ok
      || !isRecord(inventoryBody)
      || !isRecord(ordersBody)
      || inventoryBody.status !== 'ok'
      || ordersBody.status !== 'ok'
      || !isRecord(inventoryBody.data)
      || !isRecord(ordersBody.data)
      || !Array.isArray(inventoryBody.data.items)
      || !Array.isArray(ordersBody.data.orders)
    ) return unavailable();
    let listingEligible = 0;
    for (const item of inventoryBody.data.items) {
      if (!isRecord(item) || typeof item.listingEligible !== 'boolean' || typeof item.state !== 'string') {
        return unavailable();
      }
      if (item.listingEligible) listingEligible += 1;
    }
    let activeListings = 0;
    let attentionListings = 0;
    const validStatuses = new Set(['active', 'sold', 'cancelled', 'expired', 'invalid', 'requires_attention']);
    for (const order of ordersBody.data.orders) {
      if (!isRecord(order) || typeof order.status !== 'string' || !validStatuses.has(order.status)) {
        return unavailable();
      }
      if (order.status === 'active') activeListings += 1;
      if (order.status === 'requires_attention') attentionListings += 1;
    }
    return {
      state: 'ready',
      data: {
        inventory: inventoryBody.data.items.length,
        listingEligible,
        activeListings,
        attentionListings,
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return unavailable();
  }
}

function parseVesting(value: unknown): VestingSummary | null {
  if (!isRecord(value)) return null;
  const totalAmountRaw = canonicalRaw(value.totalAmountRaw);
  const releasedAmountRaw = canonicalRaw(value.releasedAmountRaw);
  const releasableRaw = canonicalRaw(value.releasableRaw);
  const lockedAmountRaw = canonicalRaw(value.lockedAmountRaw);
  if (
    (value.chainId !== 56 && value.chainId !== 97)
    || typeof value.configFrozen !== 'boolean'
    || typeof value.hasPosition !== 'boolean'
    || totalAmountRaw === null
    || releasedAmountRaw === null
    || releasableRaw === null
    || lockedAmountRaw === null
    || typeof value.progressBps !== 'number'
    || !Number.isSafeInteger(value.progressBps)
    || value.progressBps < 0
    || value.progressBps > 10_000
  ) return null;
  try {
    const total = BigInt(totalAmountRaw);
    const released = BigInt(releasedAmountRaw);
    const releasable = BigInt(releasableRaw);
    const locked = BigInt(lockedAmountRaw);
    if (released + releasable + locked !== total) return null;
  } catch {
    return null;
  }
  return {
    chainId: value.chainId,
    configFrozen: value.configFrozen,
    hasPosition: value.hasPosition,
    totalAmountRaw,
    releasedAmountRaw,
    releasableRaw,
    lockedAmountRaw,
    progressBps: value.progressBps,
  };
}

async function requestVesting(walletAddress: string, signal: AbortSignal): Promise<ModuleState<VestingSummary>> {
  try {
    const response = await fetch(
      `/api/vesting/v1/status?walletAddress=${encodeURIComponent(walletAddress)}`,
      { cache: 'no-store', credentials: 'same-origin', signal },
    );
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body) || body.status !== 'ok') return unavailable();
    const parsed = parseVesting(body.data);
    return parsed ? { state: 'ready', data: parsed } : unavailable();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return unavailable();
  }
}

function integerLabel(value: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value);
}

function ukiLabel(raw: string) {
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

export function HoldingsOverviewPanel() {
  const { user, walletType, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [summary, setSummary] = useState<HoldingsSummary | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress || walletType !== 'evm') {
      setSummary(null);
      return;
    }
    const controller = new AbortController();
    setSummary({
      marketplace: { state: 'loading', data: null },
      vesting: { state: 'loading', data: null },
    });
    Promise.all([
      requestMarketplace(walletAddress, controller.signal),
      requestVesting(walletAddress, controller.signal),
    ])
      .then(([marketplace, vesting]) => setSummary({ marketplace, vesting }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSummary({ marketplace: unavailable(), vesting: unavailable() });
      });
    return () => controller.abort();
  }, [authLoading, reloadNonce, walletAddress, walletType]);

  const loading = authLoading || Boolean(summary && Object.values(summary).some((module) => module.state === 'loading'));

  return (
    <section id="wallet-holdings-overview" className="uki-container relative z-[2] scroll-mt-28 pb-5">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Activos y desbloqueos</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Marketplace y vesting
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              El inventario se cruza con el indexador canónico y el vesting se lee en la bóveda configurada.
              Una fuente caída no oculta ni contamina la otra.
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
            <p className="font-black text-[var(--uki-cream)]">Firma una wallet EVM para ver tus activos</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              El dashboard no solicita inventarios ni calendarios privados sin una sesión firmada.
            </p>
            <LandingWalletConnectButton evmOnly className="mt-4" showCompactText={false} />
          </div>
        ) : null}

        {authLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" />
            Verificando la wallet…
          </p>
        ) : null}

        {summary ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <HoldingsCard
              icon={Store}
              title="Marketplace"
              module={summary.marketplace}
              href="/marketplace#marketplace-uki"
              action="Abrir marketplace"
              render={(data) => ({
                value: integerLabel(data.inventory),
                label: 'Cukies en inventario canónico',
                details: [
                  `${integerLabel(data.listingEligible)} disponibles para listar`,
                  `${integerLabel(data.activeListings)} anuncios activos`,
                  data.attentionListings > 0
                    ? `${integerLabel(data.attentionListings)} anuncios requieren atención`
                    : 'Ningún anuncio requiere atención',
                ],
                healthy: data.attentionListings === 0,
              })}
            />
            <HoldingsCard
              icon={LockKeyhole}
              title="Vesting de preventa"
              module={summary.vesting}
              href="/vesting"
              action="Gestionar vesting"
              render={(data) => ({
                value: ukiLabel(data.totalAmountRaw),
                label: data.hasPosition ? 'asignación total' : 'sin asignación',
                details: [
                  `${ukiLabel(data.releasableRaw)} disponibles ahora`,
                  `${ukiLabel(data.releasedAmountRaw)} ya reclamados`,
                  `${ukiLabel(data.lockedAmountRaw)} todavía bloqueados`,
                  `Chain ${data.chainId} · calendario ${data.configFrozen ? 'congelado' : 'sin congelar'}`,
                ],
                healthy: data.configFrozen,
                progress: data.progressBps / 100,
              })}
            />
          </div>
        ) : null}
      </Panel>
    </section>
  );
}

function HoldingsCard<T>({
  icon: Icon,
  title,
  module,
  href,
  action,
  render,
}: {
  icon: LucideIcon;
  title: string;
  module: ModuleState<T>;
  href: string;
  action: string;
  render: (data: T) => {
    value: string;
    label: string;
    details: ReactNode[];
    healthy: boolean;
    progress?: number;
  };
}) {
  const content = module.state === 'ready' ? render(module.data) : null;
  return (
    <article className="min-w-0 rounded-[10px] border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-[var(--uki-cyan)]" />
          <h3 className="font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{title}</h3>
        </div>
        {content ? (
          content.healthy
            ? <CheckCircle2 aria-label="Fuente saludable" className="h-4 w-4 shrink-0 text-[var(--uki-cyan)]" />
            : <AlertTriangle aria-label="Revisión necesaria" className="h-4 w-4 shrink-0 text-amber-300" />
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
            La fuente no ha podido verificarse. No se muestran saldos parciales.
          </p>
        </div>
      ) : null}
      {content ? (
        <>
          <p className="mt-5 break-words font-headline text-3xl font-black text-[var(--uki-cyan)]">{content.value}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">{content.label}</p>
          {content.progress !== undefined ? (
            <div className="mt-4">
              <div
                role="progressbar"
                aria-label="Progreso de vesting"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={content.progress}
                className="h-2 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--uki-cyan)] to-[var(--uki-gold)]"
                  style={{ width: `${content.progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">{content.progress.toLocaleString('es-ES')}% liberado</p>
            </div>
          ) : null}
          <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
            {content.details.map((detail, index) => <li key={index}>{detail}</li>)}
          </ul>
        </>
      ) : null}
      <a href={href} className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-gold)]">
        {action}
        <ArrowRight className="h-4 w-4" />
      </a>
    </article>
  );
}
