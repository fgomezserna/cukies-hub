'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, Gamepad2, Swords } from 'lucide-react';

import TreasureHuntCompetitionPanel from '@/components/games/treasure-hunt-competition-panel';
import {
  InactiveExperienceCard,
  TreasureHuntPhaseBadge,
  TreasureHuntSectionIntro,
} from '@/components/games/treasure-hunt-view-primitives';
import {
  formatTreasureHuntCampaignWindow,
  formatTreasureHuntPercentage,
  TREASURE_HUNT_FALLBACK_RULES,
  TREASURE_HUNT_PHASE_COPY,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';

export default function TreasureHuntCompetitionsView() {
  const { status, isLoading } = useTreasureHuntCompetitionOverview({
    includeLeaderboard: false,
  });
  const phase = status?.phase ?? 'unconfigured';
  const campaignWindow = formatTreasureHuntCampaignWindow(status?.campaign ?? null);
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const canCompete = phase === 'active';

  return (
    <div className="space-y-6 pb-8">
      <TreasureHuntSectionIntro
        eyebrow="Arena de Treasure Hunt"
        title="Una competición activa; las siguientes, visibles sin confundir"
        description="Cada edición tiene sus propias fechas, reglas, intentos y ranking. La Preventa UKI es la única competición accionable ahora; el resto queda marcado como inactivo hasta que exista una configuración real."
      />

      <section aria-labelledby="competition-catalog-title" className="space-y-3">
        <h2 id="competition-catalog-title" className="sr-only">Ediciones de competición</h2>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <article className="relative min-h-[27rem] overflow-hidden rounded-[15px] border border-emerald-300/25 bg-[#0d1916] p-5 shadow-[0_24px_64px_-36px_rgba(0,0,0,0.85)] sm:p-6 lg:min-h-0">
            <div className="pointer-events-none absolute inset-0 bg-[url('/brand/generated/uki-treasure-hunt-scene-v2.png')] bg-cover bg-center opacity-30" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,15,0.98)_0%,rgba(7,17,15,0.86)_48%,rgba(7,17,15,0.2)_100%)]" />

            <div className="relative flex h-full max-w-2xl flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.18em] text-amber-200">
                  Competición oficial · edición actual
                </p>
                <TreasureHuntPhaseBadge phase={phase} loading={isLoading} />
              </div>
              <h2 className="mt-4 font-headline text-2xl font-black tracking-tight text-white sm:text-3xl">
                Torneo de Preventa UKI
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                Partidas 1P con intentos verificados, ranking propio y recompensas calculadas sobre las compras válidas de UKI.
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-400">
                {campaignWindow
                  ? `${campaignWindow} · UTC`
                  : TREASURE_HUNT_PHASE_COPY[phase].detail}
              </p>

              <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Pool', formatTreasureHuntPercentage(rules.poolBps)],
                  ['Por partida', formatTreasureHuntPercentage(rules.playerRewardBps)],
                  ['Intentos máx.', String(rules.maxWinningAttemptsPerWallet)],
                  ['Sponsor', formatTreasureHuntPercentage(rules.sponsorRewardBps)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[10px] border border-white/10 bg-black/25 px-3 py-3 backdrop-blur-sm">
                    <dt className="text-[0.6rem] font-black uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                    <dd className="mt-1 font-mono text-lg font-black text-emerald-200">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-auto flex flex-wrap gap-2 pt-7">
                {canCompete ? (
                  <Link
                    href="/games/treasure-hunt"
                    className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-emerald-300 px-4 text-sm font-black text-[#06211b] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                  >
                    <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                    Jugar ahora
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-[10px] border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-slate-500">
                    No admite nuevas partidas
                  </span>
                )}
                <a
                  href="#competition-details"
                  className="inline-flex min-h-11 items-center rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm font-black text-white transition hover:border-emerald-300/25 hover:bg-emerald-300/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                >
                  Ver detalle y participación
                </a>
              </div>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <InactiveExperienceCard
              eyebrow="Temporada competitiva"
              title="Temporada 1P"
              description="Clasificación periódica basada en partidas individuales fuera de la campaña de preventa."
              label="Próximamente"
              Icon={CalendarClock}
            />
            <InactiveExperienceCard
              eyebrow="Duelo directo"
              title="Torneo 1v1"
              description="Cuadro de enfrentamientos con reglas y autoridad multijugador propias."
              label="No disponible"
              Icon={Swords}
            />
          </div>
        </div>
      </section>

      <section id="competition-details" aria-labelledby="competition-details-title" className="scroll-mt-6 space-y-3">
        <div>
          <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.16em] text-slate-500">
            Edición seleccionada
          </p>
          <h2 id="competition-details-title" className="mt-1 font-headline text-xl font-black text-white">
            Detalle y participación
          </h2>
        </div>
        <TreasureHuntCompetitionPanel />
      </section>
    </div>
  );
}
