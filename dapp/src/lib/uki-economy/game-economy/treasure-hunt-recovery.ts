import "server-only";

import type { Db, Filter, FindCursor } from "mongodb";

import type {
  CompetitionCreditLedgerEntry,
  CreditLot,
  CreditReservation,
} from "../credits/types";
import { validateReservationIntegrity } from "../credits/service";
import { stableCreditHash, sumExactCredits } from "../credits/rules";
import { assertCukiePoolAssignmentIntegrity } from "../cukie-pool/service";
import type { CukiePoolVaultAssetLease } from "../cukie-pool/vault-assignment";
import { CUKIE_POOL_VAULT_ASSET_LEASES } from "../cukie-pool/vault-source";
import type {
  CukiePoolAssignment,
  CukiePoolEvent,
  CukiePoolPosition,
} from "../cukie-pool/types";
import { stableCukiePoolHash } from "../cukie-pool/rules";
import {
  assertOwnCukieAssignmentIntegrity,
  assertOwnCukieEpochIntegrity,
  stableOwnCukieHash,
} from "../own-cukie/rules";
import type {
  OwnCukieAssignment,
  OwnCukieEpoch,
  OwnCukieEvent,
} from "../own-cukie/types";
import type {
  NftAssetLockDocument,
  NftAssetLockEventDocument,
} from "@/lib/nft-inventory/lock-types";
import { buildNftLockPayloadHash } from "@/lib/nft-inventory/lock-types";

import { DomainConflictError } from "../errors";
import {
  assertGameSessionIntegrity,
  buildGameResourceReservationResultHash,
  stableGameEconomyHash,
} from "./rules";
import {
  buildGameCukieAssignmentEvidence,
  buildGameOwnCukieAssignmentEvidence,
} from "./resource-evidence";
import { TREASURE_HUNT_ECONOMY_POLICY } from "./treasure-hunt-policy";
import type {
  GameEconomyEvent,
  GameEconomyResource,
  GameEconomySession,
} from "./types";
import type { TreasureHuntEconomyRun } from "./treasure-hunt-types";

/** Public codes deliberately contain no database or reservation details. */
export const TREASURE_HUNT_ECONOMY_RECOVERY_RESTART_CODE =
  "GAME_SESSION_RESTART_REQUIRED" as const;
export const TREASURE_HUNT_ECONOMY_RECOVERY_PENDING_CODE =
  "GAME_ECONOMY_RECOVERY_PENDING" as const;

const RECOVERY_IDEMPOTENCY_PREFIX = "treasure-recovery-";
const MAX_RECOVERY_CREDIT_RESERVATIONS = 8_192;
const MAX_RECOVERY_CREDIT_LEDGER_ENTRIES = 32_768;
const MAX_RECOVERY_CREDIT_LOTS = 1_024;
const MAX_RECOVERY_ASSIGNMENTS = 32;
const MAX_RECOVERY_EVENTS = 128;
const MAX_RECOVERY_GAME_EVENTS = 128;
const MAX_RECOVERY_POSITIONS = 8;
const MAX_RECOVERY_LEASES = 8;
const MAX_RECOVERY_LOCKS = 8;
const MAX_RECOVERY_LOCK_EVENTS = 256;

type ResourceKind = "credit" | "cukie";

