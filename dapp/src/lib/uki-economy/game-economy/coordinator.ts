import "server-only";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";

import {
  DomainConflictError,
  DomainNotFoundError,
  StaleFenceError,
} from "../errors";
import { authorizeGameResult } from "./control-plane";
import { createMongoGameEconomyPorts } from "./resource-ports";
import {
  createMongoGameEconomyService,
  type CreateGameSessionInput,
  type RejectGameSessionInput,
} from "./service";
import type { GameEconomySession } from "./types";
import { validGameDate, validGameText } from "./rules";

export type OpenGameSessionInput = Omit<
  CreateGameSessionInput,
  "now" | "cukieAssetIds"
> & {
  now: Date;
};

export type CompleteGameSessionInput = {
  sessionId: string;
  walletAddress: string;
  evidenceReference: string;
  payloadHash: string;
  scoreRaw: string;
  idempotencyKey: string;
  now: Date;
};

const COMPLETE_MAX_ATTEMPTS = 5;
const COMPLETE_RETRY_DELAYS_MS = [25, 50, 100, 200] as const;

async function readSession(sessionId: string) {
  const db = await getEconomyDb();
  const session = await db.collection<GameEconomySession>("game_economy_sessions")
    .findOne({ _id: sessionId });
  if (!session) throw new DomainNotFoundError(`No existe la sesion ${sessionId}.`);
  return session;
}

function derivedKey(base: string, suffix: string) {
  return validGameText(`${validGameText(base, "idempotencyKey")}:${suffix}`, "idempotencyKey");
}

function isRetryableCompletionError(error: unknown) {
  return error instanceof StaleFenceError || (
    error instanceof DomainConflictError &&
    error.details?.retryable === true
  );
}

function waitForCompletionRetry(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function openGameSession(input: OpenGameSessionInput) {
  const now = validGameDate(input.now, "now");
  const service = createMongoGameEconomyService(createMongoGameEconomyPorts());
  const created = await service.createSession({
    ...input,
    // La seleccion Cukie es exclusivamente server-side en el resource port.
    cukieAssetIds: [],
    idempotencyKey: derivedKey(input.idempotencyKey, "create"),
    now,
  });
  if (created.startCommand || created.status !== "resources_reserved") return created;
  return service.startSession({
    sessionId: created.sessionId,
    walletAddress: input.walletAddress,
    idempotencyKey: derivedKey(input.idempotencyKey, "start"),
    expectedRevision: created.revision,
    now,
  });
}

export async function completeGameSession(input: CompleteGameSessionInput) {
  const now = validGameDate(input.now, "now");
  const sessionId = validGameText(input.sessionId, "sessionId");
  const service = createMongoGameEconomyService(createMongoGameEconomyPorts());
  for (let attempt = 0; attempt < COMPLETE_MAX_ATTEMPTS; attempt += 1) {
    try {
      // Cada intento vuelve a leer la sesión. La operación puede llegar dos
      // veces (Pusher y recovery del iframe) y la revisión anterior deja de
      // ser válida en cuanto el otro actor avanza el fence.
      let session = await readSession(sessionId);
      if (session.status === "started" || session.submission) {
        session = await service.submitResult({
          sessionId,
          walletAddress: input.walletAddress,
          evidenceReference: input.evidenceReference,
          payloadHash: input.payloadHash,
          idempotencyKey: derivedKey(input.idempotencyKey, "submit"),
          expectedRevision: session.revision,
          now,
        });
      }
      if (!session.submission) {
        throw new DomainConflictError(
          `complete_session no puede enviar resultado desde ${session.status}.`,
        );
      }
      await authorizeGameResult({
        sessionId,
        evidenceReference: input.evidenceReference,
        submissionPayloadHash: input.payloadHash,
        scoreRaw: input.scoreRaw,
        idempotencyKey: derivedKey(input.idempotencyKey, "authorize"),
        now,
      });
      if (session.status === "submitted" || session.validation) {
        session = await service.validateResult({
          sessionId,
          idempotencyKey: derivedKey(input.idempotencyKey, "validate"),
          expectedRevision: session.revision,
          now,
        });
      }
      if (session.status === "validated" || session.settlementCommand) {
        session = await service.settleSession({
          sessionId,
          idempotencyKey: derivedKey(input.idempotencyKey, "settle"),
          expectedRevision: session.revision,
          now,
        });
      }
      if (session.status !== "settled") {
        throw new DomainConflictError(
          `complete_session no puede continuar desde ${session.status}.`,
        );
      }
      return session;
    } catch (error) {
      if (!isRetryableCompletionError(error) || attempt === COMPLETE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      await waitForCompletionRetry(COMPLETE_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new DomainConflictError("complete_session agotó sus reintentos transitorios.");
}

export async function rejectGameSession(
  input: Omit<RejectGameSessionInput, "now"> & { now: Date },
) {
  const service = createMongoGameEconomyService(createMongoGameEconomyPorts());
  return service.rejectSession({
    ...input,
    idempotencyKey: derivedKey(input.idempotencyKey, "reject"),
    now: validGameDate(input.now, "now"),
  });
}
