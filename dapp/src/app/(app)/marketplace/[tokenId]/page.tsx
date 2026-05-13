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
  Wallet,
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
import { getLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';
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
  ['miner', 'Miner'],
  ['engineer', 'Engineer'],
  ['farmer', 'Farmer'],
  ['gatherer', 'Gatherer'],
  ['scout', 'Scout'],
  ['breeder', 'Breeder'],
] as const;

const vitalLabels = [
  ['life', 'Life'],
  ['energy', 'Energy'],
] as const;

function getExplorerUrl(network: string, tokenId: string) {
  if (network === 'BSC') {
    return `${getLegacyBscExplorerAddressUrl(
      legacyMarketplaceContracts.bsc.contracts.token,
    )}?a=${tokenId}`;
  }

  return `https://tronscan.org/#/token721/${legacyMarketplaceContracts.tron.contracts.token}/${tokenId}`;
}

function getOriginAction(cuki: LegacyMarketplaceCukiItem) {
  return cuki.origin === 'mint' ? 'Mint' : 'Birth';
}

function getOriginDate(cuki: LegacyMarketplaceCukiItem) {
  const datedHistory = cuki.history
    .map((item) => item.date)
    .filter((date): date is number => date !== null)
    .sort((a, b) => a - b);

  return datedHistory[0] ?? null;
}

function formatHistoryPrice(entry: LegacyMarketplaceCukiHistoryEntry) {
  if (!entry.price) return '-';

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

function formatHistoryActor(
  entry: LegacyMarketplaceCukiHistoryEntry,
  side: 'from' | 'to',
) {
  const value = side === 'from' ? entry.from : entry.to;

  if (value) return shortWallet(value);
  if (side === 'from' && entry.type.toLowerCase() === 'mint') return 'Minted';
  if (side === 'from' && entry.type.toLowerCase() === 'breed') return 'Bred';

  return '-';
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
      <Icon className="mb-3 h-4 w-4 text-cyan-200" />
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
      className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3 transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
    >
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#071211]">
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
          {relation.network ?? '-'} · Gen {relation.generation ?? '-'}
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
  const cuki = await getLegacyMarketplaceCuki(tokenId);

  if (!cuki) {
    notFound();
  }

  const originAction = getOriginAction(cuki);
  const originDate = getOriginDate(cuki);
  const history = [...cuki.history].sort(
    (a, b) => (b.date ?? 0) - (a.date ?? 0),
  );
  const detailStats = [
    { label: 'Price', value: formatLegacyPrice(cuki), Icon: Sparkles },
    { label: 'Type', value: getTypeLabel(cuki.type), Icon: Shield },
    { label: 'Generation', value: String(cuki.skills.generation ?? '-'), Icon: Zap },
    { label: 'Children', value: String(cuki.childrenCount ?? '-'), Icon: Users },
  ];

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-6 overflow-hidden text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to marketplace
        </Link>
        <a
          href={getExplorerUrl(cuki.network, cuki.tokenId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-[8px] border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Explorer
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <section className="min-w-0 overflow-hidden rounded-[8px] border border-white/10 bg-black/35 shadow-2xl shadow-black/25">
            <div className="relative aspect-[4/5] min-h-[30rem] bg-[#071211]">
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
          <div className="rounded-[8px] border border-cyan-300/20 bg-black/35 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
              <Network className="h-3.5 w-3.5" />
              {cuki.network} · {getStateLabel(cuki.state)}
            </div>
            <h1 className="font-headline text-4xl font-bold text-white md:text-5xl">
              {getCukiDisplayName(cuki)}
            </h1>
            <p className="mt-2 break-all font-mono text-sm text-slate-400">
              Token {cuki.tokenId}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {detailStats.map(({ label, value, Icon }) => (
                <StatCard key={label} label={label} value={value} Icon={Icon} />
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                General info
              </h2>
            </div>
            <InfoRow label="Type" value={getTypeLabel(cuki.type)} />
            <InfoRow
              label={`${originAction} date`}
              value={formatLegacyDate(originDate)}
            />
            <InfoRow
              label={`${originAction} network`}
              value={cuki.birthNetwork ?? '-'}
            />
            <InfoRow label="Owner" value={cuki.owner ?? '-'} mono />
            <InfoRow label="Current network" value={cuki.network} />
            <InfoRow label="Origin" value={cuki.origin ?? '-'} />
            <InfoRow label="State" value={getStateLabel(cuki.state)} />
            <InfoRow label="Token ID" value={cuki.tokenId} mono />
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-cyan-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                Skills
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
                      <span className="font-mono text-sm text-cyan-100">
                        {value}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300"
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
                  Generation
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
                <Users className="h-5 w-5 text-cyan-200" />
                <h2 className="font-headline text-2xl font-bold text-white">
                  Family
                </h2>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>{cuki.childrenCount ?? 0} children</p>
                <p>
                  TRON {cuki.childrenCountTron ?? 0} · BSC{' '}
                  {cuki.childrenCountBsc ?? 0}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <RelationCard
                relation={cuki.parents[0]}
                emptyLabel="Original Cukie"
              />
              <RelationCard
                relation={cuki.parents[1]}
                emptyLabel="Original Cukie"
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {cuki.children.length > 0 ? (
                cuki.children.map((child) => (
                  <RelationCard
                    key={child.tokenId}
                    relation={child}
                    emptyLabel="No child"
                  />
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400 md:col-span-2">
                  No children registered
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-cyan-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                History
              </h2>
            </div>
            <div className="grid gap-3">
              {history.length > 0 ? (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-white">{item.type}</p>
                      <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatLegacyDate(item.date)}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          From
                        </p>
                        <p className="mt-1 font-mono text-white">
                          {formatHistoryActor(item, 'from')}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          To
                        </p>
                        <p className="mt-1 font-mono text-white">
                          {formatHistoryActor(item, 'to')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Price
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {formatHistoryPrice(item)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
                  No history registered
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-black/30 p-5 backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-cyan-200" />
              <h2 className="font-headline text-2xl font-bold text-white">
                Marketplace data
              </h2>
            </div>
            <InfoRow label="Display price" value={formatLegacyPrice(cuki)} />
            <InfoRow label="Raw price" value={cuki.priceOriginal ?? '-'} mono />
            <InfoRow
              label="Indexed at"
              value={cuki.timestamp ? formatLegacyDate(cuki.timestamp * 1000) : '-'}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
