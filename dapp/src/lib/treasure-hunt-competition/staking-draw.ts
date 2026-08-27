import { createHash } from 'node:crypto';

import { buildCompetitionRanking, isCompetitionWalletAddress, normalizeCompetitionWallet } from './ranking';
import { multiplyByBps, parseUkiRaw } from './rules';
import type {
  CompetitionAward,
  CompetitionConfig,
  CompetitionSettlement,
  RankedCompetitionAttempt,
} from './types';

const DRAW_SEED_PATTERN = /^0x[0-9a-f]{64}$/i;

export interface CompetitionStakingDrawWinner {
  readonly round: number;
  readonly walletAddress: string;
  readonly tickets: number;
  readonly selectedTicket: string;
  readonly attemptId: string;
  readonly rewardUkiRaw: string;
}

export interface CompetitionStakingDrawResult {
  readonly algorithmVersion: 'treasure-hunt-staking-weighted-v1';
  readonly drawSeed: string;
  readonly totalStakedUkiRaw: string;
  readonly totalTickets: number;
  readonly winnerCount: number;
  readonly winners: readonly CompetitionStakingDrawWinner[];
  readonly settlement: CompetitionSettlement;
}

interface WalletDrawEntry {
  readonly walletAddress: string;
  readonly tickets: number;
  readonly representative: RankedCompetitionAttempt;
}

function drawValue(input: {
  seed: string;
  campaignId: string;
  rulesVersion: string;
  round: number;
  candidates: readonly WalletDrawEntry[];
}) {
  const canonicalCandidates = input.candidates
    .map((candidate) => `${candidate.walletAddress}:${candidate.tickets}`)
    .join('|');
  return BigInt(`0x${createHash('sha256').update([
    'cukies-world',
    'treasure-hunt-staking-weighted-v1',
    input.seed.toLowerCase(),
    input.campaignId,
    input.rulesVersion,
    String(input.round),
    canonicalCandidates,
  ].join('\n')).digest('hex')}`);
}

function weightedCandidates(input: {
  campaign: CompetitionConfig;
  ranking: readonly RankedCompetitionAttempt[];
  disqualifiedWalletAddresses: readonly string[];
}) {
  const disqualified = new Set(input.disqualifiedWalletAddresses.map((walletAddress) => {
    const normalized = normalizeCompetitionWallet(walletAddress);
    if (!isCompetitionWalletAddress(normalized)) {
      throw new Error('Disqualified wallet address must be a valid EVM address');
    }
    return normalized;
  }));
  const byWallet = new Map<string, WalletDrawEntry>();
  for (const attempt of buildCompetitionRanking(input.ranking, input.campaign)) {
    const walletAddress = normalizeCompetitionWallet(attempt.walletAddress);
    if (disqualified.has(walletAddress)) continue;
    const tickets = Math.floor(attempt.score / input.campaign.pointsPerTicket);
    if (tickets < 1) continue;
    const existing = byWallet.get(walletAddress);
    byWallet.set(walletAddress, {
      walletAddress,
      tickets: (existing?.tickets ?? 0) + tickets,
      representative: existing?.representative ?? attempt,
    });
  }
  return [...byWallet.values()].sort((left, right) => (
    left.walletAddress.localeCompare(right.walletAddress, 'en')
  ));
}

export function settleStakingCompetitionDraw(input: {
  readonly campaign: CompetitionConfig;
  readonly ranking: readonly RankedCompetitionAttempt[];
  readonly totalStakedUkiRaw: string;
  readonly disqualifiedWalletAddresses: readonly string[];
  readonly drawSeed: string;
}): CompetitionStakingDrawResult {
  if (input.campaign.eligibilityKind !== 'uki_staking') {
    throw new Error('Staking draw requires a staking competition');
  }
  const drawSeed = input.drawSeed.trim().toLowerCase();
  if (!DRAW_SEED_PATTERN.test(drawSeed)) {
    throw new Error('Staking draw seed must be a 32-byte 0x-prefixed hexadecimal value');
  }
  const totalStaked = parseUkiRaw(input.totalStakedUkiRaw);
  const pool = parseUkiRaw(input.campaign.basePrizeUkiRaw)
    + multiplyByBps(totalStaked, input.campaign.stakePrizeBps);
  const prizePerWinner = parseUkiRaw(input.campaign.prizePerWinnerUkiRaw);
  const candidates = weightedCandidates(input);
  const availableWinnerSlots = Number(pool / prizePerWinner);
  if (!Number.isSafeInteger(availableWinnerSlots)) {
    throw new RangeError('Staking draw winner count exceeds safe integer range');
  }
  const winnerCount = Math.min(availableWinnerSlots, candidates.length);
  const remaining = [...candidates];
  const winners: CompetitionStakingDrawWinner[] = [];
  const awards: CompetitionAward[] = [];

  for (let round = 1; round <= winnerCount; round += 1) {
    const totalTickets = remaining.reduce((total, candidate) => total + BigInt(candidate.tickets), BigInt(0));
    if (totalTickets < BigInt(1)) break;
    const selectedTicket = drawValue({
      seed: drawSeed,
      campaignId: input.campaign.campaignId,
      rulesVersion: input.campaign.rulesVersion,
      round,
      candidates: remaining,
    }) % totalTickets;
    let cursor = BigInt(0);
    let selectedIndex = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      cursor += BigInt(remaining[index].tickets);
      if (selectedTicket < cursor) {
        selectedIndex = index;
        break;
      }
    }
    if (selectedIndex < 0) throw new Error('Staking draw selection invariant violated');
    const [winner] = remaining.splice(selectedIndex, 1);
    winners.push({
      round,
      walletAddress: winner.walletAddress,
      tickets: winner.tickets,
      selectedTicket: selectedTicket.toString(10),
      attemptId: winner.representative.attemptId,
      rewardUkiRaw: prizePerWinner.toString(10),
    });
    awards.push({
      attemptId: winner.representative.attemptId,
      rank: winner.representative.rank,
      walletRank: winner.representative.walletRank,
      walletAddress: winner.walletAddress,
      playerAlias: winner.representative.playerAlias,
      purchasedUkiRaw: '0',
      playerRewardUkiRaw: prizePerWinner.toString(10),
      sponsorWalletAddress: null,
      sponsorRewardUkiRaw: '0',
      totalRewardUkiRaw: prizePerWinner.toString(10),
      partial: false,
    });
  }

  const spent = prizePerWinner * BigInt(awards.length);
  const totalTickets = candidates.reduce((total, candidate) => total + candidate.tickets, 0);
  const settlement: CompetitionSettlement = {
    campaignId: input.campaign.campaignId,
    totalPurchasedUkiRaw: '0',
    poolUkiRaw: pool.toString(10),
    playerPoolUkiRaw: pool.toString(10),
    sponsorPoolUkiRaw: '0',
    playerRewardsUkiRaw: spent.toString(10),
    sponsorRewardsUkiRaw: '0',
    spentUkiRaw: spent.toString(10),
    remainingUkiRaw: (pool - spent).toString(10),
    roundingDustUkiRaw: '0',
    awards,
    skipped: [],
  };
  return {
    algorithmVersion: 'treasure-hunt-staking-weighted-v1',
    drawSeed,
    totalStakedUkiRaw: totalStaked.toString(10),
    totalTickets,
    winnerCount: awards.length,
    winners,
    settlement,
  };
}
