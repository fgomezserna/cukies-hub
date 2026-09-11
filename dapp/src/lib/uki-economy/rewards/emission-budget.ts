import "server-only";
import { acceleratedCyclePeriod, economyCycleDurationMs, type EconomyCycleCalendar } from '../cycle-calendar';

import { DomainConflictError, DomainValidationError } from "../errors";
import { formatRawAmount, parseRawAmount } from "../money";
import type { RewardRepository } from "./repository";
import { stableRewardHash, validRewardDate, validRewardText } from "./rules";
import {
  REWARD_EMISSION_BUDGET_SCOPE,
  REWARD_LATE_SETTLEMENT_RECOVERY_PLAN_VERSION,
  type RewardEmissionBudgetDay,
  type RewardEmissionBudgetEvent,
  type RewardEmissionBudgetOperatorRecovery,
  type RewardEmissionBudgetReason,
  type RewardEmissionBudgetState,
  type RewardEconomyRuntimeContext,
  type RewardLateSettlementRecoveryPlan,
  type RewardRule,
} from "./types";

const DAY_MS = 86_400_000;

type EmissionBudgetSource = {
  periodId: string;
  sourceId: string;
  sourceTotalRaw: string;
  sourceSetHash: string;
  calculationJobRunId: string;
  calculationKind: RewardEmissionBudgetEvent["calculationKind"];
  calculationInputHash: string;
  calculationOutputHash: string;
  ruleEffectiveAt: Date;
  now: Date;
  recoveryPlan?: RewardLateSettlementRecoveryPlan;
};

export const REWARD_LATE_SETTLEMENT_RECOVERY_PLAN_ENV =
  "REWARD_LATE_SETTLEMENT_RECOVERY_PLAN" as const;
const RECOVERY_DATABASE_NAME = "cukieshub-new-staging" as const;
const RECOVERY_CHAIN_ID = 97 as const;
const RECOVERY_CYCLE_SECONDS = 1_800 as const;

function exactRecordKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const expected = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (unexpected.length > 0) {
    throw new DomainValidationError(
      `${label} contiene campos no permitidos: ${unexpected.join(",")}.`,
    );
  }
}

function recoveryRaw(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} debe ser un raw decimal.`);
  }
  try {
    return formatRawAmount(parseRawAmount(value));
  } catch {
    throw new DomainValidationError(`${label} debe ser un raw decimal canonico.`);
  }
}

function recoveryMap(
  value: unknown,
  label: string,
  sourceIds: readonly string[],
  required: boolean,
) {
  if (value === undefined && !required) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(`${label} debe ser un objeto.`);
  }
  const map = value as Record<string, unknown>;
  const allowed = new Set(sourceIds);
  const keys = Object.keys(map);
  if (required && keys.length !== sourceIds.length) {
    throw new DomainValidationError(`${label} debe fijar todos los sourceIds del plan.`);
  }
  if (keys.some((key) => !allowed.has(key))) {
    throw new DomainValidationError(`${label} contiene un sourceId fuera del plan.`);
  }
  const normalized: Record<string, string> = {};
  for (const sourceId of keys) {
    const amount = map[sourceId];
    normalized[sourceId] = recoveryRaw(amount, `${label}.${sourceId}`);
  }
  return normalized;
}

function recoveryHashMap(
  value: unknown,
  label: string,
  sourceIds: readonly string[],
) {
  if (value === undefined) {
    throw new DomainValidationError(`${label} debe fijar todos los sourceIds del plan.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(`${label} debe ser un objeto.`);
  }
  const map = value as Record<string, unknown>;
  const allowed = new Set(sourceIds);
  const keys = Object.keys(map);
  if (keys.length !== sourceIds.length) {
    throw new DomainValidationError(`${label} debe fijar todos los sourceIds del plan.`);
  }
  if (keys.some((key) => !allowed.has(key))) {
    throw new DomainValidationError(`${label} contiene un sourceId fuera del plan.`);
  }
  const normalized: Record<string, string> = {};
  for (const sourceId of keys) {
    const hash = map[sourceId];
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new DomainValidationError(`${label}.${sourceId} no es un hash canonico.`);
    }
    normalized[sourceId] = hash;
  }
  return normalized;
}

function planUnsigned(plan: RewardLateSettlementRecoveryPlan) {
  const { planHash: _planHash, ...unsigned } = plan;
  return unsigned;
}

export function rewardLateSettlementRecoveryPlanHash(
  plan: Omit<RewardLateSettlementRecoveryPlan, "planHash">,
) {
  return stableRewardHash({
    kind: "reward-late-settlement-recovery-plan",
    ...plan,
  });
}

/**
 * Validates the complete, immutable recovery material. This is deliberately
 * separate from command parsing: an approval id or hash by itself is never an
 * authorization.
 */
