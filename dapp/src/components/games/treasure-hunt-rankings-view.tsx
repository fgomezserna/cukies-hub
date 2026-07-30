'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3, Medal } from 'lucide-react';

import {
  formatTreasureHuntDuration,
  type TreasureHuntLeaderboardEntry,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { cn } from '@/lib/utils';

type RankingFilter = 'general' | 'mine';
const PAGE_SIZE = 20;

function rewardLabel(entry: TreasureHuntLeaderboardEntry) {
  if (entry.rewardStatus === 'no_purchase') return 'Sin compra UKI';
  if (entry.rewardStatus === 'pool_exhausted') return 'Fuera de premios';
  if (entry.rewardStatus === 'reward_rounds_to_zero') return 'Sin premio';
  return formatTreasureHuntUkiRaw(entry.estimatedRewardUkiRaw);
}

function pageNumbers(currentPage: number, totalPages: number) {
  const first = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const last = Math.min(totalPages, Math.max(currentPage + 1, 3));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export default function TreasureHuntRankingsView() {
  const [filter, setFilter] = useState<RankingFilter>('general');
  const [page, setPage] = useState(1);
  const { status, leaderboard, leaderboardMeta, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview({
      leaderboardPage: page,
      leaderboardPageSize: PAGE_SIZE,
      leaderboardMineOnly: filter === 'mine',
    });
  const campaign = status?.campaign;
  const maxAttempts = campaign?.maxWinningAttemptsPerWallet ?? 5;
  const myAttempts = leaderboardMeta?.myAttempts ?? 0;
  const prizePoolValue = leaderboardMeta
    ? formatTreasureHuntUkiRaw(leaderboardMeta.poolUkiRaw)
    : 'Actualizando…';
  const pagination = leaderboardMeta?.pagination;

  useEffect(() => {
    if (window.location.hash === '#mi-participacion') setFilter('mine');
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const metrics = [
    ['Modo activo', '1P', true],
    ['Partidas computables', isLoading ? '···' : `${myAttempts}/${maxAttempts}`, false],
    [
      'Premio acumulado',
      isLoading && !leaderboardMeta ? '···' : prizePoolValue,
      false,
    ],
  ] as const;

  return (
    <div className="mx-auto min-h-full w-full max-w-[68rem] pb-8">
      <div className="mb-4">
        <h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">
          Rankings de Treasure Hunt
        </h2>
        <p className="mt-1 text-sm text-[#aaa8a2]">
          Las cinco mejores partidas de cada jugador, ordenadas por puntuación.
        </p>
      </div>

      {error ? (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-[7px] border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm text-red-100">
          <span>{error}</span>
          <button type="button" onClick={reload} className="font-bold text-[#35eee2]">
            Reintentar
          </button>
        </div>
      ) : null}

      <main className="overflow-hidden rounded-[8px] border border-[#b68b3c]/55 bg-[#061110]/94">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 px-5 py-5">
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-[#35eee2]">
              Competición oficial
            </p>
            <h3 className="mt-1 font-headline text-2xl font-black tracking-[-0.02em] text-[#f1eee8]">
              Torneo Preventa UKI
            </h3>
          </div>
          <Link
            href="/games/treasure-hunt"
            className="hidden min-h-11 items-center gap-2 rounded-[6px] border border-[#2de9dd]/65 bg-[#0d5d57] px-5 text-sm font-bold text-white hover:bg-[#137069] sm:inline-flex"
          >
            Jugar 1P <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <dl className="grid grid-cols-2 gap-px border-b border-white/15 bg-white/15 sm:grid-cols-3">
          {metrics.map(([label, value, mobileHidden]) => (
            <div
              key={label}
              className={cn(
                'min-w-0 bg-[#071312] px-3 py-3 sm:px-5 sm:py-4',
                mobileHidden && 'hidden sm:block',
              )}
            >
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#969994]">
                {label}
              </dt>
              <dd className="mt-1 truncate font-mono text-base font-black text-[#35eee2] sm:text-xl" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div
          id="mi-participacion"
          className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3 border-b border-white/15 px-4 py-3 sm:px-5"
        >
          <div className="inline-flex rounded-[7px] border border-white/15 bg-black/20 p-1" role="group" aria-label="Filtrar ranking">
            {([
              ['general', 'General'],
              ['mine', 'Mis partidas'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'min-h-9 rounded-[5px] px-3 text-xs font-black transition',
                  filter === value
                    ? 'bg-[#35eee2]/15 text-[#35eee2]'
                    : 'text-[#969994] hover:text-[#f2eee7]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#969994]">
            Cada partida clasificada suma el 10% de tus UKI comprados, hasta {maxAttempts}.
          </p>
        </div>

        {isLoading ? (
          <div aria-label="Cargando ranking" className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-[7px] bg-white/5" />
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
            <Medal className="h-8 w-8 text-[#35eee2]" aria-hidden="true" />
            <h3 className="mt-4 font-headline text-lg font-black text-[#f2eee7]">
              {filter === 'mine' ? 'Aún no tienes partidas clasificadas' : 'Todavía no hay partidas clasificadas'}
            </h3>
            <p className="mt-2 max-w-md text-sm text-[#969994]">
              Termina una partida 1P computable para aparecer en el ranking.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {leaderboard.map((entry) => (
                <article key={entry.attemptId} className={cn('rounded-[7px] border border-white/15 bg-black/15 p-4', entry.isMe && 'border-[#35eee2]/45 bg-[#35eee2]/5')}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-[#ffc240]">#{entry.rank}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[#f2eee7]">{entry.alias}</p>
                    </div>
                    <p className="font-mono text-lg font-black text-[#35eee2]">{entry.score.toLocaleString('es-ES')}</p>
                  </div>
                  <p className="mt-3 flex items-center justify-end gap-1.5 border-t border-white/10 pt-3 text-xs text-[#969994]">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatTreasureHuntDuration(entry.gameTimeMs)}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#969994]">Premio estimado</span>
                    <strong className={cn(
                      'font-mono text-sm',
                      entry.rewardStatus === 'pool_exhausted'
                        ? 'text-[#969994]'
                        : 'text-[#ffc240]',
                    )}>
                      {rewardLabel(entry)}
                      {entry.rewardStatus === 'partial' ? ' · Parcial' : ''}
                    </strong>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="bg-black/15 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]">
                  <tr>
                    <th className="px-5 py-3">Pos.</th>
                    <th className="px-5 py-3">Jugador</th>
                    <th className="px-5 py-3 text-right">Puntuación</th>
                    <th className="px-5 py-3 text-right">Tiempo</th>
                    <th className="px-5 py-3 text-right">Premio estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {leaderboard.map((entry) => (
                    <tr key={entry.attemptId} className={cn(entry.isMe && 'bg-[#35eee2]/5')}>
                      <td className="px-5 py-4 font-mono font-black text-[#ffc240]">#{entry.rank}</td>
                      <td className="px-5 py-4 font-bold text-[#f2eee7]">
                        {entry.alias}{entry.isMe ? <span className="ml-2 text-xs text-[#35eee2]">Tú</span> : null}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-black text-[#35eee2]">{entry.score.toLocaleString('es-ES')}</td>
                      <td className="px-5 py-4 text-right font-mono text-[#aaa8a2]">{formatTreasureHuntDuration(entry.gameTimeMs)}</td>
                      <td className="px-5 py-4 text-right">
                        <span className={cn(
                          'font-mono font-black',
                          entry.rewardStatus === 'pool_exhausted'
                            ? 'text-[#969994]'
                            : 'text-[#ffc240]',
                        )}>
                          {rewardLabel(entry)}
                        </span>
                        {entry.rewardStatus === 'partial' ? (
                          <span className="ml-2 rounded-full border border-[#ffc240]/35 bg-[#ffc240]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#ffc240]">
                            Parcial
                          </span>
                        ) : null}
                        {entry.reviewStatus === 'pending' ? (
                          <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.06em] text-[#969994]">
                            Pendiente de revisión
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 ? (
              <nav
                aria-label="Paginación del ranking"
                className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-4 sm:px-5"
              >
                <p className="text-xs text-[#969994]">
                  {pagination.totalEntries.toLocaleString('es-ES')} partidas · Página{' '}
                  {pagination.page} de {pagination.totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="min-h-10 rounded-[5px] border border-white/15 px-3 text-xs font-bold text-[#f2eee7] hover:border-[#35eee2]/45 disabled:cursor-not-allowed disabled:opacity-35"
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
                        'min-h-10 min-w-10 rounded-[5px] border px-2 font-mono text-xs font-black',
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
                    className="min-h-10 rounded-[5px] border border-white/15 px-3 text-xs font-bold text-[#f2eee7] hover:border-[#35eee2]/45 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Siguiente
                  </button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
