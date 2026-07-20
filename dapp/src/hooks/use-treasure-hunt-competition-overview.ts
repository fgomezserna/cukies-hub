'use client';

import { useCallback, useEffect, useState } from 'react';

export const TREASURE_HUNT_COMPETITION_API = '/api/games/treasure-hunt/competition';

export type TreasureHuntCompetitionPhase =
  | 'unconfigured'
  | 'disabled'
  | 'scheduled'
  | 'active'
  | 'closed';

export interface TreasureHuntCompetitionCampaign {
  readonly campaignId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly poolBps: number;
  readonly playerRewardBps: number;
  readonly sponsorRewardBps: number;
  readonly maxWinningAttemptsPerWallet: number;
  readonly cliffMonths: number;
  readonly vestingMonths: number;
}

export interface TreasureHuntCompetitionParticipant {
  readonly alias: string;
  readonly canonicalAlias: string;
  readonly aliasChangedAt: string | null;
  readonly createdAt: string;
}

export interface TreasureHuntCompetitionStatus {
  readonly success: true;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly phase: TreasureHuntCompetitionPhase;
  readonly campaign: TreasureHuntCompetitionCampaign | null;
  readonly participant: TreasureHuntCompetitionParticipant | null;
}

export interface TreasureHuntLeaderboardEntry {
  readonly rank: number;
  readonly walletRank: number;
  readonly attemptId: string;
  readonly alias: string;
  readonly score: number;
  readonly gameTimeMs: number;
  readonly finishedAt: string;
  readonly reviewStatus: 'pending' | 'approved';
  readonly isMe: boolean;
}

interface CompetitionLeaderboardResponse {
  readonly success: true;
  readonly campaignId: string;
  readonly entries: readonly TreasureHuntLeaderboardEntry[];
}

export const TREASURE_HUNT_FALLBACK_RULES = Object.freeze({
  poolBps: 2_500,
  playerRewardBps: 1_000,
  sponsorRewardBps: 2_500,
  maxWinningAttemptsPerWallet: 5,
  cliffMonths: 9,
  vestingMonths: 6,
});

export const TREASURE_HUNT_PHASE_COPY: Record<
  TreasureHuntCompetitionPhase,
  { readonly label: string; readonly detail: string }
> = {
  unconfigured: {
    label: 'Pendiente de configurar',
    detail: 'Las fechas se anunciarán cuando la campaña quede configurada.',
  },
  disabled: {
    label: 'Inactiva',
    detail: 'La competición no admite nuevas partidas en este momento.',
  },
  scheduled: {
    label: 'Próximamente',
    detail: 'La competición está configurada y abrirá en la fecha indicada.',
  },
  active: {
    label: 'En curso',
    detail: 'Las partidas 1P finalizadas entran en el ranking provisional.',
  },
  closed: {
    label: 'Finalizada',
    detail: 'El ranking está cerrado y pendiente de liquidación definitiva.',
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCampaign(value: unknown): value is TreasureHuntCompetitionCampaign {
  if (!isObject(value)) return false;
  return (
    typeof value.campaignId === 'string' &&
    typeof value.startsAt === 'string' &&
    typeof value.endsAt === 'string' &&
    isFiniteNumber(value.poolBps) &&
    isFiniteNumber(value.playerRewardBps) &&
    isFiniteNumber(value.sponsorRewardBps) &&
    isFiniteNumber(value.maxWinningAttemptsPerWallet) &&
    isFiniteNumber(value.cliffMonths) &&
    isFiniteNumber(value.vestingMonths)
  );
}

function isParticipant(value: unknown): value is TreasureHuntCompetitionParticipant {
  if (!isObject(value)) return false;
  return (
    typeof value.alias === 'string' &&
    typeof value.canonicalAlias === 'string' &&
    (value.aliasChangedAt === null || typeof value.aliasChangedAt === 'string') &&
    typeof value.createdAt === 'string'
  );
}

function isStatus(value: unknown): value is TreasureHuntCompetitionStatus {
  if (!isObject(value)) return false;
  return (
    value.success === true &&
    typeof value.configured === 'boolean' &&
    typeof value.enabled === 'boolean' &&
    typeof value.phase === 'string' &&
    ['unconfigured', 'disabled', 'scheduled', 'active', 'closed'].includes(value.phase) &&
    (value.campaign === null || isCampaign(value.campaign)) &&
    (value.participant === null || isParticipant(value.participant))
  );
}

function isLeaderboardEntry(value: unknown): value is TreasureHuntLeaderboardEntry {
  if (!isObject(value)) return false;
  return (
    isFiniteNumber(value.rank) &&
    isFiniteNumber(value.walletRank) &&
    typeof value.attemptId === 'string' &&
    typeof value.alias === 'string' &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.gameTimeMs) &&
    typeof value.finishedAt === 'string' &&
    (value.reviewStatus === 'pending' || value.reviewStatus === 'approved') &&
    typeof value.isMe === 'boolean'
  );
}

function isLeaderboard(value: unknown): value is CompetitionLeaderboardResponse {
  return (
    isObject(value) &&
    value.success === true &&
    typeof value.campaignId === 'string' &&
    Array.isArray(value.entries) &&
    value.entries.every(isLeaderboardEntry)
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function formatTreasureHuntPercentage(bps: number) {
  return `${bps / 100}%`;
}

export function formatTreasureHuntDuration(gameTimeMs: number) {
  if (!Number.isFinite(gameTimeMs) || gameTimeMs < 0) return '—';
  return `${(gameTimeMs / 1_000).toFixed(1)} s`;
}

export function formatTreasureHuntCampaignWindow(
  campaign: TreasureHuntCompetitionCampaign | null,
) {
  if (!campaign) return null;
  const startsAt = new Date(campaign.startsAt);
  const endsAt = new Date(campaign.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatter.format(startsAt)} — ${formatter.format(endsAt)}`;
}

export function useTreasureHuntCompetitionOverview(options?: {
  readonly includeLeaderboard?: boolean;
}) {
  const includeLeaderboard = options?.includeLeaderboard ?? true;
  const [status, setStatus] = useState<TreasureHuntCompetitionStatus | null>(null);
  const [leaderboard, setLeaderboard] = useState<readonly TreasureHuntLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const statusResponse = await fetch(TREASURE_HUNT_COMPETITION_API, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const statusBody = await readJson(statusResponse);
        if (!statusResponse.ok || !isStatus(statusBody)) {
          throw new Error('No se pudo consultar el estado de la competición.');
        }
        if (controller.signal.aborted) return;
        setStatus(statusBody);

        if (!includeLeaderboard || !statusBody.configured || !statusBody.campaign) {
          setLeaderboard([]);
          return;
        }

        const leaderboardResponse = await fetch(
          `${TREASURE_HUNT_COMPETITION_API}/leaderboard?limit=100`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
          },
        );
        const leaderboardBody = await readJson(leaderboardResponse);
        if (!leaderboardResponse.ok || !isLeaderboard(leaderboardBody)) {
          throw new Error('El ranking no está disponible ahora mismo.');
        }
        if (!controller.signal.aborted) setLeaderboard(leaderboardBody.entries);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setStatus(null);
        setLeaderboard([]);
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo consultar la competición.',
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [includeLeaderboard, refreshToken]);

  const reload = useCallback(() => setRefreshToken((current) => current + 1), []);

  return { status, leaderboard, isLoading, error, reload } as const;
}
