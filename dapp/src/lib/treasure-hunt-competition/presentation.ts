import type {
  TreasureHuntCompetitionCampaign,
  TreasureHuntCompetitionPhase,
} from '@/hooks/use-treasure-hunt-competition-overview';

export const TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME = 'Torneo Lanzamiento UKI';

export function calculateAvailablePrizeSlots(
  poolUkiRaw: string | null | undefined,
  prizePerWinnerUkiRaw: string | null | undefined,
) {
  if (!poolUkiRaw || !prizePerWinnerUkiRaw) return null;
  try {
    const pool = BigInt(poolUkiRaw);
    const prizePerWinner = BigInt(prizePerWinnerUkiRaw);
    if (pool < BigInt(0) || prizePerWinner <= BigInt(0)) return null;
    return pool / prizePerWinner;
  } catch {
    return null;
  }
}

export function competitionDeadline(
  phase: TreasureHuntCompetitionPhase | undefined,
  campaign: TreasureHuntCompetitionCampaign | null | undefined,
) {
  if (!campaign) return null;
  const target = phase === 'scheduled' ? campaign.startsAt : campaign.endsAt;
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return null;
  return {
    targetMs,
    prefix: phase === 'scheduled' ? 'Comienza en' : phase === 'closed' ? 'Finalizada' : 'Finaliza en',
  } as const;
}

export function formatCompetitionDeadline(targetMs: number) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(targetMs));
}

export function formatCompetitionRemaining(targetMs: number, nowMs: number) {
  const remainingSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1_000));
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