export function assertRewardLateSettlementRecoveryPlan(
  value: unknown,
): RewardLateSettlementRecoveryPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError("El plan de recuperacion debe ser un objeto.");
  }
  const item = value as Record<string, unknown>;
  exactRecordKeys(item, [
    "planVersion",
    "recoveryCaseId",
    "approvalId",
    "planHash",
    "approvedAt",
    "approvedBy",
    "databaseName",
    "chainId",
    "cycleSeconds",
    "sourceIds",
    "periodIds",
    "sourceTotalRawById",
    "expectedRuleVersion",
    "expectedRuleConfigHash",
    "dailyCapRaw",
    "lifetimeCapRaw",
    "sourceSetHashById",
    "calculationInputHashById",
    "calculationOutputHashById",
  ], "recoveryPlan");
  if (item.planVersion !== REWARD_LATE_SETTLEMENT_RECOVERY_PLAN_VERSION) {
    throw new DomainValidationError("La version del plan de recuperacion no es compatible.");
  }
  const recoveryCaseId = validRewardText(item.recoveryCaseId, "recoveryPlan.recoveryCaseId");
  const approvalId = validRewardText(item.approvalId, "recoveryPlan.approvalId");
  const planHash = validRewardText(item.planHash, "recoveryPlan.planHash");
  if (!/^[0-9a-f]{64}$/.test(planHash)) {
    throw new DomainValidationError("recoveryPlan.planHash no es un hash canonico.");
  }
  const approvedAt = validRewardDate(item.approvedAt, "recoveryPlan.approvedAt");
  const approvedBy = validRewardText(item.approvedBy, "recoveryPlan.approvedBy");
  const databaseName = validRewardText(item.databaseName, "recoveryPlan.databaseName");
  if (databaseName !== RECOVERY_DATABASE_NAME) {
    throw new DomainConflictError("El plan de recuperacion no pertenece a la base de staging autorizada.");
  }
  if (!Number.isSafeInteger(item.chainId) || item.chainId !== RECOVERY_CHAIN_ID) {
    throw new DomainConflictError("El plan de recuperacion no pertenece a BSC Testnet.");
  }
  if (!Number.isSafeInteger(item.cycleSeconds) || item.cycleSeconds !== RECOVERY_CYCLE_SECONDS) {
    throw new DomainConflictError("El plan de recuperacion no pertenece al ciclo C1800.");
  }
  if (!Array.isArray(item.sourceIds) || item.sourceIds.length === 0 || item.sourceIds.length > 100) {
    throw new DomainValidationError("recoveryPlan.sourceIds debe contener entre 1 y 100 sources.");
  }
  const sourceIds = item.sourceIds.map((sourceId, index) =>
    validRewardText(sourceId, `recoveryPlan.sourceIds[${index}]`));
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new DomainValidationError("recoveryPlan.sourceIds no puede repetir sources.");
  }
  if (!Array.isArray(item.periodIds) || item.periodIds.length === 0 || item.periodIds.length > 100) {
    throw new DomainValidationError("recoveryPlan.periodIds debe contener entre 1 y 100 periodos.");
  }
  const periodIds = item.periodIds.map((periodId, index) =>
    validRewardText(periodId, `recoveryPlan.periodIds[${index}]`));
  if (new Set(periodIds).size !== periodIds.length) {
    throw new DomainValidationError("recoveryPlan.periodIds no puede repetir periodos.");
  }
  const sourceTotalRawById = recoveryMap(
    item.sourceTotalRawById,
    "recoveryPlan.sourceTotalRawById",
    sourceIds,
    true,
  )!;
  const expectedRuleVersion = validRewardText(
    item.expectedRuleVersion,
    "recoveryPlan.expectedRuleVersion",
  );
  const expectedRuleConfigHash = validRewardText(
    item.expectedRuleConfigHash,
    "recoveryPlan.expectedRuleConfigHash",
  );
  if (!/^[0-9a-f]{64}$/.test(expectedRuleConfigHash)) {
    throw new DomainValidationError("recoveryPlan.expectedRuleConfigHash no es un hash canonico.");
  }
  const dailyCapRaw = recoveryRaw(item.dailyCapRaw, "recoveryPlan.dailyCapRaw");
  const lifetimeCapRaw = recoveryRaw(item.lifetimeCapRaw, "recoveryPlan.lifetimeCapRaw");
  if (parseRawAmount(dailyCapRaw) <= BigInt(0) || parseRawAmount(lifetimeCapRaw) < parseRawAmount(dailyCapRaw)) {
    throw new DomainValidationError("recoveryPlan debe conservar techos de emision positivos y ordenados.");
  }
  const sourceSetHashById = recoveryHashMap(
    item.sourceSetHashById,
    "recoveryPlan.sourceSetHashById",
    sourceIds,
  );
  const calculationInputHashById = recoveryHashMap(
    item.calculationInputHashById,
    "recoveryPlan.calculationInputHashById",
    sourceIds,
  );
  const calculationOutputHashById = recoveryHashMap(
    item.calculationOutputHashById,
    "recoveryPlan.calculationOutputHashById",
    sourceIds,
  );
  const plan: RewardLateSettlementRecoveryPlan = {
    planVersion: REWARD_LATE_SETTLEMENT_RECOVERY_PLAN_VERSION,
    recoveryCaseId,
    approvalId,
    planHash,
    approvedAt,
    approvedBy,
    databaseName,
    chainId: item.chainId as number,
    cycleSeconds: item.cycleSeconds as number,
    sourceIds,
    periodIds,
    sourceTotalRawById,
    expectedRuleVersion,
    expectedRuleConfigHash,
    dailyCapRaw,
    lifetimeCapRaw,
    sourceSetHashById: sourceSetHashById!,
    calculationInputHashById: calculationInputHashById!,
    calculationOutputHashById: calculationOutputHashById!,
  };
  if (rewardLateSettlementRecoveryPlanHash(planUnsigned(plan)) !== plan.planHash) {
    throw new DomainConflictError("recoveryPlan.planHash no coincide con el plan inmutable.");
  }
  return plan;
}

