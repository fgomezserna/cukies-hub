'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Flag,
  Gamepad2,
  Info,
  LockKeyhole,
  Medal,
  ShoppingCart,
  Timer,
  Trophy,
  UserRound,
} from 'lucide-react';

import {
  formatTreasureHuntPercentage,
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { cn } from '@/lib/utils';

export default function TreasureHuntRulesView() {
  const { status, leaderboard, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview();
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const isActive = status?.phase === 'active';
  const myAttempts = leaderboard.filter((entry) => entry.isMe);
  const myBest = myAttempts.reduce<(typeof myAttempts)[number] | null>(
    (best, entry) => (!best || entry.score > best.score ? entry : best),
    null,
  );

  return (
    <div className="min-h-full">
      {error ? (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-[7px] border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm text-red-100">
          <span>{error}</span>
          <button type="button" onClick={reload} className="font-bold text-[#35eee2]">Reintentar</button>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main>
          <div className="border-b border-white/15 pb-4">
            <h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">
              Reglas del Torneo de Preventa UKI
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={cn(
                'rounded-[4px] border px-2.5 py-1 text-[10px] font-bold tracking-[0.12em]',
                isActive
                  ? 'border-[#2de9dd]/55 bg-[#07302e] text-[#49f2e7]'
                  : 'border-white/20 bg-white/5 text-[#aaa8a2]',
              )}>
                {isLoading ? 'CONSULTANDO' : isActive ? 'EN CURSO' : 'INACTIVO'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#d89c21]/60 bg-[#2b2107] px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-[#ffc240]">
                <Medal className="h-3.5 w-3.5" /> OFICIAL
              </span>
            </div>
            <p className="mt-4 text-sm text-[#aaa8a2]">Estas reglas solo se aplican a esta competición.</p>
          </div>

          <section className="grid grid-cols-[34px_1fr] gap-4 border-b border-white/15 py-5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#35eee2] text-sm text-[#35eee2]">1</span>
            <div>
              <h3 className="font-headline text-lg font-bold text-[#35eee2]">Cómo participar</h3>
              <p className="mt-2 text-sm leading-6 text-[#c6c5c0]">
                Juega partidas 1P. Puedes participar sin comprar UKI.
              </p>
            </div>
          </section>

          <section className="grid grid-cols-[34px_1fr] gap-4 border-b border-white/15 py-5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#35eee2] text-sm text-[#35eee2]">2</span>
            <div>
              <h3 className="font-headline text-lg font-bold text-[#35eee2]">Clasificación</h3>
              <p className="mt-2 text-sm leading-6 text-[#c6c5c0]">
                Solo cuentan partidas válidas. Máximo {rules.maxWinningAttemptsPerWallet} partidas por jugador.
              </p>
            </div>
          </section>

          <section className="grid grid-cols-[34px_1fr] gap-4 border-b border-white/15 py-5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#35eee2] text-sm text-[#35eee2]">3</span>
            <div className="min-w-0">
              <h3 className="font-headline text-lg font-bold text-[#35eee2]">Distribución</h3>
              <dl className="mt-3 grid grid-cols-2 divide-x divide-white/15 rounded-[8px] border border-white/20 bg-[#071312] py-4 sm:grid-cols-4">
                {[
                  { label: 'Pool', value: formatTreasureHuntPercentage(rules.poolBps), Icon: CircleDollarSign },
                  { label: 'Por partida', value: formatTreasureHuntPercentage(rules.playerRewardBps), Icon: Trophy },
                  { label: 'Partidas máx.', value: String(rules.maxWinningAttemptsPerWallet), Icon: Flag },
                  { label: 'Sponsor', value: formatTreasureHuntPercentage(rules.sponsorRewardBps), Icon: Medal },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="px-4 text-center">
                    <dt className="inline-flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[#b9b7b2]">
                      <Icon className="h-5 w-5 text-[#edc27a]" /> {label}
                    </dt>
                    <dd className="mt-2 font-mono text-2xl font-black text-[#ffb72f]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="grid grid-cols-[34px_1fr] gap-4 py-5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#35eee2] text-sm text-[#35eee2]">4</span>
            <div>
              <h3 className="font-headline text-lg font-bold text-[#35eee2]">Entrega de premios</h3>
              <p className="mt-2 text-sm leading-6 text-[#c6c5c0]">
                Los premios se expresan en UKI. {rules.cliffMonths} meses de cliff + {rules.vestingMonths} meses de vesting.
              </p>
              <p className="mt-4 text-sm leading-6 text-[#c6c5c0]">
                Si clasificas, cada partida premiada toma como referencia los UKI comprados durante la preventa.
              </p>
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-[8px] border border-white/20 bg-[#071211]/94 p-4">
            <h3 className="font-headline text-xl font-bold text-[#35eee2]">Resumen del torneo</h3>
            <dl className="mt-4 space-y-2">
              {[
                { label: 'Modalidad', value: '1P', Icon: UserRound },
                { label: 'Compra requerida', value: 'No', Icon: ShoppingCart },
                { label: 'Tu progreso', value: `${myAttempts.length}/${rules.maxWinningAttemptsPerWallet}`, Icon: BarChart3 },
                { label: 'Ranking', value: myBest ? `#${myBest.rank}` : 'Sin clasificar', Icon: Trophy },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="flex min-h-[52px] items-center gap-3 rounded-[7px] border border-white/20 bg-[#091513] px-4">
                  <Icon className="h-5 w-5 shrink-0 text-[#dfded8]" />
                  <dt className="text-sm text-[#c8c7c2]">{label}</dt>
                  <dd className="ml-auto text-right text-sm font-bold text-[#f2f0e9]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-2">
              <Link href="/games/treasure-hunt" className="flex min-h-[48px] items-center justify-center gap-3 rounded-[6px] border border-[#2de9dd]/65 bg-[#0d5d57] px-5 text-sm font-bold text-white hover:bg-[#137069]">
                <Gamepad2 className="h-4 w-4" /> Jugar torneo
              </Link>
              <Link href="/games/treasure-hunt/rankings" className="flex min-h-[48px] items-center justify-center rounded-[6px] border border-white/20 px-5 text-sm text-[#eceae4] hover:border-[#35eee2]/50">
                Ver ranking
              </Link>
            </div>
          </section>

          <section className="rounded-[8px] border border-white/20 bg-[#071211]/94 p-4">
            <h3 className="font-headline text-base font-semibold text-[#efeee8]">Otros reglamentos</h3>
            <div className="mt-3 divide-y divide-white/15 rounded-[7px] border border-white/15">
              {[
                ['Liga semanal', 'Inactivo'],
                ['Speedrun', 'Inactivo'],
                ['1v1', 'Sin ranking ni premios'],
              ].map(([title, value]) => (
                <div key={title} className="flex min-h-[46px] items-center gap-3 px-4 text-sm text-[#bbbdb8]">
                  <LockKeyhole className="h-4 w-4" />
                  <span>{title}</span>
                  <span className="ml-auto text-xs text-[#858985]">{value}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <footer className="mt-4 flex flex-col gap-3 border-t border-white/15 py-4 text-[11px] text-[#9b9e99] sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2"><Info className="h-4 w-4 text-[#d4d8d2]" />Las competiciones están sujetas a reglas específicas. Revisa los detalles antes de participar.</p>
        <p className="inline-flex items-center gap-2"><Timer className="h-4 w-4 text-[#d4d8d2]" />Las horas se muestran en tu zona horaria local.</p>
      </footer>
    </div>
  );
}