type GameEconomyResourceBinding = {
  _id: string;
  sessionId: string;
  kind: ResourceKind;
  reservationIdempotencyKey: string;
  requestHash: string;
  fenceToken: number;
  reservationId?: string;
  evidenceHash?: string;
  terminalIntent?: "consumed" | "released";
  terminalIdempotencyKey?: string;
  status: "reserving" | "active" | "consumed" | "released";
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

type RecoveryDecision =
  | {
      kind: "restart";
      replacementIdempotencyKey: string;
    }
  | {
      kind: "pending";
      reason: string;
    }
  | {
      kind: "not_applicable";
      reason: string;
    };

type RecoveryReadInput = {
  db: Db;
  userId: string;
  walletNormalized: string;
  authorityGameSessionId: string;
  runId: string;
  expectedCreateIdempotencyKey: string;
  session?: GameEconomySession | null;
};

type RecoverySnapshot = {
  session: GameEconomySession;
  run: TreasureHuntEconomyRun | null;
  creditBinding: GameEconomyResourceBinding | null;
  cukieBinding: GameEconomyResourceBinding | null;
  creditReservations: CreditReservation[];
  creditReservationsComplete: boolean;
  creditLedger: CompetitionCreditLedgerEntry[];
  creditLedgerComplete: boolean;
  creditLots: CreditLot[];
  creditLotsComplete: boolean;
  gameEvents: GameEconomyEvent[];
  gameEventsComplete: boolean;
  ownAssignments: OwnCukieAssignment[];
  ownAssignmentsComplete: boolean;
  ownEpochs: OwnCukieEpoch[];
  ownEpoch: OwnCukieEpoch | null;
  ownEvents: OwnCukieEvent[];
  ownEventsComplete: boolean;
  poolAssignments: CukiePoolAssignment[];
  poolAssignmentsComplete: boolean;
  poolPositions: CukiePoolPosition[];
  poolPositionsComplete: boolean;
  poolEvents: CukiePoolEvent[];
  poolEventsComplete: boolean;
  poolVaultLeases: CukiePoolVaultAssetLease[];
  poolVaultLeasesComplete: boolean;
  locks: NftAssetLockDocument[];
  locksComplete: boolean;
  lockEvents: NftAssetLockEventDocument[];
  lockEventsComplete: boolean;
};

function isNonEmptyText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function collectionFilter<T>(value: Filter<T>) {
  return value;
}

async function readBounded<T>(cursor: FindCursor<T>, limit: number) {
  const values = await cursor.limit(limit + 1).toArray();
  return {
    values: values.slice(0, limit),
    complete: values.length <= limit,
  };
}

function replacementIdempotencyKey(input: {
  userId: string;
  walletNormalized: string;
  authorityGameSessionId: string;
  gameEconomySessionId: string;
}) {
  return `${RECOVERY_IDEMPOTENCY_PREFIX}${stableGameEconomyHash({
    kind: "treasure-parent-session-recovery-v1",
    userId: input.userId,
    walletNormalized: input.walletNormalized,
    authorityGameSessionId: input.authorityGameSessionId,
    gameEconomySessionId: input.gameEconomySessionId,
  })}`;
}

export function treasureHuntRecoveryReplacementIdempotencyKey(input: {
  userId: string;
  walletNormalized: string;
  authorityGameSessionId: string;
  gameEconomySessionId: string;
}) {
  return replacementIdempotencyKey(input);
}

function pending(reason: string): RecoveryDecision {
  return { kind: "pending", reason };
}

function notApplicable(reason: string): RecoveryDecision {
  return { kind: "not_applicable", reason };
}

function resourceOf(
  session: GameEconomySession,
  kind: ResourceKind
): GameEconomyResource {
  return kind === "credit" ? session.credit : session.cukie;
}

function assertReleasedBinding(
  binding: GameEconomyResourceBinding | null,
  session: GameEconomySession,
  kind: ResourceKind
) {
  const resource = resourceOf(session, kind);
  const expectedBindingId = stableGameEconomyHash({
    kind: "game-resource-binding",
    sessionId: session.sessionId,
    resource: kind,
  });
  const expectedReservationKey = `${session.sessionId}:${kind}:reserve`;
  if (
    !binding ||
    binding._id !== expectedBindingId ||
    binding.sessionId !== session.sessionId ||
    binding.kind !== kind ||
    binding.reservationIdempotencyKey !== expectedReservationKey ||
    binding.requestHash !== resource.reservationRequestHash ||
    binding.status !== "released" ||
    binding.terminalIntent !== "released" ||
    binding.terminalIdempotencyKey !== `${session.sessionId}:${kind}:release` ||
    !isSafeNonNegativeInteger(binding.fenceToken) ||
    binding.fenceToken !== session.fenceToken ||
    !isSafeNonNegativeInteger(binding.revision) ||
    binding.revision < 2
  ) {
    throw new DomainConflictError(
      `El binding ${kind} no acredita compensacion terminal.`
    );
  }
  if (
    (resource.reservationId === null) !== (resource.evidenceHash === null) ||
    (resource.reservationId === null) !==
      (resource.reservationResultHash === null) ||
    (resource.reservationId !== null &&
      resource.evidenceHash !== null &&
      resource.reservationResultHash !==
        buildGameResourceReservationResultHash({
          requestHash: resource.reservationRequestHash,
          reservationId: resource.reservationId,
          evidenceHash: resource.evidenceHash,
        })) ||
    (binding.reservationId ?? null) !== resource.reservationId ||
    (binding.evidenceHash ?? null) !== resource.evidenceHash
  ) {
    throw new DomainConflictError(
      `El binding ${kind} no coincide con el recurso.`
    );
  }
}

const GAME_ECONOMY_RESOURCE_STATES = new Set([
  "not_required",
  "pending",
  "active",
  "consumed",
  "released",
]);

const GAME_ECONOMY_SESSION_STATUSES = new Set([
  "created",
  "resources_reserved",
  "started",
  "submitted",
  "validated",
  "settled",
  "forfeited",
  "expired",
  "rejected",
]);

function assertGameEconomyEventChain(
  session: GameEconomySession,
  events: GameEconomyEvent[],
) {
  if (events.length !== session.revision + 1 || events.length === 0) {
    throw new DomainConflictError("Faltan eventos de la saga economica.");
  }
  const ordered = [...events].sort((left, right) => left.toRevision - right.toRevision);
  let previous: GameEconomyEvent | null = null;
  for (const [index, event] of ordered.entries()) {
    const immutable = {
      eventId: event.eventId,
      sessionId: event.sessionId,
      fromRevision: event.fromRevision,
      toRevision: event.toRevision,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      creditState: event.creditState,
      cukieState: event.cukieState,
      fenceToken: event.fenceToken,
      createdAt: event.createdAt,
    };
    const expectedEventId = stableGameEconomyHash({
      kind: "game-economy-session-event-id",
      sessionId: session.sessionId,
      toRevision: index,
    });
    const expectedPayloadHash = stableGameEconomyHash({
      kind: "game-economy-session-event",
      ...immutable,
    });
    if (
      event._id !== event.eventId ||
      event.eventId !== expectedEventId ||
      event.payloadHash !== expectedPayloadHash ||
      event.sessionId !== session.sessionId ||
      event.toRevision !== index ||
      event.fromRevision !== (previous ? previous.toRevision : null) ||
      event.fromStatus !== (previous ? previous.toStatus : null) ||
      !GAME_ECONOMY_SESSION_STATUSES.has(event.toStatus) ||
      !GAME_ECONOMY_RESOURCE_STATES.has(event.creditState) ||
      !GAME_ECONOMY_RESOURCE_STATES.has(event.cukieState) ||
      !isSafeNonNegativeInteger(event.fenceToken) ||
      !(event.createdAt instanceof Date) ||
      Number.isNaN(event.createdAt.getTime()) ||
      (index === 0 ? event.fenceToken !== 0 : event.fenceToken < 1) ||
      (index === 0 && (
        event.fromRevision !== null ||
        event.fromStatus !== null ||
        event.toStatus !== "created" ||
        event.creditState !== (session.rule.credit.required ? "pending" : "not_required") ||
        event.cukieState !== (session.rule.cukie.required ? "pending" : "not_required") ||
        event.createdAt.getTime() !== session.createdAt.getTime()
      )) ||
      (previous && event.createdAt.getTime() < previous.createdAt.getTime()) ||
      (previous && event.fenceToken < previous.fenceToken)
    ) {
      throw new DomainConflictError("La cadena de eventos de la saga no es canonica.");
    }
    previous = event;
  }
  const last = ordered.at(-1)!;
  if (
    last.toStatus !== session.status ||
    last.creditState !== session.credit.state ||
    last.cukieState !== session.cukie.state ||
    last.fenceToken !== session.fenceToken ||
    last.createdAt.getTime() !== session.updatedAt.getTime()
  ) {
    throw new DomainConflictError("El ultimo evento no coincide con la sesion.");
  }
  return ordered;
}

type CreditLedgerEntryExpectation = {
  idempotencyKey: string;
  payloadHash: string;
  bucket: CreditLot["bucket"];
  amountCredits: number;
  lotId: string;
  periodId: string;
  walletNormalized: string;
  fromState: CompetitionCreditLedgerEntry["fromState"];
  toState: CompetitionCreditLedgerEntry["toState"];
};

function isCanonicalCreditLedgerEntry(
  entry: CompetitionCreditLedgerEntry | undefined,
  expected: CreditLedgerEntryExpectation
) {
  const expectedLedgerId = entry
    ? stableCreditHash({
        idempotencyKey: expected.idempotencyKey,
        operation: entry.operation,
        bucket: expected.bucket,
        lotId: expected.lotId,
      })
    : null;
  return Boolean(
    entry &&
      entry._id === expectedLedgerId &&
      entry.ledgerId === expectedLedgerId &&
      entry.idempotencyKey === expected.idempotencyKey &&
      entry.payloadHash === expected.payloadHash &&
      entry.bucket === expected.bucket &&
      entry.amountCredits === expected.amountCredits &&
      entry.lotId === expected.lotId &&
      entry.periodId === expected.periodId &&
      entry.walletNormalized === expected.walletNormalized &&
      entry.fromState === expected.fromState &&
      entry.toState === expected.toState &&
      entry.runId !== null &&
      entry.runItemId !== null
  );
}

function lotConservesCreditLot(lot: CreditLot) {
  try {
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
  } catch {
    return false;
  }
}

function assertCreditLotLedger(
  lot: CreditLot,
  ledger: CompetitionCreditLedgerEntry[],
  reservations: CreditReservation[]
) {
  const reservationsById = new Map(
    reservations.map((reservation) => [reservation.reservationId, reservation])
  );
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
    if (!entry.reservationId) {
      throw new DomainConflictError(
        "El ledger de creditos no liga su reserva."
      );
    }
    const reservation = reservationsById.get(entry.reservationId);
    if (
      !reservation ||
      !reservation.allocations.some(
        (allocation) => allocation.lotId === lot.lotId
      ) ||
      entry.bucket !== reservation.bucket ||
      entry.periodId !== reservation.periodId ||
      entry.walletNormalized !== reservation.walletNormalized ||
      entry.runId !== lot.runId ||
      entry.runItemId !== lot.runItemId ||
      !Number.isSafeInteger(entry.amountCredits) ||
      entry.amountCredits <= 0
    ) {
      throw new DomainConflictError(
        "El ledger de creditos no liga el lote canonico."
      );
    }
    const expectedStates =
      entry.operation === "reserve"
        ? { fromState: "available" as const, toState: "reserved" as const }
        : entry.operation === "release"
        ? { fromState: "reserved" as const, toState: "available" as const }
        : entry.operation === "spend"
        ? { fromState: "reserved" as const, toState: "spent" as const }
        : { fromState: "reserved" as const, toState: "expired" as const };
    if (
      entry.fromState !== expectedStates.fromState ||
      entry.toState !== expectedStates.toState
    ) {
      throw new DomainConflictError(
        "El ledger de creditos no conserva el estado del lote."
      );
    }
  }
  // Reconcile every reservation touching this lot, including reservations
  // from other sessions. Without this pass, a forged terminal ledger row could
  // change the materialized counters while leaving the rejected session's
  // own release evidence apparently valid.
  for (const reservation of reservations) {
    const allocationIndexes = reservation.allocations
      .map((allocation, index) => (allocation.lotId === lot.lotId ? index : -1))
      .filter((index) => index >= 0);
    if (allocationIndexes.length === 0) continue;
    for (const index of allocationIndexes) {
      const allocation = reservation.allocations[index];
      const allocationIsCanonical =
        allocation.route === lot.route &&
        allocation.lotExpiresAt instanceof Date &&
        !Number.isNaN(allocation.lotExpiresAt.getTime()) &&
        allocation.reservedUntil instanceof Date &&
        !Number.isNaN(allocation.reservedUntil.getTime()) &&
        allocation.reservedUntil.getTime() === reservation.expiresAt.getTime() &&
        Number.isSafeInteger(allocation.lotRevision) &&
        allocation.lotRevision >= 0 &&
        Number.isSafeInteger(allocation.amountCredits) &&
        allocation.amountCredits > 0;
      const reserveEntries = entries.filter(
        (entry) =>
          entry.reservationId === reservation.reservationId &&
          entry.operation === "reserve" &&
          entry.lotId === lot.lotId
      );
      if (
        !allocationIsCanonical ||
        reserveEntries.length !== 1 ||
        !isCanonicalCreditLedgerEntry(reserveEntries[0], {
          idempotencyKey: `${reservation.idempotencyKey}:allocation:${index}`,
          payloadHash: reservation.payloadHash,
          bucket: reservation.bucket,
          amountCredits: allocation.amountCredits,
          lotId: lot.lotId,
          periodId: reservation.periodId,
          walletNormalized: reservation.walletNormalized,
          fromState: "available",
          toState: "reserved",
        }) ||
        reserveEntries[0].sessionId !== reservation.sessionId ||
        reserveEntries[0].reservationId !== reservation.reservationId
      ) {
        throw new DomainConflictError(
          "Una reserva historica no tiene evidencia canonica en el lote."
        );
      }

      const terminalEntries = entries.filter(
        (entry) =>
          entry.reservationId === reservation.reservationId &&
          entry.lotId === lot.lotId &&
          ["release", "spend", "expire"].includes(entry.operation)
      );
      if (reservation.status === "active") {
        if (terminalEntries.length > 0) {
          throw new DomainConflictError(
            "Una reserva activa conserva un ledger terminal."
          );
        }
        continue;
      }
      const expectedOperations =
        reservation.status === "consumed"
          ? ["spend"]
          : reservation.status === "expired"
          ? ["release", "expire"]
          : ["release"];
      if (terminalEntries.length !== 1) {
        throw new DomainConflictError(
          "Una reserva historica no tiene una unica terminal."
        );
      }
      const terminal = terminalEntries[0];
      if (
        !expectedOperations.includes(terminal.operation) ||
        !isCanonicalCreditLedgerEntry(terminal, {
          idempotencyKey: `${reservation.terminalIdempotencyKey}:allocation:${index}`,
          payloadHash: reservation.terminalPayloadHash!,
          bucket: reservation.bucket,
          amountCredits: allocation.amountCredits,
          lotId: lot.lotId,
          periodId: reservation.periodId,
          walletNormalized: reservation.walletNormalized,
          fromState: "reserved",
          toState: terminal.operation === "release"
            ? "available"
            : terminal.operation === "spend"
            ? "spent"
            : "expired",
        }) ||
        terminal.sessionId !== reservation.sessionId ||
        terminal.reservationId !== reservation.reservationId
      ) {
        throw new DomainConflictError(
          "Una reserva historica no tiene una terminal canonica."
        );
      }
    }
  }
  for (const entry of directExpires) {
    if (
      !Number.isSafeInteger(entry.amountCredits) ||
      entry.amountCredits <= 0 ||
      entry.bucket !== lot.bucket ||
      entry.walletNormalized !==
        (lot.bucket === "own" ? lot.walletNormalized : null) ||
      entry.periodId !== lot.periodId ||
      entry.runId !== lot.runId ||
      entry.runItemId !== lot.runItemId ||
      entry.fromState !== "available" ||
      entry.toState !== "expired" ||
      entry.payloadHash !==
        stableCreditHash({
          operation: "expire",
          lotId: lot.lotId,
          expiresAt: lot.expiresAt,
        })
    ) {
      throw new DomainConflictError(
        "La expiracion directa del lote no es canonica."
      );
    }
  }
  const reservedAmount = sumExactCredits(
    reserves.map((entry) => entry.amountCredits),
    "reservas del lote"
  );
  const releasedAmount = sumExactCredits(
    releases.map((entry) => entry.amountCredits),
    "releases del lote"
  );
  const spentAmount = sumExactCredits(
    spends.map((entry) => entry.amountCredits),
    "spends del lote"
  );
  const reservationExpiredAmount = sumExactCredits(
    reservationExpires.map((entry) => entry.amountCredits),
    "expiraciones de reserva del lote"
  );
  const directExpiredAmount = sumExactCredits(
    directExpires.map((entry) => entry.amountCredits),
    "expiraciones directas del lote"
  );
  const terminalAmount = sumExactCredits(
    [releasedAmount, spentAmount, reservationExpiredAmount],
    "terminales del lote"
  );
  const baseAvailable =
    lot.bucket === "own"
      ? lot.totalCredits - lot.poolDepositedCredits
      : lot.totalCredits;
  if (
    baseAvailable < 0 ||
    terminalAmount > reservedAmount ||
    lot.reservedCredits !== reservedAmount - terminalAmount ||
    lot.availableCredits !==
      baseAvailable - reservedAmount + releasedAmount - directExpiredAmount ||
    lot.spentCredits !== spentAmount ||
    lot.expiredCredits !== reservationExpiredAmount + directExpiredAmount
  ) {
    throw new DomainConflictError(
      "El estado materializado del lote no cuadra con su ledger."
    );
  }
}