export function assertRewardLateSettlementRecoveryForSource(
  planInput: unknown,
  source: Pick<EmissionBudgetSource, "periodId" | "sourceId" | "sourceTotalRaw" | "sourceSetHash" | "calculationInputHash" | "calculationOutputHash" | "now">,
  rule: RewardRule,
  runtime?: RewardEconomyRuntimeContext,
): RewardEmissionBudgetOperatorRecovery {
  const plan = assertRewardLateSettlementRecoveryPlan(planInput);
  if (!plan.sourceIds.includes(source.sourceId)) {
    throw new DomainConflictError(`El source ${source.sourceId} no esta incluido en el plan de recuperacion.`);
  }
  if (!plan.periodIds.includes(source.periodId)) {
    throw new DomainConflictError(`El periodo ${source.periodId} no esta incluido en el plan de recuperacion.`);
  }
  if (plan.sourceTotalRawById[source.sourceId] !== source.sourceTotalRaw) {
    throw new DomainConflictError(`El sourceTotalRaw del source ${source.sourceId} no coincide con el plan aprobado.`);
  }
  if (
    plan.expectedRuleVersion !== rule.version
    || plan.expectedRuleConfigHash !== rule.configHash
    || plan.dailyCapRaw !== rule.emissionBudget.dailyCapRaw
    || plan.lifetimeCapRaw !== rule.emissionBudget.lifetimeCapRaw
  ) {
    throw new DomainConflictError(`La regla o los techos de emision no coinciden con el plan aprobado.`);
  }
  const calendar = rule.emissionBudget.calendar;
  if (!calendar) {
    throw new DomainConflictError("La recuperacion exige un calendario economico sellado.");
  }
  if (
    !runtime
    || runtime.databaseName !== plan.databaseName
    || runtime.chainId !== plan.chainId
    || runtime.cycleSeconds !== plan.cycleSeconds
    || !runtime.calendar
    || stableRewardHash(runtime.calendar) !== stableRewardHash(calendar)
  ) {
    throw new DomainConflictError("El plan de recuperacion no coincide con el runtime economico abierto.");
  }
  if (calendar.chainId !== plan.chainId || calendar.cycleSeconds !== plan.cycleSeconds) {
    throw new DomainConflictError(`El calendario economico no coincide con el plan aprobado.`);
  }
  if (plan.approvedAt.getTime() > source.now.getTime()) {
    throw new DomainConflictError("El plan de recuperacion no estaba aprobado al ejecutar el comando.");
  }
  if (
    plan.sourceSetHashById[source.sourceId] !== source.sourceSetHash
    || plan.calculationInputHashById[source.sourceId] !== source.calculationInputHash
    || plan.calculationOutputHashById[source.sourceId] !== source.calculationOutputHash
  ) {
    throw new DomainConflictError(`La evidencia de calculo del source ${source.sourceId} no coincide con el plan aprobado.`);
  }
  return {
    recoveryCaseId: plan.recoveryCaseId,
    approvalId: plan.approvalId,
    planHash: plan.planHash,
    originalReason: "DAY_CLOSED",
    approvedAt: plan.approvedAt,
    approvedBy: plan.approvedBy,
  };
}

/** Resolves the approved plan from a runtime secret, never from command data. */
export function loadRewardLateSettlementRecoveryPlan() {
  const raw = process.env[REWARD_LATE_SETTLEMENT_RECOVERY_PLAN_ENV]?.trim();
  if (!raw) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new DomainValidationError("REWARD_LATE_SETTLEMENT_RECOVERY_PLAN no es JSON valido.");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new DomainValidationError("REWARD_LATE_SETTLEMENT_RECOVERY_PLAN debe ser un objeto.");
  }
  const item = decoded as Record<string, unknown>;
  const approvedAt = item.approvedAt;
  if (typeof approvedAt !== "string") {
    throw new DomainValidationError("recoveryPlan.approvedAt debe ser ISO-8601 UTC.");
  }
  const date = new Date(approvedAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== approvedAt) {
    throw new DomainValidationError("recoveryPlan.approvedAt debe ser ISO-8601 UTC canonico.");
  }
  return assertRewardLateSettlementRecoveryPlan({ ...item, approvedAt: date });
}

