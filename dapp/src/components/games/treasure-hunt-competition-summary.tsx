'use client';

import type { ReactNode } from 'react';

import { TreasureHuntCompetitionCountdown } from '@/components/games/treasure-hunt-competition-countdown';
import TreasureHuntDisqualificationNotice from '@/components/games/treasure-hunt-disqualification-notice';
import type {
  TreasureHuntCompetitionCampaign,
  TreasureHuntCompetitionEligibility,
  TreasureHuntCompetitionPhase,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME } from '@/lib/treasure-hunt-competition/presentation';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { cn } from '@/lib/utils';

export function TreasureHuntCompetitionSummary({
  id,
  phase,
  campaign,
  eligibility,
  poolUkiRaw,
  isLoading,
  actions,
  className,
}: {
  readonly id: string;
  readonly phase: TreasureHuntCompetitionPhase | undefined;
  readonly campaign: TreasureHuntCompetitionCampaign | null | undefined;
  readonly eligibility: TreasureHuntCompetitionEligibility | null | undefined;
  readonly poolUkiRaw: string | null | undefined;
  readonly isLoading: boolean;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  const isPresale = campaign?.eligibilityKind === 'presale';
  const maxAttempts = campaign?.topAttemptsPerWallet ?? 10;
  const countedAttempts = eligibility?.disqualified
    ? 0
    : typeof eligibility?.topAttemptsCount === 'number'
      ? eligibility.topAttemptsCount
      : 0;
  const attemptsRemaining = typeof eligibility?.attemptsRemaining === 'number'
    ? eligibility.attemptsRemaining.toLocaleString('es-ES')
    : '—';
  const prizePool = poolUkiRaw ? formatTreasureHuntUkiRaw(poolUkiRaw) : 'Actualizando…';
  const metrics = isPresale
    ? [
      ['Mejores partidas', isLoading ? '···' : `${countedAttempts}/${maxAttempts}`],
      ['Premio acumulado', isLoading && !poolUkiRaw ? '···' : prizePool],
    ] as const
    : [
      [
        'Intentos disponibles',
        isLoading ? '···' : attemptsRemaining,
      ],
      ['Resultados que cuentan', isLoading ? '···' : `${countedAttempts}/${maxAttempts}`],
      ['Premio acumulado', isLoading && !poolUkiRaw ? '···' : prizePool],
    ] as const;

  return (
    <aside
      aria-labelledby={id}
      className={cn(
        'overflow-hidden rounded-[8px] border border-white/20 bg-[#0d0914]/94',
        className,
      )}
    >
      <div className="px-3 py-3 sm:px-4 lg:px-5">
        <div data-competition-title className="min-w-0 border-l-2 border-[var(--uki-lilac)] pl-3 sm:pl-4">
          <p className="font-mono text-[0.66rem] font-black uppercase tracking-[0.2em] text-[var(--uki-lilac)]">
            {isPresale ? 'Competición oficial · Preventa UKI' : 'Competición oficial · Lanzamiento UKI'}
          </p>
          <h2
            id={id}
            className="mt-1 font-headline text-lg font-black tracking-tight text-[#f2eee7] sm:text-xl"
          >
            {isPresale ? 'Treasure Hunt · Torneo de preventa' : TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME}
          </h2>
          {!isPresale ? (
            <TreasureHuntCompetitionCountdown phase={phase} campaign={campaign} className="mt-1" />
          ) : null}
        </div>

        {eligibility?.disqualified ? (
          <div className="mt-3">
            <TreasureHuntDisqualificationNotice eligibility={eligibility} compact />
          </div>
        ) : null}

        <div className={cn(
          'mt-3 grid min-w-0 gap-2',
          actions && 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch',
        )}>
          <dl
            data-competition-metrics
            className={cn(
              'grid min-w-0 gap-px overflow-hidden rounded-[8px] border border-white/20 bg-white/15',
              isPresale ? 'grid-cols-2' : 'grid-cols-3',
            )}
          >
            {metrics.map(([label, value]) => (
              <div key={label} className="min-w-0 bg-[#0d0914] px-1.5 py-2 text-center sm:px-3">
                <dt className="text-[0.48rem] font-bold uppercase leading-tight tracking-[0.035em] text-[#969994] min-[390px]:text-[0.52rem] sm:text-[0.62rem] sm:tracking-[0.08em]">
                  {label}
                </dt>
                <dd
                  className="mt-1 truncate font-mono text-[0.68rem] font-black text-[var(--uki-lilac)] min-[390px]:text-xs sm:text-base"
                  title={value}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {actions ? (
            <div data-competition-actions className="hidden items-stretch justify-end gap-2 sm:flex">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
