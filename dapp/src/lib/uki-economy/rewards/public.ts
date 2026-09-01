import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getAddress, isAddress, type Hex } from 'viem';
import type { Filter } from 'mongodb';

import { DomainConflictError, DomainValidationError } from '../errors';
import { validRewardWallet } from './rules';
import { rewardHashPair, rewardLeafHash } from './merkle';
import { stableRewardHash } from './rules';
import {
  validateRewardAllocationDocument,
  validateRewardSourceManifest,
} from './service';
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
    proof._id !== expectedProofId
    || proof.proofId !== expectedProofId
    || proof.batchId.toLowerCase() !== batch.batchId.toLowerCase()
    || proof.periodId !== batch.periodId
    || walletNormalized !== proof.walletNormalized
    || proof.walletNormalized !== expectedWallet
    || !RAW.test(proof.amountRaw)
    || BigInt(proof.amountRaw) <= BigInt(0)
    || !BYTES32.test(proof.leaf)
    || !Array.isArray(proof.proof)
    || proof.proof.some((sibling) => !BYTES32.test(sibling))
    || !(proof.createdAt instanceof Date)
    || proof.payloadHash !== stableRewardHash({ kind: 'reward-claim-proof', ...immutableProof })
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
    proof.leaf.toLowerCase() !== expectedLeaf.toLowerCase()
    || root.toLowerCase() !== batch.merkleRoot.toLowerCase()
  ) {
    throw new DomainConflictError(`Proof ${proof._id} no alcanza el root publicado.`);
  }
}