export function rewardEmissionBudgetDayWindow(
  ruleEffectiveAtInput: Date,
  dayBoundarySecondUtc: number,
  lateReservationGraceSeconds: number,
  calendar?: EconomyCycleCalendar,
) {
  const ruleEffectiveAt = validRewardDate(ruleEffectiveAtInput, "ruleEffectiveAt");
  if (
    !Number.isSafeInteger(dayBoundarySecondUtc)
    || dayBoundarySecondUtc < 0
    || dayBoundarySecondUtc > 86_399
    || !Number.isSafeInteger(lateReservationGraceSeconds)
    || lateReservationGraceSeconds < 0
    || lateReservationGraceSeconds > 604_800
  ) {
    throw new DomainValidationError("La frontera y la gracia diaria no son validas.");
  }
  const boundaryMs = dayBoundarySecondUtc * 1_000;
  const startsAtMs = calendar ? acceleratedCyclePeriod(ruleEffectiveAt, calendar).start.getTime() : Math.floor(
    (ruleEffectiveAt.getTime() - boundaryMs) / DAY_MS,
  ) * DAY_MS + boundaryMs;
  const startsAt = new Date(startsAtMs);
  const endsAt = new Date(startsAtMs + economyCycleDurationMs(calendar));
  const reservationClosesAt = new Date(
    endsAt.getTime() + lateReservationGraceSeconds * 1_000,
  );
  return {
    dayId: startsAt.toISOString(),
    startsAt,
    endsAt,
    reservationClosesAt,
  };
}

function validRevision(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new DomainConflictError(`${label} no contiene una revision valida.`);
  }
}

export function assertRewardEmissionBudgetState(
  state: RewardEmissionBudgetState,
  rule: RewardRule,
) {
  const config = rule.emissionBudget;
  const createdAt = validRewardDate(state.createdAt, "emissionBudgetState.createdAt");
  const updatedAt = validRewardDate(state.updatedAt, "emissionBudgetState.updatedAt");
  validRevision(state.revision, "El estado global de emision");
  if (
    state._id !== REWARD_EMISSION_BUDGET_SCOPE
    || stableRewardHash(state.calendar ?? null) !== stableRewardHash(config.calendar ?? null)
    || state.scope !== REWARD_EMISSION_BUDGET_SCOPE
    || !(state.programStartsAt instanceof Date)
    || state.programStartsAt.getTime() !== config.programStartsAt.getTime()
    || state.dayBoundarySecondUtc !== config.dayBoundarySecondUtc
    || state.lateReservationGraceSeconds !== config.lateReservationGraceSeconds
    || state.unusedDailyCapacity !== config.unusedDailyCapacity
    || state.overflowPolicy !== config.overflowPolicy
    || state.lifetimeCapRaw !== config.lifetimeCapRaw
    || state.reservedLifetimeRaw !== formatRawAmount(parseRawAmount(state.reservedLifetimeRaw))
    || parseRawAmount(state.reservedLifetimeRaw) < BigInt(0)
    || parseRawAmount(state.reservedLifetimeRaw) > parseRawAmount(state.lifetimeCapRaw)
    || updatedAt.getTime() < createdAt.getTime()
  ) {
    throw new DomainConflictError(
      "La configuracion temporal/politica y el techo acumulado no pueden cambiar tras iniciar el ledger.",
    );
  }
}

function validateBudgetDay(
  day: RewardEmissionBudgetDay,
  window: ReturnType<typeof rewardEmissionBudgetDayWindow>,
) {
  validRevision(day.revision, `El dia de emision ${window.dayId}`);
  const createdAt = validRewardDate(day.createdAt, "emissionBudgetDay.createdAt");
  const updatedAt = validRewardDate(day.updatedAt, "emissionBudgetDay.updatedAt");
  if (
    day._id !== window.dayId
    || day.dayId !== window.dayId
    || !(day.startsAt instanceof Date)
    || day.startsAt.getTime() !== window.startsAt.getTime()
    || !(day.endsAt instanceof Date)
    || day.endsAt.getTime() !== window.endsAt.getTime()
    || !(day.reservationClosesAt instanceof Date)
    || day.reservationClosesAt.getTime() !== window.reservationClosesAt.getTime()
    || day.reservedRaw !== formatRawAmount(parseRawAmount(day.reservedRaw))
    || parseRawAmount(day.reservedRaw) < BigInt(0)
    || updatedAt.getTime() < createdAt.getTime()
  ) {
    throw new DomainConflictError(`El ledger diario ${window.dayId} no es canonico.`);
  }
}

function emissionEventPayload(
  event: Omit<RewardEmissionBudgetEvent, "_id" | "payloadHash">,
) {
  return stableRewardHash({ kind: "reward-emission-budget-event", ...event });
}

