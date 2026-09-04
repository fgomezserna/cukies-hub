import { acceleratedDayId, acceleratedDayFromId, acceleratedCyclePeriod, assertEconomyCycleCalendar, economyCycleDurationMs, economyCycleDelayMs, type EconomyCycleCalendar } from '../cycle-calendar';
import { getIsoWeekPeriodFromId, getIsoWeekPeriodId } from '../periods';

/** Pure snapshot-based calendar: never reads the environment for persisted data. */
export function rewardAccountingDayId(start: Date, calendar?: EconomyCycleCalendar) {
  return calendar ? acceleratedDayId(start, calendar) : start.toISOString().slice(0, 10);
}

export function rewardAccountingDayStart(id: string, boundarySecondUtc = 14 * 3600, calendar?: EconomyCycleCalendar) {
  assertEconomyCycleCalendar(calendar);
  if (calendar) {
    const period = acceleratedDayFromId(id);
    if (acceleratedDayId(period.start, calendar) !== id) throw new TypeError('El dia no corresponde al calendario sellado.');
    return period.start;
  }
  const start = new Date(`${id}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== id) {
    throw new TypeError('El cierre reward contiene un dayId no canonico.');
  }
  return new Date(start.getTime() + boundarySecondUtc * 1000);
}

export function rewardAccountingWeek(periodId: string, calendar?: EconomyCycleCalendar) {
  assertEconomyCycleCalendar(calendar);
  const period = getIsoWeekPeriodFromId(periodId);
  if (Boolean(calendar) !== Boolean(period.calendar)
    || getIsoWeekPeriodId(period.start, calendar) !== periodId) throw new TypeError('La semana no corresponde al calendario sellado.');
  const dayMs = economyCycleDurationMs(calendar);
  const startsAt = calendar ? period.start : new Date(period.start.getTime() + 14 * 3600_000);
  const endsAt = new Date(startsAt.getTime() + 7 * dayMs);
  return {
    startsAt, endsAt,
    payoutAt: new Date(endsAt.getTime() + economyCycleDelayMs(3, calendar)),
    dayIds: Array.from({ length: 7 }, (_, index) => rewardAccountingDayId(new Date(startsAt.getTime() + index * dayMs), calendar)),
    trancheAt: Array.from({ length: 7 }, (_, index) => new Date(endsAt.getTime() + (index + 1) * dayMs + economyCycleDelayMs(2, calendar))),
  };
}

export function firstRewardDayStart(activeFrom: Date, boundarySecondUtc: number, calendar?: EconomyCycleCalendar) {
  return calendar ? acceleratedCyclePeriod(activeFrom, calendar).start
    : rewardAccountingDayStart(activeFrom.toISOString().slice(0, 10), boundarySecondUtc);
}
