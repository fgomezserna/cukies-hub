const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;
const STANDARD_WEEK_BOUNDARY_SECOND_UTC = 14 * 60 * 60;

const STANDARD_DAY_ID = /^\d{4}-\d{2}-\d{2}$/;
const STANDARD_WEEK_ID = /^(\d{4})-W(\d{2})$/;
const ACCELERATED_DAY_ID = /^C(1800|3600)-D:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z)$/;
const ACCELERATED_WEEK_ID = /^C(1800|3600)-W:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z)$/;

/**
 * Raised only when a canonical accounting period is entirely before the
 * configured forward fence (including a period that would be partial at the
 * activation instant). Callers may skip this candidate without mutating it.
 */
export class RewardPublicationForwardFenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RewardPublicationForwardFenceError';
    this.code = 'REWARD_PUBLICATION_PERIOD_BEFORE_FORWARD_ACTIVATION';
  }
}

export function isRewardPublicationForwardFenceError(error) {
  return Boolean(
    error
      && typeof error === 'object'
      && error.code === 'REWARD_PUBLICATION_PERIOD_BEFORE_FORWARD_ACTIVATION',
  );
}

function validDate(value, label) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} no es una fecha valida.`);
  }
  return value;
}

function canonicalForwardActivationAt(value) {
  if (value === undefined) return undefined;
  const activationAt = validDate(value, 'forwardActivationAt');
  if (activationAt.toISOString() !== value.toISOString()) {
    throw new Error('forwardActivationAt debe conservar una fecha UTC canonica.');
  }
  return activationAt;
}

function canonicalCalendar(calendar) {
  if (calendar === undefined || calendar === null) return undefined;
  if (
    calendar.version !== 'cycle-v1'
    || calendar.chainId !== 97
    || (calendar.cycleSeconds !== 1800 && calendar.cycleSeconds !== 3600)
    || typeof calendar.anchorAt !== 'string'
  ) {
    throw new Error('El calendario contable no es canonico.');
  }
  const anchorAt = new Date(calendar.anchorAt);
  if (
    Number.isNaN(anchorAt.getTime())
    || anchorAt.toISOString() !== calendar.anchorAt
    || anchorAt.getTime() % (calendar.cycleSeconds * 1_000) !== 0
  ) {
    throw new Error('El inicio del calendario contable no es canonico.');
  }
  return { ...calendar };
}

function assertBoundarySecond(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 86_399) {
    throw new Error('dayBoundarySecondUtc no es canonico.');
  }
  return value;
}

function isoWeekId(value) {
  const date = validDate(value, 'period start');
  const midnight = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const isoDay = midnight.getUTCDay() || 7;
  const thursday = new Date(midnight.getTime() + (4 - isoDay) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function standardWeekStart(periodId) {
  const match = STANDARD_WEEK_ID.exec(periodId);
  if (!match) throw new Error('El periodId weekly no es canonico.');
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw new Error('El periodId weekly esta fuera de rango.');
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const isoDay = januaryFourth.getUTCDay() || 7;
  const weekOneStart = new Date(januaryFourth.getTime() - (isoDay - 1) * DAY_MS);
  const start = new Date(weekOneStart.getTime() + (week - 1) * WEEK_MS);
  if (isoWeekId(start) !== periodId) throw new Error('El periodId weekly no existe.');
  return start;
}

function acceleratedStart(id, cadence, calendar) {
  const match = (cadence === 'daily' ? ACCELERATED_DAY_ID : ACCELERATED_WEEK_ID).exec(id);
  if (!match) throw new Error(`El periodId ${cadence} no es canonico.`);
  const seconds = Number(match[1]);
  const expectedCalendar = canonicalCalendar(calendar);
  if (!expectedCalendar || expectedCalendar.cycleSeconds !== seconds) {
    throw new Error('El periodId acelerado no coincide con el calendario sellado.');
  }
  const start = new Date(match[2]);
  const duration = seconds * 1_000 * (cadence === 'daily' ? 1 : 7);
  const anchorAt = new Date(expectedCalendar.anchorAt).getTime();
  if (
    Number.isNaN(start.getTime())
    || start.toISOString() !== match[2]
    || start.getTime() % (seconds * 1_000) !== 0
    || (start.getTime() - anchorAt) % duration !== 0
  ) {
    throw new Error('El inicio del periodo acelerado no es canonico.');
  }
  return { startsAt: start, endsAt: new Date(start.getTime() + duration) };
}

function accountingPeriod({ accounting, accountingKind, rule }) {
  if (!accounting || typeof accounting !== 'object') {
    throw new Error('El cierre contable no existe.');
  }
  if (accountingKind !== 'daily' && accountingKind !== 'weekly') {
    throw new Error('El cierre contable no tiene una clase canonica.');
  }
  // The sealed accounting snapshot is the source of truth for accelerated
  // boundaries. A rule calendar by itself cannot turn an unsealed/legacy
  // period into an eligible one.
  const calendar = canonicalCalendar(accounting.calendar);
  if (accountingKind === 'daily') {
    if (
      typeof accounting.dayId !== 'string'
      || accounting._id !== `reward-daily:${accounting.dayId}`
    ) {
      throw new Error('El cierre diario no conserva su dayId canonico.');
    }
    if (calendar) {
      const bounds = acceleratedStart(accounting.dayId, 'daily', calendar);
      return { id: accounting.dayId, ...bounds, calendar };
    }
    if (!STANDARD_DAY_ID.test(accounting.dayId)) {
      throw new Error('El cierre diario no conserva su dayId UTC canonico.');
    }
    const midnight = new Date(`${accounting.dayId}T00:00:00.000Z`);
    if (Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== accounting.dayId) {
      throw new Error('El cierre diario no conserva su dayId UTC canonico.');
    }
    const boundarySecondUtc = assertBoundarySecond(
      rule?.emissionBudget?.dayBoundarySecondUtc ?? STANDARD_WEEK_BOUNDARY_SECOND_UTC,
    );
    const startsAt = new Date(midnight.getTime() + boundarySecondUtc * 1_000);
    return { id: accounting.dayId, startsAt, endsAt: new Date(startsAt.getTime() + DAY_MS) };
  }

  if (typeof accounting.periodId !== 'string' || accounting._id !== `reward-weekly:${accounting.periodId}`) {
    throw new Error('El cierre weekly no conserva su periodId canonico.');
  }
  if (calendar) {
    const bounds = acceleratedStart(accounting.periodId, 'weekly', calendar);
    return { id: accounting.periodId, ...bounds, calendar };
  }
  const monday = standardWeekStart(accounting.periodId);
  const startsAt = new Date(monday.getTime() + STANDARD_WEEK_BOUNDARY_SECOND_UTC * 1_000);
  return { id: accounting.periodId, startsAt, endsAt: new Date(startsAt.getTime() + WEEK_MS) };
}

function assertAllocationLinks({ allocations, accounting, accountingKind, period }) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error(`El cierre ${accounting._id} no contiene allocations finales.`);
  }
  for (const allocation of allocations) {
    if (
      allocation.accountingId !== accounting._id
      || allocation.accountingKind !== accountingKind
      || allocation.periodId !== period.id
    ) {
      throw new Error(`La allocation ${String(allocation._id)} no liga el periodo contable canonico.`);
    }
  }
}

/**
 * Validates the persisted accounting period against the forward fence. The
 * allocation timestamp remains useful for candidate ordering, but it cannot
 * make an old or partial canonical period eligible.
 */
export function assertRewardPublicationPeriodForwardEligible(input) {
  const activationAt = canonicalForwardActivationAt(input.forwardActivationAt);
  if (!activationAt) return null;
  const period = accountingPeriod(input);
  if (activationAt && period.startsAt.getTime() < activationAt.getTime()) {
    throw new RewardPublicationForwardFenceError(
      `El periodo ${period.id} comienza antes de REWARD_FORWARD_ACTIVATION_AT.`,
    );
  }
  if (input.allocations) {
    assertAllocationLinks({ ...input, period });
  }
  return period;
}

/**
 * Applies the same period fence to an already prepared publication plan.
 * Plans are linked to their immutable accounting closure before a lease is
 * acquired, so a late-created historical plan cannot be drained on replay.
 */
export function assertRewardPublicationPlanForwardEligible(input) {
  const period = assertRewardPublicationPeriodForwardEligible(input);
  if (
    input.plan.accountingId !== input.accounting._id
    || input.plan.accountingKind !== input.accountingKind
    || input.plan.periodId !== `reward-accounting:${input.accounting._id}`
  ) {
    throw new Error(`El plan ${String(input.plan.planId)} no liga el periodo contable canonico.`);
  }
  return period;
}

export function rewardPublicationAccountingCollection(accountingKind) {
  if (accountingKind === 'daily') return 'reward_daily_accounting';
  if (accountingKind === 'weekly') return 'reward_weekly_prize_accounting';
  throw new Error('El cierre contable no tiene una clase canonica.');
}