function assertPublicationProjection(
  batch: RewardClaimBatch,
  event: Record<string, unknown>,
) {
  if (
    (batch.status !== 'published' && batch.status !== 'closed')
    || batch.previewOnly !== false
    || batch.publishAuthorized !== true
    || batch.signature !== null
    || batch.proofCollection !== 'reward_claim_proofs'
    || !BYTES32.test(batch.batchId)
    || !BYTES32.test(batch.merkleRoot)
    || !BYTES32.test(batch.canonicalInputHash)
    || !BYTES32.test(batch.metadataHash)
    || !RAW.test(batch.totalAllocatedRaw)
    || BigInt(batch.totalAllocatedRaw) <= BigInt(0)
    || !/^[0-9a-f]{64}$/.test(batch.proofSetHash)
    || !isAddress(batch.distributorAddress)
    || (batch.chainId !== 56 && batch.chainId !== 97)
    || !batch.publicationEventId
    || batch.transactionHash !== batch.publicationTransactionHash
    || batch.publishedBatchId?.toLowerCase() !== batch.batchId.toLowerCase()
    || batch.publishedMerkleRoot?.toLowerCase() !== batch.merkleRoot.toLowerCase()
    || batch.publishedInputHash?.toLowerCase() !== batch.canonicalInputHash.toLowerCase()
    || batch.publishedMetadataHash?.toLowerCase() !== batch.metadataHash.toLowerCase()
    || batch.publishedTotalAllocatedRaw !== batch.totalAllocatedRaw
    || batch.publishedProofSetHash !== batch.proofSetHash
    || batch.publishedPeriodSealId !== batch.periodSealId
    || !RAW.test(batch.startsAtRaw ?? '')
    || !RAW.test(batch.expiresAtRaw ?? '')
    || BigInt(batch.expiresAtRaw!) <= BigInt(batch.startsAtRaw!)
    || !(batch.startsAt instanceof Date)
    || !(batch.expiresAt instanceof Date)
    || BigInt(batch.startsAt.getTime()) !== BigInt(batch.startsAtRaw!) * BigInt(1_000)
    || BigInt(batch.expiresAt.getTime()) !== BigInt(batch.expiresAtRaw!) * BigInt(1_000)
    || event._id !== batch.publicationEventId
    || event.chain !== 'BSC'
    || event.contractAlias !== 'REWARDS_DISTRIBUTOR'
    || event.eventName !== 'BatchPublished'
    || event.status !== 'projected'
    || event.txHash !== batch.publicationTransactionHash
    || event.blockHash !== batch.publicationBlockHash
    || event.blockNumber !== batch.publicationBlockNumber
    || event.logIndex !== batch.publicationLogIndex
    || typeof event.contractAddress !== 'string'
    || event.contractAddress.toLowerCase() !== batch.distributorAddress.toLowerCase()
  ) {
    throw new DomainConflictError(`Batch ${batch.batchId} no tiene publicacion canonica.`);
  }
  const normalized = event.normalized;
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new DomainConflictError(`Publicacion ${batch.publicationEventId} sin payload normalizado.`);
  }
  const payload = normalized as Record<string, unknown>;
  if (
    typeof payload.batchId !== 'string'
    || payload.batchId.toLowerCase() !== batch.batchId.toLowerCase()
    || typeof payload.merkleRoot !== 'string'
    || payload.merkleRoot.toLowerCase() !== batch.merkleRoot.toLowerCase()
    || typeof payload.inputHash !== 'string'
    || payload.inputHash.toLowerCase() !== batch.canonicalInputHash.toLowerCase()
    || typeof payload.metadataHash !== 'string'
    || payload.metadataHash.toLowerCase() !== batch.metadataHash.toLowerCase()
    || payload.totalAllocatedRaw !== batch.totalAllocatedRaw
    || payload.startsAtRaw !== batch.startsAtRaw
    || payload.expiresAtRaw !== batch.expiresAtRaw
  ) {
    throw new DomainConflictError(`Publicacion ${batch.publicationEventId} no coincide con el batch.`);
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
      input.batch.status !== 'published'
      || input.batch.closed !== false
      || !(input.now instanceof Date)
      || Number.isNaN(input.now.getTime())
    ) {
      throw new DomainConflictError(`Batch ${input.batch.batchId} no esta publicado y abierto.`);
    }
    const onChainStatus = input.now.getTime() < input.batch.startsAt!.getTime()
      ? 'scheduled' as const
      : input.now.getTime() >= input.batch.expiresAt!.getTime()
        ? 'expired' as const
        : 'claimable' as const;
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
    throw new DomainConflictError(`Batch/proof de ${input.expectedWallet} contiene datos corruptos.`);
  }
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
    claim._id !== claim.eventId
    || claim.chain !== 'BSC'
    || !isAddress(claim.contractAddress)
    || !isAddress(claim.walletAddress)
    || validRewardWallet(claim.walletAddress) !== claim.walletNormalized
    || claim.walletNormalized !== expectedWallet
    || !BYTES32.test(claim.batchId)
    || !RAW.test(claim.amountRaw)
    || BigInt(claim.amountRaw) <= BigInt(0)
    || !BYTES32.test(claim.transactionHash)
    || !BYTES32.test(claim.blockHash)
    || !Number.isSafeInteger(claim.blockNumber)
    || claim.blockNumber < 0
    || !Number.isSafeInteger(claim.logIndex)
    || claim.logIndex < 0
    || !(claim.indexedAt instanceof Date)
    || !(claim.createdAt instanceof Date)
  ) {
    throw new DomainConflictError(`Claim ${claim._id} no es canonico.`);
  }
  if (
    !batch
    || (batch.status !== 'published' && batch.status !== 'closed')
    || (batch.chainId !== 56 && batch.chainId !== 97)
    || batch.batchId.toLowerCase() !== claim.batchId.toLowerCase()
    || batch.distributorAddress.toLowerCase() !== claim.contractAddress.toLowerCase()
    || !proof
    || proof.batchId.toLowerCase() !== claim.batchId.toLowerCase()
    || proof.walletNormalized !== claim.walletNormalized
    || proof.amountRaw !== claim.amountRaw
  ) {
    throw new DomainConflictError(`Claim ${claim._id} no liga batch/proof publicados.`);
  }
  assertRewardProof(batch, proof, claim.walletNormalized);
  if (
    !event
    || event._id !== claim.eventId
    || event.chain !== 'BSC'
    || event.contractAlias !== 'REWARDS_DISTRIBUTOR'
    || event.eventName !== 'RewardClaimed'
    || event.status !== 'projected'
    || event.txHash !== claim.transactionHash
    || event.blockHash !== claim.blockHash
    || event.blockNumber !== claim.blockNumber
    || event.logIndex !== claim.logIndex
    || typeof event.contractAddress !== 'string'
    || event.contractAddress.toLowerCase() !== claim.contractAddress.toLowerCase()
  ) {
    throw new DomainConflictError(`Claim ${claim._id} no tiene evento BSC proyectado.`);
  }
  const normalized = event.normalized;
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new DomainConflictError(`Evento ${claim.eventId} no tiene payload normalizado.`);
  }
  const payload = normalized as Record<string, unknown>;
  if (
    typeof payload.batchId !== 'string'
    || payload.batchId.toLowerCase() !== claim.batchId.toLowerCase()
    || payload.accountNormalized !== claim.walletNormalized
    || payload.amountRaw !== claim.amountRaw
  ) {
    throw new DomainConflictError(`Evento ${claim.eventId} no coincide con el claim.`);
  }
}