function assertReleasedCredit(
  session: GameEconomySession,
  binding: GameEconomyResourceBinding | null,
  reservations: CreditReservation[],
  ledger: CompetitionCreditLedgerEntry[],
  lots: CreditLot[]
) {
  const resource = session.credit;
  const expectedReservationKey =
    binding?.reservationIdempotencyKey ?? `${session.sessionId}:credit:reserve`;
  if (resource.reservationId === null) {
    if (reservations.length !== 0 || ledger.length !== 0 || lots.length !== 0) {
      throw new DomainConflictError(
        "Existe una reserva de creditos sin identidad en la sesion."
      );
    }
    return;
  }
  if (!binding) {
    throw new DomainConflictError("La reserva de creditos no tiene binding.");
  }
  const ownReservation = (candidate: CreditReservation) =>
    candidate.sessionId === session.sessionId ||
    candidate.idempotencyKey === expectedReservationKey ||
    candidate.reservationId === resource.reservationId;
  if (reservations.some((candidate) => ownReservation(candidate) && candidate.status === "active")) {
    throw new DomainConflictError(
      "La sesion conserva otra reserva de creditos activa."
    );
  }
  const matchingReservations = reservations.filter(
    (candidate) => candidate.reservationId === resource.reservationId
  );
  if (matchingReservations.length !== 1) {
    throw new DomainConflictError(
      "La reserva de creditos no tiene una unica fila terminal."
    );
  }
  const reservation = validateReservationIntegrity(matchingReservations[0]);
  if (
    !["released", "expired"].includes(reservation.status) ||
    reservation.reservationId !== resource.reservationId ||
    reservation.sessionId !== session.sessionId ||
    reservation.walletNormalized !== session.walletNormalized ||
    reservation.idempotencyKey !== expectedReservationKey ||
    reservation.terminalIdempotencyKey !== binding.terminalIdempotencyKey ||
    !reservation.terminalIdempotencyKey ||
    !reservation.terminalPayloadHash
  ) {
    throw new DomainConflictError(
      "La reserva de creditos no acredita release."
    );
  }

  const terminalEntries = ledger.filter(
    (entry) =>
      entry.reservationId === reservation.reservationId &&
      entry.sessionId === session.sessionId &&
      entry.lotId !== null &&
      ["release", "expire", "spend"].includes(entry.operation)
  );
  if (terminalEntries.length !== reservation.allocations.length) {
    throw new DomainConflictError(
      "El ledger de creditos no acredita todas las terminales."
    );
  }
  const lotIds = new Set<string>();
  for (const [index, allocation] of reservation.allocations.entries()) {
    const lot = lots.find((candidate) => candidate.lotId === allocation.lotId);
    if (
      !lot ||
      allocation.runId !== lot.runId ||
      allocation.route !== lot.route ||
      allocation.lotExpiresAt.getTime() !== lot.expiresAt.getTime() ||
      (reservation.bucket === "own" &&
        lot.walletNormalized !== reservation.walletNormalized) ||
      (reservation.bucket === "pool" && lot.walletNormalized !== null)
    ) {
      throw new DomainConflictError(
        "La allocation de creditos no liga el lote correcto."
      );
    }
    const reserveEntries = ledger.filter(
      (candidate) =>
        candidate.reservationId === reservation.reservationId &&
        candidate.sessionId === session.sessionId &&
        candidate.lotId === allocation.lotId &&
        candidate.operation === "reserve"
    );
    if (
      reserveEntries.length !== 1 ||
      !isCanonicalCreditLedgerEntry(reserveEntries[0], {
        idempotencyKey: `${reservation.idempotencyKey}:allocation:${index}`,
        payloadHash: reservation.payloadHash,
        bucket: reservation.bucket,
        amountCredits: allocation.amountCredits,
        lotId: allocation.lotId,
        periodId: reservation.periodId,
        walletNormalized: reservation.walletNormalized,
        fromState: "available",
        toState: "reserved",
      })
    ) {
      throw new DomainConflictError(
        "Una reserva de creditos no tiene evidencia canonica."
      );
    }
    // A reservation can expire at its session TTL while its source lot is
    // still inside the credit period. The repository then marks the
    // reservation `expired` but returns the reserved amount to `available`
    // (operation `release`). If the lot itself has expired, the same terminal
    // transition is recorded as `expire`. Both are compensating outcomes.
    const expectedOperations =
      reservation.status === "expired" ? ["release", "expire"] : ["release"];
    const entry = terminalEntries.find(
      (candidate) =>
        candidate.idempotencyKey ===
          `${reservation.terminalIdempotencyKey}:allocation:${index}` &&
        expectedOperations.includes(candidate.operation) &&
        candidate.bucket === reservation.bucket &&
        candidate.amountCredits === allocation.amountCredits &&
        candidate.lotId === allocation.lotId &&
        candidate.fromState === "reserved" &&
        candidate.toState ===
          (candidate.operation === "release" ? "available" : "expired") &&
        candidate.walletNormalized === reservation.walletNormalized &&
        candidate.periodId === reservation.periodId &&
        candidate.payloadHash === reservation.terminalPayloadHash
    );
    if (!entry || lotIds.has(allocation.lotId)) {
      throw new DomainConflictError(
        "Una terminal de creditos no tiene evidencia canonica."
      );
    }
    lotIds.add(allocation.lotId);
  }
  if (lots.length !== lotIds.size) {
    throw new DomainConflictError("Falta un lote de creditos liberado.");
  }
  for (const lot of lots) {
    if (
      !lotIds.has(lot.lotId) ||
      lot._id !== lot.lotId ||
      lot.periodId !== reservation.periodId ||
      lot.bucket !== reservation.bucket ||
      !isSafeNonNegativeInteger(lot.totalCredits) ||
      !isSafeNonNegativeInteger(lot.availableCredits) ||
      lot.blocked ||
      !isSafeNonNegativeInteger(lot.reservedCredits) ||
      !isSafeNonNegativeInteger(lot.spentCredits) ||
      !isSafeNonNegativeInteger(lot.expiredCredits) ||
      !isSafeNonNegativeInteger(lot.poolDepositedCredits) ||
      !lotConservesCreditLot(lot)
    ) {
      throw new DomainConflictError(
        "Un lote de creditos no acredita un estado util."
      );
    }
    assertCreditLotLedger(lot, ledger, reservations);
  }
}

