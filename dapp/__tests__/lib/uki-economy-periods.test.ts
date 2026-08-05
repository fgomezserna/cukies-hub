import {
  getDailyPeriod,
  getIsoWeekPeriod,
  getIsoWeekPeriodFromId,
} from '@/lib/uki-economy/periods';

describe('UTC economy periods', () => {
  it('builds daily ids and exclusive UTC bounds across a leap day', () => {
    expect(getDailyPeriod(new Date('2024-02-29T23:59:59.999Z'))).toEqual({
      id: '2024-02-29',
      start: new Date('2024-02-29T00:00:00.000Z'),
      endExclusive: new Date('2024-03-01T00:00:00.000Z'),
    });
  });

  it('uses the UTC date rather than the source offset', () => {
    expect(getDailyPeriod(new Date('2026-01-01T00:30:00+02:00')).id).toBe('2025-12-31');
  });

  it.each([
    ['2020-12-31T12:00:00Z', '2020-W53', '2020-12-28T00:00:00.000Z', '2021-01-04T00:00:00.000Z'],
    ['2021-01-01T12:00:00Z', '2020-W53', '2020-12-28T00:00:00.000Z', '2021-01-04T00:00:00.000Z'],
    ['2021-01-04T00:00:00Z', '2021-W01', '2021-01-04T00:00:00.000Z', '2021-01-11T00:00:00.000Z'],
    ['2024-12-30T23:59:59Z', '2025-W01', '2024-12-30T00:00:00.000Z', '2025-01-06T00:00:00.000Z'],
  ])('builds ISO week %s as %s', (date, id, start, endExclusive) => {
    expect(getIsoWeekPeriod(new Date(date))).toEqual({
      id,
      start: new Date(start),
      endExclusive: new Date(endExclusive),
    });
  });

  it('rejects invalid dates', () => {
    expect(() => getDailyPeriod(new Date('invalid'))).toThrow('fecha valida');
    expect(() => getIsoWeekPeriod(new Date('invalid'))).toThrow('fecha valida');
  });

  it('resuelve bounds exactos desde un periodId ISO y rechaza W53 inexistente', () => {
    expect(getIsoWeekPeriodFromId('2026-W28')).toEqual({
      id: '2026-W28',
      start: new Date('2026-07-06T00:00:00.000Z'),
      endExclusive: new Date('2026-07-13T00:00:00.000Z'),
    });
    expect(() => getIsoWeekPeriodFromId('2021-W53')).toThrow(/no existe/);
    expect(() => getIsoWeekPeriodFromId('2026-W1')).toThrow(/canonico/);
  });
});
