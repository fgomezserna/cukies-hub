import "server-only";

import { DomainConflictError, DomainNotFoundError, DomainValidationError } from "../errors";
import { formatRawAmount, parseRawAmount } from "../money";
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
} from "./rules";
import {
  REWARD_MAX_ALLOCATIONS_PER_SOURCE,
  type RewardAccrualDraft,
  type PersistRewardAllocationSetResult,
  type RewardAllocation,
  type RewardAllocationDraft,
  type RewardAllocationSetInput,
  type RewardIntegrityIncident,
  type RewardPoolAccrual,
  type RewardRule,
  type RewardSourceManifest,
} from "./types";

const REWARD_CATEGORIES = new Set<string>([
  "player",
  "credit_pool_daily",
  "cukie_pool_original_distribution",
  "cukie_pool_second_plus_distribution",
  "cukie_pool_original_carry",
  "cukie_pool_second_plus_carry",
  "treasury",
  "marketing",
  "development",
  "supply_reduction",
]);

const REWARD_ACCRUAL_CATEGORIES = new Set<string>([
  "weekly_prize_pool",
  "credit_pool_weekly",
  "cukie_pool_original_weekly",
  "cukie_pool_second_plus_weekly",
  "undistributed_pending",
]);

function allocationIdentity(input: {
  periodId: string;
  sourceId: string;
  walletNormalized: string;
  category: string;
}) {
  return stableRewardHash({ kind: "reward-allocation", ...input });
}

function allocationPayload(input: {
  allocationId: string;
  periodId: string;
  sourceId: string;
  walletNormalized: string;
  category: string;
  amountRaw: string;
  sourceTotalRaw: string;
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  sourceSetHash: string;
  calculationJobRunId: string;
  calculationKind: RewardAllocation["calculationKind"];
  calculationInputHash: string;
  calculationOutputHash: string;
}) {
  return stableRewardHash({ kind: "reward-allocation-payload", ...input });
}

function accrualIdentity(input: {
  periodId: string;
  sourceId: string;
  category: string;
}) {
  return stableRewardHash({ kind: "reward-pool-accrual", ...input });
}

function accrualPayload(input: {
  accrualId: string;
  periodId: string;
  sourceId: string;
  category: string;
  amountRaw: string;
  sourceTotalRaw: string;
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  sourceSetHash: string;
  calculationJobRunId: string;
  calculationKind: RewardAllocation["calculationKind"];
  calculationInputHash: string;
  calculationOutputHash: string;
}) {
  return stableRewardHash({ kind: "reward-pool-accrual-payload", ...input });
}

function sourceSetHash(input: {
  periodId: string;
  sourceId: string;
  sourceTotalRaw: string;
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  allocations: RewardAllocationDraft[];
  accruals: RewardAccrualDraft[];
  calculation: RewardAllocationSetInput["calculation"];
}) {
  return stableRewardHash({ kind: "reward-allocation-set", ...input });
}

function sourceManifestPayload(input: Omit<
  RewardSourceManifest,
  "_id" | "payloadHash" | "status" | "createdAt" | "updatedAt"
>) {
  return stableRewardHash({ kind: "reward-source-manifest", ...input });
}

