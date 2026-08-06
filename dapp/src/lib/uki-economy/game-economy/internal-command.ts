import "server-only";

import { DomainValidationError } from "../errors";
import type {
  CompleteGameSessionInput,
  OpenGameSessionInput,
} from "./coordinator";
import type { RejectGameSessionInput } from "./service";

export type GameInternalCommand =
  | { command: "open_session"; payload: Omit<OpenGameSessionInput, "now"> }
  | { command: "complete_session"; payload: Omit<CompleteGameSessionInput, "now"> }
  | { command: "reject_session"; payload: Omit<RejectGameSessionInput, "now"> };

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(`${label} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !(key in value));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length || unexpected.length) {
    throw new DomainValidationError(
      `Payload invalido; faltan [${missing.join(",")}] y sobran [${unexpected.join(",")}].`,
    );
  }
  return value;
}

function openPayload(value: unknown): Omit<OpenGameSessionInput, "now"> {
  const item = exactKeys(
    record(value, "payload"),
    ["walletAddress", "gameId", "idempotencyKey"],
    ["expectedRuleVersion"],
  );
  return {
    walletAddress: item.walletAddress as string,
    gameId: item.gameId as string,
    expectedRuleVersion: item.expectedRuleVersion as string | undefined,
    idempotencyKey: item.idempotencyKey as string,
  };
}

function completePayload(value: unknown): Omit<CompleteGameSessionInput, "now"> {
  const item = exactKeys(record(value, "payload"), [
    "sessionId",
    "walletAddress",
    "evidenceReference",
    "payloadHash",
    "scoreRaw",
    "idempotencyKey",
  ]);
  return item as Omit<CompleteGameSessionInput, "now">;
}

function rejectPayload(value: unknown): Omit<RejectGameSessionInput, "now"> {
  const item = exactKeys(record(value, "payload"), [
    "sessionId",
    "idempotencyKey",
    "expectedRevision",
    "reasonCode",
  ]);
  return item as Omit<RejectGameSessionInput, "now">;
}

export function parseGameInternalCommand(rawBody: Buffer): GameInternalCommand {
  if (rawBody.byteLength === 0) throw new DomainValidationError("El body es obligatorio.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new DomainValidationError("El body no es JSON valido.");
  }
  const envelope = exactKeys(record(decoded, "body"), ["command", "payload"]);
  if (envelope.command === "open_session") {
    return { command: "open_session", payload: openPayload(envelope.payload) };
  }
  if (envelope.command === "complete_session") {
    return { command: "complete_session", payload: completePayload(envelope.payload) };
  }
  if (envelope.command === "reject_session") {
    return { command: "reject_session", payload: rejectPayload(envelope.payload) };
  }
  throw new DomainValidationError("command no esta permitido.");
}
