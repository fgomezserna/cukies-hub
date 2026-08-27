'use client';

import type { TreasureHuntCompetitionEligibility } from '@/hooks/use-treasure-hunt-competition-overview';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { cn } from '@/lib/utils';

function formatEvidenceTimestamp(timestamp: string) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(value);
}

export default function TreasureHuntDisqualificationNotice({
  eligibility,
  compact = false,
}: {
  readonly eligibility: TreasureHuntCompetitionEligibility | null | undefined;
  readonly compact?: boolean;
}) {
  if (!eligibility?.disqualified) return null;

  const evidence = eligibility.disqualificationEvidence;
  const evidenceTime = evidence ? formatEvidenceTimestamp(evidence.timestamp) : null;
  const evidenceDetail = evidence
    ? [formatTreasureHuntUkiRaw(evidence.amountRaw), evidenceTime].filter(Boolean).join(' · ')
    : null;

  return (
    <div
      role="alert"
      className={cn(
        'border border-red-300/35 bg-red-950/30 text-red-100 shadow-[inset_3px_0_0_#fca5a5]',
        compact ? 'rounded-[7px] px-4 py-3' : 'rounded-[8px] px-4 py-3 sm:px-5',
      )}
    >
      <p className="font-headline text-sm font-black uppercase tracking-[0.04em] text-red-200">
        Wallet descalificada
      </p>
      <p className="mt-1 text-xs leading-relaxed text-red-100/80 sm:text-sm">
        Se ha detectado una retirada de UKI durante el torneo. Tus partidas ya no clasifican,
        no generan tickets ni premios, y volver a depositar no elimina la descalificación.
      </p>
      {evidenceDetail ? (
        <p className="mt-2 font-mono text-[11px] font-bold text-red-200/80">
          Retirada registrada: {evidenceDetail}
        </p>
      ) : null}
    </div>
  );
}