function assertClaimProjection(input: Parameters<typeof assertClaimProjectionUnsafe>[0]) {
  try {
    return assertClaimProjectionUnsafe(input);
  } catch (error) {
    if (error instanceof DomainConflictError) throw error;
    throw new DomainConflictError(`Claim ${input.claim._id} contiene datos corruptos.`);
  }
}

function validCursor(value?: string | null) {
  const cursor = value?.trim() || null;
  if (cursor && (cursor.length > 256 || !/^[A-Za-z0-9:._-]+$/.test(cursor))) {
    throw new DomainValidationError('cursor no es valido.');
  }
  return cursor;
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

function amountSummaryPipeline(walletNormalized: string) {
  return [
    { $match: { walletNormalized } },
    {
      $project: {
        status: 1,
        amountDecimal: {
          $convert: { input: '$amountRaw', to: 'decimal', onError: null, onNull: null },
        },
        validAmount: {
          $and: [
            { $eq: [{ $type: '$amountRaw' }, 'string'] },
            {
              $regexMatch: {
                input: { $convert: { input: '$amountRaw', to: 'string', onError: '' } },
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
        allocatedCount: { $sum: { $cond: [{ $eq: ['$status', 'allocated'] }, 1, 0] } },
        blockedCount: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
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
          $convert: { input: '$amountRaw', to: 'decimal', onError: null, onNull: null },
        },
        validAmount: {
          $and: [
            { $eq: [{ $type: '$amountRaw' }, 'string'] },
            {
              $regexMatch: {
                input: { $convert: { input: '$amountRaw', to: 'string', onError: '' } },
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
  const sourceIds = [...new Set(allocations.map((allocation) => allocation.sourceId))];
  const manifestBySource = new Map(sourceManifests.map((manifest) => (
    [manifest.sourceId, manifest]
  )));
  if (
    manifestBySource.size !== sourceIds.length
    || sourceManifests.length !== manifestBySource.size
    || allocations.some((allocation) => {
      const manifest = manifestBySource.get(allocation.sourceId);
      return (
        !manifest
        || !validateRewardSourceManifest(manifest)
        || manifest.periodId !== allocation.periodId
        || manifest.sourceTotalRaw !== allocation.sourceTotalRaw
        || manifest.sourceSetHash !== allocation.sourceSetHash
        || manifest.ruleVersion !== allocation.ruleVersion
        || manifest.ruleConfigHash !== allocation.ruleConfigHash
        || manifest.ruleEffectiveAt?.getTime() !== allocation.ruleEffectiveAt?.getTime()
        || manifest.calculationJobRunId !== allocation.calculationJobRunId
        || manifest.calculationKind !== allocation.calculationKind
        || manifest.calculationInputHash !== allocation.calculationInputHash
        || manifest.calculationOutputHash !== allocation.calculationOutputHash
        || manifest.status !== allocation.status
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
  const allocations = await db.collection<RewardAllocation>('reward_allocations')
    .find({
      walletNormalized,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    })
    .sort({ _id: 1 })
    .limit(limit + 1)
    .toArray();
  const page = allocations.slice(0, limit);
  if (page.some((allocation) => !validateRewardAllocationDocument(allocation))) {
    throw new DomainConflictError('La vista de rewards contiene una allocation manipulada.');
  }
  const sourceIds = [...new Set(page.map((allocation) => allocation.sourceId))];
  const [
    claims,
    openIncidents,
    sourceManifests,
    allocationSummaryRows,
    claimSummaryRows,
  ] = await Promise.all([
    db.collection<RewardClaim>('reward_claims')
      .find({ walletNormalized })
      .sort({ indexedAt: -1, _id: -1 })
      .limit(100)
      .toArray(),
    sourceIds.length === 0
      ? Promise.resolve(0)
      : db.collection('reward_integrity_incidents').countDocuments({
        sourceId: { $in: sourceIds },
        status: 'open',
      }, { limit: 1 }),
    sourceIds.length === 0
      ? Promise.resolve([])
      : db.collection<RewardSourceManifest>('reward_source_manifests')
        .find({ sourceId: { $in: sourceIds } })
        .toArray(),
    db.collection<RewardAllocation>('reward_allocations')
      .aggregate<WalletAmountSummary>(amountSummaryPipeline(walletNormalized))
      .toArray(),
    db.collection<RewardClaim>('reward_claims')
      .aggregate<WalletClaimSummary>(claimSummaryPipeline(walletNormalized))
      .toArray(),
  ]);
  const allocationSummary = allocationSummaryRows[0];
  const claimSummary = claimSummaryRows[0];
  if ((allocationSummary?.invalidCount ?? 0) > 0 || (claimSummary?.invalidCount ?? 0) > 0) {
    throw new DomainConflictError('El resumen de rewards contiene importes no canonicos.');
  }
  const totalAllocatedRaw = BigInt(allocationSummary?.allocatedRaw.toString() ?? '0');
  const totalClaimedRaw = BigInt(claimSummary?.claimedRaw.toString() ?? '0');
  assertRewardAllocationManifestBindings(page, sourceManifests);
  const batchIds = [...new Set(claims.map((claim) => claim.batchId))] as `0x${string}`[];
  const claimIds = claims.map((claim) => claim.eventId);
  const [batches, proofs, events] = claims.length === 0
    ? [[], [], []]
    : await Promise.all([
      db.collection<RewardClaimBatch>('reward_claim_batches')
        .find({ batchId: { $in: batchIds } })
        .toArray(),
      db.collection<RewardClaimProof>('reward_claim_proofs')
        .find({
          $or: claims.map((claim) => ({
            batchId: claim.batchId,
            walletNormalized: claim.walletNormalized,
          })),
        } as unknown as Filter<RewardClaimProof>)
        .toArray(),
      db.collection<{ _id: string } & Record<string, unknown>>('chain_events')
        .find({ _id: { $in: claimIds } })
        .toArray(),
    ]);
  if (
    claims.some((claim) => typeof claim.batchId !== 'string')
    || batches.some((batch) => typeof batch.batchId !== 'string')
    || proofs.some((proof) => (
      typeof proof.batchId !== 'string' || typeof proof.walletNormalized !== 'string'
    ))
  ) {
    throw new DomainConflictError('El historial de claims contiene referencias corruptas.');
  }
  const batchById = new Map(batches.map((batch) => [batch.batchId.toLowerCase(), batch]));
  const proofByClaim = new Map(proofs.map((proof) => (
    [`${proof.batchId.toLowerCase()}:${proof.walletNormalized}`, proof]
  )));
  const eventById = new Map(events.map((event) => [String(event._id), event]));
  for (const claim of claims) {
    assertClaimProjection({
      claim,
      batch: batchById.get(claim.batchId.toLowerCase()),
      proof: proofByClaim.get(`${claim.batchId.toLowerCase()}:${claim.walletNormalized}`),
      event: eventById.get(claim.eventId),
      expectedWallet: walletNormalized,
    });
  }
  const candidateProofs = await db.collection<RewardClaimProof>('reward_claim_proofs')
    .find({ walletNormalized })
    .sort({ _id: 1 })
    .limit(MAX_WALLET_PROOFS + 1)
    .toArray();
  if (candidateProofs.length > MAX_WALLET_PROOFS) {
    throw new DomainConflictError('La wallet excede el limite de proofs publicos paginables.');
  }
  if (candidateProofs.some((proof) => typeof proof.batchId !== 'string')) {
    throw new DomainConflictError('La wallet contiene un proof sin batchId canonico.');
  }
  const candidateBatchIds = [...new Set(
    candidateProofs.map((proof) => proof.batchId.toLowerCase()),
  )] as `0x${string}`[];
  const publishedBatches = candidateBatchIds.length === 0
    ? []
    : await db.collection<RewardClaimBatch>('reward_claim_batches').find({
      batchId: { $in: candidateBatchIds },
      status: 'published',
    }).toArray();
  if (publishedBatches.some((batch) => typeof batch.batchId !== 'string')) {
    throw new DomainConflictError('La wallet contiene un batch publicado corrupto.');
  }
  const publicationEventIds = publishedBatches.map((batch) => batch.publicationEventId)
    .filter((eventId): eventId is string => Boolean(eventId));
  const publishedBatchIds = publishedBatches.map((batch) => batch.batchId);
  const [publicationEvents, claimsForPublishedProofs] = publishedBatches.length === 0
    ? [[], []]
    : await Promise.all([
      db.collection<{ _id: string } & Record<string, unknown>>('chain_events').find({
        _id: { $in: publicationEventIds },
      }).toArray(),
      db.collection<RewardClaim>('reward_claims').find({
        walletNormalized,
        batchId: { $in: publishedBatchIds },
      }).toArray(),
    ]);
  const publishedById = new Map(publishedBatches.map((batch) => (
    [batch.batchId.toLowerCase(), batch]
  )));
  const publicationById = new Map(publicationEvents.map((event) => [event._id, event]));
  if (claimsForPublishedProofs.some((claim) => typeof claim.batchId !== 'string')) {
    throw new DomainConflictError('La wallet contiene un claim sin batchId canonico.');
  }
  const alreadyClaimed = new Set(claimsForPublishedProofs.map((claim) => (
    claim.batchId.toLowerCase()
  )));
  const publishedRewards = candidateProofs.flatMap((proof) => {
    const key = proof.batchId.toLowerCase();
    const batch = publishedById.get(key);
    if (!batch || alreadyClaimed.has(key)) return [];
    const publicationEvent = batch.publicationEventId
      ? publicationById.get(batch.publicationEventId)
      : undefined;
    if (!publicationEvent) {
      throw new DomainConflictError(`Batch ${batch.batchId} no tiene chain_event de publicacion.`);
    }
    return [validatePublishedRewardClaimable({
      batch,
      proof,
      publicationEvent,
      expectedWallet: walletNormalized,
      now: new Date(),
    })];
  });
  const claimables = publishedRewards.filter((reward) => reward.onChainStatus === 'claimable');
  const scheduledRewards = publishedRewards.filter(
    (reward) => reward.onChainStatus === 'scheduled',
  );
  const expiredRewards = publishedRewards.filter((reward) => reward.onChainStatus === 'expired');
  let allocatedRaw = BigInt(0);
  for (const allocation of page) {
    if (!/^(0|[1-9][0-9]*)$/.test(allocation.amountRaw)) {
      throw new DomainConflictError('Allocation con amountRaw no canonico.');
    }
    if (allocation.status === 'allocated') allocatedRaw += BigInt(allocation.amountRaw);
  }
  const publishedOutstandingRaw = publishedRewards.reduce(
    (sum, reward) => sum + BigInt(reward.batch.amountRaw),
    BigInt(0),
  );
  const accountedRaw = totalClaimedRaw + publishedOutstandingRaw;
  const pendingRaw = totalAllocatedRaw > accountedRaw
    ? totalAllocatedRaw - accountedRaw
    : BigInt(0);
  const blockedAllocations = allocationSummary?.blockedCount ?? 0;
  return {
    walletNormalized,
    allocations: page.map((allocation) => ({
      allocationId: allocation.allocationId,
      periodId: allocation.periodId,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
      status: allocation.status,
      ruleVersion: allocation.ruleVersion,
      createdAt: allocation.createdAt,
    })),
    claims: claims.map((claim) => ({
      batchId: claim.batchId,
      chainId: batchById.get(claim.batchId.toLowerCase())!.chainId as 56 | 97,
      amountRaw: claim.amountRaw,
      transactionHash: claim.transactionHash,
      blockNumber: claim.blockNumber,
      indexedAt: claim.indexedAt,
    })),
    pageAllocatedRaw: allocatedRaw.toString(),
    totalAllocatedRaw: totalAllocatedRaw.toString(),
    totalClaimedRaw: totalClaimedRaw.toString(),
    pendingRaw: pendingRaw.toString(),
    claimableRaw: claimables.reduce(
      (sum, claimable) => sum + BigInt(claimable.batch.amountRaw),
      BigInt(0),
    ).toString(),
    scheduledRaw: scheduledRewards.reduce(
      (sum, reward) => sum + BigInt(reward.batch.amountRaw),
      BigInt(0),
    ).toString(),
    expiredRaw: expiredRewards.reduce(
      (sum, reward) => sum + BigInt(reward.batch.amountRaw),
      BigInt(0),
    ).toString(),
    allocationCount: allocationSummary?.allocatedCount ?? 0,
    claimCount: claimSummary?.claimCount ?? 0,
    claimPublished: publishedRewards.length > 0,
    claimables,
    publishedRewards,
    openIncidents,
    blockedAllocations,
    healthy: openIncidents === 0 && blockedAllocations === 0,
    nextCursor: allocations.length > limit ? page.at(-1)?._id ?? null : null,
  };
}
