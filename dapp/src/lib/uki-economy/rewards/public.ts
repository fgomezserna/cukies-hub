import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getAddress, isAddress, type Hex } from 'viem';
import type { Filter } from 'mongodb';

import { DomainConflictError, DomainValidationError } from '../errors';
import { validRewardWallet } from './rules';
import { rewardHashPair, rewardLeafHash } from './merkle';
import { stableRewardHash } from './rules';
import {
  assertWeeklyPrizeAccountingIntegrity,
  sealDailyRewardAccounting,
} from './accounting';
import {
  validateRewardAllocationDocument,
  validateRewardSourceManifest,
} from './service';
import type {
  DailyRewardAccounting,
  RewardAccountingAllocationDocument,
  WeeklyPrizeAccounting,
} from './accounting-types';
import type {
  RewardAllocation,
  RewardClaim,
  RewardClaimBatch,
  RewardClaimProof,
  RewardSourceManifest,
} from './types';

const BYTES32 = /^0x[0-9a-f]{64}$/i;
const RAW = /^(0|[1-9][0-9]*)$/;
const MAX_WALLET_PROOFS = 1_000;
const MAX_WALLET_ACCOUNTING_ALLOCATIONS = 100_000;
const MAX_WALLET_CLAIMS = 100_000;
const MAX_WALLET_CLAIM_HISTORY = 100;
const CLAIMABLE_ACCOUNTING_CATEGORIES = [
  'player',
  'credit_pool',
  'cukie_pool_original',
  'cukie_pool_second_plus',
  'ambassador_ordinary',
  'ambassador_weekly',
] as const;
const CLAIMABLE_ACCOUNTING_CATEGORY_SET = new Set<string>(
  CLAIMABLE_ACCOUNTING_CATEGORIES,
);
const ACCOUNTING_CATEGORY_SET = new Set<string>([
  ...CLAIMABLE_ACCOUNTING_CATEGORIES,
  'treasury',
  'marketing_development',
  'supply_reduction',
]);
const AMBASSADOR_ACCOUNTING_CATEGORY_SET = new Set<string>([
  'ambassador_ordinary',
  'ambassador_weekly',
]);
const PUBLICATION_PLAN_STATUSES = new Set([
  'prepared',
  'processing',
  'awaiting_projection',
  'completed',
  'blocked',
]);

export type RewardPublicationState =
  | 'calculated'
  | 'pending_publication'
  | 'scheduled'
  | 'claimable'
  | 'claimed'
  | 'expired'
  | 'unknown';

type RewardPublicationPlanDocument = {
  _id?: string;
  planId?: string;
  accountingId: string;
  accountingKind?: 'daily' | 'weekly';
  periodId?: string;
  chainId?: number;
  tokenAddress?: string;
  distributorAddress?: string;
  sourceAllocationSetHash?: string;
  accountingPayloadHash?: string;
  ruleVersion?: string;
  ruleConfigHash?: string;
  sourceAllocationIds?: string[];
  batchId?: `0x${string}` | null;
  draftKey?: string | null;
  claimableTotalRaw?: string;
  treasuryRaw?: string;
  marketingDevelopmentRaw?: string;
  supplyReductionRaw?: string;
  totalRaw?: string;
  operations?: Array<{
    kind: string;
    amountRaw: string;
    to?: string | null;
  }>;
  payloadHash?: string;
  status: string;
};

function assertRewardProof(
  batch: RewardClaimBatch,
  proof: RewardClaimProof,
  expectedWallet: string,
) {
  const walletNormalized = validRewardWallet(proof.walletAddress);
  const expectedProofId = stableRewardHash({
    kind: 'reward-claim-proof-id',
    batchId: batch.batchId,
    walletNormalized: expectedWallet,
  });
  const immutableProof = {
    proofId: proof.proofId,
    batchId: proof.batchId,
    periodId: proof.periodId,
    walletAddress: proof.walletAddress,
    walletNormalized: proof.walletNormalized,
    amountRaw: proof.amountRaw,
    leaf: proof.leaf,
    proof: proof.proof,
  };
  if (
    proof._id !== expectedProofId ||
    proof.proofId !== expectedProofId ||
    proof.batchId.toLowerCase() !== batch.batchId.toLowerCase() ||
    proof.periodId !== batch.periodId ||
    walletNormalized !== proof.walletNormalized ||
    proof.walletNormalized !== expectedWallet ||
    !RAW.test(proof.amountRaw) ||
    BigInt(proof.amountRaw) <= BigInt(0) ||
    !BYTES32.test(proof.leaf) ||
    !Array.isArray(proof.proof) ||
    proof.proof.some((sibling) => !BYTES32.test(sibling)) ||
    !(proof.createdAt instanceof Date) ||
    proof.payloadHash !==
      stableRewardHash({ kind: 'reward-claim-proof', ...immutableProof })
  ) {
    throw new DomainConflictError(`Proof ${proof._id} no es canonico.`);
  }
  const expectedLeaf = rewardLeafHash(
    batch.chainId,
    getAddress(batch.distributorAddress),
    batch.batchId as Hex,
    getAddress(proof.walletAddress),
    proof.amountRaw,
  );
  const root = proof.proof.reduce(
    (node, sibling) => rewardHashPair(node, sibling),
    proof.leaf as Hex,
  );
  if (
    proof.leaf.toLowerCase() !== expectedLeaf.toLowerCase() ||
    root.toLowerCase() !== batch.merkleRoot.toLowerCase()
  ) {
    throw new DomainConflictError(
      `Proof ${proof._id} no alcanza el root publicado.`,
    );
  }
}

