'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Coins,
  Gamepad2,
  Medal,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';

import {
  TreasureHuntErrorState,
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

export default function TreasureHuntRulesView() {
  const { status, isLoading, error, reload } = useTreasureHuntCompetitionOverview({
    includeLeaderboard: false,
  });
  const phase = status?.phase ?? 'unconfigured';
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const campaignWindow = formatTreasureHuntCampaignWindow(status?.campaign ?? null);

  const ruleMetrics = [
    {
      label: 'Pool',
      value: formatTreasureHuntPercentage(rules.poolBps),
      detail: 'de los UKI comprados',
      Icon: Coins,
    },
    {
      label: 'Por partida',
      value: formatTreasureHuntPercentage(rules.playerRewardBps),
      detail: 'de tu compra válida',
      Icon: Sparkles,
    },
    {
      label: 'Partidas máx.',
      value: String(rules.maxWinningAttemptsPerWallet),
      detail: 'premiadas por wallet',
      Icon: BadgeCheck,
    },
    {
      label: 'Sponsor',
      value: formatTreasureHuntPercentage(rules.sponsorRewardBps),
      detail: 'del premio del referido',
      Icon: UserRoundCheck,
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <TreasureHuntSectionIntro
        eyebrow="Reglamento oficial"
        title="Reglas claras antes de pulsar Jugar"
        description="Estas condiciones pertenecen a la competición de Preventa UKI. Jugar, clasificarse y obtener una recompensa son tres estados distintos y se explican por separado."
      />

      {error ? <TreasureHuntErrorState message={error} onRetry={reload} /> : null}

      <section
        aria-labelledby="official-rules-title"
        className="overflow-hidden rounded-[15px] border border-emerald-300/20 bg-[#0d1916]/95 shadow-[0_24px_64px_-36px_rgba(0,0,0,0.85)]"
      >
        <header className="relative overflow-hidden border-b border-white/[0.08] px-4 py-5 sm:px-6 sm:py-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[36rem] max-w-[70%] bg-[url('/brand/generated/uki-treasure-hunt-reference-scene.png')] bg-cover bg-center opacity-[0.18] [mask-image:linear-gradient(to_left,black,transparent)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[0.66rem] font-black uppercase tracking-[0.18em] text-amber-200">
                  Preventa UKI · versión configurada
                </p>
                <TreasureHuntPhaseBadge phase={phase} loading={isLoading} />
              </div>
              <h2 id="official-rules-title" className="mt-2 font-headline text-2xl font-black tracking-tight text-white sm:text-3xl">
                Competición individual 1P
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {TREASURE_HUNT_PHASE_COPY[phase].detail}
              </p>
              {campaignWindow ? (
                <p className="mt-2 font-mono text-xs font-semibold text-slate-300">
                  Ventana: {campaignWindow} · UTC
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-amber-200/80">
                  Las reglas económicas son visibles; las fechas no se inventan cuando la campaña no está configurada.
                </p>
              )}
            </div>

            <Link
              href="/games/treasure-hunt"
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-emerald-300 px-4 text-sm font-black text-[#06211b] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
              Jugar Treasure Hunt
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <dl className="grid gap-px border-b border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">
          {ruleMetrics.map(({ label, value, detail, Icon }) => (
            <div key={label} className="bg-[#0b1613] px-4 py-5 sm:px-5">
              <div className="flex items-center gap-2 text-slate-500">
                <Icon className="h-4 w-4" aria-hidden="true" />
                <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em]">{label}</dt>
              </div>
              <dd className="mt-2 font-mono text-2xl font-black text-emerald-200">{value}</dd>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </div>
          ))}
        </dl>

        <div className="grid gap-px bg-white/[0.08] lg:grid-cols-[1.05fr_0.95fr]">
          <section aria-labelledby="participation-title" className="bg-[#0d1916] p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-5 w-5 text-emerald-200" aria-hidden="true" />
              <h3 id="participation-title" className="font-headline text-xl font-black text-white">Cómo participar</h3>
            </div>
            <ol className="mt-5 space-y-4">
              {[
                ['1', 'Conecta y firma una wallet EVM', 'La firma vincula cada intento a una identidad válida sin publicar tu dirección.'],
                ['2', 'Define tu nombre de ranking', 'Usa entre 3 y 20 caracteres. El alias se puede editar mientras la competición lo permita.'],
                ['3', 'Entra en modo 1P de competición', 'El juego solicita elegibilidad antes de crear el intento. 1v1 no participa en este ranking.'],
                ['4', 'Termina la partida', 'El score, el tiempo y la evidencia se envían al servidor; abandonar no crea un resultado premiable.'],
                ['5', 'Consulta la revisión', 'Una partida puede aparecer como pendiente hasta superar las comprobaciones de integridad.'],
              ].map(([step, title, detail]) => (
                <li key={step} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] font-mono text-xs font-black text-emerald-200">
                    {step}
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="rewards-title" className="bg-[#0b1613] p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-200" aria-hidden="true" />
              <h3 id="rewards-title" className="font-headline text-xl font-black text-white">Cuándo genera premio</h3>
            </div>

            <div className="mt-5 rounded-[12px] border border-amber-300/20 bg-amber-300/[0.06] p-4">
              <p className="text-sm font-black text-amber-100">Puedes jugar sin comprar UKI.</p>
              <p className="mt-1 text-xs leading-5 text-amber-50/65">
                Para generar recompensa, la wallet debe tener una compra válida antes del cierre de la preventa y el intento debe resultar elegible.
              </p>
            </div>

            <ul className="mt-5 space-y-3">
              {[
                `Cada partida premiada toma como referencia el ${formatTreasureHuntPercentage(rules.playerRewardBps)} de tus UKI comprados.`,
                `Se premian como máximo ${rules.maxWinningAttemptsPerWallet} intentos por wallet, sujetos al pool disponible.`,
                `El sponsor puede recibir el ${formatTreasureHuntPercentage(rules.sponsorRewardBps)} del premio del jugador referido cuando corresponda.`,
                'Una posición provisional no garantiza liquidación: la revisión y los límites del pool son definitivos.',
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-5 text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-white/[0.08] bg-black/15 p-4">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-white">Entrega de recompensas</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {rules.cliffMonths} meses de cliff y después {rules.vestingMonths} meses de vesting lineal.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section aria-labelledby="integrity-title" className="grid gap-3 lg:grid-cols-3">
        {[
          {
            Icon: ShieldCheck,
            title: 'Integridad del intento',
            detail: 'Cada intento se enlaza a una sesión de juego, checkpoints y un resultado final verificable.',
          },
          {
            Icon: Medal,
            title: 'Ranking provisional',
            detail: 'Los intentos pendientes se identifican; la clasificación puede variar después de la revisión.',
          },
          {
            Icon: BookOpenText,
            title: 'Reglas por edición',
            detail: 'Una competición futura tendrá su propia configuración y nunca heredará fechas o premios por accidente.',
          },
        ].map(({ Icon, title, detail }, index) => (
          <article key={title} className="rounded-[13px] border border-white/[0.08] bg-[#0d1916]/80 p-5">
            {index === 0 ? <h2 id="integrity-title" className="sr-only">Integridad y alcance</h2> : null}
            <Icon className="h-5 w-5 text-emerald-200" aria-hidden="true" />
            <h3 className="mt-4 font-headline text-base font-black text-white">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[13px] border border-emerald-300/15 bg-emerald-300/[0.05] p-4 sm:p-5">
        <div>
          <p className="text-sm font-black text-white">¿Listo para competir?</p>
          <p className="mt-1 text-xs text-slate-400">Juega en 1P o consulta primero las posiciones actuales.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/games/treasure-hunt/rankings" className="inline-flex min-h-10 items-center gap-2 rounded-[9px] border border-white/10 px-4 text-sm font-bold text-slate-200 transition hover:border-emerald-300/25 hover:text-white">
            <Medal className="h-4 w-4" aria-hidden="true" />
            Ver ranking
          </Link>
          <Link href="/games/treasure-hunt" className="inline-flex min-h-10 items-center gap-2 rounded-[9px] bg-emerald-300 px-4 text-sm font-black text-[#06211b] transition hover:bg-emerald-200">
            Jugar ahora
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
