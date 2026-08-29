import "server-only";

import { createHash } from "node:crypto";

import { normalizeWalletAddress } from "@/lib/wallet-address";

import { DomainValidationError } from "../errors";
import { assertCreditAmount } from "../money";
import {
  CREDITS_PER_MATURE_SLOT,
  CREDIT_RULE_SCOPE,
  type CompetitionCreditPeriod,
  type CompetitionCreditRule,
  type CreditRunItem,
  type CreditSnapshotSlot,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 160;
const MAX_RULE_COSTS = 100;
const HARD_MAX_SNAPSHOT_SLOTS = 5_000;
export const MAX_COMPETITION_CREDIT_BATCH_SIZE = 100;
const HARD_MAX_LEASE_MS = 30 * 60 * 1000;
const HARD_MAX_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;
const SAFE_PERIOD_ID_MAX_LENGTH = 512;

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key.normalize("NFC"), child] as const);
    const keys = new Set<string>();
    for (const [key] of normalizedEntries) {
      if (keys.has(key)) {
        throw new DomainValidationError(
          `Colision de claves tras normalizacion NFC: ${key}.`
        );
      }
      keys.add(key);
    }
    return Object.fromEntries(
      normalizedEntries
        .sort(([left], [right]) => compareCreditText(left, right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function compareCreditText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableCreditHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function safeCompetitionCreditPeriodScopeId(
  runInput: unknown,
  trustedRunId: string
) {
  const safeRunId =
    typeof trustedRunId === "string" &&
    trustedRunId.length > 0 &&
    trustedRunId.length <= MAX_TEXT_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(trustedRunId)
      ? trustedRunId
      : "unknown-run";
  const fallback = `malformed-credit-period:${stableCreditHash({
    kind: "malformed-credit-period-scope",
    runId: safeRunId,
  })}`;
  try {
    if (!runInput || typeof runInput !== "object" || Array.isArray(runInput)) {
      return fallback;
    }
    const period = (runInput as Record<string, unknown>).period;
    if (!period || typeof period !== "object" || Array.isArray(period)) {
      return fallback;
    }
    const record = period as Record<string, unknown>;
    const { periodId, cutoff, nextCutoff, settlementTarget, ruleVersion, ruleConfigHash } =
      record;
    if (
      typeof periodId !== "string" ||
      periodId.length === 0 ||
      periodId.length > SAFE_PERIOD_ID_MAX_LENGTH ||
      periodId.normalize("NFC") !== periodId ||
      !(cutoff instanceof Date) ||
      Number.isNaN(cutoff.getTime()) ||
      !(nextCutoff instanceof Date) ||
      Number.isNaN(nextCutoff.getTime()) ||
      nextCutoff.getTime() !== cutoff.getTime() + DAY_MS ||
      !(settlementTarget instanceof Date) ||
      Number.isNaN(settlementTarget.getTime()) ||
      settlementTarget.getTime() < cutoff.getTime() ||
      settlementTarget.getTime() >= nextCutoff.getTime() ||
      typeof ruleVersion !== "string" ||
      ruleVersion.length === 0 ||
      ruleVersion.length > MAX_TEXT_LENGTH ||
      ruleVersion.normalize("NFC") !== ruleVersion ||
      !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(ruleVersion) ||
      typeof ruleConfigHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(ruleConfigHash) ||
      periodId !== `${ruleVersion}:${ruleConfigHash}:${cutoff.toISOString()}`
    ) {
      return fallback;
    }
    return periodId;
  } catch {
    return fallback;
  }
}

export function safeCompetitionCreditSettlementPeriodScopeId(
  runInput: unknown,
  trustedRunId: string
) {
  if (!runInput || typeof runInput !== "object" || Array.isArray(runInput)) {
    return safeCompetitionCreditPeriodScopeId(null, trustedRunId);
  }
  return safeCompetitionCreditPeriodScopeId(
    {
      period: (runInput as Record<string, unknown>).settlementPeriod,
    },
    trustedRunId
  );
}

export function buildCompetitionCreditRuleConfigHash(
  rule: CompetitionCreditRule
) {
  return stableCreditHash({
    scope: rule.scope,
    version: rule.version,
    active: rule.active,
    activeFrom: rule.activeFrom,
    activeUntil: rule.activeUntil,
    cutoffHourUtc: rule.cutoffHourUtc,
    cutoffMinuteUtc: rule.cutoffMinuteUtc,
    settlementHourUtc: rule.settlementHourUtc,
    settlementMinuteUtc: rule.settlementMinuteUtc,
    maxSnapshotLatenessMs: rule.maxSnapshotLatenessMs,
    sourceFreshnessMs: rule.sourceFreshnessMs,
    expectedBscChainId: rule.expectedBscChainId,
    sourceContractAddresses: rule.sourceContractAddresses,
    verifiedSourceIdentities: rule.verifiedSourceIdentities,
    creditsPerSlot: rule.creditsPerSlot,
    maxSnapshotSlots: rule.maxSnapshotSlots,
    maxBatchSize: rule.maxBatchSize,
    leaseDurationMs: rule.leaseDurationMs,
    reservationTtlMs: rule.reservationTtlMs,
    costs: [...rule.costs]
      .sort((left, right) => compareCreditText(left.costCode, right.costCode))
      .map((cost) => ({
        costCode: cost.costCode,
        credits: cost.credits,
        active: cost.active,
      })),
  });
}

export function validCreditDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError(`${label} debe ser una fecha valida.`);
  }
  return new Date(value.getTime());
}

export function validCreditText(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} debe ser texto.`);
  }
  const normalized = value.trim().normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TEXT_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(normalized)
  ) {
    throw new DomainValidationError(
      `${label} tiene un formato o longitud no permitidos.`
    );
  }
  return normalized;
}

export function validCreditWallet(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new DomainValidationError("walletAddress no es valida.");
  }
  const normalized = normalizeWalletAddress(value);
  const isEvm = /^0x[0-9a-f]{40}$/.test(normalized);
  const isTron = /^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(normalized);
  if (!isEvm && !isTron)
    throw new DomainValidationError("walletAddress no es valida.");
  if (/^0x0{40}$/.test(normalized))
    throw new DomainValidationError("walletAddress no puede ser cero.");
  return normalized;
}

function validBoundedInteger(
  value: number,
  label: string,
  minimum: number,
  maximum: number
) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DomainValidationError(
      `${label} debe ser un entero entre ${minimum} y ${maximum}.`
    );
  }
  return value;
}

export function assertCompetitionCreditRule(rule: CompetitionCreditRule) {
  if (!rule || rule.scope !== CREDIT_RULE_SCOPE) {
    throw new DomainValidationError(
      "La regla no pertenece a competition_credits."
    );
  }
  if (validCreditText(rule._id, "rule._id") !== rule._id) {
    throw new DomainValidationError("rule._id debe estar en forma canonica.");
  }
  if (validCreditText(rule.version, "rule.version") !== rule.version) {
    throw new DomainValidationError(
      "rule.version debe estar en forma canonica."
    );
  }
  if (typeof rule.active !== "boolean") {
    throw new DomainValidationError("rule.active debe ser boolean.");
  }
  validCreditDate(rule.activeFrom, "rule.activeFrom");
  if (rule.activeUntil) {
    validCreditDate(rule.activeUntil, "rule.activeUntil");
    if (rule.activeUntil.getTime() <= rule.activeFrom.getTime()) {
      throw new DomainValidationError(
        "rule.activeUntil debe ser posterior a activeFrom."
      );
    }
  }
  validBoundedInteger(rule.cutoffHourUtc, "rule.cutoffHourUtc", 0, 23);
  validBoundedInteger(rule.cutoffMinuteUtc, "rule.cutoffMinuteUtc", 0, 59);
  validBoundedInteger(rule.settlementHourUtc, "rule.settlementHourUtc", 0, 23);
  validBoundedInteger(rule.settlementMinuteUtc, "rule.settlementMinuteUtc", 0, 59);
  validBoundedInteger(
    rule.maxSnapshotLatenessMs,
    "rule.maxSnapshotLatenessMs",
    1,
    DAY_MS
  );
  validBoundedInteger(
    rule.sourceFreshnessMs,
    "rule.sourceFreshnessMs",
    60_000,
    2 * 60 * 60 * 1000
  );
  if (rule.expectedBscChainId !== 56 && rule.expectedBscChainId !== 97) {
    throw new DomainValidationError(
      "rule.expectedBscChainId debe ser 56 o 97."
    );
  }
  const sourceAliases = [
    "UKI_STAKING",
    "VESTING_VAULT",
    "TOKEN_V2",
    "CUKIE_MASTER_NFT_VAULT",
  ] as const;
  const addresses = new Set<string>();
  for (const alias of sourceAliases) {
    const address = rule.sourceContractAddresses?.[alias];
    if (
      typeof address !== "string" ||
      !/^0x[0-9a-f]{40}$/.test(address) ||
      /^0x0{40}$/.test(address)
    ) {
      throw new DomainValidationError(
        `Direccion BSC invalida o no canonica para ${alias}.`
      );
    }
    if (addresses.has(address)) {
      throw new DomainValidationError(`Direccion BSC duplicada para ${alias}.`);
    }
    addresses.add(address);
  }
  for (const alias of ["UKI_STAKING", "VESTING_VAULT"] as const) {
    const identity = rule.verifiedSourceIdentities?.[alias];
    if (
      !identity ||
      !/^0x[0-9a-f]{64}$/.test(identity.runtimeCodeHash) ||
      !/^0x[0-9a-f]{64}$/.test(identity.configHash) ||
      !Number.isSafeInteger(identity.deploymentBlock) ||
      identity.deploymentBlock < 0
    ) {
      throw new DomainValidationError(
        `Identidad contractual verificada invalida para ${alias}.`
      );
    }
  }
  if (rule.creditsPerSlot !== CREDITS_PER_MATURE_SLOT) {
    throw new DomainValidationError(
      `rule.creditsPerSlot debe ser ${CREDITS_PER_MATURE_SLOT}.`
    );
  }
  validBoundedInteger(
    rule.maxSnapshotSlots,
    "rule.maxSnapshotSlots",
    1,
    HARD_MAX_SNAPSHOT_SLOTS
  );
  validBoundedInteger(
    rule.maxBatchSize,
    "rule.maxBatchSize",
    1,
    MAX_COMPETITION_CREDIT_BATCH_SIZE
  );
  validBoundedInteger(
    rule.leaseDurationMs,
    "rule.leaseDurationMs",
    1_000,
    HARD_MAX_LEASE_MS
  );
  validBoundedInteger(
    rule.reservationTtlMs,
    "rule.reservationTtlMs",
    1_000,
    HARD_MAX_RESERVATION_TTL_MS
  );
  if (
    !Array.isArray(rule.costs) ||
    rule.costs.length === 0 ||
    rule.costs.length > MAX_RULE_COSTS
  ) {
    throw new DomainValidationError(
      `rule.costs debe contener entre 1 y ${MAX_RULE_COSTS} costes.`
    );
  }
  const codes = new Set<string>();
  for (const cost of rule.costs) {
    const code = validCreditText(cost.costCode, "costCode");
    if (code !== cost.costCode) {
      throw new DomainValidationError(
        `costCode debe estar en forma canonica: ${cost.costCode}.`
      );
    }
    if (codes.has(code))
      throw new DomainValidationError(`costCode duplicado: ${code}.`);
    codes.add(code);
    if (typeof cost.active !== "boolean") {
      throw new DomainValidationError(
        `cost.active debe ser boolean para ${code}.`
      );
    }
    const credits = assertCreditAmount(cost.credits);
    if (credits < 1 || credits > 1_000) {
      throw new DomainValidationError(
        `El coste ${code} debe estar entre 1 y 1000.`
      );
    }
  }
  if (!/^[0-9a-f]{64}$/.test(rule.configHash)) {
    throw new DomainValidationError(
      "rule.configHash debe ser un SHA-256 hexadecimal."
    );
  }
  if (rule.configHash !== buildCompetitionCreditRuleConfigHash(rule)) {
    throw new DomainValidationError(
      "rule.configHash no coincide con la configuracion economica."
    );
  }
  validCreditDate(rule.createdAt, "rule.createdAt");
  validCreditDate(rule.updatedAt, "rule.updatedAt");
  if (rule.updatedAt.getTime() < rule.createdAt.getTime()) {
    throw new DomainValidationError(
      "rule.updatedAt no puede ser anterior a createdAt."
    );
  }
  return rule;
}

export function assertRuleActiveAt(rule: CompetitionCreditRule, at: Date) {
  assertCompetitionCreditRule(rule);
  const timestamp = validCreditDate(at, "at");
  if (
    !rule.active ||
    rule.activeFrom.getTime() > timestamp.getTime() ||
    (rule.activeUntil && rule.activeUntil.getTime() <= timestamp.getTime())
  )
    throw new DomainValidationError(
      `La regla ${rule.version} no esta activa en el corte.`
    );
  return rule;
}

function scheduledCutoffOnUtcDay(value: Date, rule: CompetitionCreditRule) {
  const date = validCreditDate(value, "value");
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      rule.cutoffHourUtc,
      rule.cutoffMinuteUtc,
      0,
      0
    )
  );
}

export function buildCompetitionCreditPeriod(
  cutoffInput: Date,
  rule: CompetitionCreditRule
): CompetitionCreditPeriod {
  assertCompetitionCreditRule(rule);
  const cutoff = validCreditDate(cutoffInput, "cutoff");
  const scheduled = scheduledCutoffOnUtcDay(cutoff, rule);
  if (scheduled.getTime() !== cutoff.getTime()) {
    throw new DomainValidationError(
      `cutoff debe coincidir exactamente con ${String(
        rule.cutoffHourUtc
      ).padStart(2, "0")}:${String(rule.cutoffMinuteUtc).padStart(2, "0")} UTC.`
    );
  }
  const nextCutoff = new Date(cutoff.getTime() + DAY_MS);
  const settlementTarget = new Date(
    Date.UTC(
      cutoff.getUTCFullYear(),
      cutoff.getUTCMonth(),
      cutoff.getUTCDate(),
      rule.settlementHourUtc,
      rule.settlementMinuteUtc,
      0,
      0
    )
  );
  if (
    settlementTarget.getTime() < cutoff.getTime() ||
    settlementTarget.getTime() >= nextCutoff.getTime()
  ) {
    throw new DomainValidationError(
      "La hora objetivo de liquidacion debe pertenecer al periodo y ser posterior al corte."
    );
  }
  return {
    periodId: `${rule.version}:${rule.configHash}:${cutoff.toISOString()}`,
    cutoff,
    nextCutoff,
    settlementTarget,
    ruleVersion: rule.version,
    ruleConfigHash: rule.configHash,
  };
}

export function currentCompetitionCreditPeriod(
  at: Date,
  rule: CompetitionCreditRule
) {
  assertCompetitionCreditRule(rule);
  const timestamp = validCreditDate(at, "at");
  const today = scheduledCutoffOnUtcDay(timestamp, rule);
  const cutoff =
    timestamp.getTime() >= today.getTime()
      ? today
      : new Date(today.getTime() - DAY_MS);
  return buildCompetitionCreditPeriod(cutoff, rule);
}

export function computePoolConfigEffectiveCutoff(
  requestedAtInput: Date,
  rule: CompetitionCreditRule
) {
  assertCompetitionCreditRule(rule);
  const requestedAt = validCreditDate(requestedAtInput, "requestedAt");
  const today = scheduledCutoffOnUtcDay(requestedAt, rule);
  return requestedAt.getTime() < today.getTime()
    ? today
    : new Date(today.getTime() + DAY_MS);
}

export function validPoolCreditsPerSlot(value: number) {
  const credits = assertCreditAmount(value);
  if (credits > CREDITS_PER_MATURE_SLOT || credits % 10 !== 0) {
    throw new DomainValidationError(
      "poolCreditsPerSlot debe estar entre 0 y 100 y ser multiplo de 10."
    );
  }
  return credits;
}

export function creditCostForCode(
  rule: CompetitionCreditRule,
  costCodeInput: string
) {
  assertCompetitionCreditRule(rule);
  const costCode = validCreditText(costCodeInput, "costCode");
  const cost = rule.costs.find(
    (item) => item.costCode === costCode && item.active
  );
  if (!cost)
    throw new DomainValidationError(
      `No existe un coste activo para ${costCode}.`
    );
  return cost.credits;
}

export function sumExactCredits(values: readonly number[], label = "creditos") {
  let total = 0;
  for (const value of values) {
    total += assertCreditAmount(value);
    if (!Number.isSafeInteger(total)) {
      throw new DomainValidationError(
        `La suma de ${label} excede el entero seguro.`
      );
    }
  }
  return total;
}

export function buildCreditRunItemPayloadHash(
  item: Omit<
    CreditRunItem,
    "payloadHash" | "status" | "appliedAt" | "createdAt"
  >
) {
  return stableCreditHash({
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
  });
}

export function buildCreditSourceSlotsHash(
  slots: readonly CreditSnapshotSlot[]
) {
  return stableCreditHash(
    [...slots]
      .sort((left, right) => compareCreditText(left._id, right._id))
      .map((slot) => ({
        slotId: slot._id,
        walletNormalized: slot.walletNormalized,
        route: slot.route,
        ordinal: slot.ordinal,
        eligibilityEpoch: slot.eligibilityEpoch,
        status: slot.status,
        qualifiedSince: slot.qualifiedSince,
        creditEligibleFrom: slot.creditEligibleFrom,
        inactiveAt: slot.inactiveAt,
        graceEndsAt: slot.graceEndsAt,
        roundId: slot.roundId,
        ruleVersion: slot.ruleVersion,
        sourceHash: slot.sourceHash,
        revision: slot.revision,
        createdAt: slot.createdAt,
        updatedAt: slot.updatedAt,
      }))
  );
}
