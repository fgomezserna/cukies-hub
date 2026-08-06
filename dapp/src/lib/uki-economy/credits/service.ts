import "server-only";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  StaleFenceError,
} from "../errors";
import { assertCreditAmount } from "../money";
import { reconcileCompetitionCreditSnapshot } from "./reconciliation";
import {
  mapCreditPersistenceError,
  mongoCompetitionCreditTransactionRunner,
  type CompetitionCreditRepository,
  type CompetitionCreditTransactionRunner,
} from "./repository";
import {
  assertRuleActiveAt,
  buildCompetitionCreditPeriod,
  buildCreditSourceSlotsHash,
  buildCreditRunItemPayloadHash,
  compareCreditText,
  computePoolConfigEffectiveCutoff,
  creditCostForCode,
  currentCompetitionCreditPeriod,
  safeCompetitionCreditPeriodScopeId,
  stableCreditHash,
  sumExactCredits,
  validCreditDate,
  validCreditText,
  validCreditWallet,
  validPoolCreditsPerSlot,
} from "./rules";
import {
  CREDITS_PER_MATURE_SLOT,
  MAX_CREDIT_RESERVATION_ALLOCATIONS,
  type CompetitionCreditRule,
  type CompetitionCreditRun,
  type CreditIntegrityIncident,
  type CreditLot,
  type CreditLotFifoCursor,
  type CreditPoolConfiguration,
  type CreditReservation,
  type CreditReservationAllocation,
  type CreditRunItem,
  type CreditSnapshotSlot,
} from "./types";

const CREDIT_LOT_PAGE_SIZE = 100;

export type ConfigureCreditPoolInput = {
  walletAddress: string;
  slotId: string;
  poolCreditsPerSlot: number;
  idempotencyKey: string;
  now: Date;
};

export type CreateCreditRunInput = {
  cutoff: Date;
  expectedRuleVersion: string;
  now: Date;
};

export type RefreshCreditSourceWatermarkInput = {
  expectedRuleVersion: string;
  now: Date;
};

export type ClaimCreditRunInput = {
  runId: string;
  workerId: string;
  now: Date;
};

export type ProcessCreditRunBatchInput = {
  runId: string;
  workerId: string;
  fenceToken: number;
  now: Date;
  limit?: number;
};

export type ReserveCompetitionCreditsInput = {
  walletAddress: string;
  sessionId: string;
  costCode: string;
  expectedRuleVersion?: string;
  expectedRuleConfigHash?: string;
  idempotencyKey: string;
  expiresAtCap?: Date;
  now: Date;
};

export type ExpireCompetitionCreditBatchInput = {
  now: Date;
  limit?: number;
};

export type FinishCompetitionCreditReservationInput = {
  reservationId: string;
  idempotencyKey: string;
  committedAt?: Date;
  now: Date;
};

function validPositiveFence(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainValidationError("fenceToken debe ser un entero positivo.");
  }
  return value;
}

function validBatchLimit(value: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new DomainValidationError(
      `limit debe ser un entero entre 1 y ${maximum}.`
    );
  }
  return value;
}

