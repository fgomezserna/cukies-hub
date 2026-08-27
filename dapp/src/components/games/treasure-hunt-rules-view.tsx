'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Gamepad2 } from 'lucide-react';

import { TreasureHuntCompetitionCountdown } from '@/components/games/treasure-hunt-competition-countdown';
import {
  formatTreasureHuntPercentage,
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME } from '@/lib/treasure-hunt-competition/presentation';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';

function RuleSection({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <li className="grid gap-4 px-4 py-5 sm:grid-cols-[2.5rem_1fr] sm:px-6">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#35eee2]/45 bg-[#35eee2]/10 font-mono text-sm font-black text-[#35eee2]">
        {number}
      </span>
      <div>
        <h3 className="font-headline text-lg font-black text-[#f2eee7]">{title}</h3>
        <div className="mt-2 space-y-3 text-sm leading-6 text-[#c6c5c0]">{children}</div>
      </div>
    </li>
  );
}

export default function TreasureHuntRulesView() {
  const { status, error, reload } = useTreasureHuntCompetitionOverview({
    includeLeaderboard: false,
  });
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;

  return (
    <div className="mx-auto min-h-full w-full max-w-[68rem] pb-8">
      <div className="mb-4">
        <h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">
          Reglas del {TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME}
        </h2>
        <p className="mt-1 text-sm text-[#aaa8a2]">
          Cómo participar, clasificarse y recibir los premios.
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
              Reglamento oficial · Lanzamiento UKI
            </p>
            <h3 className="mt-1 font-headline text-2xl font-black tracking-[-0.02em] text-[#f1eee8]">
              {TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME} · 1P
            </h3>
            <TreasureHuntCompetitionCountdown
              phase={status?.phase}
              campaign={status?.campaign}
              className="mt-2"
            />
          </div>
          <Link
            href="/games/treasure-hunt"
            className="inline-flex min-h-11 items-center gap-2 rounded-[6px] border border-[#2de9dd]/65 bg-[#0d5d57] px-5 text-sm font-bold text-white hover:bg-[#137069]"
          >
            <Gamepad2 className="h-4 w-4" aria-hidden="true" />
            Jugar Treasure Hunt
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <ol className="divide-y divide-white/15">
          <RuleSection number={1} title="Cómo participar">
            <p>
              Cada 2.000 UKI que deposites en staking te permitirá jugar 1 partida.
            </p>
            <p>Consigue la mayor puntuación posible y acumula tickets:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Cada {rules.pointsPerTicket} puntos = 1 ticket.</li>
              <li>
                Puedes jugar tantas partidas como quieras, pero solo se tendrán en cuenta para
                generar tickets tus {rules.topAttemptsPerWallet} mejores puntuaciones.
              </li>
            </ul>
            <p>
              Cuantos mejores sean tus resultados, más tickets acumularás y más posibilidades
              tendrás de ganar.
            </p>
            <Link href="/cukie-master" className="inline-flex items-center gap-2 font-bold text-[#35eee2] hover:text-white">
              Gestionar staking <ArrowRight className="h-4 w-4" />
            </Link>
          </RuleSection>

          <RuleSection number={2} title="Pool de premios">
            <p>
              El bote de premios comienza con {formatTreasureHuntUkiRaw(rules.basePrizeUkiRaw)}.
            </p>
            <p>
              Además, al finalizar la competición se añadirá al bote el equivalente al{' '}
              {formatTreasureHuntPercentage(rules.stakePrizeBps)} de todos los UKI que estén en
              staking en ese momento.
            </p>
            <p><strong className="text-[#f2eee7]">Fin de la competición:</strong> 15 de septiembre a las 15:00 UTC.</p>
            <p>Esto significa que cuantos más UKI haya en staking, mayor será el bote de premios.</p>
          </RuleSection>

          <RuleSection number={3} title="¿Cómo se eligen los ganadores?">
            <p>
              Por cada {formatTreasureHuntUkiRaw(rules.prizePerWinnerUkiRaw)} del bote,
              se seleccionará 1 ganador.
            </p>
            <div className="rounded-[8px] border border-[#ffc240]/25 bg-[#ffc240]/5 p-4 text-[#f2eee7]">
              <p className="font-black text-[#ffc240]">Ejemplo: 2.000.000 UKI en staking</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>50.000 UKI iniciales.</li>
                <li>200.000 UKI procedentes del 10% del staking.</li>
                <li>250.000 UKI de bote = 25 ganadores de 10.000 UKI.</li>
              </ul>
            </div>
            <p>Cuantos más tickets tengas, más posibilidades tendrás de ganar.</p>
            <p>Cada wallet podrá resultar ganadora una sola vez.</p>
          </RuleSection>

          <RuleSection number={4} title="Entrega de los Premios">
            <p>Todos los premios se entregarán en UKI.</p>
            <p>Los tokens tendrán:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{rules.cliffMonths} meses de bloqueo (cliff).</li>
              <li>
                Posteriormente, un vesting lineal de {rules.vestingMonths} meses,
                liberándose gradualmente.
              </li>
            </ul>
          </RuleSection>

          <RuleSection number={5} title="Descalificación">
            <p>
              Para mantener tu participación activa, deberás conservar en staking los UKI
              depositados durante toda la competición.
            </p>
            <p>
              Si realizas un unstake parcial o total antes de que finalice la competición,
              quedarás descalificado y perderás la posibilidad de recibir cualquier premio.
            </p>
          </RuleSection>
        </ol>
      </main>
    </div>
  );
}
