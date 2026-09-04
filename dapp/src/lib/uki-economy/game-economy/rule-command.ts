import "server-only";

import { DomainValidationError } from "../errors";
import type { PersistGameEconomyRuleInput } from "./control-plane";

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(`${label} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, allowed: string[], label: string) {
  const expected = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  const missing = allowed.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new DomainValidationError(
      `${label} invalido; faltan [${missing.join(",")}] y sobran [${unexpected.join(",")}].`,
    );
  }
  return value;
}

function iso(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} debe ser ISO-8601 UTC.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new DomainValidationError(`${label} debe ser ISO-8601 UTC canonico.`);
  }
  return parsed;
}

export function parseGameRuleCommand(
  rawBody: Buffer,
): Omit<PersistGameEconomyRuleInput, "now"> {
  if (rawBody.byteLength === 0) throw new DomainValidationError("El body es obligatorio.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new DomainValidationError("El body no es JSON valido.");
  }
  const payload = exact(record(decoded, "body"), [
    ...('calendar' in record(decoded, 'body') ? ['calendar'] : []),
    "gameId",
    "version",
    "sessionTtlMs",
    "operationLeaseMs",
    "credit",
    "reward",
    "cukie",
    "calculation",
    "active",
    "activeFrom",
    "activeUntil",
  ], "body");
  const credit = exact(record(payload.credit, "credit"), [
    "required",
    "consumeOnSettle",
    "costCode",
    "creditRuleVersion",
    "creditRuleConfigHash",
  ], "credit");
  const reward = exact(record(payload.reward, "reward"), [
    "rewardRuleVersion",
    "rewardRuleConfigHash",
    "maxConvertibleRaw",
  ], "reward");
  const cukie = exact(record(payload.cukie, "cukie"), [
    "required",
    "consumeOnSettle",
    "minAssets",
    "maxAssets",
    "role",
    "selectionPolicy",
  ], "cukie");
  const calculation = exact(record(payload.calculation, "calculation"), [
    "scoreCapRaw",
    "weightNumeratorRaw",
    "weightDenominatorRaw",
  ], "calculation");
  return {
    ...(payload.calendar !== undefined ? { calendar: payload.calendar as PersistGameEconomyRuleInput['calendar'] } : {}),
    gameId: payload.gameId as string,
    version: payload.version as string,
    sessionTtlMs: payload.sessionTtlMs as number,
    operationLeaseMs: payload.operationLeaseMs as number,
    credit: credit as PersistGameEconomyRuleInput["credit"],
    reward: reward as PersistGameEconomyRuleInput["reward"],
    cukie: cukie as PersistGameEconomyRuleInput["cukie"],
    calculation: calculation as PersistGameEconomyRuleInput["calculation"],
    active: payload.active as boolean,
    activeFrom: iso(payload.activeFrom, "activeFrom"),
    activeUntil: payload.activeUntil === null
      ? undefined
      : iso(payload.activeUntil, "activeUntil"),
  };
}
