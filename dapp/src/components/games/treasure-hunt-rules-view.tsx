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
  const topAttempts = rules.topAttemptsPerWallet;
  const pointsPerTicket = rules.pointsPerTicket;

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
              Deposita UKI en Cukie Master. Cada 2.000 UKI completos en staking conceden
              un intento. Si aumentas el staking, puedes desbloquear intentos adicionales.
            </p>
            <p>Solo cuenta el staking personal de esta wallet; el staking global no concede partidas.</p>
            <p>El intento se consume al iniciar la partida, incluso si la abandonas o resulta inválida.</p>
            <Link href="/cukie-master" className="inline-flex items-center gap-2 font-bold text-[#35eee2] hover:text-white">
              Gestionar staking <ArrowRight className="h-4 w-4" />
            </Link>
          </RuleSection>

          <RuleSection number={2} title="Clasificación">
            <p>
              Solo cuentan partidas 1P completadas y validadas. Se conservan como máximo
              tus {topAttempts} mejores puntuaciones.
            </p>
          </RuleSection>

          <RuleSection number={3} title="Mantener el staking">
            <p>
              Puedes retirar en cualquier momento, pero cualquier retirada durante la campaña
              descalifica la wallet completa. Volver a depositar no elimina la descalificación.
            </p>
          </RuleSection>

          <RuleSection number={4} title="Tickets para el sorteo">
            <p>
              Cada una de tus {topAttempts} mejores partidas válidas genera
              1 ticket por cada {pointsPerTicket} puntos completos. Los tickets se suman
              para aumentar tu probabilidad en el sorteo final.
            </p>
            <div className="rounded-[8px] border border-[#ffc240]/25 bg-[#ffc240]/5 p-4 text-[#f2eee7]">
              <p className="font-black text-[#ffc240]">Ejemplo</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Una partida obtiene 1.250 puntos.</li>
                <li>Genera 12 tickets; los 50 puntos restantes no forman otro ticket.</li>
              </ul>
            </div>
          </RuleSection>

          <RuleSection number={5} title="Pool y premios">
            <p>
              El pool parte de {formatTreasureHuntUkiRaw(rules.basePrizeUkiRaw)} y suma el{' '}
              {formatTreasureHuntPercentage(rules.stakePrizeBps)} del total de UKI en staking al cierre.
              Cada ganador recibe {formatTreasureHuntUkiRaw(rules.prizePerWinnerUkiRaw)} y una misma
              wallet solo puede ganar {rules.maxWinsPerWallet === 1 ? 'una vez' : `${rules.maxWinsPerWallet} veces`}.
            </p>
          </RuleSection>

          <RuleSection number={6} title="Selección de ganadores">
            <p>
              El sorteo es ponderado por tickets y se realiza únicamente entre wallets elegibles.
              Cuando una wallet resulta ganadora, se elimina de las rondas siguientes.
            </p>
          </RuleSection>

          <RuleSection number={7} title="Entrega de los Premios">
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
        </ol>
      </main>
    </div>
  );
}
