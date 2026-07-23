'use client';

import Link from 'next/link';
import { BookOpenText, Medal } from 'lucide-react';

import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';
import { useTreasureHuntPrizePool } from '@/hooks/use-treasure-hunt-prize-pool';
import { formatTreasureHuntPrizePoolUki } from '@/lib/treasure-hunt-prize-pool';

export default function TreasureHuntCompetitionBanner() {
  const { status, leaderboard, isLoading } = useTreasureHuntCompetitionOverview();
  const campaign = status?.campaign;
  const maxAttempts = campaign?.maxWinningAttemptsPerWallet ?? 5;
  const myAttempts = leaderboard.filter((entry) => entry.isMe).length;
  const prizePool = useTreasureHuntPrizePool(campaign?.poolBps ?? 2_500);

  const metrics = [
    { label: 'Modo activo', value: '1P' },
    {
      label: 'Partidas computables',
      value: isLoading ? '···' : `${myAttempts}/${maxAttempts}`,
    },
    {
      label: 'Premio acumulado',
      value: prizePool.isLoading ? '···' : formatTreasureHuntPrizePoolUki(prizePool.value),
    },
  ];

  return (
    <aside
      aria-labelledby="treasure-hunt-competition-banner-title"
      className="overflow-hidden rounded-[8px] border border-white/20 bg-[#071312]/94"
    >
      <div className="grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(34rem,1.2fr)] lg:items-center lg:px-5">
        <div className="min-w-0 border-l-2 border-[#35eee2] pl-4">
          <p className="font-mono text-[0.66rem] font-black uppercase tracking-[0.2em] text-[#35eee2]">
            Competición oficial · Preventa UKI
          </p>
          <h2
            id="treasure-hunt-competition-banner-title"
            className="mt-1 font-headline text-lg font-black tracking-tight text-[#f2eee7] sm:text-xl"
          >
            Torneo Preventa UKI
          </h2>
        </div>

        <div className="min-w-0">
          <dl className="grid grid-cols-3 divide-x divide-white/15 rounded-[8px] border border-white/20 bg-[#091513]">
            {metrics.map(({ label, value }) => (
              <div key={label} className="min-w-0 px-2 py-2 text-center sm:px-3">
                <dt className="text-[0.58rem] font-bold uppercase tracking-[0.08em] text-[#969994] sm:text-[0.62rem]">
                  {label}
                </dt>
                <dd
                  className="mt-0.5 truncate font-mono text-sm font-black text-[#35eee2] sm:text-base"
                  title={value}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
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