function decideBudgetReason(input: {
  ruleEffectiveAt: Date;
  now: Date;
  programStartsAt: Date;
  reservationClosesAt: Date;
  proposedDaily: bigint;
  dailyCap: bigint;
  proposedLifetime: bigint;
  lifetimeCap: bigint;
}): RewardEmissionBudgetReason {
  if (input.ruleEffectiveAt.getTime() < input.programStartsAt.getTime()) {
    return "PROGRAM_NOT_STARTED";
  }
  if (input.ruleEffectiveAt.getTime() > input.now.getTime()) {
    return "SOURCE_EFFECTIVE_AT_IN_FUTURE";
  }
  if (input.now.getTime() >= input.reservationClosesAt.getTime()) {
    return "DAY_CLOSED";
  }
  if (input.proposedDaily > input.dailyCap) return "DAILY_CAP_EXCEEDED";
  if (input.proposedLifetime > input.lifetimeCap) return "LIFETIME_CAP_EXCEEDED";
  return "RESERVED";
}

function buildEvent(input: {
  source: EmissionBudgetSource;
  rule: RewardRule;
  window: ReturnType<typeof rewardEmissionBudgetDayWindow>;
  status: RewardEmissionBudgetEvent["status"];
  reason: RewardEmissionBudgetReason;
  previousDailyRaw: bigint;
  resultingDailyRaw: bigint;
  previousLifetimeRaw: bigint;
  resultingLifetimeRaw: bigint;
  operatorRecovery?: RewardEmissionBudgetOperatorRecovery;
}): RewardEmissionBudgetEvent {
  const eventId = stableRewardHash({
    kind: "reward-emission-budget-source",
    sourceId: input.source.sourceId,
  });
  const immutable = {
    eventId,
    ...(input.rule.emissionBudget.calendar ? { calendar: input.rule.emissionBudget.calendar } : {}),
    sourceId: input.source.sourceId,
    periodId: input.source.periodId,
    dayId: input.window.dayId,
    dayStartsAt: input.window.startsAt,
    dayEndsAt: input.window.endsAt,
    reservationClosesAt: input.window.reservationClosesAt,
    sourceTotalRaw: input.source.sourceTotalRaw,
    status: input.status,
    reason: input.reason,
    previousDailyRaw: formatRawAmount(input.previousDailyRaw),
    resultingDailyRaw: formatRawAmount(input.resultingDailyRaw),
    dailyCapRaw: input.rule.emissionBudget.dailyCapRaw,
    previousLifetimeRaw: formatRawAmount(input.previousLifetimeRaw),
    resultingLifetimeRaw: formatRawAmount(input.resultingLifetimeRaw),
    lifetimeCapRaw: input.rule.emissionBudget.lifetimeCapRaw,
    programStartsAt: input.rule.emissionBudget.programStartsAt,
    dayBoundarySecondUtc: input.rule.emissionBudget.dayBoundarySecondUtc,
    lateReservationGraceSeconds: input.rule.emissionBudget.lateReservationGraceSeconds,
    unusedDailyCapacity: input.rule.emissionBudget.unusedDailyCapacity,
    overflowPolicy: input.rule.emissionBudget.overflowPolicy,
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    ruleEffectiveAt: input.source.ruleEffectiveAt,
    sourceSetHash: input.source.sourceSetHash,
    calculationJobRunId: input.source.calculationJobRunId,
    calculationKind: input.source.calculationKind,
    calculationInputHash: input.source.calculationInputHash,
    calculationOutputHash: input.source.calculationOutputHash,
    ...(input.operatorRecovery ? { operatorRecovery: input.operatorRecovery } : {}),
    createdAt: input.source.now,
  };
  return {
    _id: input.source.sourceId,
    ...immutable,
    payloadHash: emissionEventPayload(immutable),
  };
}

function assertOperatorRecovery(value: unknown): RewardEmissionBudgetOperatorRecovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError("budgetEvent.operatorRecovery debe ser un objeto.");
  }
  const item = value as Record<string, unknown>;
  exactRecordKeys(item, [
    "recoveryCaseId",
    "approvalId",
    "planHash",
    "originalReason",
    "approvedAt",
    "approvedBy",
  ], "budgetEvent.operatorRecovery");
  const recoveryCaseId = validRewardText(
    item.recoveryCaseId,
    "budgetEvent.operatorRecovery.recoveryCaseId",
  );
  const approvalId = validRewardText(
    item.approvalId,
    "budgetEvent.operatorRecovery.approvalId",
  );
  const planHash = validRewardText(item.planHash, "budgetEvent.operatorRecovery.planHash");
  if (!/^[0-9a-f]{64}$/.test(planHash)) {
    throw new DomainValidationError("budgetEvent.operatorRecovery.planHash no es canonico.");
  }
  if (item.originalReason !== "DAY_CLOSED") {
    throw new DomainValidationError("budgetEvent.operatorRecovery.originalReason debe ser DAY_CLOSED.");
  }
  const approvedAt = validRewardDate(
    item.approvedAt,
    "budgetEvent.operatorRecovery.approvedAt",
  );
  const approvedBy = validRewardText(
    item.approvedBy,
    "budgetEvent.operatorRecovery.approvedBy",
  );
  return {
    recoveryCaseId,
    approvalId,
    planHash,
    originalReason: "DAY_CLOSED",
    approvedAt,
    approvedBy,
  };
}

