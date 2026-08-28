import "server-only";

import {
  buildCreditRunItemPayloadHash,
  stableCreditHash,
  sumExactCredits,
} from "./rules";
import type {
  CompetitionCreditLedgerEntry,
  CreditAccountPeriod,
  CreditLot,
  CreditReconciliationResult,
  CreditReconciliationSnapshot,
  CreditReservation,
  CreditRunItem,
} from "./types";
import { MAX_CREDIT_RESERVATION_ALLOCATIONS } from "./types";

function accountId(walletNormalized: string, periodId: string, route: "uki" | "nft") {
  return `${walletNormalized}:${periodId}:${route}`;
}

function uniqueBy<T>(
  values: T[],
  key: (value: T) => string,
  reason: string,
  reasons: Set<string>
) {
  const seen = new Set<string>();
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) reasons.add(reason);
    seen.add(id);
  }
}

function ledgerForItem(
  ledger: CompetitionCreditLedgerEntry[],
  item: CreditRunItem,
  operation: CompetitionCreditLedgerEntry["operation"],
  bucket: CompetitionCreditLedgerEntry["bucket"]
) {
  return ledger.filter(
    (entry) =>
      entry.runItemId === item.itemId &&
      entry.operation === operation &&
      entry.bucket === bucket
  );
}

function ledgerForAllocation(
  ledger: CompetitionCreditLedgerEntry[],
  reservation: CreditReservation,
  lotId: string,
  operation: CompetitionCreditLedgerEntry["operation"]
) {
  return ledger.filter(
    (entry) =>
      entry.reservationId === reservation.reservationId &&
      entry.lotId === lotId &&
      entry.operation === operation
  );
}

function lotConserves(lot: CreditLot) {
  return (
    lot.totalCredits ===
    sumExactCredits(
      [
        lot.availableCredits,
        lot.reservedCredits,
        lot.spentCredits,
        lot.expiredCredits,
        lot.bucket === "own" ? lot.poolDepositedCredits : 0,
      ],
      "estados de lote"
    )
  );
}

function accountMatchesLots(account: CreditAccountPeriod, lots: CreditLot[]) {
  return (
    account.grantedCredits ===
      sumExactCredits(lots.map((lot) => lot.totalCredits)) &&
    account.poolDepositedCredits ===
      sumExactCredits(lots.map((lot) => lot.poolDepositedCredits)) &&
    account.availableCredits ===
      sumExactCredits(lots.map((lot) => lot.availableCredits)) &&
    account.reservedCredits ===
      sumExactCredits(lots.map((lot) => lot.reservedCredits)) &&
    account.spentCredits ===
      sumExactCredits(lots.map((lot) => lot.spentCredits)) &&
    account.expiredCredits ===
      sumExactCredits(lots.map((lot) => lot.expiredCredits))
  );
}

function terminalLedgerOperation(status: CreditReservation["status"]) {
  if (status === "consumed") return "spend" as const;
  if (status === "released") return "release" as const;
  if (status === "expired") return null;
  return undefined;
}

