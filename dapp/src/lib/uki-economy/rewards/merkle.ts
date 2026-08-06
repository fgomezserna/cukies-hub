import "server-only";

import { createHash } from "node:crypto";

import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

import { DomainConflictError, DomainValidationError } from "../errors";
import { formatRawAmount, parseRawAmount } from "../money";
import { getIsoWeekPeriodFromId } from "../periods";
import type { RewardRepository, RewardTransactionRunner } from "./repository";
import { mongoRewardTransactionRunner } from "./repository";
import {
  assertRewardRule,
  compareRewardText,
  normalizeRewardAccrualDrafts,
  normalizeRewardDrafts,
  stableRewardHash,
  validRewardDate,
  validRewardText,
  validRewardWallet,
} from "./rules";
import {
  validateRewardAllocationDocument,
  validateRewardPoolAccrualDocument,
  validateRewardSourceManifest,
} from "./service";
import {
  REWARD_ALLOCATION_PAGE_SIZE,
  REWARD_MAX_ALLOCATIONS_PER_PERIOD,
  type DraftRewardClaimBatchInput,
  type RewardAllocation,
  type RewardPoolAccrual,
  type RewardSourceManifest,
  type RewardClaimBatch,
  type RewardClaimProof,
  type RewardPeriodSeal,
  type SealRewardPeriodInput,
} from "./types";

type ClaimAmount = { walletAddress: Address; amountRaw: string };

function validBatchInput(input: DraftRewardClaimBatchInput) {
  const record = input as unknown as Record<string, unknown>;
  for (const forbidden of [
    "status",
    "publishAuthorized",
    "authorize",
    "authorization",
    "signature",
    "transactionHash",
    "publish",
    "sign",
  ]) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) {
      throw new DomainValidationError(
        `El draft no acepta el campo de autorizacion/publicacion ${forbidden}.`
      );
    }
  }
  const periodId = validRewardText(input.periodId, "periodId");
  const expectedPeriodAllocationHash = validHash(
    input.expectedPeriodAllocationHash,
    "expectedPeriodAllocationHash"
  );
  if (input.chainId !== 56 && input.chainId !== 97) {
    throw new DomainValidationError("chainId debe ser BSC 56 o BSC testnet 97.");
  }
  if (!isAddress(input.distributorAddress) || /^0x0{40}$/i.test(input.distributorAddress)) {
    throw new DomainValidationError("distributorAddress no es valida.");
  }
  if (
    typeof input.metadata !== "string" ||
    input.metadata.trim().length === 0 ||
    input.metadata.length > 512
  ) {
    throw new DomainValidationError("metadata debe tener entre 1 y 512 caracteres.");
  }
  return {
    periodId,
    expectedPeriodAllocationHash,
    chainId: input.chainId,
    distributorAddress: getAddress(input.distributorAddress),
    metadata: input.metadata.normalize("NFC"),
    now: validRewardDate(input.now, "now"),
  };
}

