'use client';

import { useEffect, useState } from 'react';

import type {
  TreasureHuntCompetitionCampaign,
  TreasureHuntCompetitionPhase,
} from '@/hooks/use-treasure-hunt-competition-overview';
import {
  competitionDeadline,
  formatCompetitionDeadline,
  formatCompetitionRemaining,
} from '@/lib/treasure-hunt-competition/presentation';
import { cn } from '@/lib/utils';

export function TreasureHuntCompetitionCountdown({
  phase,
  campaign,
  className,
}: {
  phase: TreasureHuntCompetitionPhase | undefined;
  campaign: TreasureHuntCompetitionCampaign | null | undefined;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const deadline = competitionDeadline(phase, campaign);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!deadline) return null;
  const isClosed = phase === 'closed' || (nowMs !== null && deadline.targetMs <= nowMs);

  return (
    <p
      aria-live="polite"
      className={cn('font-mono text-xs font-black text-[#ffc240]', className)}
    >
      {isClosed
        ? 'Competición finalizada'
        : `${deadline.prefix}: ${nowMs === null ? 'calculando…' : formatCompetitionRemaining(deadline.targetMs, nowMs)}`}
      <span className="ml-2 font-sans font-semibold text-[#969994]">
        · {formatCompetitionDeadline(deadline.targetMs)} UTC
      </span>
    </p>
  );
}