function validateReservation(
  reservation: CreditReservation,
  lotsById: Map<string, CreditLot>,
  ledger: CompetitionCreditLedgerEntry[],
  periodId: string,
  ruleVersion: string,
  ruleConfigHash: string,
  reasons: Set<string>
) {
  const expectedId = stableCreditHash({
    kind: "credit-reservation",
    walletNormalized: reservation.walletNormalized,
    sessionId: reservation.sessionId,
    periodId: reservation.periodId,
    costCode: reservation.costCode,
    ruleVersion: reservation.ruleVersion,
    ruleConfigHash: reservation.ruleConfigHash,
  });
  if (
    reservation._id !== expectedId ||
    reservation.reservationId !== expectedId
  ) {
    reasons.add("RESERVATION_ID_MISMATCH");
  }
  if (
    reservation.periodId !== periodId ||
    reservation.ruleVersion !== ruleVersion ||
    reservation.ruleConfigHash !== ruleConfigHash
  ) {
    reasons.add("RESERVATION_PERIOD_MISMATCH");
  }
  const expectedPayload = stableCreditHash({
    walletNormalized: reservation.walletNormalized,
    sessionId: reservation.sessionId,
    periodId: reservation.periodId,
    costCode: reservation.costCode,
    amountCredits: reservation.amountCredits,
    expiresAt: reservation.expiresAt,
    expiresAtCap: reservation.expiresAtCap,
    ruleVersion: reservation.ruleVersion,
    ruleConfigHash: reservation.ruleConfigHash,
  });
  const expectedRequest = stableCreditHash({
    walletNormalized: reservation.walletNormalized,
    sessionId: reservation.sessionId,
    costCode: reservation.costCode,
    expectedRuleVersion: reservation.expectedRuleVersion,
    expectedRuleConfigHash: reservation.expectedRuleConfigHash,
    expiresAtCap: reservation.expiresAtCap,
  });
  if (expectedRequest !== reservation.requestHash)
    reasons.add("RESERVATION_REQUEST_TAMPERED");
  if (expectedPayload !== reservation.payloadHash)
    reasons.add("RESERVATION_PAYLOAD_TAMPERED");
  if (
    !Number.isSafeInteger(reservation.amountCredits) ||
    reservation.amountCredits <= 0 ||
    reservation.allocations.length === 0 ||
    reservation.allocations.length > MAX_CREDIT_RESERVATION_ALLOCATIONS
  )
    reasons.add("RESERVATION_AMOUNT_INVALID");
  uniqueBy(
    reservation.allocations,
    (allocation) => allocation.lotId,
    "DUPLICATE_RESERVATION_ALLOCATION",
    reasons
  );
  if (
    sumExactCredits(
      reservation.allocations.map((item) => item.amountCredits)
    ) !== reservation.amountCredits
  )
    reasons.add("RESERVATION_ALLOCATION_TOTAL_MISMATCH");

  const expectedTerminalPayload = stableCreditHash({
    operation: reservation.status === "consumed" ? "consume" : "release",
    reservationId: reservation.reservationId,
    sessionId: reservation.sessionId,
    committedAt: reservation.terminalCommittedAt ?? null,
  });
  if (reservation.status === "active") {
    if (
      reservation.terminalAt ||
      reservation.terminalCommittedAt ||
      reservation.terminalIdempotencyKey ||
      reservation.terminalPayloadHash
    )
      reasons.add("ACTIVE_RESERVATION_HAS_TERMINAL_DATA");
  } else if (
    !reservation.terminalAt ||
    !reservation.terminalIdempotencyKey ||
    reservation.terminalPayloadHash !== expectedTerminalPayload
  )
    reasons.add("RESERVATION_TERMINAL_PAYLOAD_MISMATCH");

  for (const allocation of reservation.allocations) {
    const lot = lotsById.get(allocation.lotId);
    if (!lot) {
      reasons.add("RESERVATION_ALLOCATION_ORPHAN");
      continue;
    }
    if (
      lot.bucket !== reservation.bucket ||
      lot.periodId !== reservation.periodId ||
      allocation.lotExpiresAt.getTime() !== lot.expiresAt.getTime() ||
      allocation.reservedUntil.getTime() !== reservation.expiresAt.getTime() ||
      !Number.isSafeInteger(allocation.lotRevision) ||
      allocation.lotRevision < 0 ||
      !Number.isSafeInteger(allocation.amountCredits) ||
      allocation.amountCredits <= 0 ||
      (reservation.bucket === "own" &&
        lot.walletNormalized !== reservation.walletNormalized)
    )
      reasons.add("RESERVATION_ALLOCATION_SOURCE_MISMATCH");
    const reserveEntries = ledgerForAllocation(
      ledger,
      reservation,
      allocation.lotId,
      "reserve"
    );
    if (
      reserveEntries.length !== 1 ||
      reserveEntries[0].amountCredits !== allocation.amountCredits ||
      reserveEntries[0].payloadHash !== reservation.payloadHash ||
      reserveEntries[0].fromState !== "available" ||
      reserveEntries[0].toState !== "reserved"
    )
      reasons.add("RESERVATION_RESERVE_LEDGER_MISMATCH");

    const terminalEntries = ledger.filter(
      (entry) =>
        entry.reservationId === reservation.reservationId &&
        entry.lotId === allocation.lotId &&
        ["release", "spend", "expire"].includes(entry.operation)
    );
    if (reservation.status === "active") {
      if (terminalEntries.length > 0)
        reasons.add("ACTIVE_RESERVATION_HAS_TERMINAL_LEDGER");
      continue;
    }
    const expectedOperation = terminalLedgerOperation(reservation.status);
    if (reservation.status === "expired") {
      if (
        terminalEntries.length !== 1 ||
        !["release", "expire"].includes(terminalEntries[0].operation)
      )
        reasons.add("EXPIRED_RESERVATION_LEDGER_MISMATCH");
    } else if (
      terminalEntries.length !== 1 ||
      terminalEntries[0].operation !== expectedOperation
    )
      reasons.add("RESERVATION_TERMINAL_LEDGER_MISMATCH");
    if (
      terminalEntries.length === 1 &&
      (terminalEntries[0].amountCredits !== allocation.amountCredits ||
        terminalEntries[0].payloadHash !== reservation.terminalPayloadHash ||
        terminalEntries[0].fromState !== "reserved" ||
        !(
          (terminalEntries[0].operation === "release" &&
            terminalEntries[0].toState === "available") ||
          (terminalEntries[0].operation === "spend" &&
            terminalEntries[0].toState === "spent") ||
          (terminalEntries[0].operation === "expire" &&
            terminalEntries[0].toState === "expired")
        ))
    )
      reasons.add("RESERVATION_TERMINAL_ENTRY_INVALID");
  }
}

