'use client';

import Link from 'next/link';
import { BookOpenText, Medal } from 'lucide-react';

import { TreasureHuntCompetitionCountdown } from '@/components/games/treasure-hunt-competition-countdown';
import TreasureHuntDisqualificationNotice from '@/components/games/treasure-hunt-disqualification-notice';
import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';
import {
  calculateAvailablePrizeSlots,
  TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME,
} from '@/lib/treasure-hunt-competition/presentation';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';

export default function TreasureHuntCompetitionBanner() {
  const { status, leaderboardMeta, isLoading } = useTreasureHuntCompetitionOverview();
  const eligibility = status?.eligibility;
  const campaign = status?.campaign;
  const prizePoolValue = leaderboardMeta
    ? formatTreasureHuntUkiRaw(leaderboardMeta.poolUkiRaw)
    : 'Actualizando…';
  const metrics = [
    {
      label: 'Intentos disponibles',
      value: isLoading
        ? '···'
        : eligibility
          ? eligibility.attemptsRemaining.toLocaleString('es-ES')
          : '—',
    },
    {
      label: 'Resultados que cuentan',
      value: isLoading
        ? '···'
        : `${eligibility?.disqualified ? 0 : eligibility?.topAttemptsCount ?? 0}/${campaign?.topAttemptsPerWallet ?? 10}`,
    },
    {
      label: 'Premio acumulado',
      value: isLoading && !leaderboardMeta ? '···' : prizePoolValue,
    },
    {
      label: 'N.º de ganadores',
      value: isLoading && !leaderboardMeta
        ? '···'
        : calculateAvailablePrizeSlots(
          leaderboardMeta?.poolUkiRaw,
          campaign?.prizePerWinnerUkiRaw,
        )?.toLocaleString('es-ES') ?? '—',
    },
  ];

  return (
    <aside
      aria-labelledby="treasure-hunt-competition-banner-title"
      className="overflow-hidden rounded-[8px] border border-white/20 bg-[#071312]/94"
    >
      <div className="px-3 py-3 sm:px-4 lg:px-5">
        <div
          data-competition-title
          className="min-w-0 border-l-2 border-[#35eee2] pl-3 sm:pl-4"
        >
          <p className="font-mono text-[0.66rem] font-black uppercase tracking-[0.2em] text-[#35eee2]">
            Competición oficial · Lanzamiento UKI
          </p>
          <h2
            id="treasure-hunt-competition-banner-title"
            className="mt-1 font-headline text-lg font-black tracking-tight text-[#f2eee7] sm:text-xl"
          >
            {TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME}
          </h2>
          <TreasureHuntCompetitionCountdown
            phase={status?.phase}
            campaign={campaign}
            className="mt-1"
          />
        </div>

        {eligibility?.disqualified ? (
          <div className="mt-3">
            <TreasureHuntDisqualificationNotice eligibility={eligibility} compact />
          </div>
        ) : null}

        <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
          <dl
            data-competition-metrics
            className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/20 bg-white/15 sm:grid-cols-4"
          >
            {metrics.map(({ label, value }) => (
              <div
                key={label}
                className="min-w-0 bg-[#091513] px-2 py-2 text-center sm:px-3"
              >
                <dt className="text-[0.52rem] font-bold uppercase tracking-[0.05em] text-[#969994] sm:text-[0.62rem] sm:tracking-[0.08em]">
                  {label}
                </dt>
                <dd
                  className="mt-0.5 truncate font-mono text-[0.7rem] font-black text-[#35eee2] min-[390px]:text-xs sm:text-base"
                  title={value}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div
            data-competition-actions
            className="hidden items-stretch justify-end gap-2 sm:flex"
          >
            <Link
              href="/games/treasure-hunt/rules"
              className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-white/20 px-3 py-2 text-xs font-black text-[#f2eee7] transition hover:border-[#35eee2]/55"
            >
              <BookOpenText className="h-3.5 w-3.5" aria-hidden="true" />
              Ver reglas
            </Link>
            <Link
              href="/games/treasure-hunt/rankings"
              className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[#35eee2]/45 bg-[#35eee2]/10 px-3 py-2 text-xs font-black text-[#35eee2] transition hover:bg-[#35eee2]/15"
            >
              <Medal className="h-3.5 w-3.5" aria-hidden="true" />
              Rankings
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
