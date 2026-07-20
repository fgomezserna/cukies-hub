'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Crown,
  Gamepad2,
  Medal,
  Swords,
} from 'lucide-react';

import {
  InactiveExperienceCard,
  TreasureHuntErrorState,
  TreasureHuntPhaseBadge,
  TreasureHuntSectionIntro,
} from '@/components/games/treasure-hunt-view-primitives';
import {
  formatTreasureHuntCampaignWindow,
  formatTreasureHuntDuration,
  TREASURE_HUNT_PHASE_COPY,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { cn } from '@/lib/utils';

type RankingFilter = 'general' | 'mine';

function RankingEmptyState({ mine }: { readonly mine: boolean }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200">
        <Medal className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-headline text-lg font-black text-white">
        {mine ? 'Aún no tienes partidas clasificadas' : 'Todavía no hay partidas clasificadas'}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-5 text-slate-400">
        {mine
          ? 'Termina una partida 1P elegible para aparecer aquí. Las partidas en revisión también se muestran.'
          : 'El ranking se llenará con las partidas 1P válidas o pendientes de revisión.'}
      </p>
      <Link
        href="/games/treasure-hunt"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-emerald-300 px-4 text-sm font-black text-[#06211b] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
      >
        <Gamepad2 className="h-4 w-4" aria-hidden="true" />
        Ir a jugar
      </Link>
    </div>
  );
}

export default function TreasureHuntRankingsView() {
  const { status, leaderboard, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview();
  const [filter, setFilter] = useState<RankingFilter>('general');
  const phase = status?.phase ?? 'unconfigured';
  const campaignWindow = formatTreasureHuntCampaignWindow(status?.campaign ?? null);
  const myBestEntry = leaderboard.find((entry) => entry.isMe) ?? null;
  const visibleEntries = useMemo(
    () => (filter === 'mine' ? leaderboard.filter((entry) => entry.isMe) : leaderboard),
    [filter, leaderboard],
  );

  return (
    <div className="space-y-6 pb-8">
      <TreasureHuntSectionIntro
        eyebrow="Rankings del juego"
        title="Cada formato conserva su propia clasificación"
        description="La Preventa UKI usa un ranking por intentos 1P. Las temporadas y duelos futuros no comparten posiciones, premios ni reglas con esta edición."
      />

      {error ? <TreasureHuntErrorState message={error} onRetry={reload} /> : null}

      <section
        aria-labelledby="presale-ranking-title"
        className="overflow-hidden rounded-[15px] border border-emerald-300/20 bg-[#0d1916]/95 shadow-[0_24px_64px_-36px_rgba(0,0,0,0.85)]"
      >
        <header className="relative overflow-hidden border-b border-white/[0.08] px-4 py-5 sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[34rem] max-w-[70%] bg-[url('/brand/generated/uki-treasure-hunt-scene-v2.png')] bg-cover bg-center opacity-20 [mask-image:linear-gradient(to_left,black,transparent)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[0.66rem] font-black uppercase tracking-[0.18em] text-amber-200">
                  Competición oficial
                </p>
                <TreasureHuntPhaseBadge phase={phase} loading={isLoading} />
              </div>
              <h2 id="presale-ranking-title" className="mt-2 font-headline text-2xl font-black tracking-tight text-white sm:text-3xl">
                Ranking de Preventa UKI
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-400">
                {TREASURE_HUNT_PHASE_COPY[phase].detail}
              </p>
              {campaignWindow ? (
                <p className="mt-2 font-mono text-xs font-semibold text-slate-300">
                  {campaignWindow} · UTC
                </p>
              ) : null}
            </div>

            <Link
              href="/games/treasure-hunt"
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-emerald-300 px-4 text-sm font-black text-[#06211b] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              Jugar 1P
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="grid gap-px border-b border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
          <div className="bg-[#0b1613] px-4 py-4 sm:px-5">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Tu mejor posición</p>
            <p className="mt-1 font-mono text-2xl font-black text-emerald-200">
              {isLoading ? '···' : myBestEntry ? `#${myBestEntry.rank}` : '—'}
            </p>
          </div>
          <div className="bg-[#0b1613] px-4 py-4 sm:px-5">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Tu mejor score</p>
            <p className="mt-1 font-mono text-2xl font-black text-amber-200">
              {isLoading ? '···' : myBestEntry ? myBestEntry.score.toLocaleString('es-ES') : '—'}
            </p>
          </div>
          <div className="bg-[#0b1613] px-4 py-4 sm:px-5">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Intentos visibles</p>
            <p className="mt-1 font-mono text-2xl font-black text-white">
              {isLoading ? '···' : leaderboard.length.toLocaleString('es-ES')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-6">
          <div className="inline-flex rounded-[10px] border border-white/[0.08] bg-black/20 p-1" role="group" aria-label="Filtrar ranking">
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
                  'min-h-9 rounded-[7px] px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60',
                  filter === value
                    ? 'bg-emerald-300/15 text-emerald-200'
                    : 'text-slate-500 hover:text-slate-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Las posiciones pendientes pueden cambiar tras la revisión.
          </p>
        </div>

        {isLoading ? (
          <div aria-label="Cargando ranking" className="space-y-2 p-4 sm:p-6">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-[9px] bg-white/[0.05] motion-reduce:animate-none" />
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <RankingEmptyState mine={filter === 'mine'} />
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {visibleEntries.map((entry) => (
                <article
                  key={entry.attemptId}
                  className={cn(
                    'rounded-[11px] border p-4',
                    entry.isMe
                      ? 'border-emerald-300/25 bg-emerald-300/[0.06]'
                      : 'border-white/[0.07] bg-black/15',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] font-mono text-sm font-black text-amber-200">
                      {entry.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white">{entry.alias}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {entry.reviewStatus === 'pending' ? 'En revisión' : 'Validada'}
                      </p>
                    </div>
                    <p className="font-mono text-lg font-black text-emerald-200">
                      {entry.score.toLocaleString('es-ES')}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatTreasureHuntDuration(entry.gameTimeMs)}
                    </span>
                    {entry.isMe ? <span className="font-black text-emerald-200">Tu partida</span> : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="bg-black/15 text-[0.65rem] font-black uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Pos.</th>
                    <th className="px-5 py-3">Jugador</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Tiempo</th>
                    <th className="px-5 py-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {visibleEntries.map((entry) => (
                    <tr key={entry.attemptId} className={cn(entry.isMe && 'bg-emerald-300/[0.06]')}>
                      <td className="px-5 py-4 font-mono font-black text-amber-200">#{entry.rank}</td>
                      <td className="px-5 py-4 font-bold text-white">
                        {entry.alias}
                        {entry.isMe ? <span className="ml-2 text-xs text-emerald-200">Tú</span> : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          'rounded-full border px-2 py-1 text-[0.65rem] font-black',
                          entry.reviewStatus === 'pending'
                            ? 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200'
                            : 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200',
                        )}>
                          {entry.reviewStatus === 'pending' ? 'En revisión' : 'Validada'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-400">
                        {formatTreasureHuntDuration(entry.gameTimeMs)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-black text-emerald-200">
                        {entry.score.toLocaleString('es-ES')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="inactive-rankings-title" className="space-y-3">
        <div>
          <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.16em] text-slate-500">Otros formatos</p>
          <h2 id="inactive-rankings-title" className="mt-1 font-headline text-xl font-black text-white">Rankings inactivos</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <InactiveExperienceCard
            eyebrow="Clasificación periódica"
            title="Ranking semanal 1P"
            description="Una futura clasificación recurrente separada de los intentos de la Preventa UKI."
            label="Próximamente"
            Icon={CalendarClock}
          />
          <InactiveExperienceCard
            eyebrow="Marcador multijugador"
            title="Ranking 1v1"
            description="Victorias y derrotas de duelos directos; no mezcla score individual ni recompensas de preventa."
            label="No disponible"
            Icon={Swords}
          />
        </div>
      </section>
    </div>
  );
}
