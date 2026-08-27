import "server-only";

import { getEconomyDb, withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import { competitionCreditService, validateReservationIntegrity } from "@/lib/uki-economy/credits/service";
import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import {
  assignCukiePoolSession,
  assertCukiePoolAssignmentIntegrity,
  releaseCukiePoolAssignment,
} from "@/lib/uki-economy/cukie-pool/service";
import type { CukiePoolAssignment } from "@/lib/uki-economy/cukie-pool/types";
import {
  assertOwnCukieAssignmentIntegrity,
  ownCukieService,
} from "@/lib/uki-economy/own-cukie";
import type { OwnCukieAssignment } from "@/lib/uki-economy/own-cukie/types";

import {
  DomainConflictError,
  DomainValidationError,
  StaleFenceError,
} from "../errors";
import type {
  FinishGameResourceInput,
  GameCreditResourcePort,
  GameCukieResourcePort,
  GameResourceReservationResult,
  GameResultEvidencePort,
  ReserveGameCreditInput,
  ReserveGameCukieInput,
  VerifiedGameResult,
  VerifyGameResultInput,
} from "./ports";
import { stableGameEconomyHash, validGameText } from "./rules";

type ResourceBinding = {
  _id: string;
  sessionId: string;
  kind: "credit" | "cukie";
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

export type AuthorizedGameEvidence = {
  _id: string;
  evidenceId: string;
  authorization: "server_authorized";
  status: "ready";
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  evidenceReference: string;
  submissionPayloadHash: string;
  scoreRaw: string;
  evidenceHash: string;
  idempotencyKey: string;
  requestHash: string;
  payloadHash: string;
  createdAt: Date;
};

function positiveFence(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainValidationError("fenceToken debe ser un entero positivo.");
  }
  return value;
}

function canonicalHash(value: string, label: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser SHA-256 canonico.`);
  }
  return value;
}

function bindingId(sessionId: string, kind: ResourceBinding["kind"]) {
  return stableGameEconomyHash({ kind: "game-resource-binding", sessionId, resource: kind });
}

async function claimReservationBinding(input: {
  sessionId: string;
  kind: ResourceBinding["kind"];
  reservationIdempotencyKey: string;
  requestHash: string;
  fenceToken: number;
  now: Date;
}) {
  return withEconomyTransaction(async (db, session) => {
    const bindings = db.collection<ResourceBinding>("game_economy_resource_bindings");
    const id = bindingId(input.sessionId, input.kind);
    const current = await bindings.findOne({ _id: id }, { session });
    if (!current) {
      const created: ResourceBinding = {
        _id: id,
        sessionId: input.sessionId,
        kind: input.kind,
        reservationIdempotencyKey: input.reservationIdempotencyKey,
        requestHash: input.requestHash,
        fenceToken: input.fenceToken,
        status: "reserving",
        revision: 0,
        createdAt: input.now,
        updatedAt: input.now,
      };
      await bindings.insertOne(created, { session });
      return created;
    }
    if (
      current.sessionId !== input.sessionId
      || current.kind !== input.kind
      || current.reservationIdempotencyKey !== input.reservationIdempotencyKey
      || current.requestHash !== input.requestHash
    ) {
      throw new DomainConflictError(`El binding ${id} ya tiene otro payload.`);
    }
    if (input.fenceToken < current.fenceToken) {
      throw new StaleFenceError(`Fence obsoleto para ${input.kind} de ${input.sessionId}.`);
    }
    if (input.fenceToken === current.fenceToken) return current;
    const updated = await bindings.findOneAndUpdate(
      { _id: id, revision: current.revision, fenceToken: current.fenceToken },
      {
        $set: { fenceToken: input.fenceToken, updatedAt: input.now },
        $inc: { revision: 1 },
      },
      { session, returnDocument: "after" },
    );
    if (!updated) throw new StaleFenceError(`CAS obsoleto para el binding ${id}.`);
    return updated;
  });
}

async function completeReservationBinding(input: {
  binding: ResourceBinding;
  reservation: GameResourceReservationResult;
  now: Date;
}) {
  return withEconomyTransaction(async (db, session) => {
    const bindings = db.collection<ResourceBinding>("game_economy_resource_bindings");
    const current = await bindings.findOne({ _id: input.binding._id }, { session });
    if (!current) throw new DomainConflictError("Desaparecio el binding de recurso.");
    if (
      current.reservationId
      && (
        current.reservationId !== input.reservation.reservationId
        || current.evidenceHash !== input.reservation.evidenceHash
      )
    ) {
      throw new DomainConflictError("El binding ya contiene otra reserva.");
    }
    if (current.reservationId) return current;
    if (current.terminalIntent || current.status !== "reserving") return current;
    const updated = await bindings.findOneAndUpdate(
      {
        _id: current._id,
        revision: current.revision,
        status: "reserving",
        reservationId: { $exists: false },
        terminalIntent: { $exists: false },
      },
      {
        $set: {
          reservationId: input.reservation.reservationId,
          evidenceHash: input.reservation.evidenceHash,
          status: "active",
          updatedAt: input.now,
        },
        $inc: { revision: 1 },
      },
      { session, returnDocument: "after" },
    );
    if (!updated) {
      const winner = await bindings.findOne({ _id: current._id }, { session });
      if (winner?.terminalIntent) return winner;
      throw new StaleFenceError("CAS obsoleto al completar la reserva.");
    }
    return updated;
  });
}

async function claimTerminalBinding(
  kind: ResourceBinding["kind"],
  input: FinishGameResourceInput,
) {
  return withEconomyTransaction(async (db, session) => {
    const id = bindingId(input.sessionId, kind);
    const bindings = db.collection<ResourceBinding>("game_economy_resource_bindings");
    const current = await bindings.findOne({ _id: id }, { session });
    if (!current) return null;
    if (current.reservationIdempotencyKey !== input.reservationIdempotencyKey) {
      throw new DomainConflictError("La liberacion no corresponde al binding de reserva.");
    }
    if (
      input.reservationId
      && current.reservationId
      && input.reservationId !== current.reservationId
    ) {
      throw new DomainConflictError("La reserva terminal no coincide con el binding.");
    }
    if (input.fenceToken < current.fenceToken) {
      throw new StaleFenceError(`Fence terminal obsoleto para ${kind}.`);
    }
    if (
      current.terminalIntent
      && (
        current.terminalIntent !== input.expectedOutcome
        || current.terminalIdempotencyKey !== input.idempotencyKey
      )
    ) {
      throw new DomainConflictError(`El recurso ${kind} ya decidio otro outcome.`);
    }
    if (current.terminalIntent) return current;
    const updated = await bindings.findOneAndUpdate(
      { _id: id, revision: current.revision, terminalIntent: { $exists: false } },
      {
        $set: {
          terminalIntent: input.expectedOutcome,
          terminalIdempotencyKey: input.idempotencyKey,
          fenceToken: input.fenceToken,
          updatedAt: input.now,
        },
        $inc: { revision: 1 },
      },
      { session, returnDocument: "after" },
    );
    if (!updated) throw new StaleFenceError(`CAS terminal obsoleto para ${kind}.`);
    return updated;
  });
}

async function completeTerminalBinding(binding: ResourceBinding | null, now: Date) {
  if (!binding?.terminalIntent) return;
  await withEconomyTransaction(async (db, session) => {
    const bindings = db.collection<ResourceBinding>("game_economy_resource_bindings");
    const current = await bindings.findOne({ _id: binding._id }, { session });
    if (!current || !current.terminalIntent) return;
    if (current.status === current.terminalIntent) return;
    const result = await bindings.updateOne(
      { _id: current._id, revision: current.revision, terminalIntent: current.terminalIntent },
      {
        $set: { status: current.terminalIntent, updatedAt: now },
        $inc: { revision: 1 },
      },
      { session },
    );
    if (result.matchedCount !== 1) throw new StaleFenceError("CAS terminal perdido.");
  });
}

export function buildGameCreditReservationEvidence(
  reservation: CreditReservation,
): GameResourceReservationResult {
  return {
    reservationId: reservation.reservationId,
    evidenceHash: stableGameEconomyHash({
      kind: "game-credit-reservation-evidence",
      reservationId: reservation.reservationId,
      sessionId: reservation.sessionId,
      walletNormalized: reservation.walletNormalized,
      costCode: reservation.costCode,
      amountCredits: reservation.amountCredits,
      bucket: reservation.bucket,
      expiresAt: reservation.expiresAt,
      payloadHash: reservation.payloadHash,
    }),
  };
}

export function buildGameCukieAssignmentEvidence(
  assignment: CukiePoolAssignment,
): GameResourceReservationResult {
  return {
    reservationId: assignment.assignmentId,
    evidenceHash: stableGameEconomyHash({
      kind: "game-cukie-pool-assignment-evidence",
      assignmentId: assignment.assignmentId,
      sessionId: assignment.sessionId,
      assignmentKind: assignment.kind,
      assetId: assignment.assetId,
      tokenId: assignment.tokenId,
      ownerNormalized: assignment.ownerNormalized,
      generation: assignment.generation,
      rarity: assignment.rarity,
      ownerRewardEligible: assignment.ownerRewardEligible,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
      requestHash: assignment.requestHash,
    }),
  };
}

export function buildGameOwnCukieAssignmentEvidence(
  assignment: OwnCukieAssignment,
): GameResourceReservationResult {
  assertOwnCukieAssignmentIntegrity(assignment);
  return {
    reservationId: assignment.assignmentId,
    evidenceHash: stableGameEconomyHash({
      kind: "game-cukie-own-assignment-evidence",
      assignmentId: assignment.assignmentId,
      sessionId: assignment.sessionId,
      epochId: assignment.epochId,
      assetId: assignment.assetId,
      tokenId: assignment.tokenId,
      ownerNormalized: assignment.ownerNormalized,
      ownershipEventId: assignment.ownershipEventId,
      generation: assignment.generation,
      rarity: assignment.rarity,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
      requestHash: assignment.requestHash,
    }),
  };
}

export type ServerSelectedCukieReservation =
  | { source: "own"; assignment: OwnCukieAssignment; evidence: GameResourceReservationResult }
  | { source: "pool"; assignment: CukiePoolAssignment; evidence: GameResourceReservationResult };

export async function reserveServerSelectedCukie(
  input: ReserveGameCukieInput,
  dependencies: {
    reserveOwn?: typeof ownCukieService.reserve;
    reservePool?: typeof assignCukiePoolSession;
    now?: Date;
  } = {},
): Promise<ServerSelectedCukieReservation> {
  const poolOnly = input.role === "pool" && input.selectionPolicy === "pool_only_v1";
  const ownOrPool = input.role === "own_or_pool"
    && input.selectionPolicy === "owned_bsc_quota_then_pool_v1";
  if ((!poolOnly && !ownOrPool) || input.assetIds.length !== 0) {
    throw new DomainValidationError(
      "El port exige seleccion server-side versionada y no acepta assetIds del cliente.",
    );
  }
  const now = dependencies.now ?? new Date();
  const ownAssignment = ownOrPool
    ? await (dependencies.reserveOwn ?? ownCukieService.reserve)({
        sessionId: input.sessionId,
        walletAddress: input.walletNormalized,
        selectionPolicy: "owned_bsc_quota_then_pool_v1",
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
        now,
      })
    : null;
  if (ownAssignment) {
    return {
      source: "own",
      assignment: assertOwnCukieAssignmentIntegrity(ownAssignment),
      evidence: buildGameOwnCukieAssignmentEvidence(ownAssignment),
    };
  }
  const poolAssignment = assertCukiePoolAssignmentIntegrity(
    await (dependencies.reservePool ?? assignCukiePoolSession)({
      sessionId: input.sessionId,
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      now,
    }),
  );
  return {
    source: "pool",
    assignment: poolAssignment,
    evidence: buildGameCukieAssignmentEvidence(poolAssignment),
  };
}

function assertCreditReservationBinding(
  reservation: CreditReservation,
  input: FinishGameResourceInput,
) {
  validateReservationIntegrity(reservation);
  if (
    reservation.sessionId !== input.sessionId
    || reservation.idempotencyKey !== input.reservationIdempotencyKey
    || (input.reservationId && reservation.reservationId !== input.reservationId)
  ) {
    throw new DomainConflictError("La reserva de creditos no pertenece a esta sesion.");
  }
  return reservation;
}

function assertCukieAssignmentBinding(
  assignment: CukiePoolAssignment,
  input: FinishGameResourceInput,
) {
  assertCukiePoolAssignmentIntegrity(assignment);
  if (
    assignment.sessionId !== input.sessionId
    || assignment.idempotencyKey !== input.reservationIdempotencyKey
    || (input.reservationId && assignment.assignmentId !== input.reservationId)
  ) {
    throw new DomainConflictError("La asignacion Cukie no pertenece a esta sesion.");
  }
  return assignment;
}

export function createCompetitionCreditGamePort(): GameCreditResourcePort {
  return {
    async reserve(input: ReserveGameCreditInput) {
      canonicalHash(input.requestHash, "requestHash");
      const now = new Date();
      const binding = await claimReservationBinding({
        sessionId: input.sessionId,
        kind: "credit",
        reservationIdempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        fenceToken: positiveFence(input.fenceToken),
        now,
      });
      if (binding.terminalIntent) {
        throw new DomainConflictError("La reserva de creditos ya tiene una decision terminal.");
      }
      if (binding.reservationId && binding.evidenceHash) {
        return { reservationId: binding.reservationId, evidenceHash: binding.evidenceHash };
      }
      const reservation = await competitionCreditService.reserve({
        walletAddress: input.walletNormalized,
        sessionId: input.sessionId,
        costCode: input.costCode,
        expectedRuleVersion: input.creditRuleVersion,
        expectedRuleConfigHash: input.creditRuleConfigHash,
        idempotencyKey: input.idempotencyKey,
        expiresAtCap: input.expiresAt,
        now,
      });
      const evidence = buildGameCreditReservationEvidence(
        validateReservationIntegrity(reservation),
      );
      const completed = await completeReservationBinding({ binding, reservation: evidence, now });
      if (completed.terminalIntent) {
        await competitionCreditService.releaseReservation({
          reservationId: reservation.reservationId,
          idempotencyKey: completed.terminalIdempotencyKey!,
          now,
        });
        await completeTerminalBinding(completed, now);
        throw new DomainConflictError(
          "La sesion termino mientras se reservaban sus creditos; la reserva fue compensada.",
        );
      }
      return evidence;
    },
    async consume(input) {
      if (input.expectedOutcome !== "consumed") {
        throw new DomainValidationError("consume exige expectedOutcome=consumed.");
      }
      const binding = await claimTerminalBinding("credit", input);
      const db = await getEconomyDb();
      const reservation = input.reservationId
        ? await db.collection<CreditReservation>("competition_credit_reservations")
          .findOne({ reservationId: input.reservationId })
        : await db.collection<CreditReservation>("competition_credit_reservations")
          .findOne({ idempotencyKey: input.reservationIdempotencyKey });
      if (!reservation) throw new DomainConflictError("No existe reserva de creditos a consumir.");
      assertCreditReservationBinding(reservation, input);
      const result = await competitionCreditService.consumeReservation({
        reservationId: reservation.reservationId,
        idempotencyKey: input.idempotencyKey,
        committedAt: input.committedAt,
        now: input.now,
      });
      const evidence = buildGameCreditReservationEvidence(
        validateReservationIntegrity(result),
      );
      if (binding) {
        await completeReservationBinding({ binding, reservation: evidence, now: input.now });
      }
      await completeTerminalBinding(binding, input.now);
      return { outcome: "consumed", reservation: evidence };
    },
    async release(input) {
      if (input.expectedOutcome !== "released") {
        throw new DomainValidationError("release exige expectedOutcome=released.");
      }
      const binding = await claimTerminalBinding("credit", input);
      const db = await getEconomyDb();
      const reservation = input.reservationId
        ? await db.collection<CreditReservation>("competition_credit_reservations")
          .findOne({ reservationId: input.reservationId })
        : await db.collection<CreditReservation>("competition_credit_reservations")
          .findOne({ idempotencyKey: input.reservationIdempotencyKey });
      if (!reservation) {
        await completeTerminalBinding(binding, input.now);
        return { outcome: "released", reservation: null };
      }
      assertCreditReservationBinding(reservation, input);
      const result = await competitionCreditService.releaseReservation({
        reservationId: reservation.reservationId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });
      const evidence = buildGameCreditReservationEvidence(
        validateReservationIntegrity(result),
      );
      if (binding) {
        await completeReservationBinding({ binding, reservation: evidence, now: input.now });
      }
      await completeTerminalBinding(binding, input.now);
      return { outcome: "released", reservation: evidence };
    },
  };
}

export function createCukiePoolGamePort(): GameCukieResourcePort {
  return {
    async reserve(input: ReserveGameCukieInput) {
      canonicalHash(input.requestHash, "requestHash");
      const now = new Date();
      const binding = await claimReservationBinding({
        sessionId: input.sessionId,
        kind: "cukie",
        reservationIdempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        fenceToken: positiveFence(input.fenceToken),
        now,
      });
      if (binding.terminalIntent) {
        throw new DomainConflictError("La asignacion Cukie ya tiene una decision terminal.");
      }
      if (binding.reservationId && binding.evidenceHash) {
        return { reservationId: binding.reservationId, evidenceHash: binding.evidenceHash };
      }
      const selected = await reserveServerSelectedCukie(input, { now });
      const ownAssignment = selected.source === "own" ? selected.assignment : null;
      const assignment = selected.assignment;
      const evidence = selected.evidence;
      const completed = await completeReservationBinding({ binding, reservation: evidence, now });
      if (completed.terminalIntent) {
        if (ownAssignment) {
          await ownCukieService.finish({
            sessionId: ownAssignment.sessionId,
            assignmentId: ownAssignment.assignmentId,
            reservationIdempotencyKey: input.idempotencyKey,
            consumeGame: false,
            reason: "game_economy_late_reservation_compensation",
            idempotencyKey: completed.terminalIdempotencyKey!,
            now,
          });
        } else {
          const poolAssignment = assignment as CukiePoolAssignment;
          const released = await releaseCukiePoolAssignment({
            sessionId: poolAssignment.sessionId,
            expectedRevision: poolAssignment.revision,
            consumeGame: false,
            reason: "game_economy_late_reservation_compensation",
            idempotencyKey: completed.terminalIdempotencyKey!,
            now,
          });
          if (released.status === "completed") {
            throw new DomainConflictError("Una asignacion consumida no puede compensarse.");
          }
        }
        await completeTerminalBinding(completed, now);
        throw new DomainConflictError(
          "La sesion termino mientras se asignaba el Cukie; la asignacion fue compensada.",
        );
      }
      return evidence;
    },
    async consume(input) {
      if (input.expectedOutcome !== "consumed") {
        throw new DomainValidationError("consume exige expectedOutcome=consumed.");
      }
      const binding = await claimTerminalBinding("cukie", input);
      const db = await getEconomyDb();
      const ownAssignment = input.reservationId
        ? await db.collection<OwnCukieAssignment>("game_owned_cukie_assignments")
          .findOne({ assignmentId: input.reservationId })
        : await db.collection<OwnCukieAssignment>("game_owned_cukie_assignments")
          .findOne({ idempotencyKey: input.reservationIdempotencyKey });
      if (ownAssignment) {
        assertOwnCukieAssignmentIntegrity(ownAssignment);
        if (
          ownAssignment.sessionId !== input.sessionId
          || ownAssignment.idempotencyKey !== input.reservationIdempotencyKey
          || (input.reservationId && ownAssignment.assignmentId !== input.reservationId)
        ) {
          throw new DomainConflictError("La asignacion propia no pertenece a esta sesion.");
        }
        const result = await ownCukieService.finish({
          sessionId: input.sessionId,
          assignmentId: ownAssignment.assignmentId,
          reservationIdempotencyKey: input.reservationIdempotencyKey,
          consumeGame: true,
          reason: "game_economy_settled",
          idempotencyKey: input.idempotencyKey,
          now: input.now,
        });
        if (result.status !== "completed") {
          throw new DomainConflictError(
            `El Cukie propio termino como ${result.status}; settlement bloqueado.`,
          );
        }
        const evidence = buildGameOwnCukieAssignmentEvidence(result);
        if (binding) await completeReservationBinding({ binding, reservation: evidence, now: input.now });
        await completeTerminalBinding(binding, input.now);
        return { outcome: "consumed", reservation: evidence };
      }
      const assignment = input.reservationId
        ? await db.collection<CukiePoolAssignment>("cukie_pool_assignments")
          .findOne({ assignmentId: input.reservationId })
        : await db.collection<CukiePoolAssignment>("cukie_pool_assignments")
          .findOne({ idempotencyKey: input.reservationIdempotencyKey });
      if (!assignment) throw new DomainConflictError("No existe asignacion Cukie a consumir.");
      assertCukieAssignmentBinding(assignment, input);
      const result = assignment.status === "active"
        ? await releaseCukiePoolAssignment({
            sessionId: assignment.sessionId,
            expectedRevision: assignment.revision,
            consumeGame: true,
            reason: "game_economy_settled",
            idempotencyKey: input.idempotencyKey,
            now: input.now,
          })
        : assignment;
      if (result.status !== "completed") {
        throw new DomainConflictError(`La asignacion termino como ${result.status}, no completed.`);
      }
      const evidence = buildGameCukieAssignmentEvidence(
        assertCukiePoolAssignmentIntegrity(result),
      );
      if (binding) {
        await completeReservationBinding({ binding, reservation: evidence, now: input.now });
      }
      await completeTerminalBinding(binding, input.now);
      return { outcome: "consumed", reservation: evidence };
    },
    async release(input) {
      if (input.expectedOutcome !== "released") {
        throw new DomainValidationError("release exige expectedOutcome=released.");
      }
      const binding = await claimTerminalBinding("cukie", input);
      const db = await getEconomyDb();
      const ownAssignment = input.reservationId
        ? await db.collection<OwnCukieAssignment>("game_owned_cukie_assignments")
          .findOne({ assignmentId: input.reservationId })
        : await db.collection<OwnCukieAssignment>("game_owned_cukie_assignments")
          .findOne({ idempotencyKey: input.reservationIdempotencyKey });
      if (ownAssignment) {
        assertOwnCukieAssignmentIntegrity(ownAssignment);
        if (
          ownAssignment.sessionId !== input.sessionId
          || ownAssignment.idempotencyKey !== input.reservationIdempotencyKey
          || (input.reservationId && ownAssignment.assignmentId !== input.reservationId)
        ) {
          throw new DomainConflictError("La asignacion propia no pertenece a esta sesion.");
        }
        const result = ownAssignment.status === "active"
          ? await ownCukieService.finish({
              sessionId: input.sessionId,
              assignmentId: ownAssignment.assignmentId,
              reservationIdempotencyKey: input.reservationIdempotencyKey,
              consumeGame: false,
              reason: "game_economy_released",
              idempotencyKey: input.idempotencyKey,
              now: input.now,
            })
          : ownAssignment;
        if (result.status === "completed") {
          throw new DomainConflictError("No se puede liberar un Cukie propio consumido.");
        }
        const evidence = buildGameOwnCukieAssignmentEvidence(result);
        if (binding) await completeReservationBinding({ binding, reservation: evidence, now: input.now });
        await completeTerminalBinding(binding, input.now);
        return { outcome: "released", reservation: evidence };
      }
      const assignment = input.reservationId
        ? await db.collection<CukiePoolAssignment>("cukie_pool_assignments")
          .findOne({ assignmentId: input.reservationId })
        : await db.collection<CukiePoolAssignment>("cukie_pool_assignments")
          .findOne({ idempotencyKey: input.reservationIdempotencyKey });
      if (!assignment) {
        await completeTerminalBinding(binding, input.now);
        return { outcome: "released", reservation: null };
      }
      assertCukieAssignmentBinding(assignment, input);
      const result = assignment.status === "active"
        ? await releaseCukiePoolAssignment({
            sessionId: assignment.sessionId,
            expectedRevision: assignment.revision,
            consumeGame: false,
            reason: "game_economy_released",
            idempotencyKey: input.idempotencyKey,
            now: input.now,
          })
        : assignment;
      if (result.status === "completed") {
        throw new DomainConflictError("No se puede liberar una asignacion ya consumida.");
      }
      const evidence = buildGameCukieAssignmentEvidence(
        assertCukiePoolAssignmentIntegrity(result),
      );
      if (binding) {
        await completeReservationBinding({ binding, reservation: evidence, now: input.now });
      }
      await completeTerminalBinding(binding, input.now);
      return { outcome: "released", reservation: evidence };
    },
  };
}

export function createMongoGameEvidencePort(): GameResultEvidencePort {
  return {
    async verify(input: VerifyGameResultInput): Promise<VerifiedGameResult> {
      const db = await getEconomyDb();
      const evidence = await db.collection<AuthorizedGameEvidence>("game_result_evidence")
        .findOne({ evidenceReference: input.evidenceReference, status: "ready" });
      if (!evidence) throw new DomainConflictError("No existe evidencia autorizada del resultado.");
      const immutable = {
        evidenceId: evidence.evidenceId,
        authorization: evidence.authorization,
        status: evidence.status,
        sessionId: evidence.sessionId,
        walletNormalized: evidence.walletNormalized,
        gameId: evidence.gameId,
        ruleVersion: evidence.ruleVersion,
        ruleConfigHash: evidence.ruleConfigHash,
        evidenceReference: evidence.evidenceReference,
        submissionPayloadHash: evidence.submissionPayloadHash,
        scoreRaw: evidence.scoreRaw,
        evidenceHash: evidence.evidenceHash,
        idempotencyKey: evidence.idempotencyKey,
        requestHash: evidence.requestHash,
      };
      if (
        evidence._id !== evidence.evidenceId
        || evidence.authorization !== "server_authorized"
        || evidence.sessionId !== input.sessionId
        || evidence.walletNormalized !== input.walletNormalized
        || evidence.gameId !== input.gameId
        || evidence.ruleVersion !== input.ruleVersion
        || evidence.ruleConfigHash !== input.ruleConfigHash
        || evidence.submissionPayloadHash !== input.submissionPayloadHash
        || evidence.payloadHash !== stableGameEconomyHash({
          kind: "authorized-game-evidence",
          ...immutable,
        })
        || !/^(0|[1-9][0-9]*)$/.test(evidence.scoreRaw)
        || !/^[0-9a-f]{64}$/.test(evidence.evidenceHash)
        || validGameText(evidence.idempotencyKey, "evidence.idempotencyKey")
          !== evidence.idempotencyKey
        || !/^[0-9a-f]{64}$/.test(evidence.requestHash)
      ) {
        throw new DomainConflictError("La evidencia autorizada no coincide con la session.");
      }
      return {
        authorization: "server_authorized",
        evidenceId: validGameText(evidence.evidenceId, "evidenceId"),
        evidenceHash: evidence.evidenceHash,
        scoreRaw: evidence.scoreRaw,
      };
    },
  };
}

export function createMongoGameEconomyPorts() {
  return {
    credits: createCompetitionCreditGamePort(),
    cukies: createCukiePoolGamePort(),
    evidence: createMongoGameEvidencePort(),
  };
}