function validHash(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser un SHA-256 canonico.`);
  }
  return value;
}

export function rewardLeafHash(
  chainId: number,
  distributorAddress: Address,
  batchId: Hex,
  walletAddress: Address,
  amountRaw: string
) {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        BigInt(chainId),
        distributorAddress,
        batchId,
        walletAddress,
        parseRawAmount(amountRaw),
      ]
    )
  );
  // OpenZeppelin StandardMerkleTree usa doble hash en la hoja.
  return keccak256(inner);
}

export function rewardHashPair(left: Hex, right: Hex) {
  const [first, second] = left.toLowerCase() <= right.toLowerCase()
    ? [left, right]
    : [right, left];
  return keccak256(concatHex([first, second]));
}

function merkleLayers(leaves: Hex[]) {
  if (leaves.length === 0) throw new DomainValidationError("El Merkle draft requiere hojas.");
  const layers: Hex[][] = [[...leaves]];
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(
        index + 1 < current.length
          ? rewardHashPair(current[index], current[index + 1])
          : current[index]
      );
    }
    layers.push(next);
  }
  return layers;
}

function proofFor(layers: Hex[][], leafIndex: number) {
  const proof: Hex[] = [];
  let index = leafIndex;
  for (let layer = 0; layer < layers.length - 1; layer += 1) {
    const sibling = index % 2 === 0 ? index + 1 : index - 1;
    if (sibling < layers[layer].length) proof.push(layers[layer][sibling]);
    index = Math.floor(index / 2);
  }
  return proof;
}

async function listAllPeriodAllocations(
  repository: RewardRepository,
  periodId: string
) {
  const allocations: RewardAllocation[] = [];
  let afterAllocationId: string | null = null;
  while (allocations.length <= REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    const page = await repository.listPeriodAllocationsPage(
      periodId,
      afterAllocationId,
      REWARD_ALLOCATION_PAGE_SIZE
    );
    if (page.length === 0) break;
    if (page.some((allocation) => allocation.periodId !== periodId)) {
      throw new DomainConflictError("El repositorio devolvio allocations de otro periodo.");
    }
    const lastId = page.at(-1)!._id;
    if (afterAllocationId && lastId <= afterAllocationId) {
      throw new DomainConflictError("La paginacion de allocations no avanzo.");
    }
    allocations.push(...page);
    afterAllocationId = lastId;
    if (page.length < REWARD_ALLOCATION_PAGE_SIZE) break;
  }
  if (allocations.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainConflictError(
      `El periodo excede ${REWARD_MAX_ALLOCATIONS_PER_PERIOD} allocations materializables.`
    );
  }
  return allocations;
}

async function listAllPeriodSourceManifests(
  repository: RewardRepository,
  periodId: string,
) {
  const manifests: RewardSourceManifest[] = [];
  let afterSourceId: string | null = null;
  while (manifests.length <= REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    const page = await repository.listPeriodSourceManifestsPage(
      periodId,
      afterSourceId,
      REWARD_ALLOCATION_PAGE_SIZE,
    );
    if (page.length === 0) break;
    if (page.some((manifest) => manifest.periodId !== periodId)) {
      throw new DomainConflictError("El repositorio devolvio manifests de otro periodo.");
    }
    const lastId = page.at(-1)!._id;
    if (afterSourceId && lastId <= afterSourceId) {
      throw new DomainConflictError("La paginacion de manifests no avanzo.");
    }
    manifests.push(...page);
    afterSourceId = lastId;
    if (page.length < REWARD_ALLOCATION_PAGE_SIZE) break;
  }
  if (manifests.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainConflictError("El periodo excede el limite de manifests.");
  }
  return manifests;
}

async function listAllPeriodAccruals(
  repository: RewardRepository,
  periodId: string,
) {
  const accruals: RewardPoolAccrual[] = [];
  let afterAccrualId: string | null = null;
  while (accruals.length <= REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    const page = await repository.listPeriodAccrualsPage(
      periodId,
      afterAccrualId,
      REWARD_ALLOCATION_PAGE_SIZE,
    );
    if (page.length === 0) break;
    if (page.some((accrual) => accrual.periodId !== periodId)) {
      throw new DomainConflictError("El repositorio devolvio accruals de otro periodo.");
    }
    const lastId = page.at(-1)!._id;
    if (afterAccrualId && lastId <= afterAccrualId) {
      throw new DomainConflictError("La paginacion de accruals no avanzo.");
    }
    accruals.push(...page);
    afterAccrualId = lastId;
    if (page.length < REWARD_ALLOCATION_PAGE_SIZE) break;
  }
  if (accruals.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainConflictError("El periodo excede el limite de accruals.");
  }
  return accruals;
}

async function listCanonicalSettledGameSourceIds(
  repository: RewardRepository,
  periodId: string,
) {
  let period;
  try {
    period = getIsoWeekPeriodFromId(periodId);
  } catch {
    throw new DomainValidationError("periodId no es una semana ISO canonica.");
  }
  if (
    await repository.countPendingGameSettlements(
      period.start,
      period.endExclusive,
    ) > 0
  ) {
    throw new DomainConflictError(
      "El periodo tiene settlements de juego en curso y no puede sellarse.",
    );
  }
  const sourceIds: string[] = [];
  let afterSessionId: string | null = null;
  while (sourceIds.length <= REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    const page = await repository.listSettledGameSessionsPage(
      period.start,
      period.endExclusive,
      afterSessionId,
      REWARD_ALLOCATION_PAGE_SIZE,
    );
    if (page.length === 0) break;
    const last = page.at(-1)!;
    if (
      (afterSessionId && last.sessionId <= afterSessionId)
      || page.some((session) => (
        !(session.settledAt instanceof Date)
        || Number.isNaN(session.settledAt.getTime())
        || session.settledAt.getTime() < period.start.getTime()
        || session.settledAt.getTime() >= period.endExclusive.getTime()
      ))
    ) {
      throw new DomainConflictError("El censo canonico de games no avanzo o contiene otra semana.");
    }
    sourceIds.push(...page.map((session) => `game-session:${session.sessionId}`));
    afterSessionId = last.sessionId;
    if (page.length < REWARD_ALLOCATION_PAGE_SIZE) break;
  }
  if (sourceIds.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainConflictError("El periodo excede el limite de game sessions.");
  }
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new DomainConflictError("El censo canonico contiene sesiones duplicadas.");
  }
  return sourceIds.sort(compareRewardText);
}

async function assertPeriodSourceManifests(
  repository: RewardRepository,
  periodId: string,
  allocations: RewardAllocation[],
  accruals: RewardPoolAccrual[],
) {
  const manifests = await listAllPeriodSourceManifests(repository, periodId);
  const allocationSources = new Map<string, RewardAllocation[]>();
  for (const allocation of allocations) {
    allocationSources.set(
      allocation.sourceId,
      [...(allocationSources.get(allocation.sourceId) ?? []), allocation],
    );
  }
  const accrualSources = new Map<string, RewardPoolAccrual[]>();
  for (const accrual of accruals) {
    accrualSources.set(
      accrual.sourceId,
      [...(accrualSources.get(accrual.sourceId) ?? []), accrual],
    );
  }
  const sourceIds = new Set([...allocationSources.keys(), ...accrualSources.keys()]);
  if (manifests.length !== sourceIds.size) {
    throw new DomainConflictError("Los manifests globales no cubren exactamente el periodo.");
  }
  for (const manifest of manifests) {
    const sourceAllocations = allocationSources.get(manifest.sourceId) ?? [];
    const sourceAccruals = accrualSources.get(manifest.sourceId) ?? [];
    const first = sourceAllocations[0] ?? sourceAccruals[0];
    const claimableTotal = sourceAllocations.reduce(
      (sum, allocation) => sum + parseRawAmount(allocation.amountRaw),
      BigInt(0),
    );
    const accrualTotal = sourceAccruals.reduce(
      (sum, accrual) => sum + parseRawAmount(accrual.amountRaw),
      BigInt(0),
    );
    if (
      !first
      || !validateRewardSourceManifest(manifest)
      || manifest.status !== "allocated"
      || manifest.periodId !== first.periodId
      || manifest.sourceTotalRaw !== first.sourceTotalRaw
      || manifest.claimableTotalRaw !== formatRawAmount(claimableTotal)
      || manifest.accrualTotalRaw !== formatRawAmount(accrualTotal)
      || manifest.allocationCount !== sourceAllocations.length
      || manifest.accrualCount !== sourceAccruals.length
      || manifest.sourceSetHash !== first.sourceSetHash
      || manifest.ruleVersion !== first.ruleVersion
      || manifest.ruleConfigHash !== first.ruleConfigHash
      || manifest.ruleEffectiveAt?.getTime() !== first.ruleEffectiveAt?.getTime()
      || manifest.calculationJobRunId !== first.calculationJobRunId
      || manifest.calculationKind !== first.calculationKind
      || manifest.calculationInputHash !== first.calculationInputHash
      || manifest.calculationOutputHash !== first.calculationOutputHash
      || recomputeRewardSourceSetHash(manifest, sourceAllocations, sourceAccruals)
        !== manifest.sourceSetHash
    ) {
      throw new DomainConflictError(
        `El manifest global ${manifest.sourceId} no coincide con claims y accruals.`,
      );
    }
  }
  const canonicalGameSources = await listCanonicalSettledGameSourceIds(repository, periodId);
  const manifestedGameSources = manifests
    .filter((manifest) => manifest.calculationKind === "settlement")
    .map((manifest) => manifest.sourceId)
    .sort(compareRewardText);
  if (!sameSourceIds(canonicalGameSources, manifestedGameSources)) {
    throw new DomainConflictError(
      "El censo canonico de game sessions settled no coincide con sus obligaciones rewards.",
    );
  }
  return manifests;
}

function recomputeRewardSourceSetHash(
  manifest: RewardSourceManifest,
  allocations: RewardAllocation[],
  accruals: RewardPoolAccrual[],
) {
  return stableRewardHash({
    kind: "reward-allocation-set",
    periodId: manifest.periodId,
    sourceId: manifest.sourceId,
    sourceTotalRaw: manifest.sourceTotalRaw,
    ruleVersion: manifest.ruleVersion,
    ruleConfigHash: manifest.ruleConfigHash,
    ruleEffectiveAt: manifest.ruleEffectiveAt,
    allocations: normalizeRewardDrafts(allocations.map((allocation) => ({
      walletNormalized: allocation.walletNormalized,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
    }))),
    accruals: normalizeRewardAccrualDrafts(accruals.map((accrual) => ({
      category: accrual.category,
      amountRaw: accrual.amountRaw,
    }))),
    calculation: {
      jobRunId: manifest.calculationJobRunId,
      kind: manifest.calculationKind,
      inputHash: manifest.calculationInputHash,
      outputHash: manifest.calculationOutputHash,
    },
  });
}

export function buildRewardPeriodAllocationHash(
  periodId: string,
  allocations: RewardAllocation[],
  accruals: RewardPoolAccrual[] = [],
  manifests: RewardSourceManifest[] = [],
) {
  return stableRewardHash({
    kind: "reward-period-allocation-set",
    periodId,
    allocations: [...allocations]
      .sort((left, right) => compareRewardText(left._id, right._id))
      .map((allocation) => ({
        allocationId: allocation.allocationId,
        payloadHash: allocation.payloadHash,
        sourceSetHash: allocation.sourceSetHash,
        status: allocation.status,
      })),
    accruals: [...accruals]
      .sort((left, right) => compareRewardText(left._id, right._id))
      .map((accrual) => ({
        accrualId: accrual.accrualId,
        payloadHash: accrual.payloadHash,
        sourceSetHash: accrual.sourceSetHash,
        status: accrual.status,
      })),
    manifests: [...manifests]
      .sort((left, right) => compareRewardText(left._id, right._id))
      .map((manifest) => ({
        sourceId: manifest.sourceId,
        payloadHash: manifest.payloadHash,
        sourceSetHash: manifest.sourceSetHash,
        status: manifest.status,
      })),
  });
}

function validatePeriodAllocationSet(
  periodId: string,
  allocations: RewardAllocation[],
  accruals: RewardPoolAccrual[],
  manifests: RewardSourceManifest[],
) {
  if (allocations.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainConflictError("El periodo excede el limite de allocations materializables.");
  }
  for (const allocation of allocations) {
    if (!validateRewardAllocationDocument(allocation) || allocation.status !== "allocated") {
      throw new DomainConflictError(`Allocation manipulada o bloqueada: ${allocation._id}.`);
    }
  }
  for (const accrual of accruals) {
    if (!validateRewardPoolAccrualDocument(accrual) || accrual.status !== "accrued") {
      throw new DomainConflictError(`Accrual manipulado o bloqueado: ${accrual._id}.`);
    }
  }
  if (manifests.length === 0) {
    throw new DomainConflictError("No hay obligaciones materializadas para el periodo.");
  }
  const ruleVersions = new Set(manifests.map((manifest) => manifest.ruleVersion));
  const configHashes = new Set(manifests.map((manifest) => manifest.ruleConfigHash));
  if (ruleVersions.size !== 1 || configHashes.size !== 1) {
    throw new DomainConflictError("Un batch no puede mezclar reglas de rewards.");
  }
  const sourceIds = manifests.map((manifest) => manifest.sourceId).sort(compareRewardText);
  return {
    sourceIds,
    ruleVersion: [...ruleVersions][0],
    ruleConfigHash: [...configHashes][0],
    periodAllocationHash: buildRewardPeriodAllocationHash(
      periodId,
      allocations,
      accruals,
      manifests,
    ),
  };
}

function aggregateClaims(allocations: RewardAllocation[]) {
  const amounts = new Map<string, bigint>();
  for (const allocation of allocations) {
    const wallet = validRewardWallet(allocation.walletNormalized);
    amounts.set(wallet, (amounts.get(wallet) ?? BigInt(0)) + parseRawAmount(allocation.amountRaw));
  }
  return [...amounts.entries()]
    .map(([wallet, amount]) => ({
      walletAddress: getAddress(wallet) as Address,
      amountRaw: formatRawAmount(amount),
    }))
    .sort((left, right) =>
      compareRewardText(left.walletAddress.toLowerCase(), right.walletAddress.toLowerCase())
    );
}

export function materializeRewardMerkleDraft(input: {
  periodId: string;
  chainId: number;
  distributorAddress: Address;
  metadata: string;
  sourceAllocationSetHash: string;
  periodSealId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  sourceIds: string[];
  claims: ClaimAmount[];
  createdAt: Date;
}) {
  const claims = [...input.claims].sort((left, right) =>
    compareRewardText(left.walletAddress.toLowerCase(), right.walletAddress.toLowerCase())
  );
  if (claims.length === 0) throw new DomainValidationError("El draft no puede estar vacio.");
  // Shared contract/tooling convention: the period alone defines the bytes32 batch id.
  const batchId = keccak256(stringToHex(input.periodId));
  const leaves = claims.map((claim) =>
    rewardLeafHash(
      input.chainId,
      input.distributorAddress,
      batchId,
      claim.walletAddress,
      claim.amountRaw
    )
  );
  const layers = merkleLayers(leaves);
  const proofs: RewardClaimProof[] = claims.map((claim, index) => {
    const walletNormalized = claim.walletAddress.toLowerCase();
    const proofId = stableRewardHash({
      kind: "reward-claim-proof-id",
      batchId,
      walletNormalized,
    });
    const immutable = {
      proofId,
      batchId,
      periodId: input.periodId,
      walletAddress: claim.walletAddress,
      walletNormalized,
      amountRaw: claim.amountRaw,
      leaf: leaves[index],
      proof: proofFor(layers, index),
    };
    return {
      _id: proofId,
      ...immutable,
      payloadHash: stableRewardHash({ kind: "reward-claim-proof", ...immutable }),
      createdAt: input.createdAt,
    };
  });
  const proofSetHash = stableRewardHash({
    kind: "reward-claim-proof-set",
    batchId,
    proofs: [...proofs]
      .sort((left, right) => compareRewardText(left.proofId, right.proofId))
      .map(({ proofId, payloadHash }) => ({ proofId, payloadHash })),
  });
  const canonical = {
    batchId,
    periodId: input.periodId,
    chainId: input.chainId,
    distributorAddress: input.distributorAddress,
    metadata: input.metadata,
    allocations: claims,
  };
  const canonicalInputHash = `0x${createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex")}` as const;
  const draftKey = stableRewardHash({
    kind: "reward-claim-draft",
    periodId: input.periodId,
    chainId: input.chainId,
    distributorAddress: input.distributorAddress.toLowerCase(),
    sourceAllocationSetHash: input.sourceAllocationSetHash,
  });
  const totalAllocatedRaw = formatRawAmount(
    claims.reduce((sum, claim) => sum + parseRawAmount(claim.amountRaw), BigInt(0))
  );
  const batch: RewardClaimBatch = {
    _id: draftKey,
    draftKey,
    batchId,
    periodId: input.periodId,
    chainId: input.chainId,
    distributorAddress: input.distributorAddress,
    metadata: input.metadata,
    metadataHash: keccak256(stringToHex(input.metadata)),
    merkleRoot: layers[layers.length - 1][0],
    totalAllocatedRaw,
    allocationCount: claims.length,
    sourceAllocationSetHash: input.sourceAllocationSetHash,
    periodSealId: input.periodSealId,
    ruleVersion: input.ruleVersion,
    ruleConfigHash: input.ruleConfigHash,
    sourceIds: [...input.sourceIds],
    proofSetHash,
    proofCollection: "reward_claim_proofs",
    canonicalInputHash,
    status: "draft",
    previewOnly: true,
    publishAuthorized: false,
    signature: null,
    transactionHash: null,
    createdAt: input.createdAt,
  };
  return { batch, proofs };
}

async function listAllDraftProofs(
  repository: RewardRepository,
  batchId: RewardClaimProof["batchId"],
) {
  const proofs: RewardClaimProof[] = [];
  let afterProofId: string | null = null;
  while (proofs.length <= REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    const page = await repository.listDraftProofsPage(
      batchId,
      afterProofId,
      REWARD_ALLOCATION_PAGE_SIZE,
    );
    if (page.length === 0) break;
    const lastId = page.at(-1)!._id;
    if (afterProofId && lastId <= afterProofId) {
      throw new DomainConflictError("La paginacion de proofs no avanzo.");
    }
    proofs.push(...page);
    afterProofId = lastId;
    if (page.length < REWARD_ALLOCATION_PAGE_SIZE) break;
  }
  if (proofs.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainConflictError("El batch excede el limite de proofs.");
  }
  return proofs;
}

function assertStoredProofsMatch(
  stored: RewardClaimProof[],
  expected: RewardClaimProof[],
) {
  const left = [...stored].sort((a, b) => compareRewardText(a._id, b._id));
  const right = [...expected].sort((a, b) => compareRewardText(a._id, b._id));
  if (
    left.length !== right.length
    || left.some((proof, index) => stableRewardHash(proof) !== stableRewardHash(right[index]))
  ) {
    throw new DomainConflictError("Los proofs persistidos fueron manipulados.");
  }
}

function canonicalSourceIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DomainValidationError("expectedSourceIds debe contener al menos un source.");
  }
  if (value.length > REWARD_MAX_ALLOCATIONS_PER_PERIOD) {
    throw new DomainValidationError("expectedSourceIds excede el limite seguro.");
  }
  const normalized = value.map((sourceId) => validRewardText(sourceId, "sourceId"));
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainValidationError("expectedSourceIds no admite duplicados.");
  }
  return normalized.sort(compareRewardText);
}

function sameSourceIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function periodSealPayload(input: Omit<RewardPeriodSeal, "payloadHash" | "createdAt">) {
  return stableRewardHash({ kind: "reward-period-seal", ...input });
}

export function assertRewardPeriodSealIntegrity(seal: RewardPeriodSeal) {
  const payload = {
    _id: seal._id,
    sealId: seal.sealId,
    periodId: seal.periodId,
    expectedSourceIds: canonicalSourceIds(seal.expectedSourceIds),
    periodAllocationHash: validHash(seal.periodAllocationHash, "periodAllocationHash"),
    ruleVersion: validRewardText(seal.ruleVersion, "ruleVersion"),
    ruleConfigHash: validHash(seal.ruleConfigHash, "ruleConfigHash"),
    status: seal.status,
    sealedBy: validRewardText(seal.sealedBy, "sealedBy"),
  } satisfies Omit<RewardPeriodSeal, "payloadHash" | "createdAt">;
  const expectedId = stableRewardHash({ kind: "reward-period-seal-id", periodId: seal.periodId });
  if (
    seal.status !== "sealed" ||
    seal._id !== expectedId ||
    seal.sealId !== expectedId ||
    seal.payloadHash !== periodSealPayload(payload) ||
    !(seal.createdAt instanceof Date) ||
    Number.isNaN(seal.createdAt.getTime())
  ) {
    throw new DomainConflictError(`El sello del periodo ${seal.periodId} fue manipulado.`);
  }
  return seal;
}

