import { createHash } from 'node:crypto';

import {
  buildCompetitionRanking,
  createCompetitionVestingSchedule,
  normalizeCompetitionWallet,
  type CompetitionConfig,
} from '..';
import {
  settleStakingCompetitionDraw,
  type CompetitionStakingDrawResult,
} from '../staking-draw';
import type { CompetitionRuntime } from './runtime';
import {
  canonicalSettlementAttempts,
  CompetitionSettlementCloseError,
  type CompetitionVestingPlanEntry,
  type SettlementAttemptRecord,
} from './settlement-close';

const STAKING_SETTLEMENT_SCHEMA_VERSION = 1 as const;

export interface CompetitionStakingCloseState {
  readonly totalStakedUkiRaw: string;
  readonly totalStakedSourceBlock: number | null;
  readonly totalStakedSourceBlockHash: string | null;
  readonly totalStakedSourceEventId: string | null;
  readonly indexedThroughBlock: number;
  readonly indexedAt: string;
  readonly disqualifiedWalletAddresses: readonly string[];
}

export interface CompetitionStakingSettlementCloseSource {
  assertReady(campaign: CompetitionConfig, now: Date): Promise<void>;
  listAttempts(input: {
    readonly campaignId: string;
    readonly rulesVersion: string;
    readonly gameId: string;
    readonly mode: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly maxWinningAttemptsPerWallet: number;
  }): Promise<readonly SettlementAttemptRecord[]>;
  getCloseState(campaign: CompetitionConfig, now: Date): Promise<CompetitionStakingCloseState>;
}

export interface CompetitionStakingSettlementSnapshot {
  readonly schemaVersion: typeof STAKING_SETTLEMENT_SCHEMA_VERSION;
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly createdAt: string;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly attemptRecordCount: number;
  readonly eligibleAttemptCount: number;
  readonly closeState: CompetitionStakingCloseState;
  readonly draw: CompetitionStakingDrawResult;
  readonly vestingPlan: readonly CompetitionVestingPlanEntry[];
}

export interface CompetitionStakingSettlementSnapshotRepository {
  find(campaignId: string, rulesVersion: string): Promise<CompetitionStakingSettlementSnapshot | null>;
  saveIfAbsent(snapshot: CompetitionStakingSettlementSnapshot): Promise<{
    readonly created: boolean;
    readonly snapshot: CompetitionStakingSettlementSnapshot;
  }>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function cloneSnapshot(snapshot: CompetitionStakingSettlementSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as CompetitionStakingSettlementSnapshot;
}

function snapshotKey(campaignId: string, rulesVersion: string) {
  return JSON.stringify([campaignId, rulesVersion]);
}

export class InMemoryCompetitionStakingSettlementRepository
implements CompetitionStakingSettlementSnapshotRepository {
  private readonly snapshots = new Map<string, CompetitionStakingSettlementSnapshot>();

  async find(campaignId: string, rulesVersion: string) {
    const snapshot = this.snapshots.get(snapshotKey(campaignId, rulesVersion));
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  async saveIfAbsent(snapshot: CompetitionStakingSettlementSnapshot) {
    const key = snapshotKey(snapshot.campaignId, snapshot.rulesVersion);
    const existing = this.snapshots.get(key);
    if (existing) return { created: false, snapshot: cloneSnapshot(existing) };
    const stored = cloneSnapshot(snapshot);
    this.snapshots.set(key, stored);
    return { created: true, snapshot: cloneSnapshot(stored) };
  }
}

function campaignInput(campaign: CompetitionConfig) {
  return {
    campaignId: campaign.campaignId,
    rulesVersion: campaign.rulesVersion,
    eligibilityKind: campaign.eligibilityKind,
    stakingContractAddress: campaign.stakingContractAddress,
    stakingChainId: campaign.stakingChainId,
    stakePerAttemptRaw: campaign.stakePerAttemptRaw,
    topAttemptsPerWallet: campaign.topAttemptsPerWallet,
    pointsPerTicket: campaign.pointsPerTicket,
    basePrizeUkiRaw: campaign.basePrizeUkiRaw,
    stakePrizeBps: campaign.stakePrizeBps,
    prizePerWinnerUkiRaw: campaign.prizePerWinnerUkiRaw,
    maxWinsPerWallet: campaign.maxWinsPerWallet,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    cliffMonths: campaign.cliffMonths,
    vestingMonths: campaign.vestingMonths,
  };
}

function assertStoredSnapshot(snapshot: CompetitionStakingSettlementSnapshot, campaign: CompetitionConfig) {
  if (
    snapshot.schemaVersion !== STAKING_SETTLEMENT_SCHEMA_VERSION ||
    snapshot.campaignId !== campaign.campaignId ||
    snapshot.rulesVersion !== campaign.rulesVersion ||
    snapshot.draw.algorithmVersion !== 'treasure-hunt-staking-weighted-v1' ||
    snapshot.draw.settlement.campaignId !== campaign.campaignId
  ) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Stored staking settlement does not match ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }
  const computedOutputHash = hash({
    schemaVersion: snapshot.schemaVersion,
    campaignId: snapshot.campaignId,
    rulesVersion: snapshot.rulesVersion,
    createdAt: snapshot.createdAt,
    inputHash: snapshot.inputHash,
    attemptRecordCount: snapshot.attemptRecordCount,
    eligibleAttemptCount: snapshot.eligibleAttemptCount,
    closeState: snapshot.closeState,
    draw: snapshot.draw,
    vestingPlan: snapshot.vestingPlan,
  });
  if (computedOutputHash !== snapshot.outputHash) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Stored staking settlement output is corrupt for ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }
}