export function validateRewardEmissionBudgetEvent(event: RewardEmissionBudgetEvent) {
  try {
    const { _id, payloadHash, ...immutable } = event;
    const operatorRecovery = event.operatorRecovery
      ? assertOperatorRecovery(event.operatorRecovery)
      : undefined;
    const sourceTotal = parseRawAmount(event.sourceTotalRaw);
    const previousDaily = parseRawAmount(event.previousDailyRaw);
    const resultingDaily = parseRawAmount(event.resultingDailyRaw);
    const dailyCap = parseRawAmount(event.dailyCapRaw);
    const previousLifetime = parseRawAmount(event.previousLifetimeRaw);
    const resultingLifetime = parseRawAmount(event.resultingLifetimeRaw);
    const lifetimeCap = parseRawAmount(event.lifetimeCapRaw);
    const window = rewardEmissionBudgetDayWindow(
      event.ruleEffectiveAt,
      event.dayBoundarySecondUtc,
      event.lateReservationGraceSeconds,
      event.calendar,
    );
    const expectedReason = decideBudgetReason({
      ruleEffectiveAt: event.ruleEffectiveAt,
      now: event.createdAt,
      programStartsAt: event.programStartsAt,
      reservationClosesAt: event.reservationClosesAt,
      proposedDaily: previousDaily + sourceTotal,
      dailyCap,
      proposedLifetime: previousLifetime + sourceTotal,
      lifetimeCap,
    });
    return (
      _id === event.sourceId
      && validRewardText(event.sourceId, "budgetEvent.sourceId") === event.sourceId
      && validRewardText(event.periodId, "budgetEvent.periodId") === event.periodId
      && /^[0-9a-f]{64}$/.test(event.eventId)
      && event.eventId === stableRewardHash({
        kind: "reward-emission-budget-source",
        sourceId: event.sourceId,
      })
      && /^[0-9a-f]{64}$/.test(event.ruleConfigHash)
      && validRewardText(event.ruleVersion, "budgetEvent.ruleVersion") === event.ruleVersion
      && /^[0-9a-f]{64}$/.test(event.sourceSetHash)
      && /^[0-9a-f]{64}$/.test(event.calculationInputHash)
      && /^[0-9a-f]{64}$/.test(event.calculationOutputHash)
      && validRewardText(
        event.calculationJobRunId,
        "budgetEvent.calculationJobRunId",
      ) === event.calculationJobRunId
      && ["settlement", "credit_pool", "cukie_pool", "system"].includes(
        event.calculationKind,
      )
      && event.dayId === validRewardDate(event.dayStartsAt, "budgetEvent.dayStartsAt").toISOString()
      && event.dayId === window.dayId
      && event.dayStartsAt.getTime() === window.startsAt.getTime()
      && event.dayEndsAt.getTime() === window.endsAt.getTime()
      && event.reservationClosesAt.getTime() === window.reservationClosesAt.getTime()
      && validRewardDate(event.dayEndsAt, "budgetEvent.dayEndsAt").getTime()
        - event.dayStartsAt.getTime() === economyCycleDurationMs(event.calendar)
      && validRewardDate(
        event.reservationClosesAt,
        "budgetEvent.reservationClosesAt",
      ).getTime() >= event.dayEndsAt.getTime()
      && validRewardDate(event.programStartsAt, "budgetEvent.programStartsAt") instanceof Date
      && validRewardDate(event.ruleEffectiveAt, "budgetEvent.ruleEffectiveAt") instanceof Date
      && validRewardDate(event.createdAt, "budgetEvent.createdAt") instanceof Date
      && (!operatorRecovery || operatorRecovery.approvedAt.getTime() <= event.createdAt.getTime())
      && event.sourceTotalRaw === formatRawAmount(parseRawAmount(event.sourceTotalRaw))
      && event.previousDailyRaw === formatRawAmount(parseRawAmount(event.previousDailyRaw))
      && event.resultingDailyRaw === formatRawAmount(parseRawAmount(event.resultingDailyRaw))
      && event.dailyCapRaw === formatRawAmount(parseRawAmount(event.dailyCapRaw))
      && event.previousLifetimeRaw === formatRawAmount(parseRawAmount(event.previousLifetimeRaw))
      && event.resultingLifetimeRaw === formatRawAmount(parseRawAmount(event.resultingLifetimeRaw))
      && event.lifetimeCapRaw === formatRawAmount(parseRawAmount(event.lifetimeCapRaw))
      && sourceTotal > BigInt(0)
      && previousDaily >= BigInt(0)
      && previousLifetime >= BigInt(0)
      && dailyCap > BigInt(0)
      && lifetimeCap >= dailyCap
      && (event.unusedDailyCapacity === "expires"
        || event.unusedDailyCapacity === "materialize_undistributed")
      && event.overflowPolicy === "block"
      && (
        (
          event.status === "reserved"
          && event.reason === "RESERVED"
          && (
            (!operatorRecovery && expectedReason === "RESERVED")
            || (operatorRecovery?.originalReason === "DAY_CLOSED" && expectedReason === "DAY_CLOSED")
          )
          && resultingDaily === previousDaily + sourceTotal
          && resultingLifetime === previousLifetime + sourceTotal
          && resultingDaily <= dailyCap
          && resultingLifetime <= lifetimeCap
        )
        || (
          event.status === "blocked"
          && !operatorRecovery
          && event.reason !== "RESERVED"
          && event.reason === expectedReason
          && resultingDaily === previousDaily
          && resultingLifetime === previousLifetime
        )
      )
      && event.payloadHash === emissionEventPayload(immutable)
    );
  } catch {
    return false;
  }
}