function assertUnattemptedCukie(
  snapshot: RecoverySnapshot,
  orderedGameEvents: GameEconomyEvent[],
) {
  const { session } = snapshot;
  const resource = session.cukie;
  if (
    resource.reservationId !== null ||
    resource.evidenceHash !== null ||
    resource.reservationResultHash !== null ||
    snapshot.cukieBinding !== null ||
    snapshot.ownAssignments.length !== 0 ||
    snapshot.ownEpochs.length !== 0 ||
    snapshot.ownEvents.length !== 0 ||
    snapshot.poolAssignments.length !== 0 ||
    snapshot.poolPositions.length !== 0 ||
    snapshot.poolEvents.length !== 0 ||
    snapshot.poolVaultLeases.length !== 0 ||
    snapshot.locks.length !== 0 ||
    snapshot.lockEvents.length !== 0
  ) {
    throw new DomainConflictError("La ausencia del recurso Cukie no es acreditable.");
  }
  // The reserve saga is strictly sequential (credit, then Cukie). A missing
  // Cukie binding is safe to treat as never attempted when the immutable
  // session event chain records credit compensation before the Cukie pending ->
  // released transition. The credit binding and its terminal ledger are
  // validated by assertReleasedCredit before this check.
  if (
    !orderedGameEvents.some(
      (event, index) =>
        event.creditState === "released" &&
        event.cukieState === "pending" &&
        event.toStatus === "created" &&
        orderedGameEvents[index + 1]?.creditState === "released" &&
        orderedGameEvents[index + 1]?.cukieState === "released" &&
        orderedGameEvents[index + 1]?.toStatus === "created",
    ) ||
    orderedGameEvents.some(
      (event) => event.cukieState !== "pending" && event.cukieState !== "released",
    )
  ) {
    throw new DomainConflictError("La secuencia no acredita que Cukie no se intentara.");
  }
}

type CukieRecoverySource = "own" | "pool";

function assertCukieSourceEvidence(
  session: GameEconomySession,
  binding: GameEconomyResourceBinding,
  source: CukieRecoverySource,
  assignment: OwnCukieAssignment | CukiePoolAssignment,
) {
  const evidence = source === "own"
    ? buildGameOwnCukieAssignmentEvidence(assignment as OwnCukieAssignment)
    : buildGameCukieAssignmentEvidence(assignment as CukiePoolAssignment);
  if (
    evidence.reservationId !== session.cukie.reservationId ||
    evidence.evidenceHash !== session.cukie.evidenceHash ||
    binding.reservationId !== evidence.reservationId ||
    binding.evidenceHash !== evidence.evidenceHash
  ) {
    throw new DomainConflictError("La fuente Cukie no coincide con la evidencia de sesion.");
  }
}

function resolveCukieSource(snapshot: RecoverySnapshot): CukieRecoverySource {
  const reservationId = snapshot.session.cukie.reservationId;
  if (!reservationId) {
    throw new DomainConflictError("La sesion no tiene reserva Cukie.");
  }
  const own = snapshot.ownAssignments;
  const pool = snapshot.poolAssignments;
  if (own.length > 1 || pool.length > 1 || (own.length > 0 && pool.length > 0)) {
    throw new DomainConflictError("La reserva Cukie aparece en dos fuentes.");
  }
  if (own.length === 1) {
    if (own[0].assignmentId !== reservationId) {
      throw new DomainConflictError("La reserva propia no coincide con la sesion.");
    }
    return "own";
  }
  if (pool.length === 1) {
    if (pool[0].assignmentId !== reservationId) {
      throw new DomainConflictError("La reserva de pool no coincide con la sesion.");
    }
    return "pool";
  }
  throw new DomainConflictError("La reserva Cukie no tiene fuente canonica.");
}

