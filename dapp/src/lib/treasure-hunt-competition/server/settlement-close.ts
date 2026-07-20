import { createHash } from 'node:crypto';

import {
  buildCompetitionRanking,
  createCompetitionVestingSchedule,
  isCompetitionWalletAddress,
  normalizeCompetitionWallet,
  parseCanonicalUtcDate,
  parseUkiRaw,
  settleCompetition,
  type CompetitionAttempt,
  type CompetitionConfig,
  type CompetitionSettlement,
  type CompetitionVestingSchedule,
} from '..';
import type { CompetitionRuntime } from './runtime';

const SETTLEMENT_SCHEMA_VERSION = 2 as const;
const SETTLEMENT_ALGORITHM_VERSION = 'treasure-hunt-presale-v1' as const;

export interface SettlementAttemptRecord extends CompetitionAttempt {
  readonly rulesVersion: string;
}

export interface SettlementPurchaseRecord {
  readonly eventId: string;
  readonly walletAddress: string;
  readonly ukiPurchasedRaw: string;
  readonly confirmedAt: string;
}

export interface SettlementParticipantRecord {
  readonly walletAddress: string;
  readonly lockedSponsorWalletAddress?: string | null;
}

export interface CompetitionSettlementCloseSource {
  assertReady?(campaign: CompetitionConfig): Promise<void>;
  listAttempts(input: {
    readonly campaignId: string;
    readonly rulesVersion: string;
    readonly gameId: string;
    readonly mode: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly maxWinningAttemptsPerWallet: number;
  }): Promise<readonly SettlementAttemptRecord[]>;
  listPurchases(input: {
    readonly presaleContractAddress: string;
    readonly startsAt: string;
    readonly endsAt: string;
  }): Promise<readonly SettlementPurchaseRecord[]>;
  listParticipants(input: {
    readonly walletAddresses: readonly string[];
  }): Promise<readonly SettlementParticipantRecord[]>;
}

export interface CompetitionSettlementManifest {
  readonly schemaVersion: typeof SETTLEMENT_SCHEMA_VERSION;
  readonly algorithmVersion: typeof SETTLEMENT_ALGORITHM_VERSION;
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly presaleContractAddress: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly attemptsHash: string;
  readonly purchasesHash: string;
  readonly participantsHash: string;
  readonly attemptRecordCount: number;
  readonly eligibleAttemptCount: number;
  readonly rankedAttemptCount: number;
  readonly purchaseEventCount: number;
  readonly participantCount: number;
}

export interface CompetitionSettlementAllocation {
  readonly walletAddress: string;
  readonly playerRewardUkiRaw: string;
  readonly sponsorRewardUkiRaw: string;
  readonly totalRewardUkiRaw: string;
  readonly playerAwardCount: number;
  readonly sponsoredAwardCount: number;
}

export interface CompetitionVestingPlanEntry {
  readonly beneficiaryWalletAddress: string;
  readonly amountUkiRaw: string;
  readonly transactionStatus: 'not_submitted';
  readonly schedule: CompetitionVestingSchedule;
}

export interface CompetitionSettlementSnapshot {
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly createdAt: string;
  readonly manifest: CompetitionSettlementManifest;
  readonly settlement: CompetitionSettlement;
  readonly allocations: readonly CompetitionSettlementAllocation[];
  readonly vestingPlan: readonly CompetitionVestingPlanEntry[];
}

export interface CompetitionSettlementSnapshotRepository {
  find(campaignId: string, rulesVersion: string): Promise<CompetitionSettlementSnapshot | null>;
  saveIfAbsent(snapshot: CompetitionSettlementSnapshot): Promise<{
    readonly created: boolean;
    readonly snapshot: CompetitionSettlementSnapshot;
  }>;
}

export type CompetitionSettlementCloseErrorCode =
  | 'competition_not_closed'
  | 'invalid_settlement_input'
  | 'settlement_source_not_ready'
  | 'settlement_input_conflict';

export class CompetitionSettlementCloseError extends Error {
  constructor(
    readonly code: CompetitionSettlementCloseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CompetitionSettlementCloseError';
  }
}