function assertPublicationProjection(
  batch: RewardClaimBatch,
  event: Record<string, unknown>,
) {
  if (
    (batch.status !== 'published' && batch.status !== 'closed') ||
    batch.previewOnly !== false ||
    batch.publishAuthorized !== true ||
    batch.signature !== null ||
    batch.proofCollection !== 'reward_claim_proofs' ||
    !BYTES32.test(batch.batchId) ||
    !BYTES32.test(batch.merkleRoot) ||
    !BYTES32.test(batch.canonicalInputHash) ||
    !BYTES32.test(batch.metadataHash) ||
    !RAW.test(batch.totalAllocatedRaw) ||
    BigInt(batch.totalAllocatedRaw) <= BigInt(0) ||
    !/^[0-9a-f]{64}$/.test(batch.proofSetHash) ||
    !isAddress(batch.distributorAddress) ||
    (batch.chainId !== 56 && batch.chainId !== 97) ||
    !batch.publicationEventId ||
    batch.transactionHash !== batch.publicationTransactionHash ||
    batch.publishedBatchId?.toLowerCase() !== batch.batchId.toLowerCase() ||
    batch.publishedMerkleRoot?.toLowerCase() !==
      batch.merkleRoot.toLowerCase() ||
    batch.publishedInputHash?.toLowerCase() !==
      batch.canonicalInputHash.toLowerCase() ||
    batch.publishedMetadataHash?.toLowerCase() !==
      batch.metadataHash.toLowerCase() ||
    batch.publishedTotalAllocatedRaw !== batch.totalAllocatedRaw ||
    batch.publishedProofSetHash !== batch.proofSetHash ||
    batch.publishedPeriodSealId !== batch.periodSealId ||
    !RAW.test(batch.startsAtRaw ?? '') ||
    !RAW.test(batch.expiresAtRaw ?? '') ||
    BigInt(batch.expiresAtRaw!) <= BigInt(batch.startsAtRaw!) ||
    !(batch.startsAt instanceof Date) ||
    !(batch.expiresAt instanceof Date) ||
    BigInt(batch.startsAt.getTime()) !==
      BigInt(batch.startsAtRaw!) * BigInt(1_000) ||
    BigInt(batch.expiresAt.getTime()) !==
      BigInt(batch.expiresAtRaw!) * BigInt(1_000) ||
    event._id !== batch.publicationEventId ||
    event.chain !== 'BSC' ||
    event.contractAlias !== 'REWARDS_DISTRIBUTOR' ||
    event.eventName !== 'BatchPublished' ||
    event.status !== 'projected' ||
    event.txHash !== batch.publicationTransactionHash ||
    event.blockHash !== batch.publicationBlockHash ||
    event.blockNumber !== batch.publicationBlockNumber ||
    event.logIndex !== batch.publicationLogIndex ||
    typeof event.contractAddress !== 'string' ||
    event.contractAddress.toLowerCase() !==
      batch.distributorAddress.toLowerCase()
  ) {
    throw new DomainConflictError(
      `Batch ${batch.batchId} no tiene publicacion canonica.`,
    );
  }
  const normalized = event.normalized;
  if (
    !normalized ||
    typeof normalized !== 'object' ||
    Array.isArray(normalized)
  ) {
    throw new DomainConflictError(
      `Publicacion ${batch.publicationEventId} sin payload normalizado.`,
    );
  }
  const payload = normalized as Record<string, unknown>;
  if (
    typeof payload.batchId !== 'string' ||
    payload.batchId.toLowerCase() !== batch.batchId.toLowerCase() ||
    typeof payload.merkleRoot !== 'string' ||
    payload.merkleRoot.toLowerCase() !== batch.merkleRoot.toLowerCase() ||
    typeof payload.inputHash !== 'string' ||
    payload.inputHash.toLowerCase() !==
      batch.canonicalInputHash.toLowerCase() ||
    typeof payload.metadataHash !== 'string' ||
    payload.metadataHash.toLowerCase() !== batch.metadataHash.toLowerCase() ||
    payload.totalAllocatedRaw !== batch.totalAllocatedRaw ||
    payload.startsAtRaw !== batch.startsAtRaw ||
    payload.expiresAtRaw !== batch.expiresAtRaw
  ) {
    throw new DomainConflictError(
      `Publicacion ${batch.publicationEventId} no coincide con el batch.`,
    );
  }
}

export function validatePublishedRewardClaimable(input: {
  batch: RewardClaimBatch;
  proof: RewardClaimProof;
  publicationEvent: Record<string, unknown>;
  expectedWallet: string;
  now: Date;
}) {
  try {
    const walletNormalized = validRewardWallet(input.expectedWallet);
    assertPublicationProjection(input.batch, input.publicationEvent);
    assertRewardProof(input.batch, input.proof, walletNormalized);
    if (
      input.batch.status !== 'published' ||
      input.batch.closed !== false ||
      !(input.now instanceof Date) ||
      Number.isNaN(input.now.getTime())
    ) {
      throw new DomainConflictError(
        `Batch ${input.batch.batchId} no esta publicado y abierto.`,
      );
    }
    const onChainStatus =
      input.now.getTime() < input.batch.startsAt!.getTime()
        ? ('scheduled' as const)
        : input.now.getTime() >= input.batch.expiresAt!.getTime()
        ? ('expired' as const)
        : ('claimable' as const);
    return {
      batch: {
        batchId: input.batch.batchId,
        periodId: input.batch.periodId,
        chainId: input.batch.chainId,
        distributorAddress: getAddress(input.batch.distributorAddress),
        merkleRoot: input.batch.merkleRoot,
        amountRaw: input.proof.amountRaw,
        startsAt: input.batch.startsAt,
        expiresAt: input.batch.expiresAt,
        publicationTransactionHash: input.batch.publicationTransactionHash!,
      },
      proof: {
        proofId: input.proof.proofId,
        leaf: input.proof.leaf,
        siblings: [...input.proof.proof],
      },
      onChainStatus,
    };
  } catch (error) {
    if (error instanceof DomainConflictError) throw error;
    throw new DomainConflictError(
      `Batch/proof de ${input.expectedWallet} contiene datos corruptos.`,
    );
  }
}

function validatePublishedRewardState(input: {
  batch: RewardClaimBatch;
  proof: RewardClaimProof;
  publicationEvent: Record<string, unknown>;
  expectedWallet: string;
  now: Date;
}) {
  if (input.batch.status === 'published' && input.batch.closed === false) {
    return validatePublishedRewardClaimable(input);
  }
  // A closed batch remains valid evidence of a published allocation, but its
  // unclaimed amount has already returned to the configured destination. It
  // must be shown as expired, never as claimable.
  assertPublicationProjection(input.batch, input.publicationEvent);
  assertRewardProof(
    input.batch,
    input.proof,
    validRewardWallet(input.expectedWallet),
  );
  if (input.batch.status !== 'closed') {
    throw new DomainConflictError(
      `Batch ${input.batch.batchId} no tiene un cierre canonico.`,
    );
  }
  return {
    batch: {
      batchId: input.batch.batchId,
      periodId: input.batch.periodId,
      chainId: input.batch.chainId,
      distributorAddress: getAddress(input.batch.distributorAddress),
      merkleRoot: input.batch.merkleRoot,
      amountRaw: input.proof.amountRaw,
      startsAt: input.batch.startsAt,
      expiresAt: input.batch.expiresAt,
      publicationTransactionHash: input.batch.publicationTransactionHash!,
    },
    proof: {
      proofId: input.proof.proofId,
      leaf: input.proof.leaf,
      siblings: [...input.proof.proof],
    },
    onChainStatus: 'expired' as const,
  };
}

function assertClaimProjectionUnsafe(input: {
  claim: RewardClaim;
  batch: RewardClaimBatch | undefined;
  proof: RewardClaimProof | undefined;
  event: Record<string, unknown> | undefined;
  expectedWallet: string;
}) {
  const { claim, batch, proof, event, expectedWallet } = input;
  if (
    claim._id !== claim.eventId ||
    claim.chain !== 'BSC' ||
    !isAddress(claim.contractAddress) ||
    !isAddress(claim.walletAddress) ||
    validRewardWallet(claim.walletAddress) !== claim.walletNormalized ||
    claim.walletNormalized !== expectedWallet ||
    !BYTES32.test(claim.batchId) ||
    !RAW.test(claim.amountRaw) ||
    BigInt(claim.amountRaw) <= BigInt(0) ||
    !BYTES32.test(claim.transactionHash) ||
    !BYTES32.test(claim.blockHash) ||
    !Number.isSafeInteger(claim.blockNumber) ||
    claim.blockNumber < 0 ||
    !Number.isSafeInteger(claim.logIndex) ||
    claim.logIndex < 0 ||
    !(claim.indexedAt instanceof Date) ||
    !(claim.createdAt instanceof Date)
  ) {
    throw new DomainConflictError(`Claim ${claim._id} no es canonico.`);
  }
  if (
    !batch ||
    (batch.status !== 'published' && batch.status !== 'closed') ||
    (batch.chainId !== 56 && batch.chainId !== 97) ||
    batch.batchId.toLowerCase() !== claim.batchId.toLowerCase() ||
    batch.distributorAddress.toLowerCase() !==
      claim.contractAddress.toLowerCase() ||
    !proof ||
    proof.batchId.toLowerCase() !== claim.batchId.toLowerCase() ||
    proof.walletNormalized !== claim.walletNormalized ||
    proof.amountRaw !== claim.amountRaw
  ) {
    throw new DomainConflictError(
      `Claim ${claim._id} no liga batch/proof publicados.`,
    );
  }
  assertRewardProof(batch, proof, claim.walletNormalized);
  if (
    !event ||
    event._id !== claim.eventId ||
    event.chain !== 'BSC' ||
    event.contractAlias !== 'REWARDS_DISTRIBUTOR' ||
    event.eventName !== 'RewardClaimed' ||
    event.status !== 'projected' ||
    event.txHash !== claim.transactionHash ||
    event.blockHash !== claim.blockHash ||
    event.blockNumber !== claim.blockNumber ||
    event.logIndex !== claim.logIndex ||
    typeof event.contractAddress !== 'string' ||
    event.contractAddress.toLowerCase() !== claim.contractAddress.toLowerCase()
  ) {
    throw new DomainConflictError(
      `Claim ${claim._id} no tiene evento BSC proyectado.`,
    );
  }
  const normalized = event.normalized;
  if (
    !normalized ||
    typeof normalized !== 'object' ||
    Array.isArray(normalized)
  ) {
    throw new DomainConflictError(
      `Evento ${claim.eventId} no tiene payload normalizado.`,
    );
  }
  const payload = normalized as Record<string, unknown>;
  if (
    typeof payload.batchId !== 'string' ||
    payload.batchId.toLowerCase() !== claim.batchId.toLowerCase() ||
    payload.accountNormalized !== claim.walletNormalized ||
    payload.amountRaw !== claim.amountRaw
  ) {
    throw new DomainConflictError(
      `Evento ${claim.eventId} no coincide con el claim.`,
    );
  }
}

