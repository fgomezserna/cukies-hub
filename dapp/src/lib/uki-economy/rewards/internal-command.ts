import "server-only";

import { DomainValidationError } from "../errors";
import type {
  DraftRewardClaimBatchInput,
  PersistRewardRuleInput,
  SealRewardPeriodInput,
} from "./types";
import type { SettleGameRewardsInput } from "./coordinator";

export type RewardInternalCommand =
  | { command: "persist_rule"; payload: Omit<PersistRewardRuleInput, "now"> }
  | { command: "settle_game"; payload: Omit<SettleGameRewardsInput, "now"> }
  | { command: "seal_period"; payload: Omit<SealRewardPeriodInput, "now"> }
  | { command: "create_draft"; payload: Omit<DraftRewardClaimBatchInput, "now"> };

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(`${label} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const expected = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (unexpected.length > 0) {
    throw new DomainValidationError(`${label} contiene campos no permitidos: ${unexpected.join(",")}.`);
  }
  return value;
}

function isoDate(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} debe ser ISO-8601 UTC.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new DomainValidationError(`${label} debe ser ISO-8601 UTC canonico.`);
  }
  return parsed;
}

function optionalIsoDate(value: unknown, label: string) {
  return value === undefined ? undefined : isoDate(value, label);
}

function nested(value: unknown, keys: string[], label: string) {
  return exactKeys(record(value, label), keys, label);
}

function parseRule(value: unknown): Omit<PersistRewardRuleInput, "now"> {
  const item = exactKeys(record(value, "payload"), [
    "_id",
    "scope",
    "version",
    "active",
    "activeFrom",
    "activeUntil",
    "tokenDecimals",
    "runCredits",
    "settlementBps",
    "rankingPlayerBps",
    "creditPoolDaily",
    "emissionBudget",
    "cukiePool",
    "undistributedBps",
    "destinations",
    "configHash",
  ], "payload");
  const runCredits = nested(
    item.runCredits,
    [
      "unitScale",
      "totalUnits",
      "weeklyReserveUnits",
      "ambassadorReserveUnits",
      "convertibleUnits",
    ],
    "runCredits",
  );
  const settlementBps = nested(
    item.settlementBps,
    ["poolCredits", "poolCukieWithOwnCredits", "poolCukieWithPoolCredits"],
    "settlementBps",
  );
  const rankingPlayerBps = nested(
    item.rankingPlayerBps,
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    "rankingPlayerBps",
  );
  const creditPoolDaily = nested(
    item.creditPoolDaily,
    ["sourceShareBps", "floorEnabled", "floorCreditsStep", "floorAmountRaw"],
    "creditPoolDaily",
  );
  const emissionBudget = nested(
    item.emissionBudget,
    [
      "programStartsAt",
      "dayBoundarySecondUtc",
      "lateReservationGraceSeconds",
      "dailyCapRaw",
      "lifetimeCapRaw",
      "unusedDailyCapacity",
      "overflowPolicy",
    ],
    "emissionBudget",
  );
  const cukiePool = nested(
    item.cukiePool,
    ["cumulativeTierCount", "cumulativeTierBps"],
    "cukiePool",
  );
  const undistributedBps = nested(
    item.undistributedBps,
    ["treasury", "marketing", "development", "supplyReduction"],
    "undistributedBps",
  );
  const destinations = nested(
    item.destinations,
    [
      "creditPool",
      "cukiePoolOriginal",
      "cukiePoolSecondPlus",
      "treasury",
      "marketing",
      "development",
      "supplyReduction",
    ],
    "destinations",
  );
  return {
    _id: item._id,
    scope: item.scope,
    version: item.version,
    active: item.active,
    activeFrom: isoDate(item.activeFrom, "activeFrom"),
    activeUntil: optionalIsoDate(item.activeUntil, "activeUntil"),
    tokenDecimals: item.tokenDecimals,
    runCredits,
    settlementBps,
    rankingPlayerBps,
    creditPoolDaily,
    emissionBudget: {
      ...emissionBudget,
      programStartsAt: isoDate(
        emissionBudget.programStartsAt,
        "emissionBudget.programStartsAt",
      ),
    },
    cukiePool,
    undistributedBps,
    destinations,
    configHash: item.configHash,
  } as Omit<PersistRewardRuleInput, "now">;
}

function parseSettlement(value: unknown): Omit<SettleGameRewardsInput, "now"> {
  const item = exactKeys(record(value, "payload"), [
    "sessionId",
    "periodId",
    "expectedRuleVersion",
  ], "payload");
  return {
    sessionId: item.sessionId as string,
    periodId: item.periodId as string,
    expectedRuleVersion: item.expectedRuleVersion as string,
  };
}

function parseSeal(value: unknown): Omit<SealRewardPeriodInput, "now"> {
  const item = exactKeys(record(value, "payload"), [
    "periodId",
    "expectedSourceIds",
    "expectedPeriodAllocationHash",
    "expectedRuleVersion",
    "sealedBy",
  ], "payload");
  return {
    periodId: item.periodId as string,
    expectedSourceIds: item.expectedSourceIds as string[],
    expectedPeriodAllocationHash: item.expectedPeriodAllocationHash as string,
    expectedRuleVersion: item.expectedRuleVersion as string,
    sealedBy: item.sealedBy as string,
  };
}

function parseDraft(value: unknown): Omit<DraftRewardClaimBatchInput, "now"> {
  const item = exactKeys(record(value, "payload"), [
    "periodId",
    "expectedPeriodAllocationHash",
    "chainId",
    "distributorAddress",
    "metadata",
  ], "payload");
  return {
    periodId: item.periodId as string,
    expectedPeriodAllocationHash: item.expectedPeriodAllocationHash as string,
    chainId: item.chainId as number,
    distributorAddress: item.distributorAddress as string,
    metadata: item.metadata as string,
  };
}

export function parseRewardInternalCommand(rawBody: Buffer): RewardInternalCommand {
  if (rawBody.byteLength === 0) throw new DomainValidationError("El body es obligatorio.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new DomainValidationError("El body no es JSON valido.");
  }
  const envelope = exactKeys(record(decoded, "body"), ["command", "payload"], "body");
  if (envelope.command === "persist_rule") {
    return { command: "persist_rule", payload: parseRule(envelope.payload) };
  }
  if (envelope.command === "settle_game") {
    return { command: "settle_game", payload: parseSettlement(envelope.payload) };
  }
  if (envelope.command === "seal_period") {
    return { command: "seal_period", payload: parseSeal(envelope.payload) };
  }
  if (envelope.command === "create_draft") {
    return { command: "create_draft", payload: parseDraft(envelope.payload) };
  }
  throw new DomainValidationError("command no esta permitido.");
}
