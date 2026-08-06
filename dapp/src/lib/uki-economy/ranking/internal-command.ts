import "server-only";

import { DomainValidationError } from "../errors";
import { validRewardText } from "../rewards/rules";

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(`${label} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, allowed: string[], label: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new DomainValidationError(
      `${label} invalido; faltan [${missing.join(",")}] y sobran [${unexpected.join(",")}].`,
    );
  }
  return value;
}

export function parseWeeklyRankingRuleCommand(rawBody: Buffer) {
  if (rawBody.byteLength === 0) throw new DomainValidationError("El body es obligatorio.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new DomainValidationError("El body no es JSON valido.");
  }
  const body = exact(record(decoded, "body"), ["version", "activeFrom", "activeUntil"], "body");
  const iso = (value: unknown, label: string) => {
    if (typeof value !== "string") throw new DomainValidationError(`${label} debe ser ISO-8601 UTC.`);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      throw new DomainValidationError(`${label} debe ser ISO-8601 UTC canonico.`);
    }
    return parsed;
  };
  return {
    version: validRewardText(body.version, "version"),
    activeFrom: iso(body.activeFrom, "activeFrom"),
    activeUntil: body.activeUntil === null ? undefined : iso(body.activeUntil, "activeUntil"),
  };
}

export function parseWeeklyRankingTickCommand(rawBody: Buffer) {
  if (rawBody.byteLength === 0) return { workerId: "weekly-ranking-scheduler" };
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new DomainValidationError("El body no es JSON valido.");
  }
  const body = exact(record(decoded, "body"), ["workerId"], "body");
  if (typeof body.workerId !== "string") throw new DomainValidationError("workerId debe ser texto.");
  return { workerId: body.workerId };
}
