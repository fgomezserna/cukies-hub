'use client';

import Link from 'next/link';
import { BookOpenText, Medal } from 'lucide-react';

import { TreasureHuntCompetitionSummary } from '@/components/games/treasure-hunt-competition-summary';
import { TreasureHuntCreditModeBanner } from '@/components/games/treasure-hunt-credit-mode';
import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';

export default function TreasureHuntCompetitionBanner() {
  const { status, leaderboardMeta, isLoading } = useTreasureHuntCompetitionOverview();

  if (!isLoading && status?.phase === 'closed') {
    return <TreasureHuntCreditModeBanner />;
  }

  return (
    <TreasureHuntCompetitionSummary
      id="treasure-hunt-competition-banner-title"
      phase={status?.phase}
      campaign={status?.campaign}
      eligibility={status?.eligibility}
      poolUkiRaw={leaderboardMeta?.poolUkiRaw}
      isLoading={isLoading}
      actions={(
        <>
          <Link
            href="/games/treasure-hunt/rules"
            className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-white/20 px-3 py-2 text-xs font-black text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac)]/55"
          >
            <BookOpenText className="h-3.5 w-3.5" aria-hidden="true" />
            Ver reglas
          </Link>
          <Link
            href="/games/treasure-hunt/rankings"
            className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/10 px-3 py-2 text-xs font-black text-[var(--uki-lilac)] transition hover:bg-[var(--uki-lilac)]/15"
          >
            <Medal className="h-3.5 w-3.5" aria-hidden="true" />
            Rankings
          </Link>
        </>
      )}
    />
  );
}
