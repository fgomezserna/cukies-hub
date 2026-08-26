'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_AUTO_REFRESH_MS = 15_000;

export const TREASURE_HUNT_COMPETITION_API = '/api/games/treasure-hunt/competition';

export type TreasureHuntCompetitionPhase =
  | 'unconfigured'
  | 'disabled'
  | 'scheduled'
  | 'active'
  | 'closed';

export interface TreasureHuntCompetitionCampaign {
  readonly campaignId: string;
  readonly eligibilityKind: 'presale' | 'uki_staking';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly stakePerAttemptRaw: string;
  readonly topAttemptsPerWallet: number;
  readonly pointsPerTicket: number;
  readonly basePrizeUkiRaw: string;
  readonly stakePrizeBps: number;
  readonly prizePerWinnerUkiRaw: string;
  readonly maxWinsPerWallet: number;
  readonly poolBps: number;
  readonly playerRewardBps: number;
  readonly sponsorRewardBps: number;
  readonly maxWinningAttemptsPerWallet: number;
  readonly cliffMonths: number;
  readonly vestingMonths: number;
}
export interface TreasureHuntCompetitionEligibility {
  readonly ready: boolean;
  readonly stakedUkiRaw: string;
  readonly totalStakedUkiRaw: string;
  readonly indexedThroughBlock: number | null;
  readonly indexedAt: string | null;
  readonly disqualified: boolean;
  readonly disqualificationEvidence: {
    readonly eventId: string;
    readonly txHash: string;
    readonly blockNumber: number;
    readonly timestamp: string;
    readonly amountRaw: string;
  } | null;
  readonly issues: readonly string[];
  readonly attemptsGranted: number;
  readonly attemptsUsed: number;
  readonly attemptsRemaining: number;
  readonly topAttemptsCount: number;
  readonly totalTickets: number;
  readonly provisionalTickets: number;
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
  readonly eligibility: TreasureHuntCompetitionEligibility | null;
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
  readonly tickets: number;
  readonly isMe: boolean;
  readonly estimatedRewardUkiRaw: string;
  readonly rewardStatus:
    | 'estimated'
    | 'partial'
    | 'no_purchase'
    | 'pool_exhausted'
    | 'reward_rounds_to_zero'
    | 'draw_pending';
}

export interface TreasureHuntLeaderboardMeta {
  readonly calculatedAt: string;
  readonly poolUkiRaw: string;
  readonly playerPoolUkiRaw: string;
  readonly allocatedPlayerUkiRaw: string;
  readonly remainingPlayerPoolUkiRaw: string;
  readonly totalRankedEntries: number;
  readonly myAttempts: number;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalEntries: number;
    readonly totalPages: number;
  };
}

interface CompetitionLeaderboardResponse extends TreasureHuntLeaderboardMeta {
  readonly success: true;
  readonly campaignId: string;
  readonly entries: readonly TreasureHuntLeaderboardEntry[];
}

