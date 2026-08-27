export type UtcPeriod = {
  id: string;
  start: Date;
  endExclusive: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function assertValidDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Se requiere una fecha valida.');
  }

  return value;
}

function utcMidnight(value: Date) {
  const date = assertValidDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getDailyPeriodId(value: Date) {
  return utcMidnight(value).toISOString().slice(0, 10);
}

export function getDailyPeriodBounds(value: Date) {
  const start = utcMidnight(value);
  return {
    start,
    endExclusive: new Date(start.getTime() + DAY_MS),
  };
}

export function getDailyPeriod(value: Date): UtcPeriod {
  const bounds = getDailyPeriodBounds(value);
  return {
    id: getDailyPeriodId(value),
    ...bounds,
  };
}

function isoWeekParts(value: Date) {
  const midnight = utcMidnight(value);
  const isoDay = midnight.getUTCDay() || 7;
  const thursday = new Date(midnight.getTime() + (4 - isoDay) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);

  return { midnight, isoDay, year, week };
}

export function getIsoWeekPeriodId(value: Date) {
  const { year, week } = isoWeekParts(value);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getIsoWeekPeriodBounds(value: Date) {
  const { midnight, isoDay } = isoWeekParts(value);
  const start = new Date(midnight.getTime() - (isoDay - 1) * DAY_MS);

  return {
    start,
    endExclusive: new Date(start.getTime() + 7 * DAY_MS),
  };
}

export function getIsoWeekPeriod(value: Date): UtcPeriod {
  const bounds = getIsoWeekPeriodBounds(value);
  return {
    id: getIsoWeekPeriodId(value),
    ...bounds,
  };
}

export function getIsoWeekPeriodFromId(periodId: string): UtcPeriod {
  const match = /^(\d{4})-W(\d{2})$/.exec(periodId);
  if (!match) throw new TypeError('Se requiere un periodo ISO semanal canonico.');
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) {
    throw new TypeError('La semana ISO esta fuera de rango.');
  }
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const isoDay = januaryFourth.getUTCDay() || 7;
  const weekOneStart = new Date(
    januaryFourth.getTime() - (isoDay - 1) * DAY_MS,
  );
  const start = new Date(weekOneStart.getTime() + (week - 1) * 7 * DAY_MS);
  if (getIsoWeekPeriodId(start) !== periodId) {
    throw new TypeError('El periodo ISO semanal no existe.');
  }
  return {
    id: periodId,
    start,
    endExclusive: new Date(start.getTime() + 7 * DAY_MS),
  };
}

export const dailyPeriodId = getDailyPeriodId;
export const isoWeekPeriodId = getIsoWeekPeriodId;
