import "server-only";

import { DomainConflictError, DomainValidationError } from "../errors";
import { formatRawAmount, parseRawAmount } from "../money";
import type { RewardRepository } from "./repository";
import { stableRewardHash, validRewardDate, validRewardText } from "./rules";
import {
  REWARD_EMISSION_BUDGET_SCOPE,
  type RewardEmissionBudgetDay,
  type RewardEmissionBudgetEvent,
  type RewardEmissionBudgetReason,
  type RewardEmissionBudgetState,
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
};

export function rewardEmissionBudgetDayWindow(
  ruleEffectiveAtInput: Date,
  dayBoundarySecondUtc: number,
  lateReservationGraceSeconds: number,
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
  const startsAtMs = Math.floor(
    (ruleEffectiveAt.getTime() - boundaryMs) / DAY_MS,
  ) * DAY_MS + boundaryMs;
  const startsAt = new Date(startsAtMs);
  const endsAt = new Date(startsAtMs + DAY_MS);
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

function validateBudgetState(
  state: RewardEmissionBudgetState,
  rule: RewardRule,
) {
  const config = rule.emissionBudget;
  const createdAt = validRewardDate(state.createdAt, "emissionBudgetState.createdAt");
  const updatedAt = validRewardDate(state.updatedAt, "emissionBudgetState.updatedAt");
  validRevision(state.revision, "El estado global de emision");
  if (
    state._id !== REWARD_EMISSION_BUDGET_SCOPE
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
}): RewardEmissionBudgetEvent {
  const eventId = stableRewardHash({
    kind: "reward-emission-budget-source",
    sourceId: input.source.sourceId,
  });
  const immutable = {
    eventId,
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
    createdAt: input.source.now,
  };
  return {
    _id: input.source.sourceId,
    ...immutable,
    payloadHash: emissionEventPayload(immutable),
  };
}

export function validateRewardEmissionBudgetEvent(event: RewardEmissionBudgetEvent) {
  try {
    const { _id, payloadHash, ...immutable } = event;
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
        - event.dayStartsAt.getTime() === DAY_MS
      && validRewardDate(
        event.reservationClosesAt,
        "budgetEvent.reservationClosesAt",
      ).getTime() >= event.dayEndsAt.getTime()
      && validRewardDate(event.programStartsAt, "budgetEvent.programStartsAt") instanceof Date
      && validRewardDate(event.ruleEffectiveAt, "budgetEvent.ruleEffectiveAt") instanceof Date
      && validRewardDate(event.createdAt, "budgetEvent.createdAt") instanceof Date
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
      && event.unusedDailyCapacity === "expires"
      && event.overflowPolicy === "block"
      && (
        (
          event.status === "reserved"
          && event.reason === "RESERVED"
          && expectedReason === "RESERVED"
          && resultingDaily === previousDaily + sourceTotal
          && resultingLifetime === previousLifetime + sourceTotal
        )
        || (
          event.status === "blocked"
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
) {
  if (!validateRewardEmissionBudgetEvent(event)) {
    throw new DomainConflictError(
      `La decision de presupuesto del source ${source.sourceId} fue manipulada.`,
    );
  }
  // Las fuentes ya reservadas dejan que el reconciliador de rewards compare
  // el replay completo y bloquee allocations existentes ante cualquier drift.
  // Una fuente ya rechazada no tiene manifest que reconciliar y debe coincidir
  // exactamente con su decision inmutable.
  if (event.status === "reserved") return event;
  const window = rewardEmissionBudgetDayWindow(
    source.ruleEffectiveAt,
    rule.emissionBudget.dayBoundarySecondUtc,
    rule.emissionBudget.lateReservationGraceSeconds,
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
    return { event: assertRewardEmissionBudgetReplay(replay, rule, source), replayed: true };
  }

  const config = rule.emissionBudget;
  const window = rewardEmissionBudgetDayWindow(
    source.ruleEffectiveAt,
    config.dayBoundarySecondUtc,
    config.lateReservationGraceSeconds,
  );
  const state = await repository.findEmissionBudgetState();
  const day = await repository.findEmissionBudgetDay(window.dayId);
  if (state) validateBudgetState(state, rule);
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

  if (reason !== "RESERVED") {
    const event = buildEvent({
      source,
      rule,
      window,
      status: "blocked",
      reason,
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
    reason,
    previousDailyRaw: previousDaily,
    resultingDailyRaw: proposedDaily,
    previousLifetimeRaw: previousLifetime,
    resultingLifetimeRaw: proposedLifetime,
  });
  await repository.persistEmissionBudgetState(state?.revision ?? null, nextState);
  await repository.persistEmissionBudgetDay(day?.revision ?? null, nextDay);
  await repository.insertEmissionBudgetEvent(event);
  return { event, replayed: false };
}