export const TREASURE_HUNT_FALLBACK_RULES = Object.freeze({
  eligibilityKind: 'uki_staking' as const,
  stakePerAttemptRaw: '2000000000000000000000',
  topAttemptsPerWallet: 10,
  pointsPerTicket: 100,
  basePrizeUkiRaw: '50000000000000000000000',
  stakePrizeBps: 1_000,
  prizePerWinnerUkiRaw: '10000000000000000000000',
  maxWinsPerWallet: 1,
  poolBps: 2_500,
  playerRewardBps: 1_000,
  sponsorRewardBps: 2_500,
  maxWinningAttemptsPerWallet: 10,
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

function isRawTokenAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}

function isCampaign(value: unknown): value is TreasureHuntCompetitionCampaign {
  if (!isObject(value)) return false;
  return (
    typeof value.campaignId === 'string' &&
    (value.eligibilityKind === 'presale' || value.eligibilityKind === 'uki_staking') &&
    typeof value.startsAt === 'string' &&
    typeof value.endsAt === 'string' &&
    isRawTokenAmount(value.stakePerAttemptRaw) &&
    isFiniteNumber(value.topAttemptsPerWallet) &&
    isFiniteNumber(value.pointsPerTicket) &&
    isRawTokenAmount(value.basePrizeUkiRaw) &&
    isFiniteNumber(value.stakePrizeBps) &&
    isRawTokenAmount(value.prizePerWinnerUkiRaw) &&
    isFiniteNumber(value.maxWinsPerWallet) &&
    isFiniteNumber(value.poolBps) &&
    isFiniteNumber(value.playerRewardBps) &&
    isFiniteNumber(value.sponsorRewardBps) &&
    isFiniteNumber(value.maxWinningAttemptsPerWallet) &&
    isFiniteNumber(value.cliffMonths) &&
    isFiniteNumber(value.vestingMonths)
  );
}

function isEligibility(value: unknown): value is TreasureHuntCompetitionEligibility {
  if (!isObject(value)) return false;
  const evidence = value.disqualificationEvidence;
  return (
    typeof value.ready === 'boolean' &&
    isRawTokenAmount(value.stakedUkiRaw) &&
    isRawTokenAmount(value.totalStakedUkiRaw) &&
    (value.indexedThroughBlock === null || isFiniteNumber(value.indexedThroughBlock)) &&
    (value.indexedAt === null || typeof value.indexedAt === 'string') &&
    typeof value.disqualified === 'boolean' &&
    (evidence === null || (
      isObject(evidence) &&
      typeof evidence.eventId === 'string' &&
      typeof evidence.txHash === 'string' &&
      isFiniteNumber(evidence.blockNumber) &&
      typeof evidence.timestamp === 'string' &&
      isRawTokenAmount(evidence.amountRaw)
    )) &&
    Array.isArray(value.issues) && value.issues.every((issue) => typeof issue === 'string') &&
    isFiniteNumber(value.attemptsGranted) &&
    isFiniteNumber(value.attemptsUsed) &&
    isFiniteNumber(value.attemptsRemaining) &&
    isFiniteNumber(value.topAttemptsCount) &&
    isFiniteNumber(value.totalTickets) &&
    isFiniteNumber(value.provisionalTickets)
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
    (value.participant === null || isParticipant(value.participant)) &&
    (value.eligibility === null || isEligibility(value.eligibility))
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
    isFiniteNumber(value.tickets) &&
    typeof value.isMe === 'boolean' &&
    isRawTokenAmount(value.estimatedRewardUkiRaw) &&
    [
      'estimated',
      'partial',
      'no_purchase',
      'pool_exhausted',
      'reward_rounds_to_zero',
      'draw_pending',
    ].includes(String(value.rewardStatus))
  );
}

function isLeaderboard(value: unknown): value is CompetitionLeaderboardResponse {
  return (
    isObject(value) &&
    value.success === true &&
    typeof value.campaignId === 'string' &&
    typeof value.calculatedAt === 'string' &&
    isRawTokenAmount(value.poolUkiRaw) &&
    isRawTokenAmount(value.playerPoolUkiRaw) &&
    isRawTokenAmount(value.allocatedPlayerUkiRaw) &&
    isRawTokenAmount(value.remainingPlayerPoolUkiRaw) &&
    isFiniteNumber(value.totalRankedEntries) &&
    isFiniteNumber(value.myAttempts) &&
    isObject(value.pagination) &&
    isFiniteNumber(value.pagination.page) &&
    isFiniteNumber(value.pagination.pageSize) &&
    isFiniteNumber(value.pagination.totalEntries) &&
    isFiniteNumber(value.pagination.totalPages) &&
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
  readonly leaderboardPage?: number;
  readonly leaderboardPageSize?: number;
  readonly leaderboardMineOnly?: boolean;
  readonly autoRefreshMs?: number;
}) {
  const includeLeaderboard = options?.includeLeaderboard ?? true;
  const leaderboardPage = options?.leaderboardPage ?? 1;
  const leaderboardPageSize = options?.leaderboardPageSize ?? 100;
  const leaderboardMineOnly = options?.leaderboardMineOnly ?? false;
  const autoRefreshMs = options?.autoRefreshMs ?? DEFAULT_AUTO_REFRESH_MS;
  const [status, setStatus] = useState<TreasureHuntCompetitionStatus | null>(null);
  const [leaderboard, setLeaderboard] = useState<readonly TreasureHuntLeaderboardEntry[]>([]);
  const [leaderboardMeta, setLeaderboardMeta] = useState<TreasureHuntLeaderboardMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const hasLoadedRef = useRef(false);
  const queryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const queryKey = [
      includeLeaderboard,
      leaderboardMineOnly,
      leaderboardPage,
      leaderboardPageSize,
    ].join(':');
    const isBackgroundRefresh = hasLoadedRef.current && queryKeyRef.current === queryKey;
    queryKeyRef.current = queryKey;

    async function load() {
      if (!isBackgroundRefresh) setIsLoading(true);
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
          setLeaderboardMeta(null);
          return;
        }

        const leaderboardParams = new URLSearchParams({
          page: String(leaderboardPage),
          pageSize: String(leaderboardPageSize),
        });
        if (leaderboardMineOnly) leaderboardParams.set('mine', '1');
        const leaderboardResponse = await fetch(
          `${TREASURE_HUNT_COMPETITION_API}/leaderboard?${leaderboardParams.toString()}`,
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
        if (!controller.signal.aborted) {
          setLeaderboard(leaderboardBody.entries);
          setLeaderboardMeta({
            calculatedAt: leaderboardBody.calculatedAt,
            poolUkiRaw: leaderboardBody.poolUkiRaw,
            playerPoolUkiRaw: leaderboardBody.playerPoolUkiRaw,
            allocatedPlayerUkiRaw: leaderboardBody.allocatedPlayerUkiRaw,
            remainingPlayerPoolUkiRaw: leaderboardBody.remainingPlayerPoolUkiRaw,
            totalRankedEntries: leaderboardBody.totalRankedEntries,
            myAttempts: leaderboardBody.myAttempts,
            pagination: leaderboardBody.pagination,
          });
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (!isBackgroundRefresh) {
          setStatus(null);
          setLeaderboard([]);
          setLeaderboardMeta(null);
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo consultar la competición.',
        );
      } finally {
        if (!controller.signal.aborted) {
          hasLoadedRef.current = true;
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [
    includeLeaderboard,
    leaderboardMineOnly,
    leaderboardPage,
    leaderboardPageSize,
    refreshToken,
  ]);

  useEffect(() => {
    const refresh = () => setRefreshToken((current) => current + 1);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const intervalId = autoRefreshMs > 0
      ? window.setInterval(refreshWhenVisible, autoRefreshMs)
      : null;
    window.addEventListener('cukies:treasure-hunt:competition:refresh', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener('cukies:treasure-hunt:competition:refresh', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [autoRefreshMs]);

  const reload = useCallback(() => setRefreshToken((current) => current + 1), []);

  return { status, leaderboard, leaderboardMeta, isLoading, error, reload } as const;
}
