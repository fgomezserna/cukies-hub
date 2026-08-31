import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ExternalLink,
  Network,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

import { MarketplaceActions } from '@/components/legacy-marketplace/marketplace-actions';
import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import {
  formatLegacyDate,
  formatLegacyPrice,
  getCukiDisplayName,
  getStateLabel,
  getTypeLabel,
  shortWallet,
} from '@/components/legacy-marketplace/format';
import {
  getLegacyBscExplorerAddressUrl,
  legacyMarketplaceContracts,
} from '@/lib/legacy-marketplace/config';
import { legacyMarketplaceRuntime } from '@/lib/legacy-marketplace/runtime';
import { getCuki } from '@/lib/cukies-data/data';
import type {
  LegacyMarketplaceCukiHistoryEntry,
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceCukiReference,
} from '@/lib/legacy-marketplace/types';

type MarketplaceDetailPageProps = {
  params: Promise<{
    tokenId: string;
  }>;
};

const skillLabels = [
  ['miner', 'Minería'],
  ['engineer', 'Ingeniería'],
  ['farmer', 'Cultivo'],
  ['gatherer', 'Recolección'],
  ['scout', 'Exploración'],
  ['breeder', 'Crianza'],
] as const;

const vitalLabels = [
  ['life', 'Vida'],
  ['energy', 'Energía'],
] as const;

function getExplorerUrl(network: string, tokenId: string) {
  if (!legacyMarketplaceRuntime.legacyMainnetEnabled) return null;

  if (network === 'BSC') {
    return `${getLegacyBscExplorerAddressUrl(
      legacyMarketplaceContracts.bsc.contracts.token,
    )}?a=${tokenId}`;
  }

  return `https://tronscan.org/#/token721/${legacyMarketplaceContracts.tron.contracts.token}/${tokenId}`;
}

function getOriginAction(cuki: LegacyMarketplaceCukiItem) {
  return cuki.origin === 'mint' ? 'Creación' : 'Nacimiento';
}

function getOriginDate(cuki: LegacyMarketplaceCukiItem) {
  const datedHistory = cuki.history
    .map((item) => item.date)
    .filter((date): date is number => date !== null)
    .sort((a, b) => a - b);

  return datedHistory[0] ?? null;
}

function formatHistoryPrice(entry: LegacyMarketplaceCukiHistoryEntry) {
  if (entry.price === null || entry.price <= 0) return '-';

  if (entry.network === 'TRON' || entry.to?.toLowerCase().startsWith('t')) {
    return `${entry.price.toLocaleString('en-US')} TRX`;
  }

  if (entry.network === 'BSC' || entry.to?.toLowerCase().startsWith('0x')) {
    return `${(entry.price / 10_000).toLocaleString('en-US', {
      maximumFractionDigits: 4,
    })} BNB`;
  }

  return entry.price.toLocaleString('en-US');
}

function getHistoryLabel(entry: LegacyMarketplaceCukiHistoryEntry) {
  switch (entry.type.toLowerCase()) {
    case 'putonsale':
    case 'tokenonsale':
      return 'Puesto a la venta';
    case 'cancelsale':
    case 'markettokensalecancelled':
      return 'Venta cancelada';
    case 'buy':
    case 'tokenbought':
      return 'Comprado';
    case 'breed':
    case 'breedfinish':
      return 'Criado';
    case 'mint':
      return 'Creado';
    case 'bridge':
    case 'jumpoutbridge':
      return 'Cambio de red';
    default:
      return entry.type;
  }
}

function getHistoryTransactionUrl(entry: LegacyMarketplaceCukiHistoryEntry) {
  if (!legacyMarketplaceRuntime.legacyMainnetEnabled || !entry.transactionId) return null;
  if (entry.network === 'BSC') return `https://bscscan.com/tx/${entry.transactionId}`;
  if (entry.network === 'TRON') {
    return `https://tronscan.org/#/transaction/${entry.transactionId}`;
  }

  return null;
}

function shortTransaction(transactionId: string) {
  return `${transactionId.slice(0, 8)}...${transactionId.slice(-6)}`;
}

