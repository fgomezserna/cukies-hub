import { parseCanonicalUtcDate } from './rules';
import type { CompetitionConfig, CompetitionVestingSchedule } from './types';

function parseDate(value: string) {
  return parseCanonicalUtcDate(value, 'Vesting start');
}

export function addUtcCalendarMonthsClamped(value: Date, months: number) {
  if (!Number.isSafeInteger(months) || months < 0) {
    throw new RangeError('Calendar months must be a non-negative integer');
  }

  const result = new Date(value.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function createCompetitionVestingSchedule(
  competitionEndsAt: string,
  campaign: CompetitionConfig,
): CompetitionVestingSchedule {
  const startAt = parseDate(competitionEndsAt);
  const cliffAt = addUtcCalendarMonthsClamped(startAt, campaign.cliffMonths);
  const endAt = addUtcCalendarMonthsClamped(cliffAt, campaign.vestingMonths);
  const durationSeconds = Math.floor((endAt.getTime() - cliffAt.getTime()) / 1_000);

  return {
    startAt: startAt.toISOString(),
    cliffAt: cliffAt.toISOString(),
    endAt: endAt.toISOString(),
    durationSeconds,
  };
}
