'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Gamepad2 } from 'lucide-react';

import {
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';

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
    <div className="min-h-full pb-8">
      <div className="mb-4">
        <h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">
          Reglas del Torneo Preventa UKI
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
              Reglamento oficial · Preventa UKI
            </p>
            <h3 className="mt-1 font-headline text-2xl font-black tracking-[-0.02em] text-[#f1eee8]">
              Competición individual 1P
            </h3>
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
            <p>Juega partidas 1P. Puedes participar sin comprar UKI.</p>
          </RuleSection>

          <RuleSection number={2} title="Clasificación">
            <p>
              Solo cuentan partidas completadas. Máximo {rules.maxWinningAttemptsPerWallet} partidas por jugador.
            </p>
          </RuleSection>

          <RuleSection number={3} title="Pool de Premios">
            <p>
              Durante la preventa se destinará un 25% de todos los UKI comprados desde que se
              alcance una recaudación de 3500 ASM en adelante, para crear un gran pool de
              recompensas.
            </p>
          </RuleSection>

          <RuleSection number={4} title="¿Cuánto puedes ganar?">
            <p>
              Cada partida que logre entrar en la zona de premios generará una recompensa
              equivalente al 10% del total de UKI que hayas comprado durante la preventa.
            </p>
            <p>Cada usuario podrá obtener premio en hasta 5 partidas.</p>
            <div className="rounded-[8px] border border-[#ffc240]/25 bg-[#ffc240]/5 p-4 text-[#f2eee7]">
              <p className="font-black text-[#ffc240]">Ejemplo</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Compraste 20,000 UKI durante la preventa.</li>
                <li>Dos de tus partidas clasifican en premios.</li>
              </ul>
              <p className="mt-3 font-black text-[#ffc240]">Recibirás</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>2,000 UKI por la primera partida.</li>
                <li>2,000 UKI por la segunda.</li>
              </ul>
              <p className="mt-3 font-black text-[#ffc240]">
                Premio total: 4,000 UKI adicionales.
              </p>
            </div>
          </RuleSection>

          <RuleSection number={5} title="¿Cómo se eligen los ganadores?">
            <p>Al finalizar la competencia se tomará el ranking general.</p>
            <p>
              Los premios se asignarán desde el primer puesto hacia abajo, respetando el
              porcentaje correspondiente a cada jugador, hasta agotar completamente el pool
              de recompensas.
            </p>
          </RuleSection>

          <RuleSection number={6} title="Reparto del Pool">
            <p>El pool total se distribuirá de la siguiente manera:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>80% para los jugadores que clasifiquen.</li>
              <li>20% para los patrocinadores que hayan invitado a esos jugadores.</li>
            </ul>
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