function getHistorySummary(entry: LegacyMarketplaceCukiHistoryEntry) {
  const type = entry.type.toLowerCase();
  const from = entry.from ? shortWallet(entry.from) : null;
  const to = entry.to ? shortWallet(entry.to) : null;
  const price = formatHistoryPrice(entry);

  if (type === 'putonsale' || type === 'tokenonsale') {
    return price !== '-'
      ? `Puesto a la venta por ${price}${from ? ` · ${from}` : ''}.`
      : `Publicado en el marketplace${from ? ` por ${from}` : ''}.`;
  }

  if (type === 'cancelsale' || type === 'markettokensalecancelled') {
    return 'Retirado del marketplace.';
  }

  if (type === 'buy' || type === 'tokenbought') {
    const actor = [from ? `de ${from}` : null, to ? `a ${to}` : null]
      .filter(Boolean)
      .join(' ');
    return `Comprado${actor ? ` ${actor}` : ''}${price !== '-' ? ` por ${price}` : ''}.`;
  }

  if (type === 'breed' || type === 'breedfinish') {
    return `Creado mediante crianza${to ? ` para ${to}` : ''}.`;
  }

  if (type === 'mint') {
    return `Creado${to ? ` para ${to}` : ''}.`;
  }

  if (type === 'bridge' || type === 'jumpoutbridge') {
    return `Trasladado a otra red${to ? ` para ${to}` : ''}.`;
  }

  return 'Movimiento registrado para este Cukie.';
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-white/10 py-3 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div
        className={
          mono
            ? 'min-w-0 break-all font-mono text-sm text-white'
            : 'min-w-0 text-sm font-semibold text-white'
        }
      >
        {value}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: ReactNode;
  Icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
      <Icon className="mb-3 h-4 w-4 text-lilac-200" />
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function RelationCard({
  relation,
  emptyLabel,
}: {
  relation?: LegacyMarketplaceCukiReference;
  emptyLabel: string;
}) {
  if (!relation) {
    return (
      <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <Link
      href={`/marketplace/${relation.tokenId}`}
      className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3 transition hover:border-lilac-300/35 hover:bg-lilac-300/10"
    >
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#0d0914]">
        <CukiImage
          src={relation.imageUrl}
          alt={`Cukie ${relation.tokenId}`}
          sizes="64px"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">
          {relation.cukiNumber !== null
            ? `Cukie #${relation.cukiNumber}`
            : relation.tokenId}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {relation.network ?? '-'} · Generación {relation.generation ?? '-'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {getStateLabel(relation.state ?? '-')}
        </p>
      </div>
    </Link>
  );
}

export default async function MarketplaceDetailPage({
  params,
}: MarketplaceDetailPageProps) {
  const { tokenId } = await params;
  const cuki = await getCuki(tokenId);

  if (!cuki) {
    notFound();
  }

  const originAction = getOriginAction(cuki);
  const originDate = getOriginDate(cuki);
  const history = [...cuki.history].sort(
    (a, b) => (b.date ?? 0) - (a.date ?? 0),
  );
  const detailStats = [
    { label: 'Precio', value: formatLegacyPrice(cuki), Icon: Sparkles },
    { label: 'Tipo', value: getTypeLabel(cuki.type), Icon: Shield },
    { label: 'Generación', value: String(cuki.skills.generation ?? '-'), Icon: Zap },
    { label: 'Descendientes', value: String(cuki.childrenCount ?? '-'), Icon: Users },
  ];
  const explorerUrl = getExplorerUrl(cuki.network, cuki.tokenId);

  return (
    <div className="uki-landing mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-6 overflow-hidden text-[var(--uki-cream)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al marketplace
        </Link>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-[8px] border border-lilac-300/25 bg-lilac-300/10 px-3 py-2 text-sm font-semibold text-lilac-100 transition hover:bg-lilac-300/20"
          >
            Ver en el explorador
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <section className="min-w-0 overflow-hidden rounded-[8px] border border-white/10 bg-black/35 shadow-2xl shadow-black/25">
            <div className="relative aspect-[4/5] min-h-[30rem] bg-[#0d0914]">
              <CukiImage
                src={cuki.imageUrl}
                alt={getCukiDisplayName(cuki)}
                sizes="(max-width: 1024px) 100vw, 26rem"
                className="object-contain p-4"
                priority
              />
            </div>
          </section>
          <MarketplaceActions cuki={cuki} />
        </div>

        <section className="grid min-w-0 content-start gap-5">
          <div className="rounded-[8px] border border-lilac-300/20 bg-black/35 p-5 shadow-2xl shadow-lilac-950/20 backdrop-blur">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lilac-300/25 bg-lilac-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-lilac-100">
              <Network className="h-3.5 w-3.5" />
              {cuki.network} · {getStateLabel(cuki.state)}
            </div>
            <h1 className="font-headline text-4xl font-bold text-white md:text-5xl">
              {getCukiDisplayName(cuki)}
            </h1>
            <p className="mt-2 break-all font-mono text-sm text-slate-400">
              Cukie {cuki.tokenId}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {detailStats.map(({ label, value, Icon }) => (
                <StatCard key={label} label={label} value={value} Icon={Icon} />
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <Activity className="h-5 w-5 text-lilac-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                Información principal
              </h2>
            </div>
            <InfoRow label="Tipo" value={getTypeLabel(cuki.type)} />
            <InfoRow
              label={`Fecha de ${originAction.toLowerCase()}`}
              value={formatLegacyDate(originDate)}
            />
            <InfoRow
              label={`Red de ${originAction.toLowerCase()}`}
              value={cuki.birthNetwork ?? '-'}
            />
            <InfoRow label="Propietario" value={cuki.owner ?? '-'} mono />
            <InfoRow label="Red actual" value={cuki.network} />
            <InfoRow label="Origen" value={cuki.origin === 'mint' ? 'Original' : 'Crianza'} />
            <InfoRow label="Estado" value={getStateLabel(cuki.state)} />
            <InfoRow label="Identificador" value={cuki.tokenId} mono />
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-lilac-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                Habilidades
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {skillLabels.map(([key, label]) => {
                const value = cuki.skills[key] ?? 0;

                return (
                  <div
                    key={key}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white">
                        {label}
                      </span>
                      <span className="font-mono text-sm text-lilac-100">
                        {value}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-lilac-300"
                        style={{ width: `${Math.min(Number(value) * 20, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {vitalLabels.map(([key, label]) => {
                const value = cuki.skills[key] ?? 0;

                return (
                  <div
                    key={key}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold text-white">
                      {value}
                    </p>
                  </div>
                );
              })}
              <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Generación
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-white">
                  {cuki.skills.generation ?? '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-lilac-200" />
                <h2 className="font-headline text-2xl font-bold text-white">
                  Familia
                </h2>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>{cuki.childrenCount ?? 0} descendientes</p>
                <p>
                  TRON {cuki.childrenCountTron ?? 0} · BSC{' '}
                  {cuki.childrenCountBsc ?? 0}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <RelationCard
                relation={cuki.parents[0]}
                emptyLabel="Cukie Original"
              />
              <RelationCard
                relation={cuki.parents[1]}
                emptyLabel="Cukie Original"
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {cuki.children.length > 0 ? (
                cuki.children.map((child) => (
                  <RelationCard
                    key={child.tokenId}
                    relation={child}
                    emptyLabel="Sin descendiente"
                  />
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400 md:col-span-2">
                  No hay descendientes registrados
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-lilac-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                Historial
              </h2>
            </div>
            <div className="grid gap-3">
              {history.length > 0 ? (
                history.map((item) => {
                  const transactionUrl = getHistoryTransactionUrl(item);
                  const price = formatHistoryPrice(item);

                  return (
                    <div
                      key={item.id}
                      className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">
                          {getHistoryLabel(item)}
                        </p>
                        <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatLegacyDate(item.date)}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {getHistorySummary(item)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {item.network && (
                          <span className="rounded-full border border-lilac-300/20 bg-lilac-300/10 px-2.5 py-1 font-semibold text-lilac-100">
                            {item.network}
                          </span>
                        )}
                        {price !== '-' && (
                          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 font-semibold text-emerald-100">
                            {price}
                          </span>
                        )}
                        {transactionUrl && item.transactionId && (
                          <a
                            href={transactionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-slate-300 transition hover:border-lilac-300/30 hover:text-white"
                          >
                            Tx {shortTransaction(item.transactionId)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
                  Todavía no hay movimientos registrados
                </div>
              )}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}