export async function closeTreasureHuntStakingCompetition(input: {
  readonly runtime: CompetitionRuntime;
  readonly source: CompetitionStakingSettlementCloseSource;
  readonly repository: CompetitionStakingSettlementSnapshotRepository;
  readonly drawSeed: string;
  readonly prepareSource?: () => Promise<void>;
  readonly now?: Date;
}) {
  const campaign = input.runtime.campaign;
  if (input.runtime.phase !== 'closed' || !campaign || campaign.eligibilityKind !== 'uki_staking') {
    throw new CompetitionSettlementCloseError(
      'competition_not_closed',
      'Treasure Hunt staking competition can only be settled after it is closed',
    );
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime()) || now.getTime() <= Date.parse(campaign.endsAt)) {
    throw new CompetitionSettlementCloseError(
      'competition_not_closed',
      'Staking settlement time must be after the campaign end',
    );
  }

  const existing = await input.repository.find(campaign.campaignId, campaign.rulesVersion);
  if (existing) {
    assertStoredSnapshot(existing, campaign);
    return { created: false, snapshot: cloneSnapshot(existing) };
  }

  await input.prepareSource?.();
  await input.source.assertReady(campaign, now);
  const [attemptRows, closeState] = await Promise.all([
    input.source.listAttempts({
      campaignId: campaign.campaignId,
      rulesVersion: campaign.rulesVersion,
      gameId: campaign.gameId,
      mode: campaign.mode,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      maxWinningAttemptsPerWallet: campaign.topAttemptsPerWallet,
    }),
    input.source.getCloseState(campaign, now),
  ]);
  const allAttempts = canonicalSettlementAttempts(attemptRows, campaign);
  const disqualified = new Set(
    closeState.disqualifiedWalletAddresses.map((walletAddress) => normalizeCompetitionWallet(walletAddress)),
  );
  const eligibleAttempts = allAttempts.filter(
    (attempt) => !disqualified.has(attempt.walletAddress),
  );
  const statusByAttemptId = new Map(
    eligibleAttempts.map((attempt) => [attempt.attemptId, attempt.status] as const),
  );
  const provisionalRanking = buildCompetitionRanking(
    eligibleAttempts.map((attempt) => attempt.status === 'review'
      ? { ...attempt, status: 'valid' as const }
      : attempt),
    campaign,
  );
  const pendingReview = provisionalRanking.find(
    (attempt) => statusByAttemptId.get(attempt.attemptId) === 'review',
  );
  if (pendingReview) {
    throw new CompetitionSettlementCloseError(
      'settlement_source_not_ready',
      `Attempt ${pendingReview.attemptId} is awaiting adjudication`,
    );
  }
  const ranking = buildCompetitionRanking(eligibleAttempts, campaign);
  let draw: CompetitionStakingDrawResult;
  try {
    draw = settleStakingCompetitionDraw({
      campaign,
      ranking,
      totalStakedUkiRaw: closeState.totalStakedUkiRaw,
      disqualifiedWalletAddresses: closeState.disqualifiedWalletAddresses,
      drawSeed: input.drawSeed,
    });
  } catch (error) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      error instanceof Error ? error.message : 'Invalid staking draw input',
    );
  }
  const schedule = createCompetitionVestingSchedule(campaign.endsAt, campaign);
  const vestingPlan: CompetitionVestingPlanEntry[] = draw.settlement.awards.map((award) => ({
    beneficiaryWalletAddress: award.walletAddress,
    amountUkiRaw: award.totalRewardUkiRaw,
    transactionStatus: 'not_submitted',
    schedule,
  }));
  const inputHash = hash({
    schemaVersion: STAKING_SETTLEMENT_SCHEMA_VERSION,
    campaign: campaignInput(campaign),
    attempts: eligibleAttempts,
    closeState,
    drawSeed: draw.drawSeed,
  });
  const candidateWithoutOutput = {
    schemaVersion: STAKING_SETTLEMENT_SCHEMA_VERSION,
    campaignId: campaign.campaignId,
    rulesVersion: campaign.rulesVersion,
    createdAt: now.toISOString(),
    inputHash,
    attemptRecordCount: allAttempts.length,
    eligibleAttemptCount: ranking.length,
    closeState,
    draw,
    vestingPlan,
  };
  const candidate: CompetitionStakingSettlementSnapshot = {
    ...candidateWithoutOutput,
    outputHash: hash(candidateWithoutOutput),
  };
  const persisted = await input.repository.saveIfAbsent(candidate);
  assertStoredSnapshot(persisted.snapshot, campaign);
  if (
    persisted.snapshot.inputHash !== inputHash ||
    persisted.snapshot.outputHash !== candidate.outputHash
  ) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Staking settlement input changed for ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }
  return persisted;
}
