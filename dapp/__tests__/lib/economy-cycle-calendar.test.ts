import {
  acceleratedCyclePeriod, acceleratedDayFromId, acceleratedDayId,
  acceleratedWeekFromId, acceleratedWeekId, assertEconomyCycleCalendar,
  economyCycleDelayMs, economyCycleDurationMs, loadEconomyCycleCalendar,
  type EconomyCycleCalendar,
} from '@/lib/uki-economy/cycle-calendar';
import {
  assertCompetitionCreditRule, buildCompetitionCreditPeriod,
  computePoolConfigEffectiveCutoff, currentCompetitionCreditPeriod,
  safeCompetitionCreditPeriodScopeId,
} from '@/lib/uki-economy/credits/rules';
import { testCompetitionCreditRule } from '@/lib/uki-economy/credits/testing';

const calendar: EconomyCycleCalendar = {
  version: 'cycle-v1', chainId: 97, cycleSeconds: 1800,
  anchorAt: '2026-09-04T10:00:00.000Z',
};
const environment = {
  APP_ENV: 'staging', STAGING_ONLY_GUARD: 'true', NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97', CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
  ECONOMY_CYCLE_SECONDS: '1800', ECONOMY_CYCLE_ANCHOR_AT: calendar.anchorAt,
};

describe('versioned accelerated economy calendar', () => {
  it('preserves production defaults and fails closed on mismatched configuration', () => {
    expect(loadEconomyCycleCalendar({ APP_ENV: 'production' })).toBeUndefined();
    expect(economyCycleDurationMs()).toBe(86_400_000);
    expect(economyCycleDelayMs(48)).toBe(172_800_000);
    expect(loadEconomyCycleCalendar(environment)).toEqual(calendar);
    for (const override of [
      { APP_ENV: 'production' }, { STAGING_ONLY_GUARD: 'false' },
      { NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56' },
      { CHAIN_INDEXER_DB_NAME: 'cukieshub-new' }, { ECONOMY_CYCLE_ANCHOR_AT: '' },
      { ECONOMY_CYCLE_SECONDS: '0' }, { ECONOMY_CYCLE_SECONDS: '1800abc' },
    ]) expect(() => loadEconomyCycleCalendar({ ...environment, ...override })).toThrow();
    expect(() => assertEconomyCycleCalendar(calendar, 56)).toThrow();
    expect(() => assertEconomyCycleCalendar({ ...calendar, anchorAt: '2026-09-04T10:01:00.000Z' })).toThrow();
  });

  it('uses half-open periods, unique day IDs, and rolls over after seven cycles', () => {
    const start = new Date(calendar.anchorAt);
    expect(acceleratedCyclePeriod(new Date('2026-09-04T10:29:59.999Z'), calendar).start).toEqual(start);
    expect(acceleratedCyclePeriod(new Date('2026-09-04T10:30:00.000Z'), calendar).start)
      .toEqual(new Date('2026-09-04T10:30:00.000Z'));
    const ids = Array.from({ length: 7 }, (_, index) => acceleratedDayId(new Date(start.getTime() + index * 1_800_000), calendar));
    expect(new Set(ids).size).toBe(7);
    expect(acceleratedDayFromId(ids[0]).endExclusive).toEqual(new Date('2026-09-04T10:30:00.000Z'));
    const week = acceleratedWeekId(start, calendar);
    expect(acceleratedWeekFromId(week).endExclusive).toEqual(new Date('2026-09-04T13:30:00.000Z'));
    expect(acceleratedWeekId(new Date('2026-09-04T13:29:59.999Z'), calendar)).toBe(week);
    expect(acceleratedWeekId(new Date('2026-09-04T13:30:00.000Z'), calendar)).not.toBe(week);
    expect(economyCycleDelayMs(2, calendar)).toBe(150_000);
    expect(economyCycleDelayMs(3, calendar)).toBe(225_000);
    expect(economyCycleDelayMs(48, calendar)).toBe(3_600_000);
  });

  it('creates snapshot-bound credit cycles with expiry, cutoff and next configuration time', () => {
    const rule = testCompetitionCreditRule({ calendar, expectedBscChainId: 97, activeFrom: new Date(calendar.anchorAt) });
    const cutoff = new Date('2026-09-04T10:30:00.000Z');
    const period = buildCompetitionCreditPeriod(cutoff, rule);
    expect(period.calendar).toEqual(calendar);
    expect(period.nextCutoff).toEqual(new Date('2026-09-04T11:00:00.000Z'));
    // The fixture settles four hours after its standard cutoff: five scaled minutes.
    expect(period.settlementTarget).toEqual(new Date('2026-09-04T10:35:00.000Z'));
    expect(safeCompetitionCreditPeriodScopeId({ period }, 'run-1')).toBe(period.periodId);
    expect(currentCompetitionCreditPeriod(new Date('2026-09-04T10:59:59.999Z'), rule)).toEqual(period);
    expect(computePoolConfigEffectiveCutoff(cutoff, rule)).toEqual(period.nextCutoff);
    expect(computePoolConfigEffectiveCutoff(new Date(cutoff.getTime() - 1), rule)).toEqual(cutoff);
    expect(() => buildCompetitionCreditPeriod(new Date(cutoff.getTime() + 1), rule)).toThrow();
    expect(() => assertCompetitionCreditRule({ ...rule, calendar: { ...calendar, cycleSeconds: 3600 } })).toThrow(/configHash/);
    expect(() => assertCompetitionCreditRule({ ...rule, expectedBscChainId: 56 })).toThrow();
  });
});