function assertClaimProjection(
  input: Parameters<typeof assertClaimProjectionUnsafe>[0],
) {
  try {
    return assertClaimProjectionUnsafe(input);
  } catch (error) {
    if (error instanceof DomainConflictError) throw error;
    throw new DomainConflictError(
      `Claim ${input.claim._id} contiene datos corruptos.`,
    );
  }
}

function validCursor(value?: string | null) {
  const cursor = value?.trim() || null;
  if (cursor && (cursor.length > 256 || !/^[A-Za-z0-9:._-]+$/.test(cursor))) {
    throw new DomainValidationError('cursor no es valido.');
  }
  return cursor;
}

/**
 * The accounting allocation view is the only source that can be promoted to
 * a public claim. Keep this validator next to the public read so a malformed
 * row never becomes a wallet balance or a claimable amount.
 */
export function validateRewardAccountingAllocationDocument(
  allocation: RewardAccountingAllocationDocument,
) {
  try {
    const immutable = {
      accountingId: allocation.accountingId,
      accountingKind: allocation.accountingKind,
      periodId: allocation.periodId,
      allocationId: allocation.allocationId,
      walletNormalized: allocation.walletNormalized,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
      fundingMode: allocation.fundingMode,
      sourceIds: allocation.sourceIds,
      availableAt: allocation.availableAt,
      status: allocation.status,
      createdAt: allocation.createdAt,
    };
    return (
      allocation._id === allocation.allocationId &&
      /^[0-9a-f]{64}$/.test(allocation.allocationId) &&
      typeof allocation.accountingId === 'string' &&
      allocation.accountingId.length > 0 &&
      allocation.accountingId.length <= 256 &&
      (allocation.accountingKind === 'daily' ||
        allocation.accountingKind === 'weekly') &&
      typeof allocation.periodId === 'string' &&
      allocation.periodId.length > 0 &&
      allocation.periodId.length <= 256 &&
      validRewardWallet(allocation.walletNormalized) ===
        allocation.walletNormalized &&
      ACCOUNTING_CATEGORY_SET.has(allocation.category) &&
      RAW.test(allocation.amountRaw) &&
      BigInt(allocation.amountRaw) > BigInt(0) &&
      (allocation.fundingMode === 'daily_emission' ||
        allocation.fundingMode === 'reserved_no_mint') &&
      Array.isArray(allocation.sourceIds) &&
      allocation.sourceIds.length > 0 &&
      allocation.sourceIds.every(
        (sourceId) =>
          typeof sourceId === 'string' &&
          sourceId.length > 0 &&
          sourceId.length <= 256,
      ) &&
      new Set(allocation.sourceIds).size === allocation.sourceIds.length &&
      allocation.availableAt instanceof Date &&
      !Number.isNaN(allocation.availableAt.getTime()) &&
      allocation.status === 'allocated_offchain' &&
      allocation.createdAt instanceof Date &&
      !Number.isNaN(allocation.createdAt.getTime()) &&
      allocation.availableAt.getTime() >= allocation.createdAt.getTime() &&
      allocation.payloadHash ===
        stableRewardHash({
          kind: 'reward-accounting-allocation-document',
          ...immutable,
        })
    );
  } catch {
    return false;
  }
}

function assertDailyRewardAccountingIntegrity(
  accounting: DailyRewardAccounting,
) {
  try {
    const canonical = sealDailyRewardAccounting({
      dayId: accounting.dayId,
      ...(accounting.calendar ? { calendar: accounting.calendar } : {}),
      ruleVersion: accounting.ruleVersion,
      ruleConfigHash: accounting.ruleConfigHash,
      emissionRaw: accounting.emissionRaw,
      buckets: accounting.buckets,
      sourceIds: accounting.sourceIds,
      sourceReservedRaw: accounting.sourceReservedRaw,
      capacityMaterializedRaw: accounting.capacityMaterializedRaw,
      priorReservedInflowRaw: accounting.priorReservedInflowRaw,
      topupRaw: accounting.topupRaw,
      priorReservedUndistributedRaw:
        accounting.priorReservedUndistributed.totalRaw,
      allocations: accounting.allocations,
      destinations: accounting.destinations,
      sealedAt: accounting.sealedAt,
    });
    if (stableRewardHash(canonical) !== stableRewardHash(accounting)) {
      throw new DomainConflictError(
        `El cierre diario ${accounting._id} no es canonico.`,
      );
    }
    return accounting;
  } catch (error) {
    if (error instanceof DomainConflictError) throw error;
    throw new DomainConflictError(
      `El cierre diario ${accounting?._id} no es canonico.`,
    );
  }
}

