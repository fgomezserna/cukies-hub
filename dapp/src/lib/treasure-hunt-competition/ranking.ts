import type {
  CompetitionAttempt,
  CompetitionConfig,
  RankedCompetitionAttempt,
} from './types';
import { parseCanonicalUtcDate } from './rules';

const ZERO_EVM_WALLET = `0x${'0'.repeat(40)}`;

export function normalizeCompetitionWallet(walletAddress: string) {
  return walletAddress.trim().toLowerCase();
}

export function isCompetitionWalletAddress(walletAddress: string) {
  const normalized = normalizeCompetitionWallet(walletAddress);
  return /^0x[0-9a-f]{40}$/.test(normalized) && normalized !== ZERO_EVM_WALLET;
}

function parsedDate(value: string) {
  try {
    return parseCanonicalUtcDate(value).getTime();
  } catch {
    return null;
  }
}

function compareAttempts(left: CompetitionAttempt, right: CompetitionAttempt) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.gameTimeMs !== right.gameTimeMs) return left.gameTimeMs - right.gameTimeMs;

  const leftFinishedAt = Date.parse(left.finishedAt ?? '');
  const rightFinishedAt = Date.parse(right.finishedAt ?? '');
  if (leftFinishedAt !== rightFinishedAt) return leftFinishedAt - rightFinishedAt;

  return left.attemptId.localeCompare(right.attemptId, 'en');
}

function isEligibleAttempt(attempt: CompetitionAttempt, campaign: CompetitionConfig) {
  const startedAt = parsedDate(attempt.startedAt);
  const finishedAt = attempt.finishedAt ? parsedDate(attempt.finishedAt) : null;
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) return false;
  if (!Number.isSafeInteger(attempt.score) || attempt.score < 0) return false;
  if (!Number.isSafeInteger(attempt.gameTimeMs) || attempt.gameTimeMs < 0) return false;

  return (
    attempt.status === 'valid' &&
    attempt.campaignId === campaign.campaignId &&
    attempt.gameId === campaign.gameId &&
    attempt.mode === campaign.mode &&
    startedAt >= Date.parse(campaign.startsAt) &&
    finishedAt <= Date.parse(campaign.endsAt)
  );
}

export function buildCompetitionRanking(
  attempts: readonly CompetitionAttempt[],
  campaign: CompetitionConfig,
): RankedCompetitionAttempt[] {
  const attemptsByWallet = new Map<string, CompetitionAttempt[]>();
  const attemptIdCounts = new Map<string, number>();
  for (const attempt of attempts) {
    attemptIdCounts.set(attempt.attemptId, (attemptIdCounts.get(attempt.attemptId) ?? 0) + 1);
  }

  for (const attempt of attempts) {
    if (!attempt.attemptId || attemptIdCounts.get(attempt.attemptId) !== 1) continue;
    if (!isEligibleAttempt(attempt, campaign)) continue;
    const walletAddress = normalizeCompetitionWallet(attempt.walletAddress);
    if (!isCompetitionWalletAddress(walletAddress)) continue;

    const walletAttempts = attemptsByWallet.get(walletAddress) ?? [];
    walletAttempts.push({ ...attempt, walletAddress });
    attemptsByWallet.set(walletAddress, walletAttempts);
  }

  const finalists: Array<CompetitionAttempt & { walletRank: number }> = [];
  for (const walletAttempts of attemptsByWallet.values()) {
    walletAttempts.sort(compareAttempts);
    finalists.push(
      ...walletAttempts
        .slice(0, campaign.maxWinningAttemptsPerWallet)
        .map((attempt, index) => ({ ...attempt, walletRank: index + 1 })),
    );
  }

  finalists.sort(compareAttempts);
  return finalists.map((attempt, index) => ({ ...attempt, rank: index + 1 }));
}