function validSourceSlotShape(slot: CreditSnapshotSlot) {
  if (validCreditText(slot._id, "slotId") !== slot._id) {
    throw new DomainConflictError("slotId no esta en forma canonica.");
  }
  if (validCreditWallet(slot.walletNormalized) !== slot.walletNormalized) {
    throw new DomainConflictError(
      `walletNormalized no canonica en ${slot._id}.`
    );
  }
  validCreditDate(slot.qualifiedSince, `slot ${slot._id}.qualifiedSince`);
  validCreditDate(
    slot.creditEligibleFrom,
    `slot ${slot._id}.creditEligibleFrom`
  );
  if (slot.inactiveAt)
    validCreditDate(slot.inactiveAt, `slot ${slot._id}.inactiveAt`);
  if (slot.graceEndsAt)
    validCreditDate(slot.graceEndsAt, `slot ${slot._id}.graceEndsAt`);
  validCreditDate(slot.createdAt, `slot ${slot._id}.createdAt`);
  validCreditDate(slot.updatedAt, `slot ${slot._id}.updatedAt`);
  if (slot.route !== "uki" && slot.route !== "nft") {
    throw new DomainConflictError(`route invalida en ${slot._id}.`);
  }
  if (!["qualifying", "active", "grace", "inactive"].includes(slot.status)) {
    throw new DomainConflictError(`status invalido en ${slot._id}.`);
  }
  if (
    validCreditText(slot.roundId, `slot ${slot._id}.roundId`) !==
      slot.roundId ||
    validCreditText(slot.ruleVersion, `slot ${slot._id}.ruleVersion`) !==
      slot.ruleVersion
  ) {
    throw new DomainConflictError(`IDs no canonicos en ${slot._id}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(slot.sourceHash)) {
    throw new DomainConflictError(`sourceHash invalido en ${slot._id}.`);
  }
  if (
    !Number.isSafeInteger(slot.eligibilityEpoch) ||
    slot.eligibilityEpoch < 1
  ) {
    throw new DomainConflictError(`eligibilityEpoch invalido en ${slot._id}.`);
  }
  if (
    !Number.isSafeInteger(slot.ordinal) ||
    slot.ordinal < 1 ||
    slot.ordinal > 5
  ) {
    throw new DomainConflictError(`ordinal invalido en ${slot._id}.`);
  }
  if (!Number.isSafeInteger(slot.revision) || slot.revision < 0) {
    throw new DomainConflictError(`revision invalida en ${slot._id}.`);
  }
  return slot;
}

function validSnapshotSlot(
  slot: CreditSnapshotSlot,
  cutoff: Date,
  sourceRuleVersion: string
) {
  validSourceSlotShape(slot);
  if (slot.status !== "active" && slot.status !== "grace") {
    throw new DomainConflictError(
      `El slot ${slot._id} no esta activo ni en grace vigente.`
    );
  }
  if (slot.creditEligibleFrom.getTime() > cutoff.getTime()) {
    throw new DomainConflictError(
      `El slot ${slot._id} aun no cumple 24 horas en el corte.`
    );
  }
  if (
    slot.status === "grace" &&
    (!slot.graceEndsAt || slot.graceEndsAt.getTime() <= cutoff.getTime())
  )
    throw new DomainConflictError(
      `El grace del slot ${slot._id} no esta vigente en el corte.`
    );
  if (slot.ruleVersion !== sourceRuleVersion) {
    throw new DomainConflictError(
      `El slot ${slot._id} usa ${slot.ruleVersion}, no el watermark ${sourceRuleVersion}.`
    );
  }
  return slot;
}

function assertSameRequest(
  existing: { requestHash: string },
  requestHash: string,
  idempotencyKey: string
) {
  if (existing.requestHash !== requestHash) {
    throw new DomainConflictError(
      `La idempotencyKey ${idempotencyKey} ya se uso con otro payload.`
    );
  }
}

function validatePoolConfigurationIntegrity(config: CreditPoolConfiguration) {
  const walletNormalized = validCreditWallet(config.walletNormalized);
  const slotId = validCreditText(config.slotId, "config.slotId");
  const ruleVersion = validCreditText(config.ruleVersion, "config.ruleVersion");
  const idempotencyKey = validCreditText(
    config.idempotencyKey,
    "config.idempotencyKey"
  );
  const requestedAt = validCreditDate(config.requestedAt, "config.requestedAt");
  const effectiveCutoff = validCreditDate(
    config.effectiveCutoff,
    "config.effectiveCutoff"
  );
  const createdAt = validCreditDate(config.createdAt, "config.createdAt");
  const poolCreditsPerSlot = validPoolCreditsPerSlot(config.poolCreditsPerSlot);
  if (
    walletNormalized !== config.walletNormalized ||
    slotId !== config.slotId ||
    ruleVersion !== config.ruleVersion ||
    idempotencyKey !== config.idempotencyKey ||
    !Number.isSafeInteger(config.eligibilityEpoch) ||
    config.eligibilityEpoch < 1 ||
    !/^[0-9a-f]{64}$/.test(config.ruleConfigHash) ||
    requestedAt.getTime() !== createdAt.getTime()
  ) {
    throw new DomainConflictError(
      `Config de pool manipulada para ${config.slotId}.`
    );
  }
  const expectedPayload = stableCreditHash({
    walletNormalized,
    slotId,
    eligibilityEpoch: config.eligibilityEpoch,
    poolCreditsPerSlot,
    requestedAt,
    effectiveCutoff,
    ruleVersion,
    ruleConfigHash: config.ruleConfigHash,
  });
  const expectedRequest = stableCreditHash({
    walletNormalized,
    slotId,
    poolCreditsPerSlot,
  });
  const expectedId = stableCreditHash({
    kind: "pool-config",
    walletNormalized,
    slotId,
    eligibilityEpoch: config.eligibilityEpoch,
    ruleVersion,
    ruleConfigHash: config.ruleConfigHash,
    effectiveCutoff,
    idempotencyKey,
  });
  if (
    config.requestHash !== expectedRequest ||
    config.payloadHash !== expectedPayload ||
    config.configId !== expectedId ||
    config._id !== expectedId
  ) {
    throw new DomainConflictError(
      `Config de pool manipulada para ${config.slotId}.`
    );
  }
  return {
    requestedAt,
    effectiveCutoff,
    createdAt,
    poolCreditsPerSlot,
    ruleVersion,
    idempotencyKey,
  };
}

function validateStoredPoolConfig(
  config: CreditPoolConfiguration,
  slot: CreditSnapshotSlot,
  rule: CompetitionCreditRule,
  cutoff: Date
) {
  const {
    requestedAt,
    effectiveCutoff,
    createdAt,
    poolCreditsPerSlot,
    ruleVersion,
  } = validatePoolConfigurationIntegrity(config);
  if (
    config.walletNormalized !== slot.walletNormalized ||
    config.slotId !== slot._id ||
    config.eligibilityEpoch !== slot.eligibilityEpoch ||
    ruleVersion !== rule.version ||
    config.ruleConfigHash !== rule.configHash ||
    effectiveCutoff.getTime() > cutoff.getTime() ||
    effectiveCutoff.getTime() !==
      computePoolConfigEffectiveCutoff(requestedAt, rule).getTime() ||
    createdAt.getTime() !== requestedAt.getTime()
  ) {
    throw new DomainConflictError(
      `Config de pool fuera de scope para ${slot._id}.`
    );
  }
  return poolCreditsPerSlot;
}

export function validateReservationIntegrity(reservation: CreditReservation) {
  const walletNormalized = validCreditWallet(reservation.walletNormalized);
  const sessionId = validCreditText(
    reservation.sessionId,
    "reservation.sessionId"
  );
  const costCode = validCreditText(
    reservation.costCode,
    "reservation.costCode"
  );
  const ruleVersion = validCreditText(
    reservation.ruleVersion,
    "reservation.ruleVersion"
  );
  const expectedRuleVersion = reservation.expectedRuleVersion === null
    ? null
    : validCreditText(
        reservation.expectedRuleVersion,
        "reservation.expectedRuleVersion",
      );
  const expectedRuleConfigHash = reservation.expectedRuleConfigHash;
  const idempotencyKey = validCreditText(
    reservation.idempotencyKey,
    "reservation.idempotencyKey"
  );
  const expiresAt = validCreditDate(
    reservation.expiresAt,
    "reservation.expiresAt"
  );
  const expiresAtCap = reservation.expiresAtCap
    ? validCreditDate(reservation.expiresAtCap, "reservation.expiresAtCap")
    : undefined;
  const createdAt = validCreditDate(
    reservation.createdAt,
    "reservation.createdAt"
  );
  const updatedAt = validCreditDate(
    reservation.updatedAt,
    "reservation.updatedAt"
  );
  const amountCredits = assertCreditAmount(reservation.amountCredits);
  if (
    walletNormalized !== reservation.walletNormalized ||
    sessionId !== reservation.sessionId ||
    costCode !== reservation.costCode ||
    ruleVersion !== reservation.ruleVersion ||
    (expectedRuleVersion === null) !== (expectedRuleConfigHash === null) ||
    (expectedRuleConfigHash !== null && !/^[0-9a-f]{64}$/.test(expectedRuleConfigHash)) ||
    (expectedRuleVersion !== null && expectedRuleVersion !== ruleVersion) ||
    (expectedRuleConfigHash !== null
      && expectedRuleConfigHash !== reservation.ruleConfigHash) ||
    idempotencyKey !== reservation.idempotencyKey ||
    typeof reservation.periodId !== "string" ||
    reservation.periodId.length === 0 ||
    reservation.periodId.length > 512 ||
    reservation.periodId.normalize("NFC") !== reservation.periodId ||
    !reservation.periodId.startsWith(
      `${ruleVersion}:${reservation.ruleConfigHash}:`
    ) ||
    !/^[0-9a-f]{64}$/.test(reservation.ruleConfigHash) ||
    !/^[0-9a-f]{64}$/.test(reservation.requestHash) ||
    !/^[0-9a-f]{64}$/.test(reservation.payloadHash) ||
    (reservation.bucket !== "own" && reservation.bucket !== "pool") ||
    !["active", "consumed", "released", "expired"].includes(
      reservation.status
    ) ||
    amountCredits < 1 ||
    amountCredits > 1_000 ||
    !Number.isSafeInteger(reservation.revision) ||
    reservation.revision < 0 ||
    expiresAt.getTime() <= createdAt.getTime() ||
    (expiresAtCap && (
      expiresAtCap.getTime() <= createdAt.getTime()
      || expiresAt.getTime() > expiresAtCap.getTime()
    )) ||
    updatedAt.getTime() < createdAt.getTime() ||
    !Array.isArray(reservation.allocations) ||
    reservation.allocations.length === 0 ||
    reservation.allocations.length > MAX_CREDIT_RESERVATION_ALLOCATIONS
  ) {
    throw new DomainConflictError(
      `La reserva ${reservation.reservationId} esta manipulada.`
    );
  }
  const lotIds = new Set<string>();
  for (const allocation of reservation.allocations) {
    const lotExpiresAt = validCreditDate(
      allocation.lotExpiresAt,
      `reservation.allocations.${allocation.lotId}.lotExpiresAt`
    );
    if (
      !/^[0-9a-f]{64}$/.test(allocation.lotId) ||
      lotIds.has(allocation.lotId) ||
      !Number.isSafeInteger(allocation.amountCredits) ||
      allocation.amountCredits < 1 ||
      !Number.isSafeInteger(allocation.lotRevision) ||
      allocation.lotRevision < 0 ||
      lotExpiresAt.getTime() < expiresAt.getTime()
    ) {
      throw new DomainConflictError(
        `La reserva ${reservation.reservationId} tiene allocations invalidas.`
      );
    }
    lotIds.add(allocation.lotId);
  }
  if (
    sumExactCredits(
      reservation.allocations.map((item) => item.amountCredits)
    ) !== amountCredits
  ) {
    throw new DomainConflictError(
      `La reserva ${reservation.reservationId} no conserva el importe.`
    );
  }
  const expectedRequest = stableCreditHash({
    walletNormalized,
    sessionId,
    costCode,
    expectedRuleVersion: reservation.expectedRuleVersion,
    expectedRuleConfigHash: reservation.expectedRuleConfigHash,
    expiresAtCap,
  });
  const expectedPayload = stableCreditHash({
    walletNormalized,
    sessionId,
    periodId: reservation.periodId,
    costCode,
    amountCredits,
    expiresAt,
    expiresAtCap,
    ruleVersion,
    ruleConfigHash: reservation.ruleConfigHash,
  });
  const expectedId = stableCreditHash({
    kind: "credit-reservation",
    walletNormalized,
    sessionId,
    periodId: reservation.periodId,
    costCode,
    ruleVersion,
    ruleConfigHash: reservation.ruleConfigHash,
  });
  if (
    reservation._id !== expectedId ||
    reservation.reservationId !== expectedId ||
    reservation.requestHash !== expectedRequest ||
    reservation.payloadHash !== expectedPayload
  ) {
    throw new DomainConflictError(
      `La reserva ${reservation.reservationId} esta manipulada.`
    );
  }
  if (reservation.status === "active") {
    if (
      reservation.revision !== 0 ||
      updatedAt.getTime() !== createdAt.getTime() ||
      reservation.terminalAt ||
      reservation.terminalCommittedAt ||
      reservation.terminalIdempotencyKey ||
      reservation.terminalPayloadHash
    ) {
      throw new DomainConflictError(
        `La reserva activa ${reservation.reservationId} tiene datos terminales.`
      );
    }
  } else {
    const terminalAt = reservation.terminalAt
      ? validCreditDate(reservation.terminalAt, "reservation.terminalAt")
      : null;
    const terminalIdempotencyKey = reservation.terminalIdempotencyKey
      ? validCreditText(
          reservation.terminalIdempotencyKey,
          "reservation.terminalIdempotencyKey"
        )
      : null;
    const terminalOperation =
      reservation.status === "consumed" ? "consume" : "release";
    const terminalCommittedAt = reservation.terminalCommittedAt
      ? validCreditDate(
          reservation.terminalCommittedAt,
          "reservation.terminalCommittedAt",
        )
      : null;
    const expectedTerminalPayload = stableCreditHash({
      operation: terminalOperation,
      reservationId: reservation.reservationId,
      sessionId,
      committedAt: terminalCommittedAt,
    });
    const terminalIsBeforeExpiry = Boolean(
      terminalAt && terminalAt.getTime() < expiresAt.getTime()
    );
    const settlementCommittedBeforeExpiry = Boolean(
      reservation.status === "consumed"
      && terminalCommittedAt
      && terminalAt
      && terminalCommittedAt.getTime() <= expiresAt.getTime()
      && terminalCommittedAt.getTime() <= terminalAt.getTime()
    );
    if (
      !terminalAt ||
      !terminalIdempotencyKey ||
      terminalIdempotencyKey !== reservation.terminalIdempotencyKey ||
      reservation.terminalPayloadHash !== expectedTerminalPayload ||
      reservation.revision !== 1 ||
      updatedAt.getTime() !== terminalAt.getTime() ||
      (reservation.status !== "consumed" && terminalCommittedAt) ||
      (reservation.status === "expired" && terminalIsBeforeExpiry) ||
      (reservation.status !== "expired"
        && !terminalIsBeforeExpiry
        && !settlementCommittedBeforeExpiry)
    ) {
      throw new DomainConflictError(
        `La reserva ${reservation.reservationId} tiene un terminal invalido.`
      );
    }
  }
  return reservation;
}

function validateExistingCreditRun(
  run: CompetitionCreditRun,
  period: CompetitionCreditRun["period"]
) {
  const cutoff = validCreditDate(run.period.cutoff, "run.period.cutoff");
  const nextCutoff = validCreditDate(
    run.period.nextCutoff,
    "run.period.nextCutoff"
  );
  const createdAt = validCreditDate(run.createdAt, "run.createdAt");
  const updatedAt = validCreditDate(run.updatedAt, "run.updatedAt");
  const sourceObservedThrough = validCreditDate(
    run.sourceWatermark.observedThrough,
    "run.sourceWatermark.observedThrough"
  );
  const sourceUpdatedAt = validCreditDate(
    run.sourceWatermark.updatedAt,
    "run.sourceWatermark.updatedAt"
  );
  const ukiSourceRuleVersion = validCreditText(
    run.sourceWatermark.sourceRuleVersions.uki,
    "run.sourceWatermark.sourceRuleVersions.uki"
  );
  const nftSourceRuleVersion = validCreditText(
    run.sourceWatermark.sourceRuleVersions.nft,
    "run.sourceWatermark.sourceRuleVersions.nft"
  );
  const expectedRunId = stableCreditHash({
    kind: "daily-credit-run",
    period: run.period,
    sourceHash: run.sourceWatermark.sourceHash,
  });
  if (
    run._id !== expectedRunId ||
    run.runId !== expectedRunId ||
    run.period.periodId !== period.periodId ||
    cutoff.getTime() !== period.cutoff.getTime() ||
    nextCutoff.getTime() !== period.nextCutoff.getTime() ||
    run.period.ruleVersion !== period.ruleVersion ||
    run.period.ruleConfigHash !== period.ruleConfigHash ||
    !["snapshotted", "processing", "open", "blocked"].includes(run.status) ||
    !/^[0-9a-f]{64}$/.test(run.snapshotHash) ||
    !/^[0-9a-f]{64}$/.test(run.sourceWatermark.sourceHash) ||
    !/^[0-9a-f]{64}$/.test(run.sourceWatermark.healthEvidenceHash) ||
    run.sourceWatermark.status !== "healthy" ||
    run.sourceWatermark._id !== "cukie-master-slots" ||
    !Number.isSafeInteger(run.sourceWatermark.slotCount) ||
    run.sourceWatermark.slotCount < 0 ||
    run.sourceWatermark.slotCount > 5_000 ||
    ukiSourceRuleVersion !== run.sourceWatermark.sourceRuleVersions.uki ||
    nftSourceRuleVersion !== run.sourceWatermark.sourceRuleVersions.nft ||
    sourceObservedThrough.getTime() > sourceUpdatedAt.getTime() ||
    !Number.isSafeInteger(run.expectedItemCount) ||
    run.expectedItemCount < 0 ||
    run.expectedItemCount > 5_000 ||
    !Number.isSafeInteger(run.expectedGrantCredits) ||
    !Number.isSafeInteger(run.expectedOwnCredits) ||
    !Number.isSafeInteger(run.expectedPoolCredits) ||
    run.expectedOwnCredits < 0 ||
    run.expectedPoolCredits < 0 ||
    run.expectedGrantCredits !==
      run.expectedItemCount * CREDITS_PER_MATURE_SLOT ||
    run.expectedOwnCredits + run.expectedPoolCredits !==
      run.expectedGrantCredits ||
    !Number.isSafeInteger(run.fenceToken) ||
    run.fenceToken < 0 ||
    updatedAt.getTime() < createdAt.getTime()
  ) {
    throw new DomainConflictError(
      `El run existente de ${period.periodId} no supera integridad base.`
    );
  }
  return run;
}

function validateRunAgainstRule(
  run: CompetitionCreditRun,
  rule: CompetitionCreditRule
) {
  const cutoff = validCreditDate(run.period.cutoff, "run.period.cutoff");
  assertRuleActiveAt(rule, cutoff);
  return validateExistingCreditRun(
    run,
    buildCompetitionCreditPeriod(cutoff, rule)
  );
}

function isDuplicateConflict(error: unknown) {
  return (
    error instanceof DomainConflictError &&
    error.details?.persistenceFailure === "DUPLICATE_KEY"
  );
}

function allocateLots(lots: CreditLot[], amountCredits: number) {
  const allocations: CreditReservationAllocation[] = [];
  let remaining = amountCredits;
  for (const lot of lots) {
    if (remaining === 0) break;
    const amount = Math.min(lot.availableCredits, remaining);
    if (amount <= 0) continue;
    allocations.push({
      lotId: lot.lotId,
      amountCredits: amount,
      lotRevision: lot.revision,
      lotExpiresAt: new Date(lot.expiresAt.getTime()),
    });
    remaining -= amount;
  }
  return remaining === 0 ? allocations : null;
}

function compareLotWithCursor(lot: CreditLot, cursor: CreditLotFifoCursor) {
  return (
    lot.expiresAt.getTime() - cursor.expiresAt.getTime() ||
    lot.createdAt.getTime() - cursor.createdAt.getTime() ||
    compareCreditText(lot._id, cursor.lotId)
  );
}

function creditLotCursor(lot: CreditLot): CreditLotFifoCursor {
  return {
    expiresAt: new Date(lot.expiresAt.getTime()),
    createdAt: new Date(lot.createdAt.getTime()),
    lotId: lot._id,
  };
}

function validateAvailableLot(input: {
  lot: CreditLot;
  bucket: CreditLot["bucket"];
  walletNormalized: string;
  periodId: string;
  now: Date;
}) {
  const { lot } = input;
  const expiresAt = validCreditDate(lot.expiresAt, `lot ${lot._id}.expiresAt`);
  validCreditDate(lot.createdAt, `lot ${lot._id}.createdAt`);
  validCreditDate(lot.updatedAt, `lot ${lot._id}.updatedAt`);
  const values = [
    lot.totalCredits,
    lot.poolDepositedCredits,
    lot.availableCredits,
    lot.reservedCredits,
    lot.spentCredits,
    lot.expiredCredits,
  ].map((value) => assertCreditAmount(value));
  const conserved = sumExactCredits([
    lot.availableCredits,
    lot.reservedCredits,
    lot.spentCredits,
    lot.expiredCredits,
    lot.bucket === "own" ? lot.poolDepositedCredits : 0,
  ]);
  if (
    lot._id !== lot.lotId ||
    !/^[0-9a-f]{64}$/.test(lot.lotId) ||
    lot.bucket !== input.bucket ||
    lot.periodId !== input.periodId ||
    lot.blocked ||
    expiresAt.getTime() <= input.now.getTime() ||
    !Number.isSafeInteger(lot.revision) ||
    lot.revision < 0 ||
    values[0] < 1 ||
    values[0] > CREDITS_PER_MATURE_SLOT ||
    values[2] < 1 ||
    conserved !== lot.totalCredits ||
    (input.bucket === "own"
      ? lot.walletNormalized !== input.walletNormalized
      : lot.walletNormalized !== null)
  ) {
    throw new DomainConflictError(
      `El lote ${lot.lotId} no supera integridad FIFO.`
    );
  }
  return lot;
}

async function scanAvailableLots(input: {
  amountCredits: number;
  bucket: CreditLot["bucket"];
  walletNormalized: string;
  periodId: string;
  now: Date;
  fetchPage: (
    limit: number,
    after?: CreditLotFifoCursor
  ) => Promise<CreditLot[]>;
}) {
  const lots: CreditLot[] = [];
  const seen = new Set<string>();
  let totalCredits = 0;
  let cursor: CreditLotFifoCursor | undefined;
  while (
    totalCredits < input.amountCredits &&
    lots.length < MAX_CREDIT_RESERVATION_ALLOCATIONS
  ) {
    const limit = Math.min(
      CREDIT_LOT_PAGE_SIZE,
      MAX_CREDIT_RESERVATION_ALLOCATIONS - lots.length
    );
    const page = await input.fetchPage(limit, cursor);
    if (!Array.isArray(page) || page.length > limit) {
      throw new DomainConflictError(
        "La pagina FIFO de creditos excede el limite solicitado."
      );
    }
    if (page.length === 0) break;
    let previous = cursor;
    for (const candidate of page) {
      const lot = validateAvailableLot({
        lot: candidate,
        bucket: input.bucket,
        walletNormalized: input.walletNormalized,
        periodId: input.periodId,
        now: input.now,
      });
      if (
        (previous && compareLotWithCursor(lot, previous) <= 0) ||
        seen.has(lot.lotId)
      ) {
        throw new DomainConflictError(
          "La pagina FIFO de creditos no es monotona o contiene duplicados."
        );
      }
      seen.add(lot.lotId);
      previous = creditLotCursor(lot);
    }
    for (const lot of page) {
      lots.push(lot);
      totalCredits = sumExactCredits(
        [totalCredits, lot.availableCredits],
        "creditos FIFO disponibles"
      );
      if (totalCredits >= input.amountCredits) break;
    }
    if (totalCredits >= input.amountCredits || page.length < limit) break;
    cursor = creditLotCursor(page[page.length - 1]);
  }
  return { lots, totalCredits };
}

async function mappedTransaction<T>(
  runner: CompetitionCreditTransactionRunner,
  work: (repository: CompetitionCreditRepository) => Promise<T>
) {
  try {
    return await runner(work);
  } catch (error) {
    throw mapCreditPersistenceError(error);
  }
}

async function withDuplicateWinnerRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isDuplicateConflict(error)) throw error;
    return operation();
  }
}

async function blockCreditReconciliationFailure(input: {
  repository: CompetitionCreditRepository;
  runId: string;
  snapshot: { run: unknown };
  result: ReturnType<typeof reconcileCompetitionCreditSnapshot>;
  now: Date;
}) {
  const periodId = safeCompetitionCreditPeriodScopeId(
    input.snapshot.run,
    input.runId
  );
  const incidentId = stableCreditHash({
    type: "credit_reconciliation_mismatch",
    runId: input.runId,
    periodId,
    evidenceHash: input.result.evidenceHash,
  });
  const incident: CreditIntegrityIncident = {
    _id: incidentId,
    incidentId,
    type: "credit_reconciliation_mismatch",
    status: "open",
    runId: input.runId,
    periodId,
    walletNormalized: null,
    reasonCodes: input.result.reasonCodes,
    evidenceHash: input.result.evidenceHash,
    detectedAt: input.now,
    updatedAt: input.now,
  };
  await input.repository.blockRunAndOpenIncident(incident);
  return incident;
}

export function createCompetitionCreditService(
  runner: CompetitionCreditTransactionRunner = mongoCompetitionCreditTransactionRunner
) {
  async function refreshSourceWatermark(
    input: RefreshCreditSourceWatermarkInput
  ) {
    const now = validCreditDate(input.now, "now");
    const expectedRuleVersion = validCreditText(
      input.expectedRuleVersion,
      "expectedRuleVersion"
    );
    return mappedTransaction(runner, async (repository) => {
      const rule = await repository.findRuleAt(now, expectedRuleVersion);
      if (!rule)
        throw new DomainConflictError(
          "La regla esperada de creditos no esta activa."
        );
      assertRuleActiveAt(rule, now);
      const [health, sourceSlots] = await Promise.all([
        repository.readSourceHealth(now, rule),
        repository.listSourceSlots(rule.maxSnapshotSlots + 1),
      ]);
      if (sourceSlots.length > rule.maxSnapshotSlots) {
        throw new DomainConflictError(
          "La fuente Cukie Master excede 5.000 slots."
        );
      }
      for (const sourceSlot of sourceSlots) validSourceSlotShape(sourceSlot);
      if (
        !health.healthy ||
        health.warnings.length > 0 ||
        !health.observedThrough ||
        !(health.observedThrough instanceof Date) ||
        Number.isNaN(health.observedThrough.getTime()) ||
        health.observedThrough.getTime() > now.getTime() ||
        !health.sourceRuleVersions ||
        !/^[0-9a-f]{64}$/.test(health.evidenceHash)
      ) {
        throw new DomainConflictError(
          "No se puede publicar watermark con fuentes no saludables.",
          {
            warnings: health.warnings.slice(0, 20),
          }
        );
      }
      for (const route of ["uki", "nft"] as const) {
        if (
          validCreditText(
            health.sourceRuleVersions[route],
            `sourceRuleVersions.${route}`
          ) !== health.sourceRuleVersions[route]
        ) {
          throw new DomainConflictError(
            `Version de ronda ${route} no canonica.`
          );
        }
      }
      for (const sourceSlot of sourceSlots) {
        if (
          sourceSlot.status !== "inactive" &&
          sourceSlot.ruleVersion !== health.sourceRuleVersions[sourceSlot.route]
        ) {
          throw new DomainConflictError(
            `El slot ${sourceSlot._id} no coincide con la ronda ${sourceSlot.route}.`
          );
        }
      }
      const watermark = {
        _id: "cukie-master-slots" as const,
        status: "healthy" as const,
        observedThrough: health.observedThrough,
        sourceRuleVersions: health.sourceRuleVersions,
        sourceHash: buildCreditSourceSlotsHash(sourceSlots),
        slotCount: sourceSlots.length,
        healthEvidenceHash: health.evidenceHash,
        updatedAt: now,
      };
      return repository.upsertSourceWatermark(watermark);
    });
  }

  async function configurePool(input: ConfigureCreditPoolInput) {
    const now = validCreditDate(input.now, "now");
    const walletNormalized = validCreditWallet(input.walletAddress);
    const slotId = validCreditText(input.slotId, "slotId");
    const poolCreditsPerSlot = validPoolCreditsPerSlot(
      input.poolCreditsPerSlot
    );
    const idempotencyKey = validCreditText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const requestHash = stableCreditHash({
      walletNormalized,
      slotId,
      poolCreditsPerSlot,
    });

    return withDuplicateWinnerRetry(() =>
      mappedTransaction(runner, async (repository) => {
        const existing = await repository.findPoolConfigurationByIdempotencyKey(
          idempotencyKey
        );
        if (existing) {
          validatePoolConfigurationIntegrity(existing);
          assertSameRequest(existing, requestHash, idempotencyKey);
          return existing;
        }
        const rule = await repository.findRuleAt(now);
        if (!rule)
          throw new DomainConflictError("No existe regla activa de creditos.");
        assertRuleActiveAt(rule, now);
        const effectiveCutoff = computePoolConfigEffectiveCutoff(now, rule);
        const slot = await repository.findSlot(slotId);
        if (
          !slot ||
          slot.walletNormalized !== walletNormalized ||
          slot.status === "inactive"
        ) {
          throw new DomainNotFoundError(
            "El slot no pertenece a la wallet o ya esta inactivo."
          );
        }
        validSourceSlotShape(slot);
        const payloadHash = stableCreditHash({
          walletNormalized,
          slotId,
          eligibilityEpoch: slot.eligibilityEpoch,
          poolCreditsPerSlot,
          requestedAt: now,
          effectiveCutoff,
          ruleVersion: rule.version,
          ruleConfigHash: rule.configHash,
        });
        const configId = stableCreditHash({
          kind: "pool-config",
          walletNormalized,
          slotId,
          eligibilityEpoch: slot.eligibilityEpoch,
          ruleVersion: rule.version,
          ruleConfigHash: rule.configHash,
          effectiveCutoff,
          idempotencyKey,
        });
        const config: CreditPoolConfiguration = {
          _id: configId,
          configId,
          walletNormalized,
          slotId,
          eligibilityEpoch: slot.eligibilityEpoch,
          poolCreditsPerSlot,
          requestedAt: now,
          effectiveCutoff,
          ruleVersion: rule.version,
          ruleConfigHash: rule.configHash,
          idempotencyKey,
          requestHash,
          payloadHash,
          createdAt: now,
        };
        validatePoolConfigurationIntegrity(config);
        await repository.insertPoolConfiguration(config);
        return config;
      })
    );
  }

  async function createDailyRun(input: CreateCreditRunInput) {
    const cutoff = validCreditDate(input.cutoff, "cutoff");
    const now = validCreditDate(input.now, "now");
    const expectedRuleVersion = validCreditText(
      input.expectedRuleVersion,
      "expectedRuleVersion"
    );
    if (now.getTime() < cutoff.getTime()) {
      throw new DomainValidationError(
        "No se puede crear el snapshot antes del cutoff."
      );
    }

    return withDuplicateWinnerRetry(() =>
      mappedTransaction(runner, async (repository) => {
        const rule = await repository.findRuleAt(cutoff, expectedRuleVersion);
        if (!rule)
          throw new DomainConflictError(
            "La regla esperada no esta activa en el corte."
          );
        assertRuleActiveAt(rule, cutoff);
        const period = buildCompetitionCreditPeriod(cutoff, rule);
        if (now.getTime() >= period.nextCutoff.getTime()) {
          throw new DomainConflictError(
            "No se permiten grants retroactivos tras el siguiente cutoff."
          );
        }
        const existing = await repository.findRunByPeriod(period.periodId);
        if (existing) {
          return validateExistingCreditRun(existing, period);
        }
        if (now.getTime() - cutoff.getTime() > rule.maxSnapshotLatenessMs) {
          throw new DomainConflictError(
            "El job excedio la lateness maxima de la regla."
          );
        }
        const gate = await repository.readSnapshotGate(rule, cutoff);
        if (!gate.schemaReady)
          throw new DomainConflictError("El schema de economia no esta listo.");
        if (!gate.activeRuleMatches)
          throw new DomainConflictError(
            "La regla activa cambio durante el snapshot."
          );
        if (gate.openIntegrityIncidents > 0) {
          throw new DomainConflictError(
            "Hay incidentes de integridad abiertos."
          );
        }
        if (gate.maturedQualifyingSlots > 0) {
          throw new DomainConflictError(
            "Hay slots qualifying ya maduros; debe cerrarse su transicion antes del snapshot."
          );
        }
        const watermark = gate.sourceWatermark;
        const liveHealth = await repository.readSourceHealth(now, rule);
        const watermarkObservedThrough = watermark
          ? validCreditDate(
              watermark.observedThrough,
              "watermark.observedThrough"
            )
          : null;
        const watermarkUpdatedAt = watermark
          ? validCreditDate(watermark.updatedAt, "watermark.updatedAt")
          : null;
        const liveObservedThrough = liveHealth.observedThrough
          ? validCreditDate(
              liveHealth.observedThrough,
              "liveHealth.observedThrough"
            )
          : null;
        if (
          !watermark ||
          watermark.status !== "healthy" ||
          !liveHealth.healthy ||
          liveHealth.warnings.length > 0 ||
          !liveObservedThrough ||
          !liveHealth.sourceRuleVersions ||
          !watermarkObservedThrough ||
          !watermarkUpdatedAt ||
          watermarkObservedThrough.getTime() < cutoff.getTime() ||
          watermarkUpdatedAt.getTime() < watermarkObservedThrough.getTime() ||
          watermark.healthEvidenceHash !== liveHealth.evidenceHash ||
          watermarkObservedThrough.getTime() !==
            liveObservedThrough.getTime() ||
          watermark.sourceRuleVersions.uki !==
            liveHealth.sourceRuleVersions.uki ||
          watermark.sourceRuleVersions.nft !==
            liveHealth.sourceRuleVersions.nft ||
          !/^[0-9a-f]{64}$/.test(watermark.sourceHash) ||
          !/^[0-9a-f]{64}$/.test(watermark.healthEvidenceHash)
        )
          throw new DomainConflictError(
            "El watermark de Cukie Master no es saludable o no cubre el corte."
          );
        if (
          validCreditText(
            watermark.sourceRuleVersions.uki,
            "sourceRuleVersions.uki"
          ) !== watermark.sourceRuleVersions.uki ||
          validCreditText(
            watermark.sourceRuleVersions.nft,
            "sourceRuleVersions.nft"
          ) !== watermark.sourceRuleVersions.nft
        ) {
          throw new DomainConflictError(
            "Las versiones del watermark no son canonicas."
          );
        }

        const sourceSlots = await repository.listSourceSlots(
          rule.maxSnapshotSlots + 1
        );
        if (sourceSlots.length > rule.maxSnapshotSlots) {
          throw new DomainConflictError(
            "El snapshot excede el limite seguro de slots."
          );
        }
        for (const sourceSlot of sourceSlots) validSourceSlotShape(sourceSlot);
        if (
          sourceSlots.length !== watermark.slotCount ||
          buildCreditSourceSlotsHash(sourceSlots) !== watermark.sourceHash
        )
          throw new DomainConflictError(
            "Los slots cambiaron despues de publicar el watermark."
          );
        const slots = sourceSlots.filter(
          (slot) =>
            slot.creditEligibleFrom.getTime() <= cutoff.getTime() &&
            (slot.status === "active" ||
              (slot.status === "grace" &&
                Boolean(
                  slot.graceEndsAt &&
                    slot.graceEndsAt.getTime() > cutoff.getTime()
                )))
        );
        const duplicateSlots = new Set<string>();
        const walletSlotCounts = new Map<string, number>();
        const walletRouteOrdinals = new Map<string, Set<number>>();
        const runId = stableCreditHash({
          kind: "daily-credit-run",
          period,
          sourceHash: watermark.sourceHash,
        });
        const items: CreditRunItem[] = [];
        for (const slot of slots) {
          validSnapshotSlot(
            slot,
            cutoff,
            watermark.sourceRuleVersions[slot.route]
          );
          if (duplicateSlots.has(slot._id)) {
            throw new DomainConflictError(
              `El snapshot contiene el slot duplicado ${slot._id}.`
            );
          }
          duplicateSlots.add(slot._id);
          const walletCount =
            (walletSlotCounts.get(slot.walletNormalized) ?? 0) + 1;
          if (walletCount > 10) {
            throw new DomainConflictError(
              `La wallet ${slot.walletNormalized} excede 10 slots.`
            );
          }
          walletSlotCounts.set(slot.walletNormalized, walletCount);
          const routeKey = `${slot.walletNormalized}:${slot.route}`;
          const ordinals =
            walletRouteOrdinals.get(routeKey) ?? new Set<number>();
          if (ordinals.has(slot.ordinal)) {
            throw new DomainConflictError(
              `Ordinal ${slot.ordinal} duplicado en ${routeKey}.`
            );
          }
          ordinals.add(slot.ordinal);
          if (ordinals.size > 5) {
            throw new DomainConflictError(
              `La ruta ${routeKey} excede 5 slots.`
            );
          }
          walletRouteOrdinals.set(routeKey, ordinals);
          const config = await repository.findPoolConfiguration(
            slot.walletNormalized,
            slot._id,
            slot.eligibilityEpoch,
            cutoff,
            rule.version,
            rule.configHash
          );
          const poolCredits = config
            ? validateStoredPoolConfig(config, slot, rule, cutoff)
            : 0;
          const itemId = stableCreditHash({
            kind: "daily-credit-item",
            periodId: period.periodId,
            slotId: slot._id,
            eligibilityEpoch: slot.eligibilityEpoch,
          });
          const immutable = {
            _id: itemId,
            itemId,
            runId,
            periodId: period.periodId,
            walletNormalized: slot.walletNormalized,
            slotId: slot._id,
            slotRoute: slot.route,
            slotOrdinal: slot.ordinal,
            eligibilityEpoch: slot.eligibilityEpoch,
            slotRuleVersion: slot.ruleVersion,
            slotRoundId: slot.roundId,
            slotSourceHash: slot.sourceHash,
            slotRevision: slot.revision,
            creditEligibleFrom: new Date(slot.creditEligibleFrom.getTime()),
            ...(slot.graceEndsAt
              ? { graceEndsAt: new Date(slot.graceEndsAt.getTime()) }
              : {}),
            grantCredits: CREDITS_PER_MATURE_SLOT,
            ownCredits: CREDITS_PER_MATURE_SLOT - poolCredits,
            poolCredits,
            poolConfigId: config?.configId ?? null,
          };
          items.push({
            ...immutable,
            payloadHash: buildCreditRunItemPayloadHash(immutable),
            status: "pending",
            createdAt: now,
          });
        }
        const snapshotHash = stableCreditHash({
          period,
          sourceWatermark: watermark,
          items: items.map((item) => item.payloadHash).sort(),
        });
        const run: CompetitionCreditRun = {
          _id: runId,
          runId,
          period,
          status: "snapshotted",
          expectedItemCount: items.length,
          expectedGrantCredits: sumExactCredits(
            items.map((item) => item.grantCredits)
          ),
          expectedOwnCredits: sumExactCredits(
            items.map((item) => item.ownCredits)
          ),
          expectedPoolCredits: sumExactCredits(
            items.map((item) => item.poolCredits)
          ),
          sourceWatermark: watermark,
          snapshotHash,
          fenceToken: 0,
          createdAt: now,
          updatedAt: now,
        };
        await repository.insertRunAndItems(run, items);
        return run;
      })
    );
  }

  async function claimRun(input: ClaimCreditRunInput) {
    const runId = validCreditText(input.runId, "runId");
    const workerId = validCreditText(input.workerId, "workerId");
    const now = validCreditDate(input.now, "now");
    return mappedTransaction(runner, async (repository) => {
      const run = await repository.findRun(runId);
      if (!run) throw new DomainNotFoundError(`No existe el run ${runId}.`);
      const rule = await repository.findRuleAt(
        run.period.cutoff,
        run.period.ruleVersion
      );
      if (!rule)
        throw new DomainConflictError(
          "La regla del run ya no esta disponible."
        );
      validateRunAgainstRule(run, rule);
      const claimed = await repository.claimRunLease(
        runId,
        workerId,
        now,
        new Date(now.getTime() + rule.leaseDurationMs)
      );
      if (!claimed)
        throw new DomainConflictError(
          "El run esta cerrado, bloqueado o leased por otro worker."
        );
      return claimed;
    });
  }

  async function processRunBatch(input: ProcessCreditRunBatchInput) {
    const runId = validCreditText(input.runId, "runId");
    const workerId = validCreditText(input.workerId, "workerId");
    const fenceToken = validPositiveFence(input.fenceToken);
    const now = validCreditDate(input.now, "now");
    const context = await mappedTransaction(runner, async (repository) => {
      const run = await repository.findRun(runId);
      if (!run) throw new DomainNotFoundError(`No existe el run ${runId}.`);
      if (
        run.status !== "processing" ||
        run.leaseOwner !== workerId ||
        run.fenceToken !== fenceToken ||
        !run.leaseExpiresAt ||
        run.leaseExpiresAt.getTime() <= now.getTime()
      )
        throw new StaleFenceError("El lease/fence del run no esta vigente.");
      const rule = await repository.findRuleAt(
        run.period.cutoff,
        run.period.ruleVersion
      );
      if (!rule)
        throw new DomainConflictError("La regla del run no esta disponible.");
      validateRunAgainstRule(run, rule);
      const limit = validBatchLimit(
        input.limit ?? rule.maxBatchSize,
        rule.maxBatchSize
      );
      return {
        items: await repository.findPendingRunItems(runId, limit),
        limit,
      };
    });
    let applied = 0;
    for (const item of context.items) {
      const changed = await mappedTransaction(runner, (repository) =>
        repository.applyRunItem(runId, workerId, fenceToken, item, now)
      );
      if (changed) applied += 1;
    }
    const pending = await mappedTransaction(runner, (repository) =>
      repository.countPendingRunItems(runId)
    );
    return {
      scanned: context.items.length,
      applied,
      pending,
      done: pending === 0,
    };
  }

  async function reconcileRun(runIdInput: string, nowInput: Date) {
    const runId = validCreditText(runIdInput, "runId");
    const now = validCreditDate(nowInput, "now");
    return mappedTransaction(runner, async (repository) => {
      const snapshot = await repository.readReconciliationSnapshot(runId);
      if (!snapshot)
        throw new DomainNotFoundError(`No existe el run ${runId}.`);
      const result = reconcileCompetitionCreditSnapshot(snapshot, runId);
      if (!result.ok) {
        await blockCreditReconciliationFailure({
          repository,
          runId,
          snapshot,
          result,
          now,
        });
      }
      return result;
    });
  }

  async function openRun(input: ProcessCreditRunBatchInput) {
    const runId = validCreditText(input.runId, "runId");
    const workerId = validCreditText(input.workerId, "workerId");
    const fenceToken = validPositiveFence(input.fenceToken);
    const now = validCreditDate(input.now, "now");
    return mappedTransaction(runner, async (repository) => {
      const run = await repository.findRun(runId);
      if (!run) throw new DomainNotFoundError(`No existe el run ${runId}.`);
      const alreadyOpen = run.status === "open";
      if (
        !alreadyOpen &&
        (run.status !== "processing" ||
          run.leaseOwner !== workerId ||
          run.fenceToken !== fenceToken ||
          !run.leaseExpiresAt ||
          run.leaseExpiresAt.getTime() <= now.getTime())
      )
        throw new StaleFenceError("El lease/fence del run no esta vigente.");
      if (!alreadyOpen && (await repository.countPendingRunItems(runId)) > 0) {
        throw new DomainConflictError("El run aun tiene items pendientes.");
      }
      const snapshot = await repository.readReconciliationSnapshot(runId);
      if (!snapshot)
        throw new DomainNotFoundError(`No existe el snapshot de ${runId}.`);
      const reconciliation = reconcileCompetitionCreditSnapshot(
        snapshot,
        runId
      );
      if (!reconciliation.ok) {
        await blockCreditReconciliationFailure({
          repository,
          runId,
          snapshot,
          result: reconciliation,
          now,
        });
        const blocked = await repository.findRun(runId);
        return { run: blocked ?? run, reconciliation };
      }
      const rule = await repository.findRuleAt(
        run.period.cutoff,
        run.period.ruleVersion
      );
      if (!rule)
        throw new DomainConflictError("La regla del run no esta disponible.");
      validateRunAgainstRule(run, rule);
      if (alreadyOpen) return { run, reconciliation };
      const opened = await repository.openRun(runId, workerId, fenceToken, now);
      if (!opened)
        throw new StaleFenceError("El run perdio el fence antes de abrirse.");
      return { run: opened, reconciliation };
    });
  }

  async function reserve(input: ReserveCompetitionCreditsInput) {
    const walletNormalized = validCreditWallet(input.walletAddress);
    const sessionId = validCreditText(input.sessionId, "sessionId");
    const costCode = validCreditText(input.costCode, "costCode");
    const expectedRuleVersion = input.expectedRuleVersion
      ? validCreditText(input.expectedRuleVersion, "expectedRuleVersion")
      : undefined;
    const expectedRuleConfigHash = input.expectedRuleConfigHash;
    if (
      expectedRuleConfigHash !== undefined
      && !/^[0-9a-f]{64}$/.test(expectedRuleConfigHash)
    ) {
      throw new DomainValidationError("expectedRuleConfigHash debe ser SHA-256 canonico.");
    }
    if (Boolean(expectedRuleVersion) !== Boolean(expectedRuleConfigHash)) {
      throw new DomainValidationError(
        "expectedRuleVersion y expectedRuleConfigHash deben enviarse juntos.",
      );
    }
    const idempotencyKey = validCreditText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const now = validCreditDate(input.now, "now");
    const expiresAtCap = input.expiresAtCap
      ? validCreditDate(input.expiresAtCap, "expiresAtCap")
      : undefined;
    if (expiresAtCap && expiresAtCap.getTime() <= now.getTime()) {
      throw new DomainValidationError("expiresAtCap debe estar en el futuro.");
    }
    const requestHash = stableCreditHash({
      walletNormalized,
      sessionId,
      costCode,
      expectedRuleVersion: expectedRuleVersion ?? null,
      expectedRuleConfigHash: expectedRuleConfigHash ?? null,
      expiresAtCap,
    });

    return withDuplicateWinnerRetry(() =>
      mappedTransaction(runner, async (repository) => {
        const replay = await repository.findReservationByIdempotencyKey(
          idempotencyKey
        );
        if (replay) {
          validateReservationIntegrity(replay);
          assertSameRequest(replay, requestHash, idempotencyKey);
          return replay;
        }
        const rule = await repository.findRuleAt(now, expectedRuleVersion);
        if (!rule)
          throw new DomainConflictError("No existe regla activa de creditos.");
        assertRuleActiveAt(rule, now);
        if (expectedRuleConfigHash && rule.configHash !== expectedRuleConfigHash) {
          throw new DomainConflictError("La config activa de creditos no coincide con el juego.");
        }
        const period = currentCompetitionCreditPeriod(now, rule);
        const expiresAt = new Date(
          Math.min(
            now.getTime() + rule.reservationTtlMs,
            period.nextCutoff.getTime(),
            expiresAtCap?.getTime() ?? Number.MAX_SAFE_INTEGER,
          )
        );
        if (expiresAt.getTime() <= now.getTime()) {
          throw new DomainConflictError(
            "No queda ventana util en el periodo para reservar."
          );
        }
        const amountCredits = creditCostForCode(rule, costCode);
        assertCreditAmount(amountCredits);
        const payloadHash = stableCreditHash({
          walletNormalized,
          sessionId,
          periodId: period.periodId,
          costCode,
          amountCredits,
          expiresAt,
          expiresAtCap,
          ruleVersion: rule.version,
          ruleConfigHash: rule.configHash,
        });
        const sessionReservation = await repository.findReservationBySessionId(
          sessionId
        );
        if (sessionReservation) {
          throw new DomainConflictError(
            `La session ${sessionId} ya tiene una reserva.`
          );
        }
        if (await repository.hasOpenCreditBlock(walletNormalized)) {
          throw new DomainConflictError(
            "La wallet o el ledger de creditos estan bloqueados."
          );
        }

        const ownScan = await scanAvailableLots({
          amountCredits,
          bucket: "own",
          walletNormalized,
          periodId: period.periodId,
          now,
          fetchPage: (limit, after) =>
            repository.listAvailableOwnLots(
              walletNormalized,
              period.periodId,
              now,
              limit,
              after
            ),
        });
        const ownTotal = ownScan.totalCredits;
        let bucket: CreditReservation["bucket"];
        let allocations: CreditReservationAllocation[] | null;
        if (ownTotal >= amountCredits) {
          bucket = "own";
          allocations = allocateLots(ownScan.lots, amountCredits);
        } else {
          const poolScan = await scanAvailableLots({
            amountCredits,
            bucket: "pool",
            walletNormalized,
            periodId: period.periodId,
            now,
            fetchPage: (limit, after) =>
              repository.listAvailablePoolLots(
                period.periodId,
                now,
                limit,
                after
              ),
          });
          bucket = "pool";
          allocations = allocateLots(poolScan.lots, amountCredits);
        }
        if (
          !allocations ||
          sumExactCredits(allocations.map((item) => item.amountCredits)) !==
            amountCredits
        ) {
          throw new DomainConflictError(
            "No hay creditos propios completos ni pool suficiente.",
            {
              reason:
                ownTotal > 0
                  ? "partial_own_and_pool_insufficient"
                  : "insufficient_credits",
            }
          );
        }
        const reservationId = stableCreditHash({
          kind: "credit-reservation",
          walletNormalized,
          sessionId,
          periodId: period.periodId,
          costCode,
          ruleVersion: rule.version,
          ruleConfigHash: rule.configHash,
        });
        const reservation: CreditReservation = {
          _id: reservationId,
          reservationId,
          sessionId,
          walletNormalized,
          periodId: period.periodId,
          costCode,
          expectedRuleVersion: expectedRuleVersion ?? null,
          expectedRuleConfigHash: expectedRuleConfigHash ?? null,
          ruleVersion: rule.version,
          ruleConfigHash: rule.configHash,
          amountCredits,
          bucket,
          allocations,
          status: "active",
          expiresAt,
          expiresAtCap,
          revision: 0,
          idempotencyKey,
          requestHash,
          payloadHash,
          createdAt: now,
          updatedAt: now,
        };
        validateReservationIntegrity(reservation);
        await repository.reserveLots({ reservation, now });
        return reservation;
      })
    );
  }

  async function finishReservation(
    operation: "consume" | "release",
    input: FinishCompetitionCreditReservationInput
  ) {
    const reservationId = validCreditText(input.reservationId, "reservationId");
    const idempotencyKey = validCreditText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const now = validCreditDate(input.now, "now");
    const committedAt = input.committedAt
      ? validCreditDate(input.committedAt, "committedAt")
      : undefined;
    if (committedAt && committedAt.getTime() > now.getTime()) {
      throw new DomainValidationError("committedAt no puede estar en el futuro.");
    }
    return withDuplicateWinnerRetry(() =>
      mappedTransaction(runner, async (repository) => {
        const reservation = await repository.findReservation(reservationId);
        if (!reservation)
          throw new DomainNotFoundError(
            `No existe la reserva ${reservationId}.`
          );
        validateReservationIntegrity(reservation);
        const payloadHash = stableCreditHash({
          operation,
          reservationId,
          sessionId: reservation.sessionId,
          committedAt: committedAt ?? null,
        });
        if (reservation.status !== "active") {
          if (
            reservation.terminalIdempotencyKey === idempotencyKey &&
            reservation.terminalPayloadHash === payloadHash
          )
            return reservation;
          throw new DomainConflictError(
            `La reserva ya termino como ${reservation.status}; solo una transicion terminal puede ganar.`
          );
        }
        if (
          operation === "consume" &&
          reservation.expiresAt.getTime() <= now.getTime() &&
          (!committedAt || committedAt.getTime() > reservation.expiresAt.getTime())
        ) {
          throw new DomainConflictError(
            "La reserva expiro y no puede consumirse."
          );
        }
        const finished = await repository.finishReservation({
          reservation,
          operation,
          idempotencyKey,
          payloadHash,
          committedAt,
          now,
        });
        if (finished) return validateReservationIntegrity(finished);
        const winner = await repository.findReservation(reservationId);
        if (
          winner &&
          winner.terminalIdempotencyKey === idempotencyKey &&
          winner.terminalPayloadHash === payloadHash
        )
          return validateReservationIntegrity(winner);
        throw new DomainConflictError(
          "Otra transicion terminal gano la carrera de la reserva."
        );
      })
    );
  }

  async function expireReservationsBatch(
    input: ExpireCompetitionCreditBatchInput
  ) {
    const now = validCreditDate(input.now, "now");
    const limit = validBatchLimit(input.limit ?? 100, 100);
    const candidates = await mappedTransaction(runner, (repository) =>
      repository.listExpiredActiveReservations(now, limit)
    );
    let expired = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      const ownedByGameEconomy = await mappedTransaction(runner, (repository) =>
        repository.findGameSessionLifecycle(candidate.sessionId)
      );
      if (ownedByGameEconomy) {
        skipped += 1;
        continue;
      }
      const idempotencyKey = `credit-reservation-expire:${candidate.reservationId}`;
      try {
        const result = await finishReservation("release", {
          reservationId: candidate.reservationId,
          idempotencyKey,
          now,
        });
        if (result.status === "expired") expired += 1;
        else skipped += 1;
      } catch (error) {
        if (!(error instanceof DomainConflictError)) throw error;
        const winner = await mappedTransaction(runner, (repository) =>
          repository.findReservation(candidate.reservationId)
        );
        if (winner && winner.status !== "active") skipped += 1;
        else throw error;
      }
    }
    return { scanned: candidates.length, expired, skipped };
  }

  async function expireAvailableLotsBatch(
    input: ExpireCompetitionCreditBatchInput
  ) {
    const now = validCreditDate(input.now, "now");
    const limit = validBatchLimit(input.limit ?? 100, 100);
    const candidates = await mappedTransaction(runner, (repository) =>
      repository.listExpiredAvailableLots(now, limit)
    );
    let expired = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      const changed = await withDuplicateWinnerRetry(() =>
        mappedTransaction(runner, (repository) =>
          repository.expireAvailableLot(candidate, now)
        )
      );
      if (changed) expired += 1;
      else skipped += 1;
    }
    return { scanned: candidates.length, expired, skipped };
  }

  return {
    refreshSourceWatermark,
    configurePool,
    createDailyRun,
    claimRun,
    processRunBatch,
    openRun,
    reconcileRun,
    reserve,
    consumeReservation: (input: FinishCompetitionCreditReservationInput) =>
      finishReservation("consume", input),
    releaseReservation: (input: FinishCompetitionCreditReservationInput) =>
      finishReservation("release", input),
    expireReservationsBatch,
    expireAvailableLotsBatch,
  };
}

export const competitionCreditService = createCompetitionCreditService();