function cloneSnapshot(snapshot: CompetitionSettlementSnapshot): CompetitionSettlementSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as CompetitionSettlementSnapshot;
}

function snapshotKey(campaignId: string, rulesVersion: string) {
  return JSON.stringify([campaignId, rulesVersion]);
}

/**
 * Test/local repository with the same create-once contract expected from the
 * durable settlement store. `saveIfAbsent` is synchronous until its resolved
 * promise, so two concurrent calls cannot replace each other.
 */
export class InMemoryCompetitionSettlementRepository
implements CompetitionSettlementSnapshotRepository {
  private readonly snapshots = new Map<string, CompetitionSettlementSnapshot>();

  async find(campaignId: string, rulesVersion: string) {
    const snapshot = this.snapshots.get(snapshotKey(campaignId, rulesVersion));
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  async saveIfAbsent(snapshot: CompetitionSettlementSnapshot) {
    const key = snapshotKey(snapshot.campaignId, snapshot.rulesVersion);
    const existing = this.snapshots.get(key);
    if (existing) return { created: false, snapshot: cloneSnapshot(existing) };

    const stored = cloneSnapshot(snapshot);
    this.snapshots.set(key, stored);
    return { created: true, snapshot: cloneSnapshot(stored) };
  }
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

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function hash(value: unknown) {
  const digest = createHash('sha256')
    .update(stableJson(value))
    .digest('hex');
  return `sha256:${digest}`;
}

function invalidInput(message: string): never {
  throw new CompetitionSettlementCloseError('invalid_settlement_input', message);
}

function sourceNotReady(message: string): never {
  throw new CompetitionSettlementCloseError('settlement_source_not_ready', message);
}

function canonicalAttempts(
  attempts: readonly SettlementAttemptRecord[],
  campaign: CompetitionConfig,
) {
  const attemptIds = new Set<string>();

  return attempts
    .map((attempt) => {
      if (typeof attempt.attemptId !== 'string') {
        invalidInput('Competition attemptId must be a string');
      }
      const attemptId = attempt.attemptId.trim();
      if (!attemptId) invalidInput('Competition attemptId is required');
      if (attemptIds.has(attemptId)) {
        invalidInput(`Duplicate competition attemptId: ${attemptId}`);
      }
      attemptIds.add(attemptId);
      if (
        attempt.campaignId !== campaign.campaignId ||
        attempt.rulesVersion !== campaign.rulesVersion ||
        attempt.gameId !== campaign.gameId ||
        attempt.mode !== campaign.mode
      ) {
        invalidInput(`Attempt ${attemptId} does not match the immutable campaign`);
      }
      if (attempt.status !== 'review' && attempt.status !== 'valid') {
        invalidInput(`Attempt ${attemptId} has an invalid settlement status`);
      }

      if (typeof attempt.walletAddress !== 'string') {
        invalidInput(`Attempt ${attemptId} has an invalid wallet address`);
      }
      const walletAddress = normalizeCompetitionWallet(attempt.walletAddress);
      if (!isCompetitionWalletAddress(walletAddress)) {
        invalidInput(`Attempt ${attemptId} has an invalid wallet address`);
      }
      if (typeof attempt.playerAlias !== 'string' || !attempt.playerAlias.trim()) {
        invalidInput(`Attempt ${attemptId} has an invalid player alias`);
      }
      if (!Number.isSafeInteger(attempt.score) || attempt.score < 0) {
        invalidInput(`Attempt ${attemptId} has an invalid score`);
      }
      if (!Number.isSafeInteger(attempt.gameTimeMs) || attempt.gameTimeMs < 0) {
        invalidInput(`Attempt ${attemptId} has an invalid game time`);
      }

      let startedAt: Date;
      let finishedAt: Date;
      try {
        startedAt = parseCanonicalUtcDate(attempt.startedAt, `Attempt ${attemptId} startedAt`);
        if (!attempt.finishedAt) throw new Error(`Attempt ${attemptId} finishedAt is required`);
        finishedAt = parseCanonicalUtcDate(attempt.finishedAt, `Attempt ${attemptId} finishedAt`);
      } catch (error) {
        invalidInput(error instanceof Error ? error.message : `Attempt ${attemptId} has invalid dates`);
      }
      if (
        startedAt.getTime() < Date.parse(campaign.startsAt) ||
        finishedAt.getTime() > Date.parse(campaign.endsAt) ||
        finishedAt.getTime() < startedAt.getTime()
      ) {
        invalidInput(`Attempt ${attemptId} falls outside the campaign window`);
      }

      return {
        attemptId,
        campaignId: attempt.campaignId,
        rulesVersion: attempt.rulesVersion,
        gameId: attempt.gameId,
        mode: attempt.mode,
        walletAddress,
        playerAlias: attempt.playerAlias,
        score: attempt.score,
        gameTimeMs: attempt.gameTimeMs,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        status: attempt.status,
      };
    })
    .sort((left, right) => (
      left.attemptId.localeCompare(right.attemptId, 'en') ||
      left.walletAddress.localeCompare(right.walletAddress, 'en') ||
      stableJson(left).localeCompare(stableJson(right), 'en')
    ));
}

function canonicalPurchases(
  purchases: readonly SettlementPurchaseRecord[],
  campaign: CompetitionConfig,
) {
  const startsAtMs = Date.parse(campaign.startsAt);
  const endsAtMs = Date.parse(campaign.endsAt);
  const relevant: SettlementPurchaseRecord[] = [];
  const eventIds = new Set<string>();

  for (const purchase of purchases) {
    let confirmedAt: Date;
    try {
      confirmedAt = parseCanonicalUtcDate(purchase.confirmedAt, 'Purchase confirmedAt');
    } catch (error) {
      invalidInput(error instanceof Error ? error.message : 'Invalid purchase confirmation date');
    }
    if (confirmedAt.getTime() < startsAtMs || confirmedAt.getTime() > endsAtMs) continue;

    if (typeof purchase.eventId !== 'string') {
      invalidInput('Purchase eventId must be a string');
    }
    const eventId = purchase.eventId.trim();
    if (!eventId) invalidInput('Purchase eventId is required');
    if (eventIds.has(eventId)) invalidInput(`Duplicate purchase eventId: ${eventId}`);
    eventIds.add(eventId);

    if (typeof purchase.walletAddress !== 'string') {
      invalidInput(`Invalid purchase wallet address for event ${eventId}`);
    }
    const walletAddress = normalizeCompetitionWallet(purchase.walletAddress);
    if (!isCompetitionWalletAddress(walletAddress)) {
      invalidInput(`Invalid purchase wallet address for event ${eventId}`);
    }
    if (typeof purchase.ukiPurchasedRaw !== 'string') {
      invalidInput(`Invalid UKI raw amount for purchase event ${eventId}`);
    }
    try {
      parseUkiRaw(purchase.ukiPurchasedRaw);
    } catch {
      invalidInput(`Invalid UKI raw amount for purchase event ${eventId}`);
    }

    relevant.push({
      eventId,
      walletAddress,
      ukiPurchasedRaw: purchase.ukiPurchasedRaw,
      confirmedAt: confirmedAt.toISOString(),
    });
  }

  return relevant.sort((left, right) => (
    left.eventId.localeCompare(right.eventId, 'en') ||
    left.confirmedAt.localeCompare(right.confirmedAt, 'en') ||
    left.walletAddress.localeCompare(right.walletAddress, 'en')
  ));
}

function canonicalParticipantSponsors(
  participants: readonly SettlementParticipantRecord[],
  purchasedWallets: readonly string[],
) {
  const purchasedWalletSet = new Set(purchasedWallets);
  const participantByWallet = new Map<string, string | null>();

  for (const participant of participants) {
    if (typeof participant.walletAddress !== 'string') {
      invalidInput('Invalid presale participant wallet address');
    }
    const walletAddress = normalizeCompetitionWallet(participant.walletAddress);
    if (!isCompetitionWalletAddress(walletAddress)) {
      invalidInput('Invalid presale participant wallet address');
    }
    if (!purchasedWalletSet.has(walletAddress)) {
      invalidInput(`Unexpected presale participant for ${walletAddress}`);
    }
    if (participantByWallet.has(walletAddress)) {
      invalidInput(`Duplicate presale participant for ${walletAddress}`);
    }

    if (
      participant.lockedSponsorWalletAddress !== null &&
      participant.lockedSponsorWalletAddress !== undefined &&
      typeof participant.lockedSponsorWalletAddress !== 'string'
    ) {
      invalidInput(`Invalid locked sponsor attribution for ${walletAddress}`);
    }
    const sponsorCandidate = participant.lockedSponsorWalletAddress?.trim()
      ? normalizeCompetitionWallet(participant.lockedSponsorWalletAddress)
      : null;
    if (sponsorCandidate && (
      !isCompetitionWalletAddress(sponsorCandidate) || sponsorCandidate === walletAddress
    )) {
      invalidInput(`Invalid locked sponsor attribution for ${walletAddress}`);
    }
    participantByWallet.set(walletAddress, sponsorCandidate);
  }

  for (const walletAddress of purchasedWalletSet) {
    if (!participantByWallet.has(walletAddress)) {
      invalidInput(`Missing presale participant for ${walletAddress}`);
    }
  }

  const sponsorByWallet = new Map<string, string | null>();
  const canonical = [...purchasedWalletSet]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((walletAddress) => {
      const lockedSponsorWalletAddress = participantByWallet.get(walletAddress) as string | null;
      sponsorByWallet.set(walletAddress, lockedSponsorWalletAddress);
      return { walletAddress, lockedSponsorWalletAddress };
    });

  return {
    canonical,
    participantCount: participantByWallet.size,
    sponsorByWallet,
  };
}

interface MutableAllocation {
  walletAddress: string;
  playerReward: bigint;
  sponsorReward: bigint;
  playerAwardCount: number;
  sponsoredAwardCount: number;
}

function aggregateAllocations(settlement: CompetitionSettlement) {
  const byWallet = new Map<string, MutableAllocation>();
  const get = (walletAddress: string) => {
    const existing = byWallet.get(walletAddress);
    if (existing) return existing;
    const created: MutableAllocation = {
      walletAddress,
      playerReward: BigInt(0),
      sponsorReward: BigInt(0),
      playerAwardCount: 0,
      sponsoredAwardCount: 0,
    };
    byWallet.set(walletAddress, created);
    return created;
  };

  for (const award of settlement.awards) {
    const player = get(award.walletAddress);
    player.playerReward += parseUkiRaw(award.playerRewardUkiRaw);
    player.playerAwardCount += 1;

    if (award.sponsorWalletAddress && award.sponsorRewardUkiRaw !== '0') {
      const sponsor = get(award.sponsorWalletAddress);
      sponsor.sponsorReward += parseUkiRaw(award.sponsorRewardUkiRaw);
      sponsor.sponsoredAwardCount += 1;
    }
  }

  return [...byWallet.values()]
    .sort((left, right) => left.walletAddress.localeCompare(right.walletAddress, 'en'))
    .map<CompetitionSettlementAllocation>((allocation) => ({
      walletAddress: allocation.walletAddress,
      playerRewardUkiRaw: allocation.playerReward.toString(),
      sponsorRewardUkiRaw: allocation.sponsorReward.toString(),
      totalRewardUkiRaw: (allocation.playerReward + allocation.sponsorReward).toString(),
      playerAwardCount: allocation.playerAwardCount,
      sponsoredAwardCount: allocation.sponsoredAwardCount,
    }));
}

function campaignHashInput(campaign: CompetitionConfig) {
  return {
    campaignId: campaign.campaignId,
    gameId: campaign.gameId,
    mode: campaign.mode,
    rulesVersion: campaign.rulesVersion,
    presaleContractAddress: campaign.presaleContractAddress,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    poolBps: campaign.poolBps,
    playerRewardBps: campaign.playerRewardBps,
    sponsorRewardBps: campaign.sponsorRewardBps,
    maxWinningAttemptsPerWallet: campaign.maxWinningAttemptsPerWallet,
    cliffMonths: campaign.cliffMonths,
    vestingMonths: campaign.vestingMonths,
  };
}

function assertSnapshotMatchesCampaign(
  snapshot: CompetitionSettlementSnapshot,
  campaign: CompetitionConfig,
) {
  const manifest = snapshot.manifest;
  if (
    snapshot.campaignId !== campaign.campaignId ||
    snapshot.rulesVersion !== campaign.rulesVersion ||
    manifest.schemaVersion !== SETTLEMENT_SCHEMA_VERSION ||
    manifest.algorithmVersion !== SETTLEMENT_ALGORITHM_VERSION ||
    manifest.campaignId !== campaign.campaignId ||
    manifest.rulesVersion !== campaign.rulesVersion ||
    manifest.presaleContractAddress !== campaign.presaleContractAddress ||
    manifest.startsAt !== campaign.startsAt ||
    manifest.endsAt !== campaign.endsAt ||
    snapshot.settlement.campaignId !== campaign.campaignId
  ) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Stored settlement does not match ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }

  const { outputHash: declaredOutputHash, ...manifestWithoutOutputHash } = manifest;
  const computedOutputHash = hash({
    manifest: manifestWithoutOutputHash,
    settlement: snapshot.settlement,
    allocations: snapshot.allocations,
    vestingPlan: snapshot.vestingPlan,
  });
  if (computedOutputHash !== declaredOutputHash) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Stored settlement output is corrupt for ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }
}