export function assertRewardAccountingAllocationBindings(
  allocations: RewardAccountingAllocationDocument[],
  dailyClosures: DailyRewardAccounting[],
  weeklyClosures: WeeklyPrizeAccounting[],
  walletAddress?: string,
) {
  const walletScope = walletAddress
    ? validRewardWallet(walletAddress)
    : new Set(allocations.map((allocation) => allocation.walletNormalized)).size ===
        1
    ? allocations[0]?.walletNormalized ?? null
    : null;
  const closures = new Map<
    string,
    {
      kind: 'daily' | 'weekly';
      periodId: string;
      availableAt: Date;
      createdAt: Date;
      allocations: DailyRewardAccounting['allocations'];
    }
  >();
  for (const daily of dailyClosures) {
    const sealed = assertDailyRewardAccountingIntegrity(daily);
    if (closures.has(sealed._id)) {
      throw new DomainConflictError(`El cierre ${sealed._id} esta duplicado.`);
    }
    closures.set(sealed._id, {
      kind: 'daily',
      periodId: sealed.dayId,
      availableAt: sealed.sealedAt,
      createdAt: sealed.sealedAt,
      allocations: sealed.allocations,
    });
  }
  for (const weekly of weeklyClosures) {
    const sealed = assertWeeklyPrizeAccountingIntegrity(weekly);
    if (closures.has(sealed._id)) {
      throw new DomainConflictError(`El cierre ${sealed._id} esta duplicado.`);
    }
    closures.set(sealed._id, {
      kind: 'weekly',
      periodId: sealed.periodId,
      availableAt: sealed.payoutAt,
      createdAt: sealed.sealedAt,
      allocations: sealed.allocations,
    });
  }
  if (closures.size !== dailyClosures.length + weeklyClosures.length) {
    throw new DomainConflictError(
      'La vista de rewards contiene cierres contables duplicados.',
    );
  }
  for (const allocation of allocations) {
    const closure = closures.get(allocation.accountingId);
    const matches =
      closure?.allocations.filter(
        (candidate) => candidate.allocationId === allocation.allocationId,
      ) ?? [];
    const storedCore = {
      allocationId: allocation.allocationId,
      walletNormalized: allocation.walletNormalized,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
      fundingMode: allocation.fundingMode,
      sourceIds: allocation.sourceIds,
    };
    if (
      !closure ||
      closure.kind !== allocation.accountingKind ||
      closure.periodId !== allocation.periodId ||
      closure.availableAt.getTime() !== allocation.availableAt.getTime() ||
      closure.createdAt.getTime() !== allocation.createdAt.getTime() ||
      matches.length !== 1 ||
      stableRewardHash(matches[0]) !== stableRewardHash(storedCore)
    ) {
      throw new DomainConflictError(
        `La allocation ${allocation.allocationId} no pertenece a su cierre contable exacto.`,
      );
    }
  }
  for (const [accountingId, closure] of closures) {
    const expected = closure.allocations.filter((candidate) =>
      CLAIMABLE_ACCOUNTING_CATEGORY_SET.has(candidate.category),
    );
    if (
      new Set(expected.map((candidate) => candidate.allocationId)).size !==
      expected.length
    ) {
      throw new DomainConflictError(
        `El cierre ${accountingId} contiene allocations publicables duplicadas.`,
      );
    }
    const linked = allocations.filter(
      (allocation) => allocation.accountingId === accountingId,
    );
    const expectedForWallet = walletScope
      ? expected.filter((candidate) => candidate.walletNormalized === walletScope)
      : expected;
    if (
      linked.some((allocation) =>
        walletScope !== null && allocation.walletNormalized !== walletScope,
      ) ||
      expectedForWallet.length !== linked.length ||
      expectedForWallet.some(
        (candidate) =>
          !linked.some(
            (allocation) => allocation.allocationId === candidate.allocationId,
          ),
      )
    ) {
      throw new DomainConflictError(
        `El cierre ${accountingId} no tiene todas las allocations publicables de la wallet enlazadas.`,
      );
    }
  }
  if (
    closures.size !==
    new Set(allocations.map((allocation) => allocation.accountingId)).size
  ) {
    throw new DomainConflictError(
      'La vista de rewards contiene cierres contables ajenos.',
    );
  }
}

type WalletAmountSummary = {
  allocatedCount: number;
  blockedCount: number;
  allocatedRaw: { toString(): string };
  blockedRaw: { toString(): string };
  invalidCount: number;
};

type WalletClaimSummary = {
  claimCount: number;
  claimedRaw: { toString(): string };
  invalidCount: number;
};

type PublicRewardStateRow = {
  allocationId: string;
  accountingId: string;
  accountingKind: 'daily' | 'weekly';
  periodId: string;
  category: string;
  amountRaw: string;
  status: RewardPublicationState;
  nextAction:
    | 'prepare_publication'
    | 'publish'
    | 'wait_until_available'
    | 'wait_until_claim_window'
    | 'claim'
    | 'none'
    | 'source_review';
  sourceIds: string[];
  availableAt: Date;
  planStatus: string | null;
  batchId: `0x${string}` | null;
};

function hasAccountingIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  // Mongo adds `_id` to every document, including the pre-accounting
  // ambassador rows that this read keeps as a compatibility view. Canonical
  // identity starts with the accounting fields instead.
  return (
    typeof row.accountingId === 'string' ||
    typeof row.accountingKind === 'string' ||
    typeof row.payloadHash === 'string'
  );
}

function canonicalAccountingRows(rows: RewardAccountingAllocationDocument[]) {
  const result: RewardAccountingAllocationDocument[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    // Older ambassador responses were already exposed by this route before
    // final accounting existed. Keep those rows as a compatibility fallback;
    // any row that advertises accounting identity must pass the strict hash
    // and shape validator below.
    if (
      !hasAccountingIdentity(row) &&
      AMBASSADOR_ACCOUNTING_CATEGORY_SET.has(row.category)
    ) {
      continue;
    }
    if (!validateRewardAccountingAllocationDocument(row)) {
      throw new DomainConflictError(
        `La allocation contable ${String(row._id)} no es canonica.`,
      );
    }
    if (!ACCOUNTING_CATEGORY_SET.has(row.category)) {
      throw new DomainConflictError(
        `La allocation contable ${String(row._id)} tiene una categoria desconocida.`,
      );
    }
    if (!CLAIMABLE_ACCOUNTING_CATEGORY_SET.has(row.category)) continue;
    if (seen.has(row._id)) {
      throw new DomainConflictError(
        `La allocation contable ${row._id} esta duplicada.`,
      );
    }
    seen.add(row._id);
    result.push(row);
  }
  return result.sort((left, right) => left._id.localeCompare(right._id));
}

function assertPublicationPlanIntegrity(
  plan: RewardPublicationPlanDocument,
  expectedAccountingId: string,
) {
  if (
    !plan ||
    typeof plan !== 'object' ||
    plan.accountingId !== expectedAccountingId ||
    typeof plan.status !== 'string' ||
    !PUBLICATION_PLAN_STATUSES.has(plan.status)
  ) {
    throw new DomainConflictError(
      `El plan de publicacion de ${expectedAccountingId} no es canonico.`,
    );
  }
  if (
    plan.batchId !== null &&
    plan.batchId !== undefined &&
    !BYTES32.test(plan.batchId)
  ) {
    throw new DomainConflictError(
      `El plan de publicacion de ${expectedAccountingId} contiene un batch invalido.`,
    );
  }
  const hasCompletePayload = Boolean(
    plan._id ||
      plan.planId ||
      plan.payloadHash ||
      plan.operations ||
      plan.sourceAllocationIds,
  );
  if (!hasCompletePayload) return plan;
  if (
    typeof plan._id !== 'string' ||
    typeof plan.planId !== 'string' ||
    typeof plan.payloadHash !== 'string' ||
    !Array.isArray(plan.operations) ||
    !Array.isArray(plan.sourceAllocationIds) ||
    plan._id !== plan.planId ||
    plan._id !==
      stableRewardHash({
        kind: 'reward-publication-plan-id',
        accountingId: expectedAccountingId,
      })
  ) {
    throw new DomainConflictError(
      `El plan de publicacion de ${expectedAccountingId} no conserva su identidad.`,
    );
  }
  const operationIntents = plan.operations.map((operation) => ({
    kind: operation.kind,
    amountRaw: operation.amountRaw,
    to: operation.to ?? null,
  }));
  const expectedHash = stableRewardHash({
    kind: 'reward-publication-plan',
    planId: plan.planId,
    accountingId: plan.accountingId,
    accountingKind: plan.accountingKind,
    periodId: plan.periodId,
    chainId: plan.chainId,
    tokenAddress: plan.tokenAddress,
    distributorAddress: plan.distributorAddress,
    sourceAllocationSetHash: plan.sourceAllocationSetHash,
    accountingPayloadHash: plan.accountingPayloadHash,
    ruleVersion: plan.ruleVersion,
    ruleConfigHash: plan.ruleConfigHash,
    sourceAllocationIds: plan.sourceAllocationIds,
    batchId: plan.batchId,
    draftKey: plan.draftKey,
    claimableTotalRaw: plan.claimableTotalRaw,
    treasuryRaw: plan.treasuryRaw,
    marketingDevelopmentRaw: plan.marketingDevelopmentRaw,
    supplyReductionRaw: plan.supplyReductionRaw,
    totalRaw: plan.totalRaw,
    operationIntents,
  });
  const expectedKinds = [
    'fund_distributor',
    'publish_batch',
    'transfer_treasury',
    'transfer_marketing_development',
    'burn_supply_reduction',
  ];
  const amounts = [
    plan.claimableTotalRaw,
    plan.treasuryRaw,
    plan.marketingDevelopmentRaw,
    plan.supplyReductionRaw,
    plan.totalRaw,
  ];
  if (
    plan.payloadHash !== expectedHash ||
    plan.chainId !== 97 ||
    new Set(plan.sourceAllocationIds).size !==
      plan.sourceAllocationIds.length ||
    operationIntents.length !== expectedKinds.length ||
    operationIntents.some(({ kind }, index) => kind !== expectedKinds[index]) ||
    amounts.some((amount) => typeof amount !== 'string' || !RAW.test(amount)) ||
    BigInt(plan.claimableTotalRaw!) +
      BigInt(plan.treasuryRaw!) +
      BigInt(plan.marketingDevelopmentRaw!) +
      BigInt(plan.supplyReductionRaw!) !==
      BigInt(plan.totalRaw!)
  ) {
    throw new DomainConflictError(
      `El plan de publicacion de ${expectedAccountingId} fue manipulado.`,
    );
  }
  return plan;
}