function ownReleaseEvidence(
  assignment: OwnCukieAssignment,
  epoch: OwnCukieEpoch,
  events: OwnCukieEvent[],
  binding: GameEconomyResourceBinding,
) {
  const reason = assignment.terminalReason;
  if (
    !reason ||
    !["game_economy_released", "game_economy_late_reservation_compensation"].includes(reason)
  ) {
    return false;
  }
  const requestHash = stableOwnCukieHash({
    operation: "release",
    sessionId: assignment.sessionId,
    assignmentId: assignment.assignmentId,
    reservationIdempotencyKey: binding.reservationIdempotencyKey,
    consumeGame: false,
    reason,
  });
  const matchingEvents = events.filter(
    (candidate) =>
      candidate.operation === "release" &&
      candidate.idempotencyKey === binding.terminalIdempotencyKey &&
      candidate.requestHash === requestHash &&
      candidate.sessionId === assignment.sessionId &&
      candidate.assignmentId === assignment.assignmentId &&
      candidate.epochId === assignment.epochId &&
      candidate.resultingAssignment.assignmentId === assignment.assignmentId &&
      candidate.resultingAssignment.status === "released" &&
      candidate.resultingAssignment.revision === assignment.revision &&
      candidate.resultingEpoch.epochId === epoch.epochId &&
      candidate.resultingEpoch.revision === epoch.revision,
  );
  return matchingEvents.length === 1;
}

function ownTerminalLockEvidence(
  assignment: OwnCukieAssignment,
  lock: NftAssetLockDocument,
  lockEvents: NftAssetLockEventDocument[],
  binding: GameEconomyResourceBinding,
) {
  const reason = assignment.terminalReason;
  const terminalAt = assignment.terminalAt;
  if (
    !reason ||
    !(terminalAt instanceof Date) ||
    Number.isNaN(terminalAt.getTime()) ||
    assignment.lockFencingToken < 2
  ) {
    return false;
  }
  const operation = assignment.restoreSoftStake ? "transition" : "release";
  const payloadHash = buildNftLockPayloadHash(operation, {
    lockId: assignment.lockId,
    expectedFencingToken: assignment.lockFencingToken - 1,
    sessionId: assignment.sessionId,
    restoreSoftStake: assignment.restoreSoftStake,
    ownershipEventId: assignment.ownershipEventId,
    reason,
  });
  const idempotencyKey = `own-cukie:terminal-lock:${binding.terminalIdempotencyKey}`;
  return lockEvents.filter(
    (event) =>
      event.lockId === lock.lockId &&
      event.assetId === assignment.assetId &&
      event.operation === operation &&
      event.idempotencyKey === idempotencyKey &&
      event.payloadHash === payloadHash &&
      event.fromStatus === "active" &&
      event.fromReason === "game_assignment" &&
      event.toStatus === lock.status &&
      event.toReason === lock.reason &&
      event.fencingToken === lock.fencingToken &&
      event.timestamp instanceof Date &&
      event.timestamp.getTime() === terminalAt.getTime() &&
      event.createdAt instanceof Date &&
      event.createdAt.getTime() === terminalAt.getTime() &&
      event.resultingLock.lockId === lock.lockId &&
      event.resultingLock.assetId === lock.assetId &&
      event.resultingLock.ownerNormalized === lock.ownerNormalized &&
      event.resultingLock.reason === lock.reason &&
      event.resultingLock.status === lock.status &&
      event.resultingLock.fencingToken === lock.fencingToken,
  ).length === 1;
}

function poolReleaseEvidence(
  assignment: CukiePoolAssignment,
  binding: GameEconomyResourceBinding,
  events: CukiePoolEvent[],
) {
  const reason = assignment.releaseReason;
  const releasedAt = assignment.releasedAt;
  if (
    !reason ||
    !["game_economy_released", "game_economy_late_reservation_compensation"].includes(reason) ||
    !(releasedAt instanceof Date) ||
    Number.isNaN(releasedAt.getTime()) ||
    assignment.revision < 1
  ) {
    return false;
  }
  const expectedRevision = assignment.revision - 1;
  const requestHash = stableCukiePoolHash({
    operation: "release",
    sessionId: assignment.sessionId,
    expectedRevision,
    consumeGame: false,
    reason,
  });
  if (assignment.custodyMode === "custodial") {
    return (
      assignment.terminalIdempotencyKey === binding.terminalIdempotencyKey &&
      assignment.terminalRequestHash === requestHash
    );
  }
  return events.filter(
    (event) =>
      event.operation === "release" &&
      event.idempotencyKey === binding.terminalIdempotencyKey &&
      event.requestHash === requestHash &&
      event.assignmentId === assignment.assignmentId &&
      event.positionId === assignment.positionId &&
      event.resultingAssignment?.assignmentId === assignment.assignmentId &&
      event.resultingAssignment.status === "released" &&
      event.resultingAssignment.revision === assignment.revision &&
      event.createdAt instanceof Date &&
      event.createdAt.getTime() === releasedAt.getTime(),
  ).length === 1;
}

function assertReleasedOwn(
  session: GameEconomySession,
  binding: GameEconomyResourceBinding,
  assignments: OwnCukieAssignment[],
  epoch: OwnCukieEpoch | null,
  events: OwnCukieEvent[],
  locks: NftAssetLockDocument[],
  lockEvents: NftAssetLockEventDocument[]
) {
  const resource = session.cukie;
  if (resource.reservationId === null || assignments.length !== 1 || !epoch) {
    if (resource.reservationId === null && assignments.length === 0 && !epoch)
      return;
    throw new DomainConflictError(
      "La asignacion propia no tiene una terminal unica."
    );
  }
  const assignment = assertOwnCukieAssignmentIntegrity(assignments[0]);
  assertOwnCukieEpochIntegrity(epoch);
  if (
    assignment.status !== "released" ||
    assignment.assignmentId !== resource.reservationId ||
    assignment.sessionId !== session.sessionId ||
    assignment.idempotencyKey !== binding.reservationIdempotencyKey ||
    assignment.ownerNormalized !== session.walletNormalized ||
    epoch.epochId !== assignment.epochId ||
    (epoch.status !== "active" && epoch.status !== "exhausted") ||
    epoch.assignmentSessionId !== undefined ||
    epoch.assignmentExpiresAt !== undefined ||
    !ownReleaseEvidence(assignment, epoch, events, binding)
  ) {
    throw new DomainConflictError("La asignacion propia no acredita release.");
  }
  const lock = locks.find(
    (candidate) => candidate.lockId === assignment.lockId
  );
  if (
    !lock ||
    lock.assetId !== assignment.assetId ||
    lock.ownerNormalized !== assignment.ownerNormalized ||
    lock.fencingToken !== assignment.lockFencingToken ||
    (assignment.restoreSoftStake
      ? lock.status !== "active" || lock.reason !== "soft_stake"
      : lock.status !== "released") ||
    lock.sessionId !== undefined ||
    lock.expiresAt !== undefined ||
    !ownTerminalLockEvidence(assignment, lock, lockEvents, binding)
  ) {
    throw new DomainConflictError("El lock propio no acredita release.");
  }
}