function buildSourceManifest(input: {
  periodId: string;
  sourceId: string;
  sourceTotalRaw: string;
  setHash: string;
  documents: RewardAllocation[];
  accrualDocuments: RewardPoolAccrual[];
  rule: RewardRule;
  ruleEffectiveAt: Date;
  calculation: RewardAllocationSetInput["calculation"];
  now: Date;
}): RewardSourceManifest {
  const claimableTotalRaw = formatRawAmount(input.documents.reduce(
    (sum, document) => sum + parseRawAmount(document.amountRaw),
    BigInt(0),
  ));
  const accrualTotalRaw = formatRawAmount(input.accrualDocuments.reduce(
    (sum, document) => sum + parseRawAmount(document.amountRaw),
    BigInt(0),
  ));
  const immutable = {
    sourceId: input.sourceId,
    periodId: input.periodId,
    sourceTotalRaw: input.sourceTotalRaw,
    claimableTotalRaw,
    accrualTotalRaw,
    allocationCount: input.documents.length,
    accrualCount: input.accrualDocuments.length,
    sourceSetHash: input.setHash,
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    ruleEffectiveAt: input.ruleEffectiveAt,
    calculationJobRunId: input.calculation.jobRunId,
    calculationKind: input.calculation.kind,
    calculationInputHash: input.calculation.inputHash,
    calculationOutputHash: input.calculation.outputHash,
  };
  return {
    _id: input.sourceId,
    ...immutable,
    payloadHash: sourceManifestPayload(immutable),
    status: "allocated",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function validateRewardSourceManifest(manifest: RewardSourceManifest) {
  try {
    const immutable = {
      sourceId: validRewardText(manifest.sourceId, "manifest.sourceId"),
      periodId: validRewardText(manifest.periodId, "manifest.periodId"),
      sourceTotalRaw: formatRawAmount(parseRawAmount(manifest.sourceTotalRaw)),
      claimableTotalRaw: formatRawAmount(parseRawAmount(manifest.claimableTotalRaw)),
      accrualTotalRaw: formatRawAmount(parseRawAmount(manifest.accrualTotalRaw)),
      allocationCount: manifest.allocationCount,
      accrualCount: manifest.accrualCount,
      sourceSetHash: manifest.sourceSetHash,
      ruleVersion: validRewardText(manifest.ruleVersion, "manifest.ruleVersion"),
      ruleConfigHash: manifest.ruleConfigHash,
      ruleEffectiveAt: validRewardDate(
        manifest.ruleEffectiveAt,
        "manifest.ruleEffectiveAt",
      ),
      calculationJobRunId: validRewardText(
        manifest.calculationJobRunId,
        "manifest.calculationJobRunId",
      ),
      calculationKind: manifest.calculationKind,
      calculationInputHash: manifest.calculationInputHash,
      calculationOutputHash: manifest.calculationOutputHash,
    };
    const createdAt = validRewardDate(manifest.createdAt, "manifest.createdAt");
    const updatedAt = validRewardDate(manifest.updatedAt, "manifest.updatedAt");
    return (
      manifest._id === immutable.sourceId
      && manifest.sourceId === immutable.sourceId
      && manifest.periodId === immutable.periodId
      && manifest.sourceTotalRaw === immutable.sourceTotalRaw
      && manifest.claimableTotalRaw === immutable.claimableTotalRaw
      && manifest.accrualTotalRaw === immutable.accrualTotalRaw
      && Number.isSafeInteger(manifest.allocationCount)
      && manifest.allocationCount >= 0
      && Number.isSafeInteger(manifest.accrualCount)
      && manifest.accrualCount >= 0
      && parseRawAmount(immutable.claimableTotalRaw)
        + parseRawAmount(immutable.accrualTotalRaw)
        === parseRawAmount(immutable.sourceTotalRaw)
      && parseRawAmount(immutable.sourceTotalRaw) > BigInt(0)
      && /^[0-9a-f]{64}$/.test(manifest.sourceSetHash)
      && /^[0-9a-f]{64}$/.test(manifest.ruleConfigHash)
      && /^[0-9a-f]{64}$/.test(manifest.calculationInputHash)
      && /^[0-9a-f]{64}$/.test(manifest.calculationOutputHash)
      && ["settlement", "credit_pool", "cukie_pool", "system"].includes(
        manifest.calculationKind,
      )
      && (manifest.status === "allocated" || manifest.status === "blocked")
      && updatedAt.getTime() >= createdAt.getTime()
      && manifest.payloadHash === sourceManifestPayload(immutable)
    );
  } catch {
    return false;
  }
}

function validateAndBuildDocuments(
  rule: RewardRule,
  input: RewardAllocationSetInput
) {
  const periodId = validRewardText(input.periodId, "periodId");
  const sourceId = validRewardText(input.sourceId, "sourceId");
  const now = validRewardDate(input.now, "now");
  const ruleEffectiveAt = validRewardDate(input.ruleEffectiveAt, "ruleEffectiveAt");
  const sourceTotalRaw = formatRawAmount(parseRawAmount(input.sourceTotalRaw));
  const calculationJobRunId = validRewardText(
    input.calculation?.jobRunId,
    "calculation.jobRunId"
  );
  const calculationKinds = new Set(["settlement", "credit_pool", "cukie_pool", "system"]);
  if (!calculationKinds.has(input.calculation?.kind)) {
    throw new DomainValidationError("calculation.kind no es valido.");
  }
  if (
    !/^[0-9a-f]{64}$/.test(input.calculation?.inputHash ?? "")
    || !/^[0-9a-f]{64}$/.test(input.calculation?.outputHash ?? "")
  ) {
    throw new DomainValidationError("Los hashes de calculation no son SHA-256 canonicos.");
  }
  const calculation = {
    jobRunId: calculationJobRunId,
    kind: input.calculation.kind,
    inputHash: input.calculation.inputHash,
    outputHash: input.calculation.outputHash,
  };
  if (parseRawAmount(sourceTotalRaw) <= BigInt(0)) {
    throw new DomainValidationError("sourceTotalRaw debe ser mayor que cero.");
  }
  if (!Array.isArray(input.allocations)) {
    throw new DomainValidationError("allocations debe ser una lista.");
  }
  if (
    input.allocations.length > REWARD_MAX_ALLOCATIONS_PER_SOURCE
    || (input.accruals?.length ?? 0) > REWARD_MAX_ALLOCATIONS_PER_SOURCE
  ) {
    throw new DomainValidationError(
      `No se permiten mas de ${REWARD_MAX_ALLOCATIONS_PER_SOURCE} entradas por source.`
    );
  }
  if (input.expectedRuleVersion !== rule.version) {
    throw new DomainConflictError("La version de regla resuelta no coincide con la esperada.");
  }
  const allocations = normalizeRewardDrafts(input.allocations);
  const accruals = normalizeRewardAccrualDrafts(input.accruals ?? []);
  if (allocations.length === 0 && accruals.length === 0) {
    throw new DomainValidationError("El source positivo no puede producir un set vacio.");
  }
  const identityKeys = new Set<string>();
  for (const allocation of allocations) {
    if (!REWARD_CATEGORIES.has(allocation.category)) {
      throw new DomainValidationError(`Categoria de reward no permitida: ${allocation.category}.`);
    }
    const key = `${allocation.walletNormalized}:${allocation.category}`;
    if (identityKeys.has(key)) {
      throw new DomainValidationError(`Allocation duplicada para ${key}.`);
    }
    identityKeys.add(key);
  }
  for (const accrual of accruals) {
    if (!REWARD_ACCRUAL_CATEGORIES.has(accrual.category)) {
      throw new DomainValidationError(
        `Categoria de accrual no permitida: ${accrual.category}.`,
      );
    }
  }
  const allocatedTotal = allocations.reduce(
    (sum, allocation) => sum + parseRawAmount(allocation.amountRaw),
    BigInt(0)
  );
  const accruedTotal = accruals.reduce(
    (sum, accrual) => sum + parseRawAmount(accrual.amountRaw),
    BigInt(0),
  );
  if (allocatedTotal + accruedTotal !== parseRawAmount(sourceTotalRaw)) {
    throw new DomainValidationError(
      `El set no reconcilia: claims=${allocatedTotal}, accruals=${accruedTotal}, source=${sourceTotalRaw}.`
    );
  }
  const setHash = sourceSetHash({
    periodId,
    sourceId,
    sourceTotalRaw,
    ruleVersion: rule.version,
    ruleConfigHash: rule.configHash,
    ruleEffectiveAt,
    allocations,
    accruals,
    calculation,
  });
  const documents: RewardAllocation[] = allocations.map((allocation) => {
    const allocationId = allocationIdentity({
      periodId,
      sourceId,
      walletNormalized: allocation.walletNormalized,
      category: allocation.category,
    });
    const immutable = {
      allocationId,
      periodId,
      sourceId,
      walletNormalized: allocation.walletNormalized,
      category: allocation.category,
      amountRaw: allocation.amountRaw,
      sourceTotalRaw,
      ruleVersion: rule.version,
      ruleConfigHash: rule.configHash,
      ruleEffectiveAt,
      sourceSetHash: setHash,
      calculationJobRunId: calculation.jobRunId,
      calculationKind: calculation.kind,
      calculationInputHash: calculation.inputHash,
      calculationOutputHash: calculation.outputHash,
    };
    return {
      _id: allocationId,
      ...immutable,
      payloadHash: allocationPayload(immutable),
      status: "allocated",
      createdAt: now,
      updatedAt: now,
    };
  });
  const accrualDocuments: RewardPoolAccrual[] = accruals.map((accrual) => {
    const accrualId = accrualIdentity({
      periodId,
      sourceId,
      category: accrual.category,
    });
    const immutable = {
      accrualId,
      periodId,
      sourceId,
      category: accrual.category,
      amountRaw: accrual.amountRaw,
      sourceTotalRaw,
      ruleVersion: rule.version,
      ruleConfigHash: rule.configHash,
      ruleEffectiveAt,
      sourceSetHash: setHash,
      calculationJobRunId: calculation.jobRunId,
      calculationKind: calculation.kind,
      calculationInputHash: calculation.inputHash,
      calculationOutputHash: calculation.outputHash,
    };
    return {
      _id: accrualId,
      ...immutable,
      payloadHash: accrualPayload(immutable),
      status: "accrued",
      createdAt: now,
      updatedAt: now,
    };
  });
  const manifest = buildSourceManifest({
    periodId,
    sourceId,
    sourceTotalRaw,
    setHash,
    documents,
    accrualDocuments,
    rule,
    ruleEffectiveAt,
    calculation,
    now,
  });
  return {
    periodId,
    sourceId,
    now,
    sourceTotalRaw,
    setHash,
    documents,
    accrualDocuments,
    manifest,
  };
}

export function validateRewardAllocationDocument(allocation: RewardAllocation) {
  const expectedId = allocationIdentity({
    periodId: allocation.periodId,
    sourceId: allocation.sourceId,
    walletNormalized: allocation.walletNormalized,
    category: allocation.category,
  });
  const expectedPayload = allocationPayload({
    allocationId: allocation.allocationId,
    periodId: allocation.periodId,
    sourceId: allocation.sourceId,
    walletNormalized: allocation.walletNormalized,
    category: allocation.category,
    amountRaw: allocation.amountRaw,
    sourceTotalRaw: allocation.sourceTotalRaw,
    ruleVersion: allocation.ruleVersion,
    ruleConfigHash: allocation.ruleConfigHash,
    ruleEffectiveAt: allocation.ruleEffectiveAt,
    sourceSetHash: allocation.sourceSetHash,
    calculationJobRunId: allocation.calculationJobRunId,
    calculationKind: allocation.calculationKind,
    calculationInputHash: allocation.calculationInputHash,
    calculationOutputHash: allocation.calculationOutputHash,
  });
  return (
    allocation._id === expectedId &&
    allocation.allocationId === expectedId &&
    allocation.payloadHash === expectedPayload &&
    allocation.ruleEffectiveAt instanceof Date &&
    !Number.isNaN(allocation.ruleEffectiveAt.getTime()) &&
    REWARD_CATEGORIES.has(allocation.category) &&
    (allocation.status === "allocated" || allocation.status === "blocked")
  );
}

export function validateRewardPoolAccrualDocument(accrual: RewardPoolAccrual) {
  const expectedId = accrualIdentity({
    periodId: accrual.periodId,
    sourceId: accrual.sourceId,
    category: accrual.category,
  });
  const expectedPayload = accrualPayload({
    accrualId: accrual.accrualId,
    periodId: accrual.periodId,
    sourceId: accrual.sourceId,
    category: accrual.category,
    amountRaw: accrual.amountRaw,
    sourceTotalRaw: accrual.sourceTotalRaw,
    ruleVersion: accrual.ruleVersion,
    ruleConfigHash: accrual.ruleConfigHash,
    ruleEffectiveAt: accrual.ruleEffectiveAt,
    sourceSetHash: accrual.sourceSetHash,
    calculationJobRunId: accrual.calculationJobRunId,
    calculationKind: accrual.calculationKind,
    calculationInputHash: accrual.calculationInputHash,
    calculationOutputHash: accrual.calculationOutputHash,
  });
  return (
    accrual._id === expectedId
    && accrual.accrualId === expectedId
    && accrual.payloadHash === expectedPayload
    && accrual.ruleEffectiveAt instanceof Date
    && !Number.isNaN(accrual.ruleEffectiveAt.getTime())
    && REWARD_ACCRUAL_CATEGORIES.has(accrual.category)
    && (accrual.status === "accrued" || accrual.status === "blocked")
  );
}

export function reconcileRewardAllocationSource(
  allocations: RewardAllocation[],
  accruals: RewardPoolAccrual[],
  expected: ReturnType<typeof validateAndBuildDocuments>
) {
  const reasonCodes: string[] = [];
  if (allocations.length > REWARD_MAX_ALLOCATIONS_PER_SOURCE) {
    reasonCodes.push("ALLOCATION_LIMIT_EXCEEDED");
  }
  if (allocations.length !== expected.documents.length) {
    reasonCodes.push("ALLOCATION_COUNT_MISMATCH");
  }
  if (accruals.length !== expected.accrualDocuments.length) {
    reasonCodes.push("ACCRUAL_COUNT_MISMATCH");
  }
  const ids = new Set<string>();
  let total = BigInt(0);
  for (const allocation of allocations) {
    if (ids.has(allocation._id)) reasonCodes.push("DUPLICATE_ALLOCATION_ID");
    ids.add(allocation._id);
    try {
      total += parseRawAmount(allocation.amountRaw);
    } catch {
      reasonCodes.push("INVALID_AMOUNT_RAW");
    }
    if (!validateRewardAllocationDocument(allocation)) {
      reasonCodes.push("ALLOCATION_PAYLOAD_TAMPERED");
    }
    if (
      allocation.periodId !== expected.periodId ||
      allocation.sourceId !== expected.sourceId ||
      allocation.sourceTotalRaw !== expected.sourceTotalRaw ||
      allocation.sourceSetHash !== expected.setHash ||
      !(allocation.ruleEffectiveAt instanceof Date) ||
      allocation.ruleEffectiveAt.getTime() !== expected.manifest.ruleEffectiveAt.getTime() ||
      allocation.calculationJobRunId !== expected.manifest.calculationJobRunId ||
      allocation.calculationKind !== expected.manifest.calculationKind ||
      allocation.calculationInputHash !== expected.manifest.calculationInputHash ||
      allocation.calculationOutputHash !== expected.manifest.calculationOutputHash ||
      allocation.status !== "allocated"
    ) {
      reasonCodes.push("ALLOCATION_SOURCE_MISMATCH");
    }
  }
  let accruedTotal = BigInt(0);
  const accrualIds = new Set<string>();
  for (const accrual of accruals) {
    if (accrualIds.has(accrual._id)) reasonCodes.push("DUPLICATE_ACCRUAL_ID");
    accrualIds.add(accrual._id);
    try {
      accruedTotal += parseRawAmount(accrual.amountRaw);
    } catch {
      reasonCodes.push("INVALID_ACCRUAL_AMOUNT_RAW");
    }
    if (!validateRewardPoolAccrualDocument(accrual)) {
      reasonCodes.push("ACCRUAL_PAYLOAD_TAMPERED");
    }
    if (
      accrual.periodId !== expected.periodId
      || accrual.sourceId !== expected.sourceId
      || accrual.sourceTotalRaw !== expected.sourceTotalRaw
      || accrual.sourceSetHash !== expected.setHash
      || !(accrual.ruleEffectiveAt instanceof Date)
      || accrual.ruleEffectiveAt.getTime() !== expected.manifest.ruleEffectiveAt.getTime()
      || accrual.calculationJobRunId !== expected.manifest.calculationJobRunId
      || accrual.calculationKind !== expected.manifest.calculationKind
      || accrual.calculationInputHash !== expected.manifest.calculationInputHash
      || accrual.calculationOutputHash !== expected.manifest.calculationOutputHash
      || accrual.status !== "accrued"
    ) {
      reasonCodes.push("ACCRUAL_SOURCE_MISMATCH");
    }
  }
  if (total + accruedTotal !== parseRawAmount(expected.sourceTotalRaw)) {
    reasonCodes.push("SOURCE_TOTAL_MISMATCH");
  }
  const expectedPayloads = expected.documents
    .map((allocation) => allocation.payloadHash)
    .sort(compareRewardText);
  const actualPayloads = allocations
    .map((allocation) => allocation.payloadHash)
    .sort(compareRewardText);
  if (stableRewardHash(actualPayloads) !== stableRewardHash(expectedPayloads)) {
    reasonCodes.push("ALLOCATION_SET_MISMATCH");
  }
  const expectedAccrualPayloads = expected.accrualDocuments
    .map((accrual) => accrual.payloadHash)
    .sort(compareRewardText);
  const actualAccrualPayloads = accruals
    .map((accrual) => accrual.payloadHash)
    .sort(compareRewardText);
  if (stableRewardHash(actualAccrualPayloads) !== stableRewardHash(expectedAccrualPayloads)) {
    reasonCodes.push("ACCRUAL_SET_MISMATCH");
  }
  return [...new Set(reasonCodes)].sort(compareRewardText);
}

function buildIncident(
  expected: ReturnType<typeof validateAndBuildDocuments>,
  allocations: RewardAllocation[],
  accruals: RewardPoolAccrual[],
  reasonCodes: string[]
): RewardIntegrityIncident {
  const evidenceHash = stableRewardHash({
    periodId: expected.periodId,
    sourceId: expected.sourceId,
    sourceSetHash: expected.setHash,
    reasonCodes,
    persisted: allocations.map((allocation) => ({
      id: allocation._id,
      payloadHash: allocation.payloadHash,
      status: allocation.status,
    })),
    accrued: accruals.map((accrual) => ({
      id: accrual._id,
      payloadHash: accrual.payloadHash,
      status: accrual.status,
    })),
  });
  const incidentId = stableRewardHash({
    kind: "reward-integrity-incident",
    periodId: expected.periodId,
    sourceId: expected.sourceId,
    evidenceHash,
  });
  return {
    _id: incidentId,
    incidentId,
    periodId: expected.periodId,
    sourceId: expected.sourceId,
    reasonCodes,
    evidenceHash,
    status: "open",
    detectedAt: expected.now,
  };
}

export class RewardAllocationService {
  constructor(private readonly runTransaction: RewardTransactionRunner) {}

  async persistAllocationSet(
    input: RewardAllocationSetInput
  ): Promise<PersistRewardAllocationSetResult> {
    const attempt = (): Promise<PersistRewardAllocationSetResult> =>
      this.runTransaction<PersistRewardAllocationSetResult>(async (repository) => {
      const now = validRewardDate(input.now, "now");
      const expectedRuleVersion = validRewardText(
        input.expectedRuleVersion,
        "expectedRuleVersion"
      );
      const ruleEffectiveAt = validRewardDate(input.ruleEffectiveAt, "ruleEffectiveAt");
      const rule = await repository.findRuleAt(ruleEffectiveAt, expectedRuleVersion);
      if (!rule) {
        throw new DomainNotFoundError(
          `No existe regla activa ${expectedRuleVersion} para rewards.`
        );
      }
      assertRewardRule(rule, ruleEffectiveAt);
      const expected = validateAndBuildDocuments(rule, input);
      let manifest = await repository.findSourceManifest(expected.sourceId);
      let persisted = await repository.listSourceAllocations(
        expected.periodId,
        expected.sourceId
      );
      let persistedAccruals = await repository.listSourceAccruals(
        expected.periodId,
        expected.sourceId,
      );
      const replayed = manifest !== null;
      if (manifest) {
        if (!validateRewardSourceManifest(manifest)) {
          throw new DomainConflictError(
            `El manifest global del source ${expected.sourceId} fue manipulado.`,
          );
        }
        if (manifest.periodId !== expected.periodId) {
          throw new DomainConflictError(
            `El source ${expected.sourceId} ya pertenece al periodo ${manifest.periodId}.`,
          );
        }
      } else {
        // Fail closed ante datos previos sin fence. Su adopcion requiere una
        // migracion auditada que compruebe primero todos los periodos.
        if (
          await repository.findAnyAllocationBySourceId(expected.sourceId)
          || await repository.findAnyAccrualBySourceId(expected.sourceId)
        ) {
          throw new DomainConflictError(
            `El source ${expected.sourceId} tiene allocations sin manifest global.`,
          );
        }
        // Allocation y sellado escriben el mismo guard de periodo. Mongo
        // fuerza write-conflict entre ambas transacciones. El manifest con
        // `_id=sourceId` hace lo mismo entre periodos distintos.
        await repository.advanceOpenPeriod(expected.periodId, expected.now);
        await repository.insertSourceManifest(expected.manifest);
        await repository.insertAllocations(expected.documents);
        await repository.insertAccruals(expected.accrualDocuments);
        manifest = await repository.findSourceManifest(expected.sourceId);
        persisted = await repository.listSourceAllocations(
          expected.periodId,
          expected.sourceId
        );
        persistedAccruals = await repository.listSourceAccruals(
          expected.periodId,
          expected.sourceId,
        );
      }
      const reasonCodes = reconcileRewardAllocationSource(
        persisted,
        persistedAccruals,
        expected,
      );
      if (!manifest || !validateRewardSourceManifest(manifest)) {
        reasonCodes.push("SOURCE_MANIFEST_TAMPERED");
      } else {
        if (manifest.payloadHash !== expected.manifest.payloadHash) {
          reasonCodes.push("SOURCE_MANIFEST_MISMATCH");
        }
        if (manifest.status !== "allocated") {
          reasonCodes.push("SOURCE_MANIFEST_BLOCKED");
        }
      }
      reasonCodes.sort(compareRewardText);
      if (reasonCodes.length > 0) {
        const periodState = await repository.findPeriodState(expected.periodId);
        if (periodState?.status === "sealed") {
          throw new DomainConflictError(
            `El periodo ${expected.periodId} esta sellado y no puede mutarse.`
          );
        }
        const incident = buildIncident(
          expected,
          persisted,
          persistedAccruals,
          reasonCodes,
        );
        await repository.blockSourceAndOpenIncident(incident);
        const blocked = await repository.listSourceAllocations(
          expected.periodId,
          expected.sourceId
        );
        const blockedAccruals = await repository.listSourceAccruals(
          expected.periodId,
          expected.sourceId,
        );
        return {
          status: "blocked",
          replayed,
          allocations: blocked,
          accruals: blockedAccruals,
          incident,
          sourceSetHash: expected.setHash,
        };
      }
      return {
        status: "allocated",
        replayed,
        allocations: persisted,
        accruals: persistedAccruals,
        sourceSetHash: expected.setHash,
      };
      });
    try {
      return await attempt();
    } catch (error) {
      // Dos workers pueden observar el source vacio a la vez. El perdedor de
      // la unique race relee una sola vez y entra por el camino de replay.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === 11000
      ) {
        return attempt();
      }
      throw error;
    }
  }
}

export const rewardAllocationService = new RewardAllocationService(
  mongoRewardTransactionRunner
);

export type { RewardRepository };