function isMongoDuplicateKey(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === 11000
  );
}

export class RewardPeriodSealService {
  constructor(private readonly runTransaction: RewardTransactionRunner) {}

  async sealPeriod(input: SealRewardPeriodInput) {
    const periodId = validRewardText(input.periodId, "periodId");
    const expectedSourceIds = canonicalSourceIds(input.expectedSourceIds);
    const expectedPeriodAllocationHash = validHash(
      input.expectedPeriodAllocationHash,
      "expectedPeriodAllocationHash"
    );
    const expectedRuleVersion = validRewardText(
      input.expectedRuleVersion,
      "expectedRuleVersion"
    );
    const sealedBy = validRewardText(input.sealedBy, "sealedBy");
    const now = validRewardDate(input.now, "now");
    let period;
    try {
      period = getIsoWeekPeriodFromId(periodId);
    } catch {
      throw new DomainValidationError("periodId no es una semana ISO canonica.");
    }
    if (period.endExclusive.getTime() > now.getTime()) {
      throw new DomainConflictError(
        `El periodo ${periodId} sigue en curso hasta ${period.endExclusive.toISOString()}.`,
      );
    }
    const attempt = () => this.runTransaction(async (repository) => {
      if (await repository.countOpenPeriodIncidents(periodId) > 0) {
        throw new DomainConflictError(`El periodo ${periodId} tiene incidentes abiertos.`);
      }
      const allocations = await listAllPeriodAllocations(repository, periodId);
      const accruals = await listAllPeriodAccruals(repository, periodId);
      const manifests = await assertPeriodSourceManifests(
        repository,
        periodId,
        allocations,
        accruals,
      );
      const summary = validatePeriodAllocationSet(
        periodId,
        allocations,
        accruals,
        manifests,
      );
      if (!sameSourceIds(summary.sourceIds, expectedSourceIds)) {
        throw new DomainConflictError("El manifiesto de sources no coincide con el periodo.");
      }
      if (summary.periodAllocationHash !== expectedPeriodAllocationHash) {
        throw new DomainConflictError("El anchor externo del periodo no coincide con Mongo.");
      }
      if (summary.ruleVersion !== expectedRuleVersion) {
        throw new DomainConflictError("El periodo no usa la regla esperada.");
      }
      const rule = await repository.findRuleByVersion(expectedRuleVersion);
      if (!rule) throw new DomainConflictError("La version de regla esperada no existe.");
      // El cierre puede ocurrir despues de activeUntil. Se contrasta la version
      // inmutable usada al materializar, no su vigencia en el reloj del cierre.
      assertRewardRule(rule);
      if (rule.configHash !== summary.ruleConfigHash) {
        throw new DomainConflictError("La regla activa no coincide con las allocations.");
      }
      const sealId = stableRewardHash({ kind: "reward-period-seal-id", periodId });
      const withoutHash = {
        _id: sealId,
        sealId,
        periodId,
        expectedSourceIds,
        periodAllocationHash: summary.periodAllocationHash,
        ruleVersion: summary.ruleVersion,
        ruleConfigHash: summary.ruleConfigHash,
        status: "sealed" as const,
        sealedBy,
      };
      const seal: RewardPeriodSeal = {
        ...withoutHash,
        payloadHash: periodSealPayload(withoutHash),
        createdAt: now,
      };
      const existing = await repository.findPeriodSeal(periodId);
      if (existing) {
        assertRewardPeriodSealIntegrity(existing);
        if (existing.payloadHash !== seal.payloadHash) {
          throw new DomainConflictError(`El periodo ${periodId} ya tiene otro sello.`);
        }
        const state = await repository.findPeriodState(periodId);
        if (state?.status !== "sealed" || state.sealId !== existing.sealId) {
          throw new DomainConflictError(`El guard del periodo ${periodId} no coincide con su sello.`);
        }
        return { seal: existing, replayed: true };
      }
      await repository.sealPeriodState(periodId, sealId, now);
      await repository.insertPeriodSeal(seal);
      return { seal, replayed: false };
    });
    try {
      return await attempt();
    } catch (error) {
      if (isMongoDuplicateKey(error)) return attempt();
      throw error;
    }
  }
}