function assertReleasedPool(
  session: GameEconomySession,
  binding: GameEconomyResourceBinding,
  assignments: CukiePoolAssignment[],
  positions: CukiePoolPosition[],
  events: CukiePoolEvent[],
  leases: CukiePoolVaultAssetLease[],
  locks: NftAssetLockDocument[],
  lockEvents: NftAssetLockEventDocument[]
) {
  const resource = session.cukie;
  if (resource.reservationId === null || assignments.length !== 1) {
    if (resource.reservationId === null && assignments.length === 0) return;
    throw new DomainConflictError(
      "La asignacion de pool no tiene una terminal unica."
    );
  }
  const assignment = assertCukiePoolAssignmentIntegrity(assignments[0]);
  if (
    assignment.status !== "released" ||
    assignment.assignmentId !== resource.reservationId ||
    assignment.sessionId !== session.sessionId ||
    assignment.idempotencyKey !== binding.reservationIdempotencyKey ||
    !poolReleaseEvidence(assignment, binding, events)
  ) {
    throw new DomainConflictError("La asignacion de pool no acredita release.");
  }
  if (assignment.kind === "seiku") {
    if (
      positions.length !== 0 ||
      leases.length !== 0 ||
      (assignment.custodyMode === "custodial" && events.length !== 0)
    ) {
      throw new DomainConflictError(
        "Seiku conserva una reserva de asset inesperada."
      );
    }
    return;
  }
  if (assignment.custodyMode === "custodial") {
    if (leases.length !== 0 || events.length !== 0) {
      throw new DomainConflictError("El lease custodial no fue liberado.");
    }
    return;
  }
  if (positions.length !== 1) {
    throw new DomainConflictError(
      "La posicion de pool no tiene una fila terminal unica."
    );
  }
  const position = positions[0];
  if (
    position.positionId !== assignment.positionId ||
    position.status !== "active" ||
    !position.lifecycleOpen ||
    position.assignmentSessionId !== undefined ||
    position.assignmentExpiresAt !== undefined
  ) {
    throw new DomainConflictError(
      "La posicion de pool no esta abierta tras el release."
    );
  }
  const lock = locks.find((candidate) => candidate.lockId === position.lockId);
  const lockTransitionIdempotencyKey =
    `cukie-pool:return-lock:${binding.terminalIdempotencyKey}`;
  const lockTransitionPayloadHash = buildNftLockPayloadHash("transition", {
    lockId: position.lockId,
    expectedFencingToken: position.lockFencingToken - 1,
    reason: "pool_deposit",
    actor: "cukie-pool-service",
    idempotencyKey: lockTransitionIdempotencyKey,
    transitionReason: "game_assignment_released",
    expiresAt: null,
    sessionId: null,
  });
  if (
    !lock ||
    lock.assetId !== position.assetId ||
    lock.ownerNormalized !== position.ownerNormalized ||
    lock.reason !== "pool_deposit" ||
    lock.status !== "active" ||
    lock.fencingToken !== position.lockFencingToken ||
    lock.sessionId !== undefined ||
    lock.expiresAt !== undefined ||
    position.lockFencingToken < 3 ||
    lockEvents.filter(
      (event) =>
        event.lockId === lock.lockId &&
        event.assetId === position.assetId &&
        event.operation === "transition" &&
        event.idempotencyKey === lockTransitionIdempotencyKey &&
        event.payloadHash === lockTransitionPayloadHash &&
        event.fromStatus === "active" &&
        event.fromReason === "game_assignment" &&
        event.toStatus === "active" &&
        event.toReason === "pool_deposit" &&
        event.fencingToken === lock.fencingToken &&
        event.actor === "cukie-pool-service" &&
        event.reason === "game_assignment_released" &&
        event.timestamp instanceof Date &&
        event.timestamp.getTime() === assignment.releasedAt!.getTime() &&
        event.createdAt instanceof Date &&
        event.createdAt.getTime() === assignment.releasedAt!.getTime() &&
        event.resultingLock.lockId === lock.lockId &&
        event.resultingLock.assetId === lock.assetId &&
        event.resultingLock.ownerNormalized === lock.ownerNormalized &&
        event.resultingLock.fencingToken === lock.fencingToken &&
        event.resultingLock.status === "active" &&
        event.resultingLock.reason === "pool_deposit" &&
        event.resultingLock.sessionId === undefined &&
        event.resultingLock.expiresAt === undefined &&
        event.resultingLock.releaseReason === undefined
    ).length !== 1
  ) {
    throw new DomainConflictError("El lock de pool no acredita release.");
  }
}

function assertNoActiveAssignment(snapshot: RecoverySnapshot) {
  if (
    snapshot.ownAssignments.some(
      (assignment) => assignment.status === "active"
    ) ||
    snapshot.poolAssignments.some(
      (assignment) => assignment.status === "active"
    )
  ) {
    throw new DomainConflictError(
      "La compensacion conserva una asignacion activa."
    );
  }
}

function assessRecovery(
  snapshot: RecoverySnapshot,
  input: Omit<RecoveryReadInput, "db" | "session">
): RecoveryDecision {
  let session: GameEconomySession;
  try {
    session = assertGameSessionIntegrity(snapshot.session);
  } catch {
    return pending("session_integrity");
  }
  if (
    session.walletNormalized !== input.walletNormalized ||
    session.gameId !== TREASURE_HUNT_ECONOMY_POLICY.gameId ||
    session.createCommand.idempotencyKey !== input.expectedCreateIdempotencyKey
  ) {
    return pending("session_authority_mismatch");
  }
  const expectedCompensationIdempotencyKey = `compensate:${stableGameEconomyHash({
    createIdempotencyKey: session.createCommand.idempotencyKey,
  })}`;
  if (snapshot.run) return pending("run_exists");
  if (
    !snapshot.creditReservationsComplete ||
    !snapshot.creditLedgerComplete ||
    !snapshot.creditLotsComplete ||
    !snapshot.gameEventsComplete ||
    !snapshot.ownAssignmentsComplete ||
    !snapshot.ownEventsComplete ||
    !snapshot.poolAssignmentsComplete ||
    !snapshot.poolPositionsComplete ||
    !snapshot.poolEventsComplete ||
    !snapshot.poolVaultLeasesComplete ||
    !snapshot.locksComplete ||
    !snapshot.lockEventsComplete
  ) {
    return pending("compensation_evidence_incomplete");
  }
  if (
    session.status !== "rejected" ||
    session.terminalIntent?.status !== "rejected" ||
    session.terminalIntent.idempotencyKey !== expectedCompensationIdempotencyKey ||
    session.terminalIntent.reasonCode !== "resource_reservation_failed" ||
    session.terminal?.reasonCode !== "resource_reservation_failed" ||
    session.reservationPhase !== "compensating" ||
    session.rule.version !== TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion ||
    session.rule.cukie.required !== true ||
    session.rule.cukie.role !== "own_or_pool" ||
    session.rule.cukie.selectionPolicy !== "owned_bsc_quota_then_pool_v1" ||
    session.cukieAssetIds.length !== 0 ||
    session.operation ||
    session.startCommand ||
    session.startedAt ||
    session.submission ||
    session.validation ||
    session.settlementIntent ||
    session.settlementCommand ||
    session.settledAt ||
    session.credit.state !== "released" ||
    session.cukie.state !== "released"
  ) {
    return pending("session_not_pre_run_compensated");
  }
  if (
    !session.terminal ||
    session.terminal.command.resultingRevision !== session.revision ||
    session.terminal.command.completedAt.getTime() !==
      session.terminal.terminalAt.getTime() ||
    session.terminal.terminalAt.getTime() !==
      session.terminalIntent.decidedAt.getTime()
  ) {
    return pending("terminal_receipt_incomplete");
  }
  try {
    const orderedGameEvents = assertGameEconomyEventChain(
      session,
      snapshot.gameEvents,
    );
    for (const reservation of snapshot.creditReservations) {
      validateReservationIntegrity(reservation);
    }
    if (snapshot.creditBinding) {
      assertReleasedBinding(snapshot.creditBinding, session, "credit");
    } else if (session.credit.reservationId !== null) {
      throw new DomainConflictError("La reserva de creditos no tiene binding.");
    }
    assertReleasedCredit(
      session,
      snapshot.creditBinding,
      snapshot.creditReservations,
      snapshot.creditLedger,
      snapshot.creditLots
    );
    if (session.cukie.reservationId === null) {
      assertUnattemptedCukie(snapshot, orderedGameEvents);
    } else {
      if (!snapshot.cukieBinding) {
        throw new DomainConflictError("La reserva Cukie no tiene binding.");
      }
      assertReleasedBinding(snapshot.cukieBinding, session, "cukie");
      const source = resolveCukieSource(snapshot);
      if (source === "own") {
        if (
          snapshot.ownEpochs.length !== 1 ||
          snapshot.poolAssignments.length !== 0 ||
          snapshot.poolPositions.length !== 0 ||
          snapshot.poolEvents.length !== 0 ||
          snapshot.poolVaultLeases.length !== 0
        ) {
          throw new DomainConflictError("La fuente de pool conserva efectos inesperados.");
        }
        assertCukieSourceEvidence(
          session,
          snapshot.cukieBinding,
          source,
          snapshot.ownAssignments[0],
        );
        assertReleasedOwn(
          session,
          snapshot.cukieBinding,
          snapshot.ownAssignments,
          snapshot.ownEpoch,
          snapshot.ownEvents,
          snapshot.locks,
          snapshot.lockEvents
        );
      } else {
        if (
          snapshot.ownAssignments.length !== 0 ||
          snapshot.ownEpochs.length !== 0 ||
          snapshot.ownEvents.length !== 0
        ) {
          throw new DomainConflictError("La fuente propia conserva efectos inesperados.");
        }
        assertCukieSourceEvidence(
          session,
          snapshot.cukieBinding,
          source,
          snapshot.poolAssignments[0],
        );
        assertReleasedPool(
          session,
          snapshot.cukieBinding,
          snapshot.poolAssignments,
          snapshot.poolPositions,
          snapshot.poolEvents,
          snapshot.poolVaultLeases,
          snapshot.locks,
          snapshot.lockEvents
        );
      }
    }
    assertNoActiveAssignment(snapshot);
  } catch {
    return pending("underlying_compensation_unproven");
  }
  return {
    kind: "restart",
    replacementIdempotencyKey: replacementIdempotencyKey({
      userId: input.userId,
      walletNormalized: input.walletNormalized,
      authorityGameSessionId: input.authorityGameSessionId,
      gameEconomySessionId: session.sessionId,
    }),
  };
}