function amountSummaryPipeline(walletNormalized: string) {
  return [
    { $match: { walletNormalized } },
    {
      $project: {
        status: 1,
        amountDecimal: {
          $convert: {
            input: '$amountRaw',
            to: 'decimal',
            onError: null,
            onNull: null,
          },
        },
        validAmount: {
          $and: [
            { $eq: [{ $type: '$amountRaw' }, 'string'] },
            {
              $regexMatch: {
                input: {
                  $convert: { input: '$amountRaw', to: 'string', onError: '' },
                },
                regex: '^(0|[1-9][0-9]*)$',
              },
            },
          ],
        },
        validStatus: { $in: ['$status', ['allocated', 'blocked']] },
      },
    },
    {
      $group: {
        _id: null,
        allocatedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'allocated'] }, 1, 0] },
        },
        blockedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] },
        },
        allocatedRaw: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'allocated'] },
              { $ifNull: ['$amountDecimal', 0] },
              0,
            ],
          },
        },
        blockedRaw: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'blocked'] },
              { $ifNull: ['$amountDecimal', 0] },
              0,
            ],
          },
        },
        invalidCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$amountDecimal', null] },
                  { $eq: ['$validAmount', false] },
                  { $eq: ['$validStatus', false] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ];
}

function claimSummaryPipeline(walletNormalized: string) {
  return [
    { $match: { walletNormalized } },
    {
      $project: {
        amountDecimal: {
          $convert: {
            input: '$amountRaw',
            to: 'decimal',
            onError: null,
            onNull: null,
          },
        },
        validAmount: {
          $and: [
            { $eq: [{ $type: '$amountRaw' }, 'string'] },
            {
              $regexMatch: {
                input: {
                  $convert: { input: '$amountRaw', to: 'string', onError: '' },
                },
                regex: '^[1-9][0-9]*$',
              },
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        claimCount: { $sum: 1 },
        claimedRaw: { $sum: { $ifNull: ['$amountDecimal', 0] } },
        invalidCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$amountDecimal', null] },
                  { $eq: ['$validAmount', false] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ];
}

export function assertRewardAllocationManifestBindings(
  allocations: RewardAllocation[],
  sourceManifests: RewardSourceManifest[],
) {
  const sourceIds = [
    ...new Set(allocations.map((allocation) => allocation.sourceId)),
  ];
  const manifestBySource = new Map(
    sourceManifests.map((manifest) => [manifest.sourceId, manifest]),
  );
  if (
    manifestBySource.size !== sourceIds.length ||
    sourceManifests.length !== manifestBySource.size ||
    allocations.some((allocation) => {
      const manifest = manifestBySource.get(allocation.sourceId);
      return (
        !manifest ||
        !validateRewardSourceManifest(manifest) ||
        manifest.periodId !== allocation.periodId ||
        manifest.sourceTotalRaw !== allocation.sourceTotalRaw ||
        manifest.sourceSetHash !== allocation.sourceSetHash ||
        manifest.ruleVersion !== allocation.ruleVersion ||
        manifest.ruleConfigHash !== allocation.ruleConfigHash ||
        manifest.ruleEffectiveAt?.getTime() !==
          allocation.ruleEffectiveAt?.getTime() ||
        manifest.calculationJobRunId !== allocation.calculationJobRunId ||
        manifest.calculationKind !== allocation.calculationKind ||
        manifest.calculationInputHash !== allocation.calculationInputHash ||
        manifest.calculationOutputHash !== allocation.calculationOutputHash ||
        manifest.status !== allocation.status
      );
    })
  ) {
    throw new DomainConflictError(
      'La vista de rewards contiene allocations sin manifest global exacto.',
    );
  }
}

export async function listWalletRewardStatus(input: {
  walletAddress: string;
  cursor?: string | null;
  limit?: number;
}) {
  const walletNormalized = validRewardWallet(input.walletAddress);
  const cursor = validCursor(input.cursor);
  const limit = input.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainValidationError('limit debe estar entre 1 y 100.');
  }
  const db = await getEconomyDb();

  // Final accounting is authoritative. The bounded read also lets us keep
  // cursor pagination deterministic without mixing source-level rows from an
  // unfinished settlement into the same page.
  const rawAccountingAllocations = await db
    .collection<RewardAccountingAllocationDocument>(
      'reward_accounting_allocations',
    )
    .find({ walletNormalized })
    .sort({ _id: 1 })
    .limit(MAX_WALLET_ACCOUNTING_ALLOCATIONS + 1)
    .toArray();
  if (rawAccountingAllocations.length > MAX_WALLET_ACCOUNTING_ALLOCATIONS) {
    throw new DomainConflictError(
      'La wallet excede el limite de allocations contables publicas.',
    );
  }
  const accountingAllocations = canonicalAccountingRows(
    rawAccountingAllocations,
  );
  const hasCanonicalAccounting = accountingAllocations.length > 0;
  const canonicalAfterCursor = cursor
    ? accountingAllocations.filter((allocation) => allocation._id > cursor)
    : accountingAllocations;
  const canonicalPage = canonicalAfterCursor.slice(0, limit);
  const canonicalHasMore = canonicalAfterCursor.length > limit;

  const [ambassadorRows, legacyAllocations] = await Promise.all([
    db
      .collection<RewardAccountingAllocationDocument>(
        'reward_accounting_allocations',
      )
      .find({
        walletNormalized,
        category: { $in: ['ambassador_ordinary', 'ambassador_weekly'] },
      })
      .sort({ availableAt: -1, _id: -1 })
      .limit(100)
      .toArray(),
    hasCanonicalAccounting
      ? Promise.resolve([] as RewardAllocation[])
      : db
          .collection<RewardAllocation>('reward_allocations')
          .find({
            walletNormalized,
            ...(cursor ? { _id: { $gt: cursor } } : {}),
          })
          .sort({ _id: 1 })
          .limit(limit + 1)
          .toArray(),
  ]);
  const legacyPage = legacyAllocations.slice(0, limit);
  if (
    !hasCanonicalAccounting &&
    legacyPage.some(
      (allocation) => !validateRewardAllocationDocument(allocation),
    )
  ) {
    throw new DomainConflictError(
      'La vista de rewards contiene una allocation manipulada.',
    );
  }

  const canonicalAccountingIds = [
    ...new Set(
      accountingAllocations.map((allocation) => allocation.accountingId),
    ),
  ];
  const dailyAccountingIds = accountingAllocations
    .filter((allocation) => allocation.accountingKind === 'daily')
    .map((allocation) => allocation.accountingId);
  const weeklyAccountingIds = accountingAllocations
    .filter((allocation) => allocation.accountingKind === 'weekly')
    .map((allocation) => allocation.accountingId);
  const [dailyClosures, weeklyClosures] = await Promise.all([
    dailyAccountingIds.length === 0
      ? Promise.resolve([] as DailyRewardAccounting[])
      : db
          .collection<DailyRewardAccounting>('reward_daily_accounting')
          .find({
            _id: { $in: [...new Set(dailyAccountingIds)] },
          })
          .toArray(),
    weeklyAccountingIds.length === 0
      ? Promise.resolve([] as WeeklyPrizeAccounting[])
      : db
          .collection<WeeklyPrizeAccounting>('reward_weekly_prize_accounting')
          .find({
            _id: { $in: [...new Set(weeklyAccountingIds)] },
          })
          .toArray(),
  ]);
  if (hasCanonicalAccounting) {
    assertRewardAccountingAllocationBindings(
      accountingAllocations,
      dailyClosures,
      weeklyClosures,
      walletNormalized,
    );
  }

  const sourceIds = hasCanonicalAccounting
    ? [
        ...new Set(
          accountingAllocations.flatMap((allocation) => allocation.sourceIds),
        ),
      ]
    : [...new Set(legacyPage.map((allocation) => allocation.sourceId))];
  const [allClaims, openIncidents, blockedAllocations] = await Promise.all([
    db
      .collection<RewardClaim>('reward_claims')
      .find({ walletNormalized })
      .sort({ indexedAt: -1, _id: -1 })
      .limit(MAX_WALLET_CLAIMS + 1)
      .toArray(),
    sourceIds.length === 0
      ? Promise.resolve(0)
      : db.collection('reward_integrity_incidents').countDocuments(
          {
            sourceId: { $in: sourceIds },
            status: 'open',
          },
          { limit: 1 },
        ),
    hasCanonicalAccounting
      ? Promise.resolve(0)
      : db.collection<RewardAllocation>('reward_allocations').countDocuments({
          walletNormalized,
          status: 'blocked',
        }),
  ]);
  if (allClaims.length > MAX_WALLET_CLAIMS) {
    throw new DomainConflictError(
      'La wallet excede el limite de claims publicos reconciliables.',
    );
  }
  // Keep the response/history bounded while validating and totaling the full
  // claim set. Totals must not change merely because the UI history page is
  // limited to the most recent entries.
  const claims = allClaims.slice(0, MAX_WALLET_CLAIM_HISTORY);

  let allocationSummary: WalletAmountSummary | undefined;
  let claimSummary: WalletClaimSummary | undefined;
  if (!hasCanonicalAccounting) {
    const [allocationSummaryRows, claimSummaryRows, sourceManifests] =
      await Promise.all([
        db
          .collection<RewardAllocation>('reward_allocations')
          .aggregate<WalletAmountSummary>(
            amountSummaryPipeline(walletNormalized),
          )
          .toArray(),
        db
          .collection<RewardClaim>('reward_claims')
          .aggregate<WalletClaimSummary>(claimSummaryPipeline(walletNormalized))
          .toArray(),
        sourceIds.length === 0
          ? Promise.resolve([] as RewardSourceManifest[])
          : db
              .collection<RewardSourceManifest>('reward_source_manifests')
              .find({ sourceId: { $in: sourceIds } })
              .toArray(),
      ]);
    allocationSummary = allocationSummaryRows[0];
    claimSummary = claimSummaryRows[0];
    if (
      (allocationSummary?.invalidCount ?? 0) > 0 ||
      (claimSummary?.invalidCount ?? 0) > 0
    ) {
      throw new DomainConflictError(
        'El resumen de rewards contiene importes no canonicos.',
      );
    }
    assertRewardAllocationManifestBindings(legacyPage, sourceManifests);
  }

  const candidateProofs = await db
    .collection<RewardClaimProof>('reward_claim_proofs')
    .find({ walletNormalized })
    .sort({ _id: 1 })
    .limit(MAX_WALLET_PROOFS + 1)
    .toArray();
  if (candidateProofs.length > MAX_WALLET_PROOFS) {
    throw new DomainConflictError(
      'La wallet excede el limite de proofs publicos paginables.',
    );
  }
  if (candidateProofs.some((proof) => typeof proof.batchId !== 'string')) {
    throw new DomainConflictError(
      'La wallet contiene un proof sin batchId canonico.',
    );
  }

  const planRows =
    canonicalAccountingIds.length === 0
      ? []
      : await db
          .collection<RewardPublicationPlanDocument>('reward_publication_plans')
          .find({ accountingId: { $in: canonicalAccountingIds } })
          .toArray();
  const planByAccounting = new Map<string, RewardPublicationPlanDocument>();
  for (const plan of planRows) {
    if (!canonicalAccountingIds.includes(plan.accountingId)) {
      throw new DomainConflictError(
        `El plan ${String(plan._id)} no pertenece a la wallet consultada.`,
      );
    }
    assertPublicationPlanIntegrity(plan, plan.accountingId);
    const linkedAllocation = accountingAllocations.find(
      (allocation) => allocation.accountingId === plan.accountingId,
    );
    if (
      linkedAllocation &&
      ((plan.accountingKind &&
        plan.accountingKind !== linkedAllocation.accountingKind) ||
        (plan.periodId &&
          plan.periodId !== `reward-accounting:${plan.accountingId}`))
    ) {
      throw new DomainConflictError(
        `El plan de publicacion de ${plan.accountingId} no conserva el periodo contable.`,
      );
    }
    if (planByAccounting.has(plan.accountingId)) {
      throw new DomainConflictError(
        `El accounting ${plan.accountingId} tiene planes duplicados.`,
      );
    }
    if (plan.sourceAllocationIds) {
      const walletAllocationIds = accountingAllocations
        .filter((allocation) => allocation.accountingId === plan.accountingId)
        .map((allocation) => allocation._id);
      if (
        walletAllocationIds.some(
          (allocationId) => !plan.sourceAllocationIds!.includes(allocationId),
        )
      ) {
        throw new DomainConflictError(
          `El plan de publicacion de ${plan.accountingId} no incluye todas las allocations de la wallet.`,
        );
      }
    }
    planByAccounting.set(plan.accountingId, plan);
  }

  const candidateBatchIds = candidateProofs.map((proof) =>
    proof.batchId.toLowerCase(),
  );
  const claimBatchIds = allClaims.map((claim) => claim.batchId.toLowerCase());
  const planBatchIds = planRows
    .map((plan) => plan.batchId)
    .filter((batchId): batchId is `0x${string}` => typeof batchId === 'string')
    .map((batchId) => batchId.toLowerCase());
  const allBatchIds: Array<`0x${string}`> = Array.from(
    new Set([...candidateBatchIds, ...claimBatchIds, ...planBatchIds]),
  ) as Array<`0x${string}`>;
  const claimIds = allClaims.map((claim) => claim.eventId);
  const [batches, proofsForClaims, claimEvents] = await Promise.all([
    allBatchIds.length === 0
      ? Promise.resolve([] as RewardClaimBatch[])
      : db
          .collection<RewardClaimBatch>('reward_claim_batches')
          .find({ batchId: { $in: allBatchIds } })
          .toArray(),
    allClaims.length === 0
      ? Promise.resolve([] as RewardClaimProof[])
      : db
          .collection<RewardClaimProof>('reward_claim_proofs')
          .find({
            $or: allClaims.map((claim) => ({
              batchId: claim.batchId,
              walletNormalized: claim.walletNormalized,
            })),
          } as unknown as Filter<RewardClaimProof>)
          .toArray(),
    claimIds.length === 0
      ? Promise.resolve([] as Array<{ _id: string } & Record<string, unknown>>)
      : db
          .collection<{ _id: string } & Record<string, unknown>>('chain_events')
          .find({ _id: { $in: claimIds } })
          .toArray(),
  ]);
  if (
    allClaims.some((claim) => typeof claim.batchId !== 'string') ||
    batches.some((batch) => typeof batch.batchId !== 'string') ||
    [...proofsForClaims, ...candidateProofs].some(
      (proof) =>
        typeof proof.batchId !== 'string' ||
        typeof proof.walletNormalized !== 'string',
    )
  ) {
    throw new DomainConflictError(
      'El historial de claims contiene referencias corruptas.',
    );
  }
  const batchById = new Map(
    batches.map((batch) => [batch.batchId.toLowerCase(), batch]),
  );
  const proofByWalletBatch = new Map<string, RewardClaimProof>();
  for (const proof of [...candidateProofs, ...proofsForClaims]) {
    const key = `${proof.batchId.toLowerCase()}:${proof.walletNormalized}`;
    if (
      proofByWalletBatch.has(key) &&
      proofByWalletBatch.get(key)!._id !== proof._id
    ) {
      throw new DomainConflictError(
        `La wallet contiene proofs duplicados para ${proof.batchId}.`,
      );
    }
    proofByWalletBatch.set(key, proof);
  }
  const eventById = new Map(
    claimEvents.map((event) => [String(event._id), event]),
  );
  for (const claim of allClaims) {
    assertClaimProjection({
      claim,
      batch: batchById.get(claim.batchId.toLowerCase()),
      proof: proofByWalletBatch.get(
        `${claim.batchId.toLowerCase()}:${claim.walletNormalized}`,
      ),
      event: eventById.get(claim.eventId),
      expectedWallet: walletNormalized,
    });
  }

  const publicationEventIds = batches
    .map((batch) => batch.publicationEventId)
    .filter((eventId): eventId is string => Boolean(eventId));
  const publicationEvents =
    publicationEventIds.length === 0
      ? []
      : await db
          .collection<{ _id: string } & Record<string, unknown>>('chain_events')
          .find({
            _id: { $in: [...new Set(publicationEventIds)] },
          })
          .toArray();
  const publicationById = new Map(
    publicationEvents.map((event) => [String(event._id), event]),
  );
  const claimByBatch = new Map(
    allClaims.map((claim) => [claim.batchId.toLowerCase(), claim]),
  );
  const publishedRewards = candidateProofs.flatMap((proof) => {
    const key = proof.batchId.toLowerCase();
    const batch = batchById.get(key);
    if (!batch || (batch.status !== 'published' && batch.status !== 'closed'))
      return [];
    if (claimByBatch.has(key)) return [];
    const publicationEvent = batch.publicationEventId
      ? publicationById.get(batch.publicationEventId)
      : undefined;
    if (!publicationEvent) {
      throw new DomainConflictError(
        `Batch ${batch.batchId} no tiene chain_event de publicacion.`,
      );
    }
    return [
      validatePublishedRewardState({
        batch,
        proof,
        publicationEvent,
        expectedWallet: walletNormalized,
        now: new Date(),
      }),
    ];
  });
  const claimables = publishedRewards.filter(
    (reward) => reward.onChainStatus === 'claimable',
  );
  const scheduledRewards = publishedRewards.filter(
    (reward) => reward.onChainStatus === 'scheduled',
  );
  const expiredRewards = publishedRewards.filter(
    (reward) => reward.onChainStatus === 'expired',
  );

  const stateRows: PublicRewardStateRow[] = hasCanonicalAccounting
    ? accountingAllocations.map((allocation) => {
        const plan = planByAccounting.get(allocation.accountingId);
        const planBatchId = plan?.batchId?.toLowerCase();
        const claim = planBatchId ? claimByBatch.get(planBatchId) : undefined;
        const batch = planBatchId ? batchById.get(planBatchId) : undefined;
        const proof = planBatchId
          ? proofByWalletBatch.get(`${planBatchId}:${walletNormalized}`)
          : undefined;
        let status: RewardPublicationState = 'calculated';
        let nextAction: PublicRewardStateRow['nextAction'] =
          'prepare_publication';
        if (!plan) {
          nextAction =
            allocation.availableAt.getTime() > Date.now()
              ? 'wait_until_available'
              : 'prepare_publication';
        } else if (claim) {
          status = 'claimed';
          nextAction = 'none';
        } else if (
          batch?.status === 'published' ||
          batch?.status === 'closed'
        ) {
          const publicationEvent = batch.publicationEventId
            ? publicationById.get(batch.publicationEventId)
            : undefined;
          if (!proof || !publicationEvent) {
            status = 'unknown';
            nextAction = 'source_review';
          } else {
            const published = validatePublishedRewardState({
              batch,
              proof,
              publicationEvent,
              expectedWallet: walletNormalized,
              now: new Date(),
            });
            status = published.onChainStatus;
            nextAction =
              status === 'claimable'
                ? 'claim'
                : status === 'scheduled'
                ? 'wait_until_claim_window'
                : 'none';
          }
        } else if (plan.status === 'blocked') {
          status = 'unknown';
          nextAction = 'source_review';
        } else {
          status = 'pending_publication';
          nextAction = 'publish';
        }
        return {
          allocationId: allocation.allocationId,
          accountingId: allocation.accountingId,
          accountingKind: allocation.accountingKind,
          periodId: allocation.periodId,
          category: allocation.category,
          amountRaw: allocation.amountRaw,
          status,
          nextAction,
          sourceIds: [...allocation.sourceIds],
          availableAt: allocation.availableAt,
          planStatus: plan?.status ?? null,
          batchId: plan?.batchId ?? null,
        };
      })
    : [];

  const sumState = (statuses: RewardPublicationState[]) =>
    stateRows
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + BigInt(row.amountRaw), BigInt(0));
  const canonicalTotalRaw = stateRows.reduce(
    (sum, row) => sum + BigInt(row.amountRaw),
    BigInt(0),
  );
  const canonicalBatchIds = new Set(
    stateRows
      .map((row) => row.batchId?.toLowerCase())
      .filter((batchId): batchId is string => Boolean(batchId)),
  );
  const extraPublishedRewards = publishedRewards.filter(
    (reward) => !canonicalBatchIds.has(reward.batch.batchId.toLowerCase()),
  );
  const extraClaimableRaw = extraPublishedRewards
    .filter((reward) => reward.onChainStatus === 'claimable')
    .reduce((sum, reward) => sum + BigInt(reward.batch.amountRaw), BigInt(0));
  const extraScheduledRaw = extraPublishedRewards
    .filter((reward) => reward.onChainStatus === 'scheduled')
    .reduce((sum, reward) => sum + BigInt(reward.batch.amountRaw), BigInt(0));
  const extraExpiredRaw = extraPublishedRewards
    .filter((reward) => reward.onChainStatus === 'expired')
    .reduce((sum, reward) => sum + BigInt(reward.batch.amountRaw), BigInt(0));

  let totalAllocatedRaw: bigint;
  let totalClaimedRaw: bigint;
  let pageAllocatedRaw: bigint;
  let pendingRaw: bigint;
  let claimableRaw: bigint;
  let scheduledRaw: bigint;
  let expiredRaw: bigint;
  let allocationCount: number;
  let claimCount: number;
  let unknownRaw = BigInt(0);
  let calculatedRaw: bigint;
  let pendingPublicationRaw: bigint;
  let sourceStatus: 'canonical' | 'legacy';
  if (hasCanonicalAccounting) {
    totalAllocatedRaw = canonicalTotalRaw;
    totalClaimedRaw = allClaims.reduce(
      (sum, claim) => sum + BigInt(claim.amountRaw),
      BigInt(0),
    );
    pageAllocatedRaw = canonicalPage.reduce(
      (sum, allocation) => sum + BigInt(allocation.amountRaw),
      BigInt(0),
    );
    pendingPublicationRaw = sumState(['calculated', 'pending_publication']);
    unknownRaw = sumState(['unknown']);
    pendingRaw = pendingPublicationRaw;
    claimableRaw = sumState(['claimable']) + extraClaimableRaw;
    scheduledRaw = sumState(['scheduled']) + extraScheduledRaw;
    expiredRaw = sumState(['expired']) + extraExpiredRaw;
    allocationCount = accountingAllocations.length;
    claimCount = allClaims.length;
    calculatedRaw = canonicalTotalRaw;
    sourceStatus = 'canonical';
  } else {
    totalAllocatedRaw = BigInt(
      allocationSummary?.allocatedRaw.toString() ?? '0',
    );
    totalClaimedRaw = BigInt(claimSummary?.claimedRaw.toString() ?? '0');
    pageAllocatedRaw = legacyPage.reduce((sum, allocation) => {
      if (!RAW.test(allocation.amountRaw)) {
        throw new DomainConflictError('Allocation con amountRaw no canonico.');
      }
      return allocation.status === 'allocated'
        ? sum + BigInt(allocation.amountRaw)
        : sum;
    }, BigInt(0));
    const publishedOutstandingRaw = publishedRewards.reduce(
      (sum, reward) => sum + BigInt(reward.batch.amountRaw),
      BigInt(0),
    );
    const accountedRaw = totalClaimedRaw + publishedOutstandingRaw;
    pendingRaw =
      totalAllocatedRaw > accountedRaw
        ? totalAllocatedRaw - accountedRaw
        : BigInt(0);
    pendingPublicationRaw = pendingRaw;
    claimableRaw = claimables.reduce(
      (sum, claimable) => sum + BigInt(claimable.batch.amountRaw),
      BigInt(0),
    );
    scheduledRaw = scheduledRewards.reduce(
      (sum, reward) => sum + BigInt(reward.batch.amountRaw),
      BigInt(0),
    );
    expiredRaw = expiredRewards.reduce(
      (sum, reward) => sum + BigInt(reward.batch.amountRaw),
      BigInt(0),
    );
    allocationCount = allocationSummary?.allocatedCount ?? 0;
    claimCount = claimSummary?.claimCount ?? 0;
    calculatedRaw = totalAllocatedRaw;
    sourceStatus = 'legacy';
  }

  const canonicalVisibleAllocations = canonicalPage.filter(
    (allocation) =>
      !AMBASSADOR_ACCOUNTING_CATEGORY_SET.has(allocation.category),
  );
  const legacyAmbassadorAllocations = ambassadorRows
    .filter((allocation) =>
      AMBASSADOR_ACCOUNTING_CATEGORY_SET.has(allocation.category),
    )
    .filter((allocation) => !hasAccountingIdentity(allocation))
    .map((allocation) => ({
      allocationId: allocation.allocationId,
      periodId: allocation.periodId,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
      status: allocation.status,
      availableAt: allocation.availableAt,
      createdAt: allocation.createdAt,
    }));
  const canonicalAmbassadorAllocations = accountingAllocations
    .filter((allocation) =>
      AMBASSADOR_ACCOUNTING_CATEGORY_SET.has(allocation.category),
    )
    .slice(0, 100)
    .map((allocation) => ({
      allocationId: allocation.allocationId,
      accountingId: allocation.accountingId,
      accountingKind: allocation.accountingKind,
      periodId: allocation.periodId,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
      status: allocation.status,
      availableAt: allocation.availableAt,
      createdAt: allocation.createdAt,
    }));
  const ambassadorAllocations = hasCanonicalAccounting
    ? canonicalAmbassadorAllocations
    : legacyAmbassadorAllocations;
  const hasPublishedPlanEvidence = planRows.some((plan) => {
    const batchId = plan.batchId?.toLowerCase();
    const batch = batchId ? batchById.get(batchId) : undefined;
    return batch?.status === 'published' || batch?.status === 'closed';
  });

  return {
    walletNormalized,
    allocations: hasCanonicalAccounting
      ? canonicalVisibleAllocations.map((allocation) => ({
          allocationId: allocation.allocationId,
          accountingId: allocation.accountingId,
          accountingKind: allocation.accountingKind,
          periodId: allocation.periodId,
          category: allocation.category,
          amountRaw: allocation.amountRaw,
          status: allocation.status,
          fundingMode: allocation.fundingMode,
          sourceIds: [...allocation.sourceIds],
          availableAt: allocation.availableAt,
          createdAt: allocation.createdAt,
        }))
      : legacyPage.map((allocation) => ({
          allocationId: allocation.allocationId,
          periodId: allocation.periodId,
          category: allocation.category,
          amountRaw: allocation.amountRaw,
          status: allocation.status,
          ruleVersion: allocation.ruleVersion,
          createdAt: allocation.createdAt,
        })),
    ambassadorAllocations,
    claims: claims.map((claim) => ({
      batchId: claim.batchId,
      chainId: batchById.get(claim.batchId.toLowerCase())!.chainId as 56 | 97,
      amountRaw: claim.amountRaw,
      transactionHash: claim.transactionHash,
      blockNumber: claim.blockNumber,
      indexedAt: claim.indexedAt,
    })),
    pageAllocatedRaw: pageAllocatedRaw.toString(),
    totalAllocatedRaw: totalAllocatedRaw.toString(),
    totalClaimedRaw: totalClaimedRaw.toString(),
    pendingRaw: pendingRaw.toString(),
    calculatedRaw: calculatedRaw.toString(),
    pendingPublicationRaw: pendingPublicationRaw.toString(),
    unknownRaw: unknownRaw.toString(),
    sourceStatus,
    claimableRaw: claimableRaw.toString(),
    scheduledRaw: scheduledRaw.toString(),
    expiredRaw: expiredRaw.toString(),
    allocationCount,
    claimCount,
    claimPublished: publishedRewards.length > 0 || hasPublishedPlanEvidence,
    claimables,
    publishedRewards,
    publicationStates: stateRows.map((row) => ({
      ...row,
      availableAt: row.availableAt,
    })),
    openIncidents,
    blockedAllocations: allocationSummary?.blockedCount ?? blockedAllocations,
    healthy:
      openIncidents === 0 &&
      (allocationSummary?.blockedCount ?? blockedAllocations) === 0 &&
      unknownRaw === BigInt(0),
    nextCursor: hasCanonicalAccounting
      ? canonicalHasMore
        ? canonicalPage.at(-1)?._id ?? null
        : null
      : legacyAllocations.length > limit
      ? legacyPage.at(-1)?._id ?? null
      : null,
  };
}
