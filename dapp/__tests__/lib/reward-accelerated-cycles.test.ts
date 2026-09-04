import { acceleratedDayId, acceleratedWeekId, type EconomyCycleCalendar } from '@/lib/uki-economy/cycle-calendar';
import { getIsoWeekPeriod, getIsoWeekPeriodFromId } from '@/lib/uki-economy/periods';
import { getTreasureHuntDailyPeriod, getTreasureHuntWeeklyPeriod } from '@/lib/uki-economy/game-economy/treasure-hunt-policy';
import { assertWeeklyPrizeAccountingIntegrity, calculateWeeklyPrize, sealDailyRewardAccounting, selectStoredWeeklyPoolTranche } from '@/lib/uki-economy/rewards/accounting';
import { rewardAccountingWeek } from '@/lib/uki-economy/rewards/calendar';
import { reserveRewardEmissionBudget, rewardEmissionBudgetDayWindow, validateRewardEmissionBudgetEvent } from '@/lib/uki-economy/rewards/emission-budget';
import { MemoryRewardRepository, testRewardRule } from '@/lib/uki-economy/rewards/testing';
import { buildCurrentWeeklyRankingRule } from '@/lib/uki-economy/ranking/rules';
import { createMongoRewardAccountingRepository, RewardAccountingService, type RewardAccountingRepository } from '@/lib/uki-economy/rewards/accounting-repository';
import type { WeeklyGameResult } from '@/lib/uki-economy/rewards/accounting-types';
import type { Db, ClientSession } from 'mongodb';

const calendar: EconomyCycleCalendar = { version: 'cycle-v1', chainId: 97, cycleSeconds: 1800, anchorAt: '2026-09-04T12:00:00.000Z' };
const start = new Date(calendar.anchorAt);
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
const periodId = acceleratedWeekId(start, calendar);
const wallet = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const destinations = { treasury: wallet(1), marketingDevelopment: wallet(2), supplyReduction: wallet(3) };
const baseRule = testRewardRule();
const rule = testRewardRule({ activeFrom: start, emissionBudget: { ...baseRule.emissionBudget, calendar, programStartsAt: start, lateReservationGraceSeconds: 150, dailyCapRaw: '100', lifetimeCapRaw: '1000' } });