function validateLotLedger(
  lot: CreditLot,
  ledger: CompetitionCreditLedgerEntry[],
  reservationsById: Map<string, CreditReservation>,
  reasons: Set<string>
) {
  const entries = ledger.filter((entry) => entry.lotId === lot.lotId);
  const reserves = entries.filter((entry) => entry.operation === "reserve");
  const releases = entries.filter((entry) => entry.operation === "release");
  const spends = entries.filter((entry) => entry.operation === "spend");
  const reservationExpires = entries.filter(
    (entry) => entry.operation === "expire" && entry.reservationId !== null
  );
  const directExpires = entries.filter(
    (entry) => entry.operation === "expire" && entry.reservationId === null
  );

  for (const entry of [
    ...reserves,
    ...releases,
    ...spends,
    ...reservationExpires,
  ]) {
    if (!entry.reservationId || !reservationsById.has(entry.reservationId)) {
      reasons.add("LEDGER_RESERVATION_ORPHAN");
    }
  }
  const reservedAmount = sumExactCredits(
    reserves.map((entry) => entry.amountCredits)
  );
  const releasedAmount = sumExactCredits(
    releases.map((entry) => entry.amountCredits)
  );
  const spentAmount = sumExactCredits(
    spends.map((entry) => entry.amountCredits)
  );
  const reservationExpiredAmount = sumExactCredits(
    reservationExpires.map((entry) => entry.amountCredits)
  );
  const directExpiredAmount = sumExactCredits(
    directExpires.map((entry) => entry.amountCredits)
  );
  const terminalAmount = sumExactCredits([
    releasedAmount,
    spentAmount,
    reservationExpiredAmount,
  ]);
  const baseAvailable =
    lot.bucket === "own"
      ? lot.totalCredits - lot.poolDepositedCredits
      : lot.totalCredits;
  if (
    terminalAmount > reservedAmount ||
    lot.reservedCredits !== reservedAmount - terminalAmount ||
    lot.availableCredits !==
      baseAvailable - reservedAmount + releasedAmount - directExpiredAmount ||
    lot.spentCredits !== spentAmount ||
    lot.expiredCredits !== reservationExpiredAmount + directExpiredAmount
  )
    reasons.add("LOT_LEDGER_STATE_MISMATCH");

  for (const entry of directExpires) {
    const expectedPayload = stableCreditHash({
      operation: "expire",
      lotId: lot.lotId,
      expiresAt: lot.expiresAt,
    });
    if (
      entry.payloadHash !== expectedPayload ||
      entry.fromState !== "available" ||
      entry.toState !== "expired"
    )
      reasons.add("DIRECT_EXPIRY_LEDGER_MISMATCH");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validRuntimeDate(value: unknown) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function validRuntimeCredit(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function runtimeShapeReasons(snapshotInput: unknown) {
  const reasons = new Set<string>();
  if (!isRecord(snapshotInput)) return ["RUNTIME_SNAPSHOT_NOT_OBJECT"];
  const arrayFields = [
    "items",
    "holds",
    "ownLots",
    "poolLots",
    "accountLots",
    "poolPeriodLots",
    "poolPositions",
    "reservations",
    "ledger",
    "accounts",
  ] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(snapshotInput[field]))
      reasons.add(`RUNTIME_${field.toUpperCase()}_NOT_ARRAY`);
  }
  const run = snapshotInput.run;
  const collectionCounts = snapshotInput.collectionCounts;
  if (!isRecord(collectionCounts))
    reasons.add("RUNTIME_COLLECTION_COUNTS_INVALID");
  else {
    for (const field of arrayFields) {
      if (!validRuntimeCredit(collectionCounts[field])) {
        reasons.add("RUNTIME_COLLECTION_COUNTS_INVALID");
      }
    }
  }
  if (
    !isRecord(run) ||
    !isRecord(run.period) ||
    !isRecord(run.settlementPeriod) ||
    !isRecord(run.sourceWatermark)
  ) {
    reasons.add("RUNTIME_RUN_INVALID");
  } else {
    if (
      typeof run.runId !== "string" ||
      !["uki", "nft"].includes(String(run.route)) ||
      typeof run.period.periodId !== "string" ||
      typeof run.period.ruleVersion !== "string" ||
      typeof run.period.ruleConfigHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(run.period.ruleConfigHash) ||
      !["snapshotted", "processing", "open", "open_with_holds", "blocked"].includes(
        String(run.status)
      )
    ) {
      reasons.add("RUNTIME_RUN_ID_OR_STATUS_INVALID");
    }
    for (const field of ["cutoff", "nextCutoff", "settlementTarget"] as const) {
      if (!validRuntimeDate(run.period[field]))
        reasons.add(`RUNTIME_RUN_${field.toUpperCase()}_INVALID`);
      if (!validRuntimeDate(run.settlementPeriod[field]))
        reasons.add(`RUNTIME_SETTLEMENT_${field.toUpperCase()}_INVALID`);
    }
    for (const field of [
      "expectedItemCount",
      "expectedGrantCredits",
      "expectedOwnCredits",
      "expectedPoolCredits",
      "expectedHeldCount",
      "fenceToken",
    ] as const) {
      if (!validRuntimeCredit(run[field]))
        reasons.add(`RUNTIME_RUN_${field.toUpperCase()}_INVALID`);
    }
    if (
      !validRuntimeDate(run.sourceWatermark.observedThrough) ||
      !validRuntimeDate(run.sourceWatermark.updatedAt)
    ) {
      reasons.add("RUNTIME_WATERMARK_DATE_INVALID");
    }
    if (!isRecord(run.sourceWatermark.sourceRuleVersions)) {
      reasons.add("RUNTIME_WATERMARK_RULES_INVALID");
    } else if (
      typeof run.sourceWatermark.sourceRuleVersions.uki !== "string" ||
      typeof run.sourceWatermark.sourceRuleVersions.nft !== "string"
    ) {
      reasons.add("RUNTIME_WATERMARK_RULES_INVALID");
    }
    if (
      run.sourceWatermark.status !== "healthy" ||
      typeof run.sourceWatermark.sourceHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(run.sourceWatermark.sourceHash) ||
      typeof run.sourceWatermark.healthEvidenceHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(run.sourceWatermark.healthEvidenceHash)
      || run.sourceWatermark.route !== run.route
      || !Number.isSafeInteger(run.sourceWatermark.canonicalSafeBlock)
      || typeof run.sourceWatermark.canonicalSafeBlockHash !== "string"
      || !/^0x[0-9a-f]{64}$/.test(run.sourceWatermark.canonicalSafeBlockHash)
    ) {
      reasons.add("RUNTIME_WATERMARK_IDENTITY_INVALID");
    }
  }

  const items = Array.isArray(snapshotInput.items) ? snapshotInput.items : [];
  for (const item of items) {
    if (!isRecord(item)) {
      reasons.add("RUNTIME_RUN_ITEM_NOT_OBJECT");
      continue;
    }
    if (
      typeof item.itemId !== "string" ||
      typeof item.runId !== "string" ||
      typeof item.slotId !== "string" ||
      typeof item.walletNormalized !== "string" ||
      !["uki", "nft"].includes(String(item.slotRoute)) ||
      !["pending", "applied"].includes(String(item.status))
    ) {
      reasons.add("RUNTIME_RUN_ITEM_ID_OR_STATUS_INVALID");
    }
    for (const field of [
      "slotOrdinal",
      "eligibilityEpoch",
      "slotRevision",
      "grantCredits",
      "ownCredits",
      "poolCredits",
    ] as const) {
      if (!validRuntimeCredit(item[field]))
        reasons.add(`RUNTIME_RUN_ITEM_${field.toUpperCase()}_INVALID`);
    }
    if (
      !validRuntimeDate(item.creditEligibleFrom) ||
      !validRuntimeDate(item.createdAt) ||
      (item.graceEndsAt !== undefined && !validRuntimeDate(item.graceEndsAt)) ||
      (item.appliedAt !== undefined && !validRuntimeDate(item.appliedAt))
    ) {
      reasons.add("RUNTIME_RUN_ITEM_DATE_INVALID");
    }
  }

  const lots = [
    ...(Array.isArray(snapshotInput.ownLots) ? snapshotInput.ownLots : []),
    ...(Array.isArray(snapshotInput.poolLots) ? snapshotInput.poolLots : []),
    ...(Array.isArray(snapshotInput.accountLots) ? snapshotInput.accountLots : []),
    ...(Array.isArray(snapshotInput.poolPeriodLots) ? snapshotInput.poolPeriodLots : []),
  ];
  for (const lot of lots) {
    if (!isRecord(lot)) {
      reasons.add("RUNTIME_LOT_NOT_OBJECT");
      continue;
    }
    if (
      typeof lot.lotId !== "string" ||
      typeof lot.runId !== "string" ||
      typeof lot.runItemId !== "string" ||
      typeof lot.sourceSlotId !== "string" ||
      !["own", "pool"].includes(String(lot.bucket))
    ) {
      reasons.add("RUNTIME_LOT_ID_OR_BUCKET_INVALID");
    }
    for (const field of [
      "eligibilityEpoch",
      "totalCredits",
      "poolDepositedCredits",
      "availableCredits",
      "reservedCredits",
      "spentCredits",
      "expiredCredits",
      "revision",
    ] as const) {
      if (!validRuntimeCredit(lot[field]))
        reasons.add(`RUNTIME_LOT_${field.toUpperCase()}_INVALID`);
    }
    if (
      !validRuntimeDate(lot.expiresAt) ||
      !validRuntimeDate(lot.createdAt) ||
      !validRuntimeDate(lot.updatedAt)
    )
      reasons.add("RUNTIME_LOT_DATE_INVALID");
    if (typeof lot.blocked !== "boolean")
      reasons.add("RUNTIME_LOT_BLOCKED_INVALID");
  }

  const reservations = Array.isArray(snapshotInput.reservations)
    ? snapshotInput.reservations
    : [];
  for (const reservation of reservations) {
    if (!isRecord(reservation)) {
      reasons.add("RUNTIME_RESERVATION_NOT_OBJECT");
      continue;
    }
    if (
      typeof reservation.reservationId !== "string" ||
      typeof reservation.sessionId !== "string" ||
      typeof reservation.walletNormalized !== "string" ||
      typeof reservation.periodId !== "string" ||
      typeof reservation.costCode !== "string" ||
      typeof reservation.ruleVersion !== "string" ||
      typeof reservation.ruleConfigHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(reservation.ruleConfigHash) ||
      typeof reservation.idempotencyKey !== "string" ||
      typeof reservation.requestHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(reservation.requestHash) ||
      typeof reservation.payloadHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(reservation.payloadHash) ||
      !["own", "pool"].includes(String(reservation.bucket)) ||
      !["active", "consumed", "released", "expired"].includes(
        String(reservation.status)
      )
    ) {
      reasons.add("RUNTIME_RESERVATION_ID_OR_STATUS_INVALID");
    }
    if (
      !validRuntimeCredit(reservation.amountCredits) ||
      !validRuntimeCredit(reservation.revision)
    ) {
      reasons.add("RUNTIME_RESERVATION_AMOUNT_OR_REVISION_INVALID");
    }
    if (
      !validRuntimeDate(reservation.expiresAt) ||
      !validRuntimeDate(reservation.createdAt) ||
      !validRuntimeDate(reservation.updatedAt) ||
      (reservation.terminalAt !== undefined &&
        !validRuntimeDate(reservation.terminalAt))
    ) {
      reasons.add("RUNTIME_RESERVATION_DATE_INVALID");
    }
    if (!Array.isArray(reservation.allocations)) {
      reasons.add("RUNTIME_RESERVATION_ALLOCATIONS_NOT_ARRAY");
      continue;
    }
    for (const allocation of reservation.allocations) {
      if (
        !isRecord(allocation) ||
        !validRuntimeCredit(allocation.amountCredits) ||
        !validRuntimeCredit(allocation.lotRevision) ||
        !validRuntimeDate(allocation.lotExpiresAt) ||
        !validRuntimeDate(allocation.reservedUntil)
      ) {
        reasons.add("RUNTIME_RESERVATION_ALLOCATION_INVALID");
      }
    }
  }

  const ledger = Array.isArray(snapshotInput.ledger)
    ? snapshotInput.ledger
    : [];
  for (const entry of ledger) {
    if (
      !isRecord(entry) ||
      !validRuntimeCredit(entry.amountCredits) ||
      !validRuntimeDate(entry.createdAt)
    )
      reasons.add("RUNTIME_LEDGER_ENTRY_INVALID");
    else if (
      typeof entry.ledgerId !== "string" ||
      typeof entry.idempotencyKey !== "string" ||
      typeof entry.payloadHash !== "string" ||
      ![
        "grant",
        "late_compensation",
        "pool_deposit",
        "reserve",
        "release",
        "spend",
        "expire",
      ].includes(String(entry.operation)) ||
      !["own", "pool"].includes(String(entry.bucket))
    ) {
      reasons.add("RUNTIME_LEDGER_ID_OR_OPERATION_INVALID");
    }
  }
  const positions = Array.isArray(snapshotInput.poolPositions)
    ? snapshotInput.poolPositions
    : [];
  for (const position of positions) {
    if (
      !isRecord(position) ||
      !validRuntimeCredit(position.credits) ||
      !validRuntimeCredit(position.eligibilityEpoch) ||
      !validRuntimeDate(position.createdAt) ||
      !validRuntimeDate(position.updatedAt)
    ) {
      reasons.add("RUNTIME_POOL_POSITION_INVALID");
    } else if (
      typeof position.positionId !== "string" ||
      !["pending_run", "open", "blocked"].includes(String(position.status))
    ) {
      reasons.add("RUNTIME_POOL_POSITION_STATUS_INVALID");
    }
  }
  const accounts = Array.isArray(snapshotInput.accounts)
    ? snapshotInput.accounts
    : [];
  for (const account of accounts) {
    if (!isRecord(account)) {
      reasons.add("RUNTIME_ACCOUNT_NOT_OBJECT");
      continue;
    }
    if (
      typeof account.walletNormalized !== "string" ||
      typeof account.periodId !== "string" ||
      typeof account.blocked !== "boolean"
    )
      reasons.add("RUNTIME_ACCOUNT_ID_OR_BLOCK_INVALID");
    for (const field of [
      "grantedCredits",
      "poolDepositedCredits",
      "availableCredits",
      "reservedCredits",
      "spentCredits",
      "expiredCredits",
      "revision",
    ] as const) {
      if (!validRuntimeCredit(account[field]))
        reasons.add(`RUNTIME_ACCOUNT_${field.toUpperCase()}_INVALID`);
    }
    if (
      !validRuntimeDate(account.createdAt) ||
      !validRuntimeDate(account.updatedAt)
    ) {
      reasons.add("RUNTIME_ACCOUNT_DATE_INVALID");
    }
  }
  const poolPeriod = snapshotInput.poolPeriod;
  if (poolPeriod !== null && poolPeriod !== undefined) {
    if (!isRecord(poolPeriod)) reasons.add("RUNTIME_POOL_PERIOD_NOT_OBJECT");
    else {
      if (
        typeof poolPeriod.periodId !== "string" ||
        typeof poolPeriod.blocked !== "boolean"
      ) {
        reasons.add("RUNTIME_POOL_PERIOD_ID_OR_BLOCK_INVALID");
      }
      for (const field of [
        "contributedCredits",
        "availableCredits",
        "reservedCredits",
        "spentCredits",
        "expiredCredits",
        "revision",
      ] as const) {
        if (!validRuntimeCredit(poolPeriod[field])) {
          reasons.add(`RUNTIME_POOL_PERIOD_${field.toUpperCase()}_INVALID`);
        }
      }
      if (
        !validRuntimeDate(poolPeriod.createdAt) ||
        !validRuntimeDate(poolPeriod.updatedAt)
      ) {
        reasons.add("RUNTIME_POOL_PERIOD_DATE_INVALID");
      }
    }
  }
  return [...reasons].sort();
}

function runtimeFailureResult(
  snapshot: unknown,
  reasonCodes: string[],
  trustedRunId?: string
): CreditReconciliationResult {
  const persistedRunId =
    isRecord(snapshot) && isRecord(snapshot.run)
      ? snapshot.run.runId
      : undefined;
  const candidateRunId = trustedRunId ?? persistedRunId;
  const runId =
    typeof candidateRunId === "string" &&
    candidateRunId.length > 0 &&
    candidateRunId.length <= 160 &&
    /^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(candidateRunId)
      ? candidateRunId
      : "unknown-run";
  const sorted = [...new Set(reasonCodes)].sort();
  return {
    ok: false,
    reasonCodes: sorted,
    evidenceHash: stableCreditHash({ runId, reasonCodes: sorted }),
  };
}

function reconcileCompetitionCreditSnapshotUnsafe(
  snapshot: CreditReconciliationSnapshot
): CreditReconciliationResult {
  const reasons = new Set<string>();
  const { run } = snapshot;
  const allLots = [...snapshot.ownLots, ...snapshot.poolLots];
  const lotsById = new Map(allLots.map((lot) => [lot.lotId, lot]));
  const reservationsById = new Map(
    snapshot.reservations.map((reservation) => [
      reservation.reservationId,
      reservation,
    ])
  );
  for (const field of [
    "items",
    "holds",
    "ownLots",
    "poolLots",
    "accountLots",
    "poolPeriodLots",
    "poolPositions",
    "reservations",
    "ledger",
    "accounts",
  ] as const) {
    if (snapshot.collectionCounts[field] !== snapshot[field].length) {
      reasons.add(`RECONCILIATION_${field.toUpperCase()}_TRUNCATED_OR_MISSING`);
    }
  }

  const expectedRunId = stableCreditHash({
    kind: "daily-credit-run",
    route: run.route,
    period: run.period,
    sourceHash: run.sourceSnapshotHash,
  });
  if (run._id !== expectedRunId || run.runId !== expectedRunId)
    reasons.add("RUN_ID_MISMATCH");
  uniqueBy(
    snapshot.items,
    (item) => item.itemId,
    "DUPLICATE_RUN_ITEM",
    reasons
  );
  uniqueBy(allLots, (lot) => lot.lotId, "DUPLICATE_LOT_ID", reasons);
  uniqueBy(
    snapshot.poolPositions,
    (item) => item.positionId,
    "DUPLICATE_POOL_POSITION",
    reasons
  );
  uniqueBy(
    snapshot.ledger,
    (entry) => entry.ledgerId,
    "DUPLICATE_LEDGER_ID",
    reasons
  );
  uniqueBy(
    snapshot.ledger,
    (entry) => entry.idempotencyKey,
    "DUPLICATE_LEDGER_IDEMPOTENCY",
    reasons
  );
  uniqueBy(
    snapshot.reservations,
    (item) => item.reservationId,
    "DUPLICATE_RESERVATION_ID",
    reasons
  );
  uniqueBy(
    snapshot.reservations,
    (item) => item.idempotencyKey,
    "DUPLICATE_RESERVATION_IDEMPOTENCY",
    reasons
  );
  uniqueBy(
    snapshot.reservations,
    (item) => item.sessionId,
    "DUPLICATE_RESERVATION_SESSION",
    reasons
  );
  uniqueBy(
    snapshot.reservations.filter((item) => item.terminalIdempotencyKey),
    (item) => item.terminalIdempotencyKey!,
    "DUPLICATE_RESERVATION_TERMINAL_IDEMPOTENCY",
    reasons
  );

  if (snapshot.items.length !== run.expectedItemCount)
    reasons.add("RUN_ITEM_COUNT_MISMATCH");
  if (snapshot.items.some((item) => item.status !== "applied"))
    reasons.add("RUN_ITEM_NOT_APPLIED");
  if (snapshot.ownLots.length !== snapshot.items.length)
    reasons.add("OWN_LOT_COUNT_MISMATCH");

  for (const entry of snapshot.ledger) {
    const expectedLedgerId = stableCreditHash({
      idempotencyKey: entry.idempotencyKey,
      operation: entry.operation,
      bucket: entry.bucket,
      lotId: entry.lotId,
    });
    if (entry._id !== expectedLedgerId || entry.ledgerId !== expectedLedgerId) {
      reasons.add("LEDGER_ID_MISMATCH");
    }
    if (
      entry.runId !== run.runId ||
      entry.periodId !== run.settlementPeriod.periodId ||
      !Number.isSafeInteger(entry.amountCredits) ||
      entry.amountCredits <= 0
    )
      reasons.add("LEDGER_SCOPE_OR_AMOUNT_INVALID");
    if (
      (entry.operation === "grant" ||
        entry.operation === "late_compensation" ||
        entry.operation === "pool_deposit") &&
      (
        entry.effectiveBlockNumber !== run.cutoffBlock.blockNumber ||
        entry.effectiveBlockHash !== run.cutoffBlock.blockHash ||
        !(entry.effectiveBlockTimestamp instanceof Date) ||
        entry.effectiveBlockTimestamp.getTime() !== run.cutoffBlock.blockTimestamp.getTime()
      )
    ) reasons.add("LEDGER_EFFECTIVE_BLOCK_MISMATCH");
    if (
      entry.runItemId &&
      !snapshot.items.some((item) => item.itemId === entry.runItemId)
    ) {
      reasons.add("LEDGER_RUN_ITEM_ORPHAN");
    }
    if (entry.lotId && !lotsById.has(entry.lotId))
      reasons.add("LEDGER_LOT_ORPHAN");
    const lot = entry.lotId ? lotsById.get(entry.lotId) : null;
    if (
      lot &&
      (entry.bucket !== lot.bucket ||
        entry.runId !== lot.runId ||
        entry.periodId !== lot.periodId ||
        entry.runItemId !== lot.runItemId)
    )
      reasons.add("LEDGER_LOT_SCOPE_MISMATCH");
  }

  for (const item of snapshot.items) {
    const expectedItemId = stableCreditHash({
      kind: "daily-credit-item",
      periodId: run.period.periodId,
      slotId: item.slotId,
      eligibilityEpoch: item.eligibilityEpoch,
    });
    if (
      item._id !== expectedItemId ||
      item.itemId !== expectedItemId ||
      item.runId !== run.runId ||
      item.earnedPeriodId !== run.period.periodId ||
      item.periodId !== run.settlementPeriod.periodId
    )
      reasons.add("RUN_ITEM_ID_OR_SCOPE_MISMATCH");
    const immutable = {
      _id: item._id,
      itemId: item.itemId,
      runId: item.runId,
      earnedPeriodId: item.earnedPeriodId,
      periodId: item.periodId,
      walletNormalized: item.walletNormalized,
      slotId: item.slotId,
      slotRoute: item.slotRoute,
      slotOrdinal: item.slotOrdinal,
      eligibilityEpoch: item.eligibilityEpoch,
      slotRuleVersion: item.slotRuleVersion,
      slotRoundId: item.slotRoundId,
      slotSourceHash: item.slotSourceHash,
      slotRevision: item.slotRevision,
      creditEligibleFrom: item.creditEligibleFrom,
      graceEndsAt: item.graceEndsAt,
      baseGrantCredits: item.baseGrantCredits,
      compensationCredits: item.compensationCredits,
      compensationReason: item.compensationReason,
      baseOwnCredits: item.baseOwnCredits,
      basePoolCredits: item.basePoolCredits,
      compensationOwnCredits: item.compensationOwnCredits,
      compensationPoolCredits: item.compensationPoolCredits,
      grantCredits: item.grantCredits,
      ownCredits: item.ownCredits,
      poolCredits: item.poolCredits,
      poolConfigId: item.poolConfigId,
    };
    if (buildCreditRunItemPayloadHash(immutable) !== item.payloadHash) {
      reasons.add("RUN_ITEM_PAYLOAD_TAMPERED");
    }
    if (
      item.baseGrantCredits !== 100 ||
      (item.compensationCredits !== 0 && item.compensationCredits !== 100) ||
      item.grantCredits !== item.baseGrantCredits + item.compensationCredits ||
      item.baseOwnCredits + item.basePoolCredits !== item.baseGrantCredits ||
      item.compensationOwnCredits + item.compensationPoolCredits !== item.compensationCredits ||
      (item.compensationCredits === 0 && item.compensationReason !== null) ||
      (item.compensationCredits === 100 && item.compensationReason !== "late_gt_24h") ||
      (item.compensationCredits === 100 &&
        (item.compensationOwnCredits !== item.baseOwnCredits ||
          item.compensationPoolCredits !== item.basePoolCredits)) ||
      item.ownCredits + item.poolCredits !== item.grantCredits ||
      item.ownCredits !== item.baseOwnCredits + item.compensationOwnCredits ||
      item.poolCredits !== item.basePoolCredits + item.compensationPoolCredits ||
      item.poolCredits < 0 ||
      item.poolCredits > 200 ||
      item.poolCredits % 10 !== 0
    ) {
      reasons.add("RUN_ITEM_CREDIT_SPLIT_INVALID");
    }

    const ownLots = snapshot.ownLots.filter(
      (lot) => lot.runItemId === item.itemId
    );
    if (ownLots.length !== 1) reasons.add("OWN_LOT_PER_ITEM_MISMATCH");
    else {
      const ownLot = ownLots[0];
      const expectedLotId = stableCreditHash({
        kind: "own-lot",
        itemId: item.itemId,
      });
      if (
        ownLot._id !== expectedLotId ||
        ownLot.lotId !== expectedLotId ||
        ownLot.bucket !== "own" ||
        ownLot.walletNormalized !== item.walletNormalized ||
        ownLot.runId !== run.runId ||
        ownLot.periodId !== run.settlementPeriod.periodId ||
        ownLot.sourceSlotId !== item.slotId ||
        ownLot.eligibilityEpoch !== item.eligibilityEpoch ||
        ownLot.totalCredits !== item.grantCredits ||
        ownLot.poolDepositedCredits !== item.poolCredits ||
        ownLot.expiresAt.getTime() !== run.settlementPeriod.nextCutoff.getTime()
      ) {
        reasons.add("OWN_LOT_SOURCE_MISMATCH");
      }
      if (!lotConserves(ownLot)) reasons.add("OWN_LOT_CONSERVATION_FAILED");
    }

    const poolLots = snapshot.poolLots.filter(
      (lot) => lot.runItemId === item.itemId
    );
    const positions = snapshot.poolPositions.filter(
      (position) => position.runItemId === item.itemId
    );
    if (item.poolCredits === 0) {
      if (poolLots.length > 0 || positions.length > 0)
        reasons.add("UNEXPECTED_POOL_TRANSFER");
    } else if (poolLots.length !== 1 || positions.length !== 1) {
      reasons.add("POOL_TRANSFER_CARDINALITY_MISMATCH");
    } else {
      const poolLot = poolLots[0];
      const position = positions[0];
      const expectedPoolLotId = stableCreditHash({
        kind: "pool-lot",
        itemId: item.itemId,
      });
      const expectedPositionId = stableCreditHash({
        kind: "pool-position",
        itemId: item.itemId,
      });
      if (
        poolLot._id !== expectedPoolLotId ||
        poolLot.lotId !== expectedPoolLotId ||
        poolLot.bucket !== "pool" ||
        poolLot.walletNormalized !== null ||
        poolLot.runId !== run.runId ||
        poolLot.periodId !== run.settlementPeriod.periodId ||
        position._id !== expectedPositionId ||
        position.positionId !== expectedPositionId ||
        position.walletNormalized !== item.walletNormalized ||
        position.runId !== run.runId ||
        position.periodId !== run.settlementPeriod.periodId ||
        poolLot.totalCredits !== item.poolCredits ||
        position.credits !== item.poolCredits ||
        poolLot.sourceSlotId !== item.slotId ||
        position.sourceSlotId !== item.slotId ||
        poolLot.eligibilityEpoch !== item.eligibilityEpoch ||
        position.eligibilityEpoch !== item.eligibilityEpoch ||
        position.status !==
          (run.status === "open"
            ? "open"
            : run.status === "blocked"
            ? "blocked"
            : "pending_run")
      ) {
        reasons.add("POOL_TRANSFER_EQUALITY_FAILED");
      }
      if (!lotConserves(poolLot)) reasons.add("POOL_LOT_CONSERVATION_FAILED");
    }

    const grants = ledgerForItem(snapshot.ledger, item, "grant", "own");
    if (
      grants.length !== 1 ||
      grants[0].amountCredits !== item.baseGrantCredits ||
      grants[0].payloadHash !== item.payloadHash ||
      grants[0].fromState !== null ||
      grants[0].toState !== "available"
    ) {
      reasons.add("GRANT_LEDGER_MISMATCH");
    }
    const compensations = ledgerForItem(
      snapshot.ledger,
      item,
      "late_compensation",
      "own"
    );
    if (
      (item.compensationCredits === 0 && compensations.length !== 0) ||
      (item.compensationCredits > 0 &&
        (compensations.length !== 1 ||
          compensations[0].amountCredits !== item.compensationCredits ||
          compensations[0].payloadHash !== item.payloadHash ||
          compensations[0].fromState !== null ||
          compensations[0].toState !== "available"))
    ) {
      reasons.add("LATE_COMPENSATION_LEDGER_MISMATCH");
    }
    const ownDeposits = ledgerForItem(
      snapshot.ledger,
      item,
      "pool_deposit",
      "own"
    );
    const poolDeposits = ledgerForItem(
      snapshot.ledger,
      item,
      "pool_deposit",
      "pool"
    );
    if (item.poolCredits === 0) {
      if (ownDeposits.length > 0 || poolDeposits.length > 0)
        reasons.add("UNEXPECTED_POOL_LEDGER");
    } else if (
      ownDeposits.length !== 1 ||
      poolDeposits.length !== 1 ||
      ownDeposits[0].amountCredits !== item.poolCredits ||
      poolDeposits[0].amountCredits !== item.poolCredits ||
      ownDeposits[0].payloadHash !== item.payloadHash ||
      poolDeposits[0].payloadHash !== item.payloadHash ||
      ownDeposits[0].fromState !== "available" ||
      ownDeposits[0].toState !== null ||
      poolDeposits[0].fromState !== null ||
      poolDeposits[0].toState !== "available"
    ) {
      reasons.add("POOL_LEDGER_EQUALITY_FAILED");
    }
  }

  for (const lot of allLots)
    validateLotLedger(lot, snapshot.ledger, reservationsById, reasons);
  for (const reservation of snapshot.reservations) {
    validateReservation(
      reservation,
      lotsById,
      snapshot.ledger,
      run.settlementPeriod.periodId,
      run.period.ruleVersion,
      run.period.ruleConfigHash,
      reasons
    );
  }

  const shouldBeBlocked = run.status === "blocked";
  if (
    allLots.some((lot) => lot.blocked !== shouldBeBlocked) ||
    snapshot.accounts.some((account) => account.blocked !== shouldBeBlocked) ||
    (snapshot.poolPeriod && snapshot.poolPeriod.blocked !== shouldBeBlocked)
  ) {
    reasons.add("RUN_BLOCK_STATE_MISMATCH");
  }

  const expectedGrant = sumExactCredits(
    snapshot.items.map((item) => item.grantCredits)
  );
  const expectedOwn = sumExactCredits(
    snapshot.items.map((item) => item.ownCredits)
  );
  const expectedPool = sumExactCredits(
    snapshot.items.map((item) => item.poolCredits)
  );
  if (
    run.expectedGrantCredits !== expectedGrant ||
    run.expectedOwnCredits !== expectedOwn ||
    run.expectedPoolCredits !== expectedPool
  )
    reasons.add("RUN_TOTALS_MISMATCH");
  if (
    snapshot.poolLots.length !==
    snapshot.items.filter((item) => item.poolCredits > 0).length
  ) {
    reasons.add("POOL_LOT_COUNT_MISMATCH");
  }
  if (
    snapshot.poolPositions.length !==
    snapshot.items.filter((item) => item.poolCredits > 0).length
  ) {
    reasons.add("POOL_POSITION_COUNT_MISMATCH");
  }

  const wallets = new Set(
    snapshot.accountLots.flatMap((lot) => lot.walletNormalized ? [lot.walletNormalized] : [])
  );
  for (const wallet of wallets) {
    const accounts = snapshot.accounts.filter(
      (account) => account._id === accountId(wallet, run.settlementPeriod.periodId, run.route)
    );
    const lots = snapshot.accountLots.filter(
      (lot) => lot.walletNormalized === wallet
    );
    if (accounts.length !== 1 || !accountMatchesLots(accounts[0], lots)) {
      reasons.add("ACCOUNT_MATERIALIZATION_MISMATCH");
    }
  }
  if (
    snapshot.accounts.some(
      (account) =>
        account.route !== run.route ||
        account.periodId !== run.settlementPeriod.periodId ||
        account._id !== accountId(account.walletNormalized, account.periodId, account.route)
    )
  ) {
    reasons.add("UNEXPECTED_ACCOUNT_MATERIALIZATION");
  }

  if (snapshot.poolPeriodLots.length === 0) {
    if (snapshot.poolPeriod && snapshot.poolPeriod.contributedCredits !== 0) {
      reasons.add("UNEXPECTED_POOL_PERIOD");
    }
  } else if (
    !snapshot.poolPeriod ||
    snapshot.poolPeriod._id !== `pool:${run.settlementPeriod.periodId}:${run.route}` ||
    snapshot.poolPeriod.route !== run.route ||
    snapshot.poolPeriod.periodId !== run.settlementPeriod.periodId ||
    snapshot.poolPeriod.contributedCredits !==
      sumExactCredits(snapshot.poolPeriodLots.map((lot) => lot.totalCredits)) ||
    snapshot.poolPeriod.availableCredits !==
      sumExactCredits(snapshot.poolPeriodLots.map((lot) => lot.availableCredits)) ||
    snapshot.poolPeriod.reservedCredits !==
      sumExactCredits(snapshot.poolPeriodLots.map((lot) => lot.reservedCredits)) ||
    snapshot.poolPeriod.spentCredits !==
      sumExactCredits(snapshot.poolPeriodLots.map((lot) => lot.spentCredits)) ||
    snapshot.poolPeriod.expiredCredits !==
      sumExactCredits(snapshot.poolPeriodLots.map((lot) => lot.expiredCredits))
  )
    reasons.add("POOL_MATERIALIZATION_MISMATCH");

  const snapshotHash = stableCreditHash({
    period: run.period,
    settlementPeriod: run.settlementPeriod,
    cutoffBlock: run.cutoffBlock,
    sourceWatermark: run.sourceWatermark,
    sourceSnapshotHash: run.sourceSnapshotHash,
    items: snapshot.items.map((item) => item.payloadHash).sort(),
    holds: snapshot.holds.map((hold) => hold.evidenceHash).sort(),
  });
  if (snapshotHash !== run.snapshotHash)
    reasons.add("RUN_SNAPSHOT_HASH_MISMATCH");

  const reasonCodes = [...reasons].sort();
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
    evidenceHash: stableCreditHash({
      runId: run.runId,
      reasonCodes,
      itemHashes: snapshot.items.map((item) => item.payloadHash).sort(),
      ownLots: snapshot.ownLots,
      poolLots: snapshot.poolLots,
      poolPositions: snapshot.poolPositions,
      reservations: snapshot.reservations,
      accounts: snapshot.accounts,
      poolPeriod: snapshot.poolPeriod,
      ledger: snapshot.ledger,
      collectionCounts: snapshot.collectionCounts,
    }),
  };
}

export function reconcileCompetitionCreditSnapshot(
  snapshot: unknown,
  trustedRunId?: string
): CreditReconciliationResult {
  const shapeReasons = runtimeShapeReasons(snapshot);
  if (shapeReasons.length > 0)
    return runtimeFailureResult(snapshot, shapeReasons, trustedRunId);
  try {
    return reconcileCompetitionCreditSnapshotUnsafe(
      snapshot as CreditReconciliationSnapshot
    );
  } catch (error) {
    return runtimeFailureResult(
      snapshot,
      [
        "RECONCILIATION_RUNTIME_EXCEPTION",
        error instanceof Error && error.name
          ? `RECONCILIATION_EXCEPTION_${error.name.toUpperCase()}`
          : "RECONCILIATION_EXCEPTION_UNKNOWN",
      ],
      trustedRunId
    );
  }
}