export function assertRewardEmissionBudgetReplay(
  event: RewardEmissionBudgetEvent,
  rule: RewardRule,
  source: EmissionBudgetSource,
  runtime?: RewardEconomyRuntimeContext,
) {
  if (!validateRewardEmissionBudgetEvent(event)) {
    throw new DomainConflictError(
      `La decision de presupuesto del source ${source.sourceId} fue manipulada.`,
    );
  }
  // El camino normal conserva la reconciliacion de allocations para detectar
  // drift de un replay reservado. Una decision recuperada, en cambio, exige
  // volver a presentar el mismo plan y la misma evidencia antes de continuar.
  if (event.status === "reserved" && !event.operatorRecovery && !source.recoveryPlan) {
    return event;
  }
  const window = rewardEmissionBudgetDayWindow(
    source.ruleEffectiveAt,
    rule.emissionBudget.dayBoundarySecondUtc,
    rule.emissionBudget.lateReservationGraceSeconds,
    rule.emissionBudget.calendar,
  );
  if (
    event.sourceId !== source.sourceId
    || event.periodId !== source.periodId
    || event.dayId !== window.dayId
    || event.sourceTotalRaw !== source.sourceTotalRaw
    || event.ruleVersion !== rule.version
    || event.ruleConfigHash !== rule.configHash
    || event.ruleEffectiveAt.getTime() !== source.ruleEffectiveAt.getTime()
    || event.calculationJobRunId !== source.calculationJobRunId
    || event.calculationKind !== source.calculationKind
    || event.calculationInputHash !== source.calculationInputHash
    || event.calculationOutputHash !== source.calculationOutputHash
    || event.sourceSetHash !== source.sourceSetHash
  ) {
    throw new DomainConflictError(
      `La decision de presupuesto del source ${source.sourceId} no coincide con el replay.`,
    );
  }
  const expectedOperatorRecovery = source.recoveryPlan
    ? assertRewardLateSettlementRecoveryForSource(source.recoveryPlan, source, rule, runtime)
    : undefined;
  if (event.operatorRecovery && !source.recoveryPlan) {
    throw new DomainConflictError(
      `La decision de presupuesto del source ${source.sourceId} exige volver a presentar el plan de recuperacion.`,
    );
  }
  if (stableRewardHash(event.operatorRecovery ?? null) !== stableRewardHash(expectedOperatorRecovery ?? null)) {
    throw new DomainConflictError(
      `La decision de presupuesto del source ${source.sourceId} no coincide con el plan de recuperacion.`,
    );
  }
  return event;
}