describe('rewards con calendario acelerado sellado', () => {
  it('comparte cortes exactos de treinta minutos y siete ciclos entre juego y rewards', () => {
    expect(getTreasureHuntDailyPeriod(at(1799), calendar).endsAt).toEqual(at(1800));
    expect(getTreasureHuntDailyPeriod(at(1800), calendar).periodId).toBe(acceleratedDayId(at(1800), calendar));
    expect(getTreasureHuntWeeklyPeriod(at(12599), calendar).periodId).toBe(periodId);
    expect(getTreasureHuntWeeklyPeriod(at(12600), calendar).periodId).not.toBe(periodId);
    expect(getIsoWeekPeriodFromId(periodId).endExclusive).toEqual(at(12600));
    expect(getIsoWeekPeriod(start).id).toBe('2026-W36');
    expect(buildCurrentWeeklyRankingRule({ version: 'fast', activeFrom: start, calendar, now: start }).calendar).toEqual(calendar);
  });

  it('elige el siguiente cierre real despues de treinta minutos mas 150 segundos', async () => {
    const db = { collection: (name: string) => name === 'economy_rule_versions' ? { findOne: async () => rule } : { findOne: async () => null } } as unknown as Db;
    const repository = createMongoRewardAccountingRepository(db, {} as ClientSession);
    await expect(repository.findNextClosableRewardDay(rule.version, at(1949))).resolves.toBeNull();
    await expect(repository.findNextClosableRewardDay(rule.version, at(1950))).resolves.toEqual({ dayId: acceleratedDayId(start, calendar), startsAt: start });
    const weeklyRepository = { findRewardRuleByVersion: async () => rule, findWeekly: async () => null } as unknown as RewardAccountingRepository;
    const service = new RewardAccountingService(async (work) => work(weeklyRepository));
    await expect(service.nextWeeklyPeriod({ ruleVersion: rule.version, now: at(12824) })).resolves.toBeNull();
    await expect(service.nextWeeklyPeriod({ ruleVersion: rule.version, now: at(12825) })).resolves.toEqual({ periodId, startsAt: start, payoutAt: at(12825) });
  });

  it('reserva una sola vez, renueva el cap por ciclo y conserva un lifetime comun', async () => {
    const repository = new MemoryRewardRepository(rule);
    const source = (id: string, effectiveAt: Date, now = effectiveAt) => ({ periodId, sourceId: id, sourceTotalRaw: '70', sourceSetHash: 'a'.repeat(64), calculationJobRunId: `job-${id}`, calculationKind: 'system' as const, calculationInputHash: 'b'.repeat(64), calculationOutputHash: 'c'.repeat(64), ruleEffectiveAt: effectiveAt, now });
    const first = await reserveRewardEmissionBudget(repository, rule, source('one', at(100)));
    expect(first.event.dayEndsAt).toEqual(at(1800));
    expect(validateRewardEmissionBudgetEvent(first.event)).toBe(true);
    expect((await reserveRewardEmissionBudget(repository, rule, source('one', at(100), at(1800)))).replayed).toBe(true);
    const second = await reserveRewardEmissionBudget(repository, rule, source('two', at(1800)));
    expect(second.event.resultingLifetimeRaw).toBe('140');
    expect(repository.state.emissionBudgetDays).toHaveLength(2);
    const late = await reserveRewardEmissionBudget(repository, rule, source('late', at(101), at(1950)));
    expect(late.event.reason).toBe('DAY_CLOSED');
    const changed = testRewardRule({ ...rule, configHash: undefined, emissionBudget: { ...rule.emissionBudget, calendar: { ...calendar, cycleSeconds: 3600 } } });
    await expect(reserveRewardEmissionBudget(repository, changed, source('changed', at(3600)))).rejects.toThrow(/no pueden cambiar/);
    expect(rewardEmissionBudgetDayWindow(start, 14 * 3600, 0).endsAt.getTime() - rewardEmissionBudgetDayWindow(start, 14 * 3600, 0).startsAt.getTime()).toBe(86400000);
  });

  it('no cierra el primer dia posterior sin el weekly que financia su tramo', async () => {
    const materializeDailyCapacity = jest.fn();
    const repository = { findNextClosableRewardDay: async () => ({ dayId: acceleratedDayId(at(12600), calendar), startsAt: at(12600) }), findRewardRule: async () => rule, dailyReadiness: async () => ({ unfinishedRuns: 0, missingRewardSources: 0, missingWeeklySources: 0 }), findDaily: async () => null, listDailyRewardSourceLines: async () => [], listCreditContributors: async () => [], listCukieParticipants: async () => [], findPriorWeeklyPoolTranche: async () => null, listDailyAmbassadorSnapshots: async () => ({}), materializeDailyCapacity } as unknown as RewardAccountingRepository;
    const service = new RewardAccountingService(async (work) => work(repository));
    await expect(service.closeNextDaily({ ruleVersion: rule.version, now: at(14550), includePriorWeekly: true })).rejects.toThrow(/sigue pendiente del cierre weekly/);
    expect(materializeDailyCapacity).not.toHaveBeenCalled();
  });

  it('sella dias con IDs diferentes y liga el calendario al hash', () => {
    const seal = (seconds: number) => sealDailyRewardAccounting({ calendar, dayId: acceleratedDayId(at(seconds), calendar), ruleVersion: rule.version, ruleConfigHash: rule.configHash, emissionRaw: '100', buckets: { playersRaw: '0', creditPoolRaw: '0', cukiePoolRaw: '0', ambassadorOrdinaryRaw: '0', weeklyPrizeRaw: '0', ambassadorWeeklyRaw: '0' }, destinations, sealedAt: at(seconds + 1950) });
    expect(seal(0)._id).not.toBe(seal(1800)._id);
    expect(seal(0).payloadHash).toBe(seal(0).payloadHash);
    expect(seal(0).conservationRaw).toBe('100');
    expect(seal(0).calendar).toEqual(calendar);
    expect(() => sealDailyRewardAccounting({ ...seal(0), calendar: undefined })).toThrow(/YYYY-MM-DD/);
  });

  it('conserva siete tramos, bote, entropia real y replay del weekly', () => {
    const schedule = rewardAccountingWeek(periodId, calendar);
    const playedAt = at(60);
    const result: WeeklyGameResult = { wallet: wallet(4), gameId: 'treasure-hunt', scoreRaw: '1000', playedAt, sessionId: 'fast-game', periodAnchorAt: playedAt, settledAt: playedAt, status: 'settled', outcome: 'completed', resultValid: true, resultHash: '1'.repeat(64), creditSnapshot: { source: 'pool', reservationId: 'credit-fast', evidenceHash: '2'.repeat(64) }, cukieSnapshot: { source: 'pool_original', assignmentId: 'cukie-fast', generation: 'original', evidenceHash: '3'.repeat(64) }, ambassadorSnapshot: { walletNormalized: wallet(5), capturedAt: playedAt, evidenceHash: '4'.repeat(64) }, arenaRankingSnapshot: { rank: 5, rewardBps: 6000, sourceRankingId: 'arena-fast', evidenceHash: '5'.repeat(64) } };
    const lotteryEntropy = { chainId: 97 as const, selectionPolicy: 'first_safe_block_at_or_after_cutoff' as const, blockNumber: 100, blockHash: `0x${'ab'.repeat(32)}`, blockTimestamp: at(12828), previousBlockNumber: 99, previousBlockHash: `0x${'cd'.repeat(32)}`, previousBlockTimestamp: at(12824), canonical: true as const, confirmedAt: at(12885) };
    const input = { calendar, periodId, ruleVersion: rule.version, ruleConfigHash: rule.configHash, potRaw: '1000', ambassadorReserveRaw: '50', sourceDailyAccountingIds: schedule.dayIds.map((id) => `reward-daily:${id}`), results: [result], lotteryEntropy, destinations, payoutAt: schedule.payoutAt, sealedAt: lotteryEntropy.confirmedAt };
    const weekly = calculateWeeklyPrize(input);
    expect(calculateWeeklyPrize(input).payloadHash).toBe(weekly.payloadHash);
    expect(weekly.conservationRaw).toBe('1050');
    expect(weekly.poolTrancheSchedule).toHaveLength(7);
    expect(weekly.poolTrancheSchedule[0]).toEqual(at(14550));
    expect(weekly.poolTrancheSchedule[6]).toEqual(at(25350));
    expect(weekly.poolReservations.length).toBeGreaterThan(0);
    for (const reservation of weekly.poolReservations) expect(reservation.tranches.reduce((sum, tranche) => sum + BigInt(tranche.amountRaw), BigInt(0)).toString()).toBe(reservation.amountRaw);
    expect(selectStoredWeeklyPoolTranche(weekly, at(14550))).not.toBeNull();
    expect(() => assertWeeklyPrizeAccountingIntegrity({ ...weekly, calendar: { ...calendar, cycleSeconds: 3600 } })).toThrow();
    expect(() => calculateWeeklyPrize({ ...input, sealedAt: at(12827) })).toThrow(/confirmar/);
    expect(() => calculateWeeklyPrize({ ...input, sourceDailyAccountingIds: input.sourceDailyAccountingIds.slice(0, 6) })).toThrow(/siete/);
  });
});