export type RewardDistributorIdentity = {
  chainId: 56 | 97;
  distributorAddress: Address;
};

export function loadRewardDistributorIdentity(): RewardDistributorIdentity {
  const rawChainId = process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID?.trim();
  const chainId = Number(rawChainId);
  if (chainId !== 56 && chainId !== 97) {
    throw new DomainConflictError("CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID no identifica BSC.");
  }
  const rawAddress = process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS?.trim()
    || process.env.NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS?.trim();
  if (!rawAddress || !isAddress(rawAddress) || /^0x0{40}$/i.test(rawAddress)) {
    throw new DomainConflictError("RewardsDistributor no tiene identidad BSC configurada.");
  }
  return { chainId, distributorAddress: getAddress(rawAddress) };
}

export class RewardClaimBatchService {
  constructor(
    private readonly runTransaction: RewardTransactionRunner,
    private readonly resolveIdentity: () => RewardDistributorIdentity = loadRewardDistributorIdentity,
  ) {}

  async createDraft(input: DraftRewardClaimBatchInput) {
    const valid = validBatchInput(input);
    const identity = this.resolveIdentity();
    if (
      valid.chainId !== identity.chainId
      || valid.distributorAddress.toLowerCase() !== identity.distributorAddress.toLowerCase()
    ) {
      throw new DomainConflictError(
        "El draft no coincide con la identidad BSC configurada de RewardsDistributor.",
      );
    }
    const attempt = () => this.runTransaction(async (repository) => {
      const seal = await repository.findPeriodSeal(valid.periodId);
      if (!seal) {
        throw new DomainConflictError(`El periodo ${valid.periodId} no esta sellado.`);
      }
      assertRewardPeriodSealIntegrity(seal);
      if (seal.periodAllocationHash !== valid.expectedPeriodAllocationHash) {
        throw new DomainConflictError("El anchor esperado no coincide con el sello del periodo.");
      }
      if (await repository.countOpenPeriodIncidents(valid.periodId) > 0) {
        throw new DomainConflictError(`El periodo ${valid.periodId} tiene incidentes abiertos.`);
      }
      const allocations = await listAllPeriodAllocations(repository, valid.periodId);
      const accruals = await listAllPeriodAccruals(repository, valid.periodId);
      const manifests = await assertPeriodSourceManifests(
        repository,
        valid.periodId,
        allocations,
        accruals,
      );
      const summary = validatePeriodAllocationSet(
        valid.periodId,
        allocations,
        accruals,
        manifests,
      );
      if (
        summary.periodAllocationHash !== seal.periodAllocationHash ||
        summary.ruleVersion !== seal.ruleVersion ||
        summary.ruleConfigHash !== seal.ruleConfigHash ||
        !sameSourceIds(summary.sourceIds, seal.expectedSourceIds)
      ) {
        throw new DomainConflictError("Las allocations ya no coinciden con el periodo sellado.");
      }
      const materialize = (createdAt: Date) => materializeRewardMerkleDraft({
        ...valid,
        sourceAllocationSetHash: summary.periodAllocationHash,
        periodSealId: seal.sealId,
        ruleVersion: seal.ruleVersion,
        ruleConfigHash: seal.ruleConfigHash,
        sourceIds: seal.expectedSourceIds,
        claims: aggregateClaims(allocations),
        createdAt,
      });
      const { batch, proofs } = materialize(valid.now);
      const existing = await repository.findDraftBatch(batch.draftKey);
      if (existing) {
        const expectedExisting = materialize(existing.createdAt);
        if (stableRewardHash(existing) !== stableRewardHash(expectedExisting.batch)) {
          throw new DomainConflictError("El draft persistido fue manipulado.");
        }
        const storedProofs = await listAllDraftProofs(repository, existing.batchId);
        assertStoredProofsMatch(storedProofs, expectedExisting.proofs);
        return { batch: existing, replayed: true };
      }
      await repository.insertDraftProofs(proofs);
      await repository.insertDraftBatch(batch);
      return { batch, replayed: false };
    });
    try {
      return await attempt();
    } catch (error) {
      if (isMongoDuplicateKey(error)) return attempt();
      throw error;
    }
  }
}

export const rewardClaimBatchService = new RewardClaimBatchService(
  mongoRewardTransactionRunner
);

export const rewardPeriodSealService = new RewardPeriodSealService(
  mongoRewardTransactionRunner
);
