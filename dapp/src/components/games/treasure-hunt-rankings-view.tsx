'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Coins, Medal, Trophy } from 'lucide-react';

import TreasureHuntHistoryView from '@/components/games/treasure-hunt-history-view';
import { useTreasureHuntWeeklyOverview } from '@/hooks/use-treasure-hunt-weekly-overview';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { cn } from '@/lib/utils';

type RankingFilter = 'general' | 'mine';
type RankingPeriod = 'active' | 'finished';
const PAGE_SIZE = 20;

export { calculateAvailablePrizeSlots } from '@/lib/treasure-hunt-competition/presentation';

function pageNumbers(currentPage: number, totalPages: number) {
  const first = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const last = Math.min(totalPages, Math.max(currentPage + 1, 3));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function formatUtcPeriod(startsAt?: string, endsAt?: string) {
  if (!startsAt || !endsAt) return 'Se renueva automáticamente cada semana';
  const format = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${format.format(new Date(startsAt))} — ${format.format(new Date(endsAt))} UTC`;
}

function positionMeaning(rank: number) {
  if (rank <= 10) return 'Grupo principal';
  if (rank <= 25) return 'Segundo grupo';
  return 'Fuera del top 25';
}

function ActiveTreasureHuntRankingsView() {
  const [filter, setFilter] = useState<RankingFilter>('general');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, reload } = useTreasureHuntWeeklyOverview({
    page,
    pageSize: PAGE_SIZE,
    mineOnly: filter === 'mine',
  });
  const pagination = data?.pagination;

  useEffect(() => {
    if (window.location.hash === '#mi-participacion') setFilter('mine');
  }, []);

  useEffect(() => setPage(1), [filter]);

  return (
    <>
      {error ? (
        <div role="alert" className="mb-3 flex items-center justify-between gap-4 rounded-[7px] border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm text-red-100">
          <span>{error}</span>
          <button type="button" onClick={reload} className="min-h-10 px-2 font-black text-[var(--uki-lilac)]">Reintentar</button>
        </div>
      ) : null}

      <section className="mb-3 overflow-hidden rounded-[8px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/94">
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="border-l-2 border-[var(--uki-lilac)] pl-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--uki-lilac)]">Competición semanal automática</p>
            <h3 className="mt-1.5 font-headline text-2xl font-black text-[#f2eee7]">Tu mejor partida con créditos del pool</h3>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[#aaa8a2]">
              Al terminar el periodo se guarda la clasificación y empieza el siguiente automáticamente. Aquí puedes consultar las fechas de la competición actual.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/games/treasure-hunt/rules" className="inline-flex min-h-10 items-center rounded-[6px] border border-white/20 px-3.5 text-xs font-black text-[var(--uki-cream)] hover:border-[var(--uki-lilac)]/55">Ver reglas</Link>
            <Link href="/games/treasure-hunt" className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-[var(--uki-lilac)]/55 bg-[var(--uki-lilac)] px-3.5 text-xs font-black text-[#120716] hover:brightness-110">Jugar <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
        </div>
        <dl className="grid border-t border-white/15 sm:grid-cols-3 sm:divide-x sm:divide-white/15">
          <div className="px-5 py-4">
            <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#969994]"><CalendarClock className="h-4 w-4 text-[var(--uki-lilac)]" /> Periodo actual</dt>
            <dd className="mt-1.5 text-sm font-black text-[#f2eee7]">{formatUtcPeriod(data?.period.startsAt, data?.period.endsAt)}</dd>
          </div>
          <div className="px-5 py-4">
            <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#969994]"><Coins className="h-4 w-4 text-[#ffc240]" /> Bote acumulado</dt>
            <dd className="mt-1.5 font-mono text-xl font-black text-[#ffc240]">{formatTreasureHuntUkiRaw(data?.poolUkiRaw ?? null, 4)}</dd>
          </div>
          <div className="px-5 py-4">
            <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#969994]"><Trophy className="h-4 w-4 text-[var(--uki-lilac)]" /> Participantes clasificados</dt>
            <dd className="mt-1.5 font-mono text-xl font-black text-[var(--uki-lilac)]">{data?.totalRankedWallets ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {data?.participation ? (
        <section id="mi-participacion" className="mb-3 scroll-mt-6 rounded-[8px] border border-white/15 bg-[#0d0914] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--uki-lilac)]">Tu semana</p>
              <p className="mt-1 text-sm font-bold text-[#f2eee7]">
                {data.participation.bestPoolScoreRaw ? `Mejor puntuación clasificada: ${Number(data.participation.bestPoolScoreRaw).toLocaleString('es-ES')}` : 'Aún no tienes una partida clasificada esta semana'}
              </p>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span className="rounded-full border border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10 px-3 py-1.5 text-[var(--uki-lilac)]">{data.participation.poolCreditRuns} con créditos del pool</span>
              <span className="rounded-full border border-white/15 px-3 py-1.5 text-[#aaa8a2]">{data.participation.ownCreditRuns} con créditos propios</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#969994]">Las partidas con créditos propios generan su recompensa directa, pero no alteran este ranking.</p>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[8px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/94">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-4 py-3 sm:px-5">
          <div className="inline-flex rounded-[7px] border border-white/15 bg-black/20 p-1" role="group" aria-label="Filtrar ranking">
            {([['general', 'General'], ['mine', 'Mi posición']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn('min-h-9 rounded-[5px] px-3 text-xs font-black transition', filter === value ? 'bg-[var(--uki-lilac)]/15 text-[var(--uki-lilac)]' : 'text-[#969994] hover:text-[#f2eee7]')}>{label}</button>
            ))}
          </div>
          <p className="text-xs text-[#969994]">Una posición por wallet · cuenta su mejor puntuación elegible</p>
        </div>

        {isLoading ? (
          <div aria-label="Cargando ranking" className="space-y-2 p-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-[7px] bg-white/5" />)}</div>
        ) : !data?.entries.length ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
            <Medal className="h-8 w-8 text-[var(--uki-lilac)]" aria-hidden="true" />
            <h3 className="mt-4 font-headline text-lg font-black text-[#f2eee7]">{filter === 'mine' ? 'Aún no tienes posición semanal' : 'Todavía no hay puntuaciones semanales'}</h3>
            <p className="mt-2 max-w-md text-sm text-[#969994]">Completa una partida usando créditos del pool para entrar en esta clasificación.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {data.entries.map((entry) => (
                <article key={`${entry.rank}:${entry.alias}`} className={cn('rounded-[7px] border border-white/15 bg-black/15 p-4', entry.isMe && 'border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/5')}>
                  <div className="flex items-center gap-3"><span className="font-mono font-black text-[#ffc240]">#{entry.rank}</span><p className="min-w-0 flex-1 truncate font-bold text-[#f2eee7]">{entry.alias}{entry.isMe ? <span className="ml-2 text-xs text-[var(--uki-lilac)]">Tú</span> : null}</p><strong className="font-mono text-lg text-[var(--uki-lilac)]">{Number(entry.scoreRaw).toLocaleString('es-ES')}</strong></div>
                  <p className="mt-3 border-t border-white/10 pt-3 text-xs text-[#969994]">{positionMeaning(entry.rank)} · Cukie {entry.cukieSource === 'own' ? 'propio' : 'del pool'}</p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/15 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]"><tr><th className="px-5 py-3">Pos.</th><th className="px-5 py-3">Jugador</th><th className="px-5 py-3">Situación</th><th className="px-5 py-3">Cukie usado</th><th className="px-5 py-3 text-right">Mejor puntuación</th></tr></thead>
                <tbody className="divide-y divide-white/10">
                  {data.entries.map((entry) => (
                    <tr key={`${entry.rank}:${entry.alias}`} className={cn(entry.isMe && 'bg-[var(--uki-lilac)]/5')}><td className="px-5 py-4 font-mono font-black text-[#ffc240]">#{entry.rank}</td><td className="px-5 py-4 font-bold text-[#f2eee7]">{entry.alias}{entry.isMe ? <span className="ml-2 text-xs text-[var(--uki-lilac)]">Tú</span> : null}</td><td className="px-5 py-4 text-[#aaa8a2]">{positionMeaning(entry.rank)}</td><td className="px-5 py-4 text-[#aaa8a2]">{entry.cukieSource === 'own' ? 'Propio' : 'Del pool'}</td><td className="px-5 py-4 text-right font-mono font-black text-[var(--uki-lilac)]">{Number(entry.scoreRaw).toLocaleString('es-ES')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.totalPages > 1 ? (
              <nav aria-label="Paginación del ranking" className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-4 sm:px-5">
                <p className="text-xs text-[#969994]">{pagination.totalEntries.toLocaleString('es-ES')} participantes · Página {pagination.page} de {pagination.totalPages}</p>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-10 rounded-[5px] border border-white/15 px-3 text-xs font-bold text-[#f2eee7] disabled:opacity-35">Anterior</button>
                  {pageNumbers(pagination.page, pagination.totalPages).map((pageNumber) => <button key={pageNumber} type="button" aria-label={`Página ${pageNumber}`} aria-current={pagination.page === pageNumber ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={cn('min-h-10 min-w-10 rounded-[5px] border px-2 font-mono text-xs font-black', pagination.page === pageNumber ? 'border-[var(--uki-lilac)]/60 bg-[var(--uki-lilac)]/15 text-[var(--uki-lilac)]' : 'border-white/15 text-[#aaa8a2]')}>{pageNumber}</button>)}
                  <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="min-h-10 rounded-[5px] border border-white/15 px-3 text-xs font-bold text-[#f2eee7] disabled:opacity-35">Siguiente</button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

export default function TreasureHuntRankingsView() {
  const [period, setPeriod] = useState<RankingPeriod>('active');
  return (
    <div className="mx-auto min-h-full w-full max-w-[68rem] pb-8">
      <div className="mb-4"><h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">Rankings de Treasure Hunt</h2><p className="mt-1 text-sm text-[#aaa8a2]">La semana activa se renueva sola; los torneos especiales cerrados se conservan aparte.</p></div>
      <div className="mb-4 grid w-full grid-cols-2 rounded-[7px] border border-white/15 bg-black/20 p-1 sm:w-fit" role="group" aria-label="Tipo de competición">
        {([['active', 'Semana actual'], ['finished', 'Torneos especiales']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={cn('min-h-10 rounded-[5px] px-4 text-sm font-black transition', period === value ? 'bg-[var(--uki-lilac)]/15 text-[var(--uki-lilac)]' : 'text-[#969994] hover:text-[#f2eee7]')}>{label}</button>)}
      </div>
      {period === 'active' ? <ActiveTreasureHuntRankingsView /> : <section className="overflow-hidden rounded-[8px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/94"><TreasureHuntHistoryView /></section>}
    </div>
  );
}
