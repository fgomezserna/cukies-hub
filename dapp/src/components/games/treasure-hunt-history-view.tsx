'use client';

import { useEffect, useState } from 'react';
import { Archive, Clock3 } from 'lucide-react';

import {
  type TreasureHuntCompetitionArchiveEntry,
  type TreasureHuntCompetitionArchiveManifest,
  useTreasureHuntCompetitionHistory,
} from '@/hooks/use-treasure-hunt-competition-history';
import { formatTreasureHuntDuration } from '@/hooks/use-treasure-hunt-competition-overview';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function editionLabel(archive: TreasureHuntCompetitionArchiveManifest) {
  return archive.eligibilityKind === 'presale' ? 'Torneo de preventa' : 'Staking UKI';
}

function formatArchiveWindow(archive: TreasureHuntCompetitionArchiveManifest) {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${formatter.format(new Date(archive.startsAt))} UTC — ${formatter.format(new Date(archive.endsAt))} UTC`;
}

export function formatArchiveReward(entry: TreasureHuntCompetitionArchiveEntry) {
  switch (entry.rewardStatus) {
    case 'no_purchase':
      return 'Sin compra elegible';
    case 'pool_exhausted':
      return 'Pool agotado';
    case 'reward_rounds_to_zero':
    case 'not_applicable':
      return 'Sin premio';
    case 'draw_pending':
      return 'Sorteo pendiente';
    case 'partial': {
      const amount = formatTreasureHuntUkiRaw(entry.estimatedRewardUkiRaw);
      return amount === '—' ? 'Pendiente · Parcial' : `${amount} · Parcial`;
    }
    case 'estimated':
      return formatTreasureHuntUkiRaw(entry.estimatedRewardUkiRaw);
    case 'final':
      return formatTreasureHuntUkiRaw(entry.finalRewardUkiRaw);
    case 'pending':
      return 'Pendiente';
  }
}

function pageNumbers(currentPage: number, totalPages: number) {
  const first = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const last = Math.min(totalPages, Math.max(currentPage + 1, 3));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function ArchiveLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando histórico de clasificaciones"
      className="space-y-3 p-4 sm:p-5"
    >
      <div className="h-20 animate-pulse rounded-[7px] bg-white/5" />
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="h-14 animate-pulse rounded-[7px] bg-white/5" />
      ))}
    </div>
  );
}

function ArchiveReward({ entry }: { readonly entry: TreasureHuntCompetitionArchiveEntry }) {
  return (
    <div>
      <strong className="font-mono text-sm text-[#ffc240]">{formatArchiveReward(entry)}</strong>
      {entry.rewardStatus === 'draw_pending' && entry.tickets !== null ? (
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.06em] text-[#aaa8a2]">
          {entry.tickets.toLocaleString('es-ES')} tickets
        </span>
      ) : null}
      {entry.reviewStatus === 'pending' || entry.reviewStatus === 'review' ? (
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.06em] text-[#aaa8a2]">
          Pendiente de revisión
        </span>
      ) : null}
    </div>
  );
}

function ArchiveEntries({
  entries,
}: {
  readonly entries: readonly TreasureHuntCompetitionArchiveEntry[];
}) {
  return (
    <>
      <div className="space-y-2 p-3 sm:hidden">
        {entries.map((entry) => (
          <article key={entry.publicEntryId} className="rounded-[7px] border border-white/15 bg-black/15 p-4">
            <div className="flex items-center gap-3">
              <span className="font-mono font-black text-[#ffc240]">#{entry.rank}</span>
              <p className="min-w-0 flex-1 truncate font-bold text-[#f2eee7]">{entry.playerAlias}</p>
              <p className="font-mono text-lg font-black text-[#35eee2]">
                <span className="sr-only">Puntuación: </span>
                {entry.score.toLocaleString('es-ES')}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <span className="flex items-center gap-1.5 text-xs text-[#aaa8a2]">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Tiempo: </span>
                {formatTreasureHuntDuration(entry.elapsedMs)}
              </span>
              <div className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#969994]">
                  Premio/resultado
                </span>
                <ArchiveReward entry={entry} />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-black/15 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]">
            <tr>
              <th className="px-5 py-3">Pos.</th>
              <th className="px-5 py-3">Jugador</th>
              <th className="px-5 py-3 text-right">Puntuación</th>
              <th className="px-5 py-3 text-right">Tiempo</th>
              <th className="px-5 py-3 text-right">Premio/resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {entries.map((entry) => (
              <tr key={entry.publicEntryId}>
                <td className="px-5 py-4 font-mono font-black text-[#ffc240]">#{entry.rank}</td>
                <td className="px-5 py-4 font-bold text-[#f2eee7]">{entry.playerAlias}</td>
                <td className="px-5 py-4 text-right font-mono font-black text-[#35eee2]">
                  {entry.score.toLocaleString('es-ES')}
                </td>
                <td className="px-5 py-4 text-right font-mono text-[#aaa8a2]">
                  {formatTreasureHuntDuration(entry.elapsedMs)}
                </td>
                <td className="px-5 py-4 text-right"><ArchiveReward entry={entry} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function TreasureHuntHistoryView() {
  const [page, setPage] = useState(1);
  const {
    archives,
    selectedCampaignId,
    archive,
    entries,
    pagination,
    isListLoading,
    isDetailLoading,
    listError,
    detailError,
    selectCampaign,
    reloadList,
    reloadDetail,
  } = useTreasureHuntCompetitionHistory({ page, pageSize: PAGE_SIZE });

  useEffect(() => {
    setPage(1);
  }, [selectedCampaignId]);

  if (isListLoading) return <ArchiveLoading />;

  if (listError) {
    return (
      <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-[7px] border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm text-red-100 sm:m-5">
        <span>{listError}</span>
        <button
          type="button"
          onClick={reloadList}
          className="min-h-10 rounded-[5px] px-2 font-bold text-[#35eee2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (archives.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
        <Archive className="h-8 w-8 text-[#35eee2]" aria-hidden="true" />
        <h3 className="mt-4 font-headline text-lg font-black text-[#f2eee7]">Aún no hay ediciones publicadas</h3>
        <p className="mt-2 max-w-md text-sm text-[#969994]">
          Las clasificaciones cerradas aparecerán aquí cuando estén disponibles.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-white/15 px-4 py-4 sm:px-5">
        <label htmlFor="competition-archive" className="block text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]">
          Edición finalizada
        </label>
        <select
          id="competition-archive"
          value={selectedCampaignId ?? ''}
          onChange={(event) => selectCampaign(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-[6px] border border-white/20 bg-[#071312] px-3 text-sm font-bold text-[#f2eee7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2]"
        >
          {archives.map((item) => (
            <option key={item.campaignId} value={item.campaignId}>
              {editionLabel(item)} · {formatArchiveWindow(item)}
            </option>
          ))}
        </select>
      </div>

      {isDetailLoading ? <ArchiveLoading /> : null}

      {!isDetailLoading && detailError ? (
        <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-[7px] border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm text-red-100 sm:m-5">
          <span>{detailError}</span>
          <button
            type="button"
            onClick={reloadDetail}
            className="min-h-10 rounded-[5px] px-2 font-bold text-[#35eee2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2]"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!isDetailLoading && !detailError && archive ? (
        <>
          <header className="border-b border-white/15 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-[#35eee2]">
                  Edición cerrada
                </p>
                <h3 className="mt-1 font-headline text-xl font-black tracking-[-0.02em] text-[#f1eee8] sm:text-2xl">
                  Treasure Hunt · {editionLabel(archive)}
                </h3>
                <p className="mt-2 text-xs text-[#aaa8a2]">{formatArchiveWindow(archive)}</p>
              </div>
              <span className={cn(
                'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em]',
                archive.stage === 'provisional'
                  ? 'border-[#ffc240]/45 bg-[#ffc240]/10 text-[#ffc240]'
                  : 'border-[#35eee2]/45 bg-[#35eee2]/10 text-[#35eee2]',
              )}>
                {archive.stage === 'provisional' ? 'Provisional' : 'Final'}
              </span>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#c5c3bd]">
              {archive.stage === 'provisional'
                ? 'Clasificación congelada al cierre. Los premios son todavía estimados y están pendientes de revisión.'
                : 'Resultados definitivos de la edición, con la revisión y los premios cerrados.'}
            </p>
          </header>

          <dl className="grid grid-cols-1 gap-px border-b border-white/15 bg-white/15 min-[420px]:grid-cols-3">
            {([
              ['Pool al cierre', formatTreasureHuntUkiRaw(archive.pool.totalUkiRaw)],
              ['Entradas', archive.totalRankedEntries.toLocaleString('es-ES')],
              ['Participantes', archive.totalParticipants?.toLocaleString('es-ES') ?? '—'],
            ] as const).map(([label, value]) => (
              <div key={label} className="min-w-0 bg-[#071312] px-4 py-3 sm:px-5 sm:py-4">
                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#969994]">{label}</dt>
                <dd className="mt-1 truncate font-mono text-base font-black text-[#35eee2] sm:text-lg" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {entries.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
              <Archive className="h-8 w-8 text-[#35eee2]" aria-hidden="true" />
              <h3 className="mt-4 font-headline text-lg font-black text-[#f2eee7]">Esta edición no tiene entradas clasificadas</h3>
            </div>
          ) : (
            <ArchiveEntries entries={entries} />
          )}

          {pagination && pagination.totalPages > 1 ? (
            <nav aria-label="Paginación del histórico" className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-4 sm:px-5">
              <p className="text-xs text-[#969994]">
                {pagination.total.toLocaleString('es-ES')} entradas · Página {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="min-h-10 shrink-0 rounded-[5px] border border-white/15 px-3 text-xs font-bold text-[#f2eee7] hover:border-[#35eee2]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Anterior
                </button>
                {pageNumbers(pagination.page, pagination.totalPages).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    aria-current={pagination.page === pageNumber ? 'page' : undefined}
                    aria-label={`Página ${pageNumber}`}
                    onClick={() => setPage(pageNumber)}
                    className={cn(
                      'min-h-10 min-w-10 shrink-0 rounded-[5px] border px-2 font-mono text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2]',
                      pagination.page === pageNumber
                        ? 'border-[#35eee2]/60 bg-[#35eee2]/15 text-[#35eee2]'
                        : 'border-white/15 text-[#aaa8a2] hover:border-[#35eee2]/45',
                    )}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                  className="min-h-10 shrink-0 rounded-[5px] border border-white/15 px-3 text-xs font-bold text-[#f2eee7] hover:border-[#35eee2]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Siguiente
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