export async function reserveRewardEmissionBudget(
  repository: RewardRepository,
  rule: RewardRule,
  sourceInput: EmissionBudgetSource,
) {
  const source: EmissionBudgetSource = {
    periodId: validRewardText(sourceInput.periodId, "periodId"),
    sourceId: validRewardText(sourceInput.sourceId, "sourceId"),
    sourceTotalRaw: formatRawAmount(parseRawAmount(sourceInput.sourceTotalRaw)),
    sourceSetHash: sourceInput.sourceSetHash,
    calculationJobRunId: validRewardText(
      sourceInput.calculationJobRunId,
      "calculation.jobRunId",
    ),
    calculationKind: sourceInput.calculationKind,
    calculationInputHash: sourceInput.calculationInputHash,
    calculationOutputHash: sourceInput.calculationOutputHash,
    ruleEffectiveAt: validRewardDate(sourceInput.ruleEffectiveAt, "ruleEffectiveAt"),
    now: validRewardDate(sourceInput.now, "now"),
    ...(sourceInput.recoveryPlan ? { recoveryPlan: sourceInput.recoveryPlan } : {}),
  };
  if (
    !/^[0-9a-f]{64}$/.test(source.sourceSetHash)
    || !/^[0-9a-f]{64}$/.test(source.calculationInputHash)
    || !/^[0-9a-f]{64}$/.test(source.calculationOutputHash)
    || !["settlement", "credit_pool", "cukie_pool", "system"].includes(
      source.calculationKind,
    )
  ) {
    throw new DomainValidationError("La evidencia de calculo del presupuesto no es canonica.");
  }
  const replay = await repository.findEmissionBudgetEvent(source.sourceId);
  if (replay) {
    return {
      event: assertRewardEmissionBudgetReplay(
        replay,
        rule,
        source,
        source.recoveryPlan ? repository.getRewardEconomyRuntimeContext() : undefined,
      ),
      replayed: true,
    };
  }

  const config = rule.emissionBudget;
  const window = rewardEmissionBudgetDayWindow(
    source.ruleEffectiveAt,
    config.dayBoundarySecondUtc,
    config.lateReservationGraceSeconds,
    config.calendar,
  );
  const state = await repository.findEmissionBudgetState();
  const day = await repository.findEmissionBudgetDay(window.dayId);
  if (state) assertRewardEmissionBudgetState(state, rule);
  if (day) validateBudgetDay(day, window);

  if (
    (state && source.now.getTime() < state.updatedAt.getTime())
    || (day && source.now.getTime() < day.updatedAt.getTime())
  ) {
    throw new DomainConflictError(
      "El reloj de reserva no puede retroceder respecto al ledger persistido.",
    );
  }

  const amount = parseRawAmount(source.sourceTotalRaw);
  if (amount <= BigInt(0)) {
    throw new DomainValidationError("sourceTotalRaw debe ser mayor que cero.");
  }
  const previousDaily = day ? parseRawAmount(day.reservedRaw) : BigInt(0);
  const previousLifetime = state ? parseRawAmount(state.reservedLifetimeRaw) : BigInt(0);
  const proposedDaily = previousDaily + amount;
  const proposedLifetime = previousLifetime + amount;
  const dailyCap = parseRawAmount(config.dailyCapRaw);
  const lifetimeCap = parseRawAmount(config.lifetimeCapRaw);
  const reason = decideBudgetReason({
    ruleEffectiveAt: source.ruleEffectiveAt,
    now: source.now,
    programStartsAt: config.programStartsAt,
    reservationClosesAt: window.reservationClosesAt,
    proposedDaily,
    dailyCap,
    proposedLifetime,
    lifetimeCap,
  });

  let operatorRecovery: RewardEmissionBudgetOperatorRecovery | undefined;
  let effectiveReason = reason;
  if (source.recoveryPlan) {
    operatorRecovery = assertRewardLateSettlementRecoveryForSource(
      source.recoveryPlan,
      source,
      rule,
      repository.getRewardEconomyRuntimeContext(),
    );
    if (reason !== "DAY_CLOSED") {
      throw new DomainConflictError(
        `El source ${source.sourceId} no requiere una recuperacion DAY_CLOSED autorizada.`,
      );
    }
    if (proposedDaily > dailyCap || proposedLifetime > lifetimeCap) {
      throw new DomainConflictError(
        `El source ${source.sourceId} excederia los techos de emision durante la recuperacion.`,
      );
    }
    effectiveReason = "RESERVED";
  }

  if (effectiveReason !== "RESERVED") {
    const event = buildEvent({
      source,
      rule,
      window,
      status: "blocked",
      reason: effectiveReason,
      previousDailyRaw: previousDaily,
      resultingDailyRaw: previousDaily,
      previousLifetimeRaw: previousLifetime,
      resultingLifetimeRaw: previousLifetime,
    });
    await repository.insertEmissionBudgetEvent(event);
    return { event, replayed: false };
  }

  const nextState: RewardEmissionBudgetState = state
    ? {
        ...state,
        reservedLifetimeRaw: formatRawAmount(proposedLifetime),
        revision: state.revision + 1,
        updatedAt: source.now,
      }
    : {
        _id: REWARD_EMISSION_BUDGET_SCOPE,
        ...(config.calendar ? { calendar: config.calendar } : {}),
        scope: REWARD_EMISSION_BUDGET_SCOPE,
        programStartsAt: config.programStartsAt,
        dayBoundarySecondUtc: config.dayBoundarySecondUtc,
        lateReservationGraceSeconds: config.lateReservationGraceSeconds,
        unusedDailyCapacity: config.unusedDailyCapacity,
        overflowPolicy: config.overflowPolicy,
        lifetimeCapRaw: config.lifetimeCapRaw,
        reservedLifetimeRaw: formatRawAmount(proposedLifetime),
        revision: 0,
        createdAt: source.now,
        updatedAt: source.now,
      };
  const nextDay: RewardEmissionBudgetDay = day
    ? {
        ...day,
        reservedRaw: formatRawAmount(proposedDaily),
        revision: day.revision + 1,
        updatedAt: source.now,
      }
    : {
        _id: window.dayId,
        dayId: window.dayId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        reservationClosesAt: window.reservationClosesAt,
        reservedRaw: formatRawAmount(proposedDaily),
        revision: 0,
        createdAt: source.now,
        updatedAt: source.now,
      };
  const event = buildEvent({
    source,
    rule,
    window,
    status: "reserved",
    reason: effectiveReason,
    previousDailyRaw: previousDaily,
    resultingDailyRaw: proposedDaily,
    previousLifetimeRaw: previousLifetime,
    resultingLifetimeRaw: proposedLifetime,
    operatorRecovery,
  });
  await repository.persistEmissionBudgetState(state?.revision ?? null, nextState);
  await repository.persistEmissionBudgetDay(day?.revision ?? null, nextDay);
  await repository.insertEmissionBudgetEvent(event);
  return { event, replayed: false };
}
