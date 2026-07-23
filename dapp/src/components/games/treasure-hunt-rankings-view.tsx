'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3, Medal } from 'lucide-react';

import {
  formatTreasureHuntDuration,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { useTreasureHuntPrizePool } from '@/hooks/use-treasure-hunt-prize-pool';
import { formatTreasureHuntPrizePoolUki } from '@/lib/treasure-hunt-prize-pool';
import { cn } from '@/lib/utils';

type RankingFilter = 'general' | 'mine';

export default function TreasureHuntRankingsView() {
  const { status, leaderboard, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview();
  const [filter, setFilter] = useState<RankingFilter>('general');
  const campaign = status?.campaign;
  const maxAttempts = campaign?.maxWinningAttemptsPerWallet ?? 5;
  const myAttempts = leaderboard.filter((entry) => entry.isMe).length;
  const prizePool = useTreasureHuntPrizePool(campaign?.poolBps ?? 2_500);
  const visibleEntries = useMemo(
    () => (filter === 'mine' ? leaderboard.filter((entry) => entry.isMe) : leaderboard),
    [filter, leaderboard],
  );

  useEffect(() => {
    if (window.location.hash === '#mi-participacion') setFilter('mine');
  }, []);

  const metrics = [
    ['Modo activo', '1P'],
    ['Partidas computables', isLoading ? '···' : `${myAttempts}/${maxAttempts}`],
    [
      'Premio acumulado',
      prizePool.isLoading ? '···' : formatTreasureHuntPrizePoolUki(prizePool.value),
    ],
  ] as const;

  return (
    <div className="min-h-full pb-8">
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
            className="inline-flex min-h-11 items-center gap-2 rounded-[6px] border border-[#2de9dd]/65 bg-[#0d5d57] px-5 text-sm font-bold text-white hover:bg-[#137069]"
          >
            Jugar 1P <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <dl className="grid gap-px border-b border-white/15 bg-white/15 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <div key={label} className="min-w-0 bg-[#071312] px-5 py-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#969994]">
                {label}
              </dt>
              <dd className="mt-1 truncate font-mono text-xl font-black text-[#35eee2]" title={value}>
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
          <p className="text-xs text-[#969994]">Hasta {maxAttempts} partidas por jugador.</p>
        </div>

        {isLoading ? (
          <div aria-label="Cargando ranking" className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-[7px] bg-white/5" />
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
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
              {visibleEntries.map((entry) => (
                <article key={entry.attemptId} className={cn('rounded-[7px] border border-white/15 bg-black/15 p-4', entry.isMe && 'border-[#35eee2]/45 bg-[#35eee2]/5')}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-[#ffc240]">#{entry.rank}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[#f2eee7]">{entry.alias}</p>
                      <p className="text-xs text-[#969994]">Partida {entry.walletRank}/{maxAttempts}</p>
                    </div>
                    <p className="font-mono text-lg font-black text-[#35eee2]">{entry.score.toLocaleString('es-ES')}</p>
                  </div>
                  <p className="mt-3 flex items-center justify-end gap-1.5 border-t border-white/10 pt-3 text-xs text-[#969994]">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatTreasureHuntDuration(entry.gameTimeMs)}
                  </p>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="bg-black/15 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]">
                  <tr>
                    <th className="px-5 py-3">Pos.</th>
                    <th className="px-5 py-3">Jugador</th>
                    <th className="px-5 py-3">Partida</th>
                    <th className="px-5 py-3 text-right">Tiempo</th>
                    <th className="px-5 py-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {visibleEntries.map((entry) => (
                    <tr key={entry.attemptId} className={cn(entry.isMe && 'bg-[#35eee2]/5')}>
                      <td className="px-5 py-4 font-mono font-black text-[#ffc240]">#{entry.rank}</td>
                      <td className="px-5 py-4 font-bold text-[#f2eee7]">
                        {entry.alias}{entry.isMe ? <span className="ml-2 text-xs text-[#35eee2]">Tú</span> : null}
                      </td>
                      <td className="px-5 py-4 font-mono text-[#aaa8a2]">{entry.walletRank}/{maxAttempts}</td>
                      <td className="px-5 py-4 text-right font-mono text-[#aaa8a2]">{formatTreasureHuntDuration(entry.gameTimeMs)}</td>
                      <td className="px-5 py-4 text-right font-mono font-black text-[#35eee2]">{entry.score.toLocaleString('es-ES')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