async function readSnapshot(
  input: RecoveryReadInput
): Promise<RecoverySnapshot | null> {
  // The database row is authoritative. `input.session` is only the object
  // that happened to be returned by the failed open attempt; re-reading the
  // row prevents a stale in-memory snapshot from authorizing a restart.
  const session = await input.db
    .collection<GameEconomySession>("game_economy_sessions")
    .findOne({
      "createCommand.idempotencyKey": input.expectedCreateIdempotencyKey,
    });
  if (!session) return null;

  const runs = input.db.collection<TreasureHuntEconomyRun>(
    "treasure_hunt_economy_runs"
  );
  const run = await runs.findOne(
    collectionFilter({
      $or: [
        { authorityGameSessionId: input.authorityGameSessionId },
        { gameEconomySessionId: session.sessionId },
      ],
    }) as Filter<TreasureHuntEconomyRun>
  );

  const gameEventsRead = await readBounded(
    input.db
      .collection<GameEconomyEvent>("game_economy_events")
      .find({ sessionId: session.sessionId }),
    MAX_RECOVERY_GAME_EVENTS,
  );

  const bindings = input.db.collection<GameEconomyResourceBinding>(
    "game_economy_resource_bindings"
  );
  const [creditBinding, cukieBinding] = await Promise.all([
    bindings.findOne({
      _id: stableGameEconomyHash({
        kind: "game-resource-binding",
        sessionId: session.sessionId,
        resource: "credit",
      }),
    }),
    bindings.findOne({
      _id: stableGameEconomyHash({
        kind: "game-resource-binding",
        sessionId: session.sessionId,
        resource: "cukie",
      }),
    }),
  ]);

  const reservationRead = await readBounded(
    input.db
      .collection<CreditReservation>("competition_credit_reservations")
      .find(
        collectionFilter({
          $or: [
            { sessionId: session.sessionId },
            { idempotencyKey: `${session.sessionId}:credit:reserve` },
            ...(session.credit.reservationId
              ? [{ reservationId: session.credit.reservationId }]
              : []),
          ],
        }) as Filter<CreditReservation>
      ),
    MAX_RECOVERY_CREDIT_RESERVATIONS
  );
  const targetReservation = session.credit.reservationId
    ? reservationRead.values.find(
        (candidate) => candidate.reservationId === session.credit.reservationId
      )
    : null;
  const targetLotIds =
    targetReservation && Array.isArray(targetReservation.allocations)
      ? [
          ...new Set(
            targetReservation.allocations.map((allocation) => allocation.lotId)
          ),
        ]
      : [];
  const byLotReservationRead =
    targetLotIds.length > 0
      ? await readBounded(
          input.db
            .collection<CreditReservation>("competition_credit_reservations")
            .find(
              collectionFilter({
                "allocations.lotId": { $in: targetLotIds },
              }) as Filter<CreditReservation>
            ),
          MAX_RECOVERY_CREDIT_RESERVATIONS
        )
      : { values: [] as CreditReservation[], complete: true };
  const creditReservations = [
    ...new Map(
      [...reservationRead.values, ...byLotReservationRead.values].map(
        (reservation) => [reservation.reservationId, reservation] as const
      )
    ).values(),
  ];
  const creditReservationsComplete =
    reservationRead.complete && byLotReservationRead.complete;

  const creditLedgerRead = await readBounded(
    input.db
      .collection<CompetitionCreditLedgerEntry>("competition_credit_ledger")
      .find(
        collectionFilter({
          $or: [
            ...(targetLotIds.length > 0
              ? [{ lotId: { $in: targetLotIds } }]
              : []),
            { sessionId: session.sessionId },
            ...(session.credit.reservationId
              ? [{ reservationId: session.credit.reservationId }]
              : []),
          ],
        }) as Filter<CompetitionCreditLedgerEntry>
      ),
    MAX_RECOVERY_CREDIT_LEDGER_ENTRIES
  );
  const creditLedger = creditLedgerRead.values;

  const [ownLotsRead, poolLotsRead] =
    targetLotIds.length > 0
      ? await Promise.all([
          readBounded(
            input.db.collection<CreditLot>("competition_credit_lots").find(
              collectionFilter({
                _id: { $in: targetLotIds },
              }) as Filter<CreditLot>
            ),
            MAX_RECOVERY_CREDIT_LOTS
          ),
          readBounded(
            input.db.collection<CreditLot>("competition_credit_pool_lots").find(
              collectionFilter({
                _id: { $in: targetLotIds },
              }) as Filter<CreditLot>
            ),
            MAX_RECOVERY_CREDIT_LOTS
          ),
        ])
      : [
          { values: [] as CreditLot[], complete: true },
          { values: [] as CreditLot[], complete: true },
        ];
  const creditLots = [...ownLotsRead.values, ...poolLotsRead.values];
  const creditLotsComplete = ownLotsRead.complete && poolLotsRead.complete;

  const assignmentFilter = collectionFilter({
    $or: [
      { sessionId: session.sessionId },
      ...(session.cukie.reservationId
        ? [{ assignmentId: session.cukie.reservationId }]
        : []),
      { idempotencyKey: `${session.sessionId}:cukie:reserve` },
    ],
  }) as Filter<OwnCukieAssignment | CukiePoolAssignment>;
  const [ownAssignmentsRead, poolAssignmentsRead] = await Promise.all([
    readBounded(
      input.db
        .collection<OwnCukieAssignment>("game_owned_cukie_assignments")
        .find(assignmentFilter as Filter<OwnCukieAssignment>),
      MAX_RECOVERY_ASSIGNMENTS,
    ),
    readBounded(
      input.db
        .collection<CukiePoolAssignment>("cukie_pool_assignments")
        .find(assignmentFilter as Filter<CukiePoolAssignment>),
      MAX_RECOVERY_ASSIGNMENTS,
    ),
  ]);
  const ownAssignments = ownAssignmentsRead.values;
  const poolAssignments = poolAssignmentsRead.values;

  const ownAssignmentIds = ownAssignments.map((assignment) => assignment.assignmentId);
  const poolAssignmentIds = poolAssignments.map((assignment) => assignment.assignmentId);
  const ownEventKeys = [
    `${session.sessionId}:cukie:reserve`,
    `${session.sessionId}:cukie:release`,
  ];
  const poolEventKeys = ownEventKeys;
  const ownEpochRead = await readBounded(
    input.db
      .collection<OwnCukieEpoch>("game_owned_cukie_epochs")
      .find({
        $or: [
          ...(ownAssignments.length === 1 ? [{ _id: ownAssignments[0].epochId }] : []),
          { assignmentSessionId: session.sessionId },
        ],
      } as Filter<OwnCukieEpoch>),
    MAX_RECOVERY_ASSIGNMENTS,
  );
  const ownEpoch = ownEpochRead.values.length === 1 ? ownEpochRead.values[0] : null;
  const ownEventsRead = await readBounded(
    input.db
      .collection<OwnCukieEvent>("game_owned_cukie_events")
      .find({
        $or: [
          ...(ownAssignmentIds.length > 0 ? [{ assignmentId: { $in: ownAssignmentIds } }] : []),
          { idempotencyKey: { $in: ownEventKeys } },
        ],
      } as Filter<OwnCukieEvent>),
    MAX_RECOVERY_EVENTS,
  );
  const poolEventsRead = await readBounded(
    input.db
      .collection<CukiePoolEvent>("cukie_pool_events")
      .find({
        $or: [
          ...(poolAssignmentIds.length > 0 ? [{ assignmentId: { $in: poolAssignmentIds } }] : []),
          { idempotencyKey: { $in: poolEventKeys } },
        ],
      } as Filter<CukiePoolEvent>),
    MAX_RECOVERY_EVENTS,
  );
  const poolPositionIds = poolAssignments
    .map((assignment) => assignment.positionId)
    .filter((positionId): positionId is string => Boolean(positionId));
  const poolPositionsRead = await readBounded(
    input.db
      .collection<CukiePoolPosition>("cukie_pool_positions")
      .find({
        $or: [
          ...(poolPositionIds.length > 0 ? [{ _id: { $in: poolPositionIds } }] : []),
          { assignmentSessionId: session.sessionId },
        ],
      } as Filter<CukiePoolPosition>),
    MAX_RECOVERY_POSITIONS,
  );
  const leasePositionIds = [
    ...new Set([
      ...poolPositionIds,
      ...poolPositionsRead.values.map((position) => position.positionId),
    ]),
  ];
  const poolVaultLeasesRead = await readBounded(
    input.db
      .collection<CukiePoolVaultAssetLease>(CUKIE_POOL_VAULT_ASSET_LEASES)
      .find({
        $or: [
          { sessionId: session.sessionId },
          ...(leasePositionIds.length > 0 ? [{ positionId: { $in: leasePositionIds } }] : []),
          ...(session.cukie.reservationId
            ? [{ assignmentId: session.cukie.reservationId }]
            : []),
        ],
      } as Filter<CukiePoolVaultAssetLease>),
    MAX_RECOVERY_LEASES,
  );
  const ownEvents = ownEventsRead.values;
  const poolEvents = poolEventsRead.values;
  const poolPositions = poolPositionsRead.values;
  const poolVaultLeases = poolVaultLeasesRead.values;

  const lockIds = [
    ...ownAssignments.map((assignment) => assignment.lockId),
    ...poolPositions.map((position) => position.lockId),
  ].filter(isNonEmptyText);
  const lockIdempotencyKeys = [
    `own-cukie:assign-lock:${session.sessionId}:cukie:reserve`,
    `own-cukie:assign-soft-stake:${session.sessionId}:cukie:reserve`,
    `own-cukie:terminal-lock:${session.sessionId}:cukie:release`,
    `cukie-pool:assign-lock:${session.sessionId}:cukie:reserve`,
    `cukie-pool:return-lock:${session.sessionId}:cukie:release`,
    `cukie-pool:release-lock:${session.sessionId}:cukie:release`,
  ];
  const locksRead =
    lockIds.length > 0 || lockIdempotencyKeys.length > 0
      ? await readBounded(
          input.db
            .collection<NftAssetLockDocument>("nft_asset_locks")
            .find({
              $or: [
                ...(lockIds.length > 0 ? [{ lockId: { $in: lockIds } }] : []),
                { sessionId: session.sessionId },
                { idempotencyKey: { $in: lockIdempotencyKeys } },
              ],
            }),
          MAX_RECOVERY_LOCKS,
        )
      : { values: [] as NftAssetLockDocument[], complete: true };
  const lockEventsRead =
    lockIds.length > 0 || lockIdempotencyKeys.length > 0
      ? await readBounded(
          input.db
            .collection<NftAssetLockEventDocument>("nft_asset_lock_events")
            .find({
              $or: [
                ...(lockIds.length > 0 ? [{ lockId: { $in: lockIds } }] : []),
                { idempotencyKey: { $in: lockIdempotencyKeys } },
              ],
            }),
          MAX_RECOVERY_LOCK_EVENTS,
        )
      : { values: [] as NftAssetLockEventDocument[], complete: true };
  const locks = locksRead.values;
  const lockEvents = lockEventsRead.values;

  return {
    session,
    run,
    creditBinding,
    cukieBinding,
    creditReservations,
    creditReservationsComplete,
    creditLedger,
    creditLedgerComplete: creditLedgerRead.complete,
    creditLots,
    creditLotsComplete,
    gameEvents: gameEventsRead.values,
    gameEventsComplete: gameEventsRead.complete,
    ownAssignments,
    ownAssignmentsComplete: ownAssignmentsRead.complete && ownEpochRead.complete,
    ownEpochs: ownEpochRead.values,
    ownEpoch,
    ownEvents,
    ownEventsComplete: ownEventsRead.complete,
    poolAssignments,
    poolAssignmentsComplete: poolAssignmentsRead.complete,
    poolPositions,
    poolPositionsComplete: poolPositionsRead.complete,
    poolEvents,
    poolEventsComplete: poolEventsRead.complete,
    poolVaultLeases,
    poolVaultLeasesComplete: poolVaultLeasesRead.complete,
    locks,
    locksComplete: locksRead.complete,
    lockEvents,
    lockEventsComplete: lockEventsRead.complete,
  };
}

/**
 * Read-only recovery decision. It never opens, releases, mutates or deletes a
 * session. Any missing, stale or ambiguous evidence returns `pending`.
 */
export async function inspectTreasureHuntEconomyRecovery(
  input: RecoveryReadInput
): Promise<RecoveryDecision> {
  let snapshot: RecoverySnapshot | null;
  try {
    snapshot = await readSnapshot(input);
  } catch {
    return pending("recovery_read_failed");
  }
  if (!snapshot) return notApplicable("economy_session_not_found");
  return assessRecovery(snapshot, input);
}