export async function closeTreasureHuntCompetition(input: {
  readonly runtime: CompetitionRuntime;
  readonly source: CompetitionSettlementCloseSource;
  readonly repository: CompetitionSettlementSnapshotRepository;
  readonly prepareSource?: () => Promise<void>;
  readonly now?: Date;
}) {
  if (input.runtime.phase !== 'closed' || !input.runtime.campaign) {
    throw new CompetitionSettlementCloseError(
      'competition_not_closed',
      'Treasure Hunt competition can only be settled after it is closed',
    );
  }

  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) invalidInput('Settlement time must be a valid date');
  const campaign = input.runtime.campaign;
  if (now.getTime() <= Date.parse(campaign.endsAt)) {
    throw new CompetitionSettlementCloseError(
      'competition_not_closed',
      'Settlement time must be after the campaign end',
    );
  }

  const existing = await input.repository.find(campaign.campaignId, campaign.rulesVersion);
  if (existing) {
    assertSnapshotMatchesCampaign(existing, campaign);
    return { created: false, snapshot: cloneSnapshot(existing) };
  }

  // Recovery/fencing work belongs only to the first close. An exact replay of
  // an already persisted snapshot must remain readable even if live gameplay
  // collections or proof configuration are no longer available.
  await input.prepareSource?.();
  await input.source.assertReady?.(campaign);

  const [attemptRows, purchaseRows] = await Promise.all([
    input.source.listAttempts({
      campaignId: campaign.campaignId,
      rulesVersion: campaign.rulesVersion,
      gameId: campaign.gameId,
      mode: campaign.mode,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      maxWinningAttemptsPerWallet: campaign.maxWinningAttemptsPerWallet,
    }),
    input.source.listPurchases({
      presaleContractAddress: campaign.presaleContractAddress,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    }),
  ]);
  const allAttempts = canonicalAttempts(attemptRows, campaign);
  const purchases = canonicalPurchases(purchaseRows, campaign);
  const purchasedWallets = [...new Set(purchases.map((purchase) => purchase.walletAddress))]
    .sort((left, right) => left.localeCompare(right, 'en'));
  const participantRows = purchasedWallets.length > 0
    ? await input.source.listParticipants({ walletAddresses: purchasedWallets })
    : [];
  const participantInput = canonicalParticipantSponsors(participantRows, purchasedWallets);

  // Client gameplay is never allowed to become an automatic economic fact.
  // Finished attempts enter a provisional `review` state and only an explicit
  // internal adjudication can promote them to `valid`. We inspect the combined
  // top five per wallet so a higher pending attempt cannot be silently skipped
  // in favour of a lower approved attempt during settlement.
  const purchasedWalletsWithValue = new Set(
    purchases
      .filter((purchase) => parseUkiRaw(purchase.ukiPurchasedRaw) > BigInt(0))
      .map((purchase) => purchase.walletAddress),
  );
  // Attempts from wallets with no positive purchase remain in the public game
  // ranking, but they cannot affect or later mutate the create-once economic
  // snapshot after the purchase window has closed.
  const attempts = allAttempts.filter((attempt) => (
    purchasedWalletsWithValue.has(attempt.walletAddress)
  ));
  const statusByAttemptId = new Map(attempts.map((attempt) => [attempt.attemptId, attempt.status]));
  const provisionalRanking = buildCompetitionRanking(
    attempts.map((attempt) => (
      attempt.status === 'review' ? { ...attempt, status: 'valid' as const } : attempt
    )),
    campaign,
  );
  const pendingEconomicReview = provisionalRanking.find((attempt) => (
    statusByAttemptId.get(attempt.attemptId) === 'review' &&
    purchasedWalletsWithValue.has(attempt.walletAddress)
  ));
  if (pendingEconomicReview) {
    sourceNotReady(`Attempt ${pendingEconomicReview.attemptId} is awaiting adjudication`);
  }

  const ranking = buildCompetitionRanking(attempts, campaign);
  const settlement = settleCompetition({
    campaign,
    ranking,
    purchases: purchases.map((purchase) => ({
      walletAddress: purchase.walletAddress,
      ukiPurchasedRaw: purchase.ukiPurchasedRaw,
      sponsorWalletAddress: participantInput.sponsorByWallet.get(purchase.walletAddress) ?? null,
    })),
  });
  const allocations = aggregateAllocations(settlement);
  const schedule = createCompetitionVestingSchedule(campaign.endsAt, campaign);
  const vestingPlan: CompetitionVestingPlanEntry[] = allocations.map((allocation) => ({
    beneficiaryWalletAddress: allocation.walletAddress,
    amountUkiRaw: allocation.totalRewardUkiRaw,
    transactionStatus: 'not_submitted',
    schedule,
  }));

  const attemptsHash = hash(attempts);
  const purchasesHash = hash(purchases);
  const participantsHash = hash(participantInput.canonical);
  const inputHash = hash({
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    algorithmVersion: SETTLEMENT_ALGORITHM_VERSION,
    campaign: campaignHashInput(campaign),
    attemptsHash,
    purchasesHash,
    participantsHash,
  });
  const manifestWithoutOutputHash = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    algorithmVersion: SETTLEMENT_ALGORITHM_VERSION,
    campaignId: campaign.campaignId,
    rulesVersion: campaign.rulesVersion,
    presaleContractAddress: campaign.presaleContractAddress,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    inputHash,
    attemptsHash,
    purchasesHash,
    participantsHash,
    attemptRecordCount: attempts.length,
    eligibleAttemptCount: ranking.length,
    rankedAttemptCount: ranking.length,
    purchaseEventCount: purchases.length,
    participantCount: participantInput.participantCount,
  };
  const outputHash = hash({
    manifest: manifestWithoutOutputHash,
    settlement,
    allocations,
    vestingPlan,
  });
  const manifest: CompetitionSettlementManifest = {
    ...manifestWithoutOutputHash,
    outputHash,
  };
  const candidate: CompetitionSettlementSnapshot = {
    campaignId: campaign.campaignId,
    rulesVersion: campaign.rulesVersion,
    createdAt: now.toISOString(),
    manifest,
    settlement,
    allocations,
    vestingPlan,
  };

  const persisted = await input.repository.saveIfAbsent(candidate);
  if (persisted.snapshot.manifest.inputHash !== inputHash) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Settlement input changed for ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }
  assertSnapshotMatchesCampaign(persisted.snapshot, campaign);
  if (persisted.snapshot.manifest.outputHash !== outputHash) {
    throw new CompetitionSettlementCloseError(
      'settlement_input_conflict',
      `Settlement output changed for ${campaign.campaignId}/${campaign.rulesVersion}`,
    );
  }
  return persisted;
}
