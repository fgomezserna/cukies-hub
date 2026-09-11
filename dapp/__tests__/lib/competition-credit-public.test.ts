jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits/public';
import { currentCompetitionCreditPeriod } from '@/lib/uki-economy/credits/rules';
import { testCompetitionCreditRule } from '@/lib/uki-economy/credits/testing';
import type { CreditIntegrityIncident } from '@/lib/uki-economy/credits/types';

const wallet = '0x1111111111111111111111111111111111111111';
const now = new Date('2026-09-07T08:35:37.000Z');

function incident(
  rule: ReturnType<typeof testCompetitionCreditRule>,
  overrides: Partial<CreditIntegrityIncident> = {},
): CreditIntegrityIncident {
  const period = currentCompetitionCreditPeriod(now, rule);
  return {
    _id: 'incident-1',
    incidentId: 'incident-1',
    type: 'credit_reconciliation_mismatch',
    status: 'open',
    runId: 'a'.repeat(64),
    route: 'uki',
    periodId: `${rule.version}:${rule.configHash}:${new Date(period.cutoff.getTime() - 86_400_000).toISOString()}`,
    walletNormalized: null,
    reasonCodes: ['SOURCE_SLOT_HISTORY_CORRECTED'],
    evidenceHash: 'e'.repeat(64),
    containment: 'pool_positions_excluded_by_reward_contributor_selector',
    selectorCutoff: 0,
    planHash: 'c'.repeat(64),
    detectedAt: new Date('2026-09-07T08:00:00.000Z'),
    updatedAt: new Date('2026-09-07T08:00:00.000Z'),
    ...overrides,
  };
}

function freshWatermarks() {
  return [
    {
      _id: 'cukie-master-slots:uki',
      route: 'uki',
      status: 'healthy',
      observedThrough: new Date('2026-09-07T08:30:00.000Z'),
    },
    {
      _id: 'cukie-master-slots:nft',
      route: 'nft',
      status: 'healthy',
      observedThrough: new Date('2026-09-07T08:30:00.000Z'),
    },
  ];
}

function mockCollections(rows: Record<string, unknown[]>) {
  const collections: Record<string, {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
  }> = {};
  const db = {
    collection: jest.fn((name: string) => {
      if (collections[name]) return collections[name];
      const cursor = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(rows[name] ?? []),
      };
      collections[name] = {
        find: jest.fn().mockReturnValue(cursor),
        countDocuments: jest.fn().mockResolvedValue(0),
        findOne: jest.fn().mockResolvedValue(null),
      };
      return collections[name];
    }),
  };
  (getEconomyDb as jest.Mock).mockResolvedValue(db);
  return { db, collections };
}

describe('competition credit public status conflicts', () => {
  it.each([
    { rules: [], reason: 'CREDIT_RULE_MISSING' },
    { rules: [testCompetitionCreditRule(), testCompetitionCreditRule()], reason: 'CREDIT_RULE_OVERLAP' },
  ])('identifies $reason and does not invent a wallet balance', async ({ rules, reason }) => {
    mockCollections({ economy_rule_versions: rules });

    await expect(getCompetitionCreditWalletStatus(wallet, now)).rejects.toMatchObject({
      code: 'CONFLICT', details: { reason },
    });
  });

  it('identifies duplicate pool routes even for a wallet without accounts or slots', async () => {
    mockCollections({
      economy_rule_versions: [testCompetitionCreditRule()],
      competition_credit_pool_periods: [{ route: 'uki' }, { route: 'nft' }, { route: 'uki' }],
    });

    await expect(getCompetitionCreditWalletStatus(wallet, now)).rejects.toMatchObject({
      code: 'CONFLICT', details: { reason: 'CREDIT_PROJECTION_DUPLICATE_ROUTES' },
    });
  });

  it('does not advertise pooled credits while the settlement run is still processing', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_pool_periods: [{
        _id: `pool:${period.periodId}:uki`,
        periodId: period.periodId,
        route: 'uki',
        contributedCredits: 50,
        availableCredits: 50,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }],
      competition_credit_runs: [{
        runId: 'run-processing',
        route: 'uki',
        status: 'processing',
        settlementPeriod: period,
      }],
      competition_credit_pool_lots: [{
        lotId: 'pool-lot-processing',
        bucket: 'pool',
        route: 'uki',
        walletNormalized: null,
        periodId: period.periodId,
        runId: 'run-processing',
        runItemId: 'run-item-processing',
        sourceSlotId: 'slot-processing',
        eligibilityEpoch: 1,
        totalCredits: 50,
        poolDepositedCredits: 0,
        availableCredits: 50,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        expiresAt: new Date('2026-09-07T09:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.pool.availableCredits).toBe(0);
    expect(status.currentRun.routes).toEqual([
      { route: 'uki', status: 'processing' },
      { route: 'nft', status: 'missing' },
    ]);
  });

  it('publishes only usable pool lots from an open settlement run', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_pool_periods: [{
        _id: `pool:${period.periodId}:uki`,
        periodId: period.periodId,
        route: 'uki',
        contributedCredits: 80,
        availableCredits: 80,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }],
      competition_credit_runs: [{
        runId: 'run-open',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_pool_lots: [
        {
          lotId: 'pool-lot-open',
          bucket: 'pool',
          route: 'uki',
          walletNormalized: null,
          periodId: period.periodId,
          runId: 'run-open',
          runItemId: 'run-item-open',
          sourceSlotId: 'slot-open',
          eligibilityEpoch: 1,
          totalCredits: 50,
          poolDepositedCredits: 0,
          availableCredits: 50,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: false,
          expiresAt: new Date('2026-09-07T09:00:00.000Z'),
        },
        {
          lotId: 'pool-lot-blocked',
          bucket: 'pool',
          route: 'uki',
          walletNormalized: null,
          periodId: period.periodId,
          runId: 'run-open',
          runItemId: 'run-item-blocked',
          sourceSlotId: 'slot-blocked',
          eligibilityEpoch: 1,
          totalCredits: 20,
          poolDepositedCredits: 0,
          availableCredits: 20,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: true,
          expiresAt: new Date('2026-09-07T09:00:00.000Z'),
        },
        {
          lotId: 'pool-lot-expired',
          bucket: 'pool',
          route: 'uki',
          walletNormalized: null,
          periodId: period.periodId,
          runId: 'run-open',
          runItemId: 'run-item-expired',
          sourceSlotId: 'slot-expired',
          eligibilityEpoch: 1,
          totalCredits: 10,
          poolDepositedCredits: 0,
          availableCredits: 10,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: false,
          expiresAt: new Date('2026-09-07T08:00:00.000Z'),
        },
      ],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.pool.availableCredits).toBe(0);
    expect(status.routes.uki.pool.availableCredits).toBe(0);
    expect(status.routes.uki.pool.materialization).toEqual({ state: 'blocked' });
    expect(status.currentRun.routes[0]).toEqual({ route: 'uki', status: 'open' });
  });

  it('derives a usable pool lot even when its pool projection is absent', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_runs: [{
        runId: 'run-open-without-pool-projection',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_pool_lots: [{
        _id: 'pool-lot-without-projection',
        lotId: 'pool-lot-without-projection',
        bucket: 'pool',
        route: 'uki',
        walletNormalized: null,
        periodId: period.periodId,
        runId: 'run-open-without-pool-projection',
        runItemId: 'run-item-without-pool-projection',
        sourceSlotId: 'slot-without-pool-projection',
        eligibilityEpoch: 1,
        totalCredits: 40,
        poolDepositedCredits: 0,
        availableCredits: 40,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        expiresAt: new Date('2026-09-07T09:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.pool.availableCredits).toBe(40);
    expect(status.routes.uki.pool.availableCredits).toBe(40);
    expect(status.routes.uki.pool.reservedCredits).toBe(0);
    expect(status.pool.reservedCredits).toBe(0);
  });

  it('derives a usable own lot even when its account projection is absent', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_runs: [{
        runId: 'run-open-without-account-projection',
        route: 'uki',
        status: 'open_with_holds',
        settlementPeriod: period,
      }],
      competition_credit_lots: [{
        _id: 'own-lot-without-projection',
        lotId: 'own-lot-without-projection',
        bucket: 'own',
        route: 'uki',
        walletNormalized: wallet,
        periodId: period.periodId,
        runId: 'run-open-without-account-projection',
        runItemId: 'run-item-without-account-projection',
        sourceSlotId: 'slot-without-account-projection',
        eligibilityEpoch: 1,
        totalCredits: 30,
        poolDepositedCredits: 0,
        availableCredits: 30,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        expiresAt: new Date('2026-09-07T09:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.balance.availableCredits).toBe(30);
    expect(status.routes.uki.balance.availableCredits).toBe(30);
    expect(status.routes.uki.balance.grantedCredits).toBe(30);
    expect(status.routes.uki.balance.poolDepositedCredits).toBe(0);
    expect(status.routes.uki.balance.reservedCredits).toBe(0);
    expect(status.routes.uki.balance.spentCredits).toBe(0);
    expect(status.routes.uki.balance.expiredCredits).toBe(0);
    expect(status.balance.spentCredits).toBe(0);
    expect(status.currentRun.routes[0]).toEqual({ route: 'uki', status: 'open_with_holds' });
  });

  it('fails closed when an absent account projection has a blocked historical lot', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_runs: [{
        runId: 'run-open-account-blocked-history',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_lots: [
        {
          _id: 'own-lot-valid',
          lotId: 'own-lot-valid',
          bucket: 'own',
          route: 'uki',
          walletNormalized: wallet,
          periodId: period.periodId,
          runId: 'run-open-account-blocked-history',
          runItemId: 'item-valid',
          sourceSlotId: 'slot-valid',
          eligibilityEpoch: 1,
          totalCredits: 30,
          poolDepositedCredits: 0,
          availableCredits: 30,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: false,
          expiresAt: new Date('2026-09-07T09:00:00.000Z'),
        },
        {
          _id: 'own-lot-blocked-history',
          lotId: 'own-lot-blocked-history',
          bucket: 'own',
          route: 'uki',
          walletNormalized: wallet,
          periodId: period.periodId,
          runId: 'run-closed-account-blocked-history',
          runItemId: 'item-blocked',
          sourceSlotId: 'slot-blocked',
          eligibilityEpoch: 1,
          totalCredits: 20,
          poolDepositedCredits: 0,
          availableCredits: 20,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: true,
          expiresAt: new Date('2026-09-06T09:00:00.000Z'),
        },
      ],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.balance.materialization).toEqual({ state: 'blocked' });
    expect(status.routes.uki.balance.availableCredits).toBe(0);
    expect(status.balance.availableCredits).toBe(0);
  });

  it('keeps a missing blocked flag as unknown instead of treating it as an available lot', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_runs: [{
        runId: 'run-open-account-unknown-lot',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_lots: [{
        _id: 'own-lot-unknown-blocked',
        lotId: 'own-lot-unknown-blocked',
        bucket: 'own',
        route: 'uki',
        walletNormalized: wallet,
        periodId: period.periodId,
        runId: 'run-open-account-unknown-lot',
        runItemId: 'item-unknown',
        sourceSlotId: 'slot-unknown',
        eligibilityEpoch: 1,
        totalCredits: 30,
        poolDepositedCredits: 0,
        availableCredits: 30,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        expiresAt: new Date('2026-09-07T09:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.balance.materialization).toEqual({ state: 'unknown' });
    expect(status.routes.uki.balance.availableCredits).toBe(0);
    expect(status.balance.materialization).toEqual({ state: 'unknown' });
  });

  it('fails closed when historical lots exceed the public reconciliation limit', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    const lots = Array.from({ length: 5_001 }, (_, index) => ({
      _id: `own-lot-${index}`,
      lotId: `own-lot-${index}`,
      bucket: 'own',
      route: 'uki',
      walletNormalized: wallet,
      periodId: period.periodId,
      runId: 'run-open-too-many-lots',
      runItemId: `item-${index}`,
      sourceSlotId: `slot-${index}`,
      eligibilityEpoch: 1,
      totalCredits: 1,
      poolDepositedCredits: 0,
      availableCredits: 1,
      reservedCredits: 0,
      spentCredits: 0,
      expiredCredits: 0,
      blocked: false,
      expiresAt: new Date('2026-09-07T09:00:00.000Z'),
    }));
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_runs: [{
        runId: 'run-open-too-many-lots',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_lots: lots,
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.balance.materialization).toEqual({ state: 'too_large' });
    expect(status.routes.uki.balance.availableCredits).toBe(0);
    expect(status.balance.availableCredits).toBe(0);
  });

  it('does not announce a stale pool projection even when its lot is usable', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_pool_periods: [{
        _id: `pool:${period.periodId}:uki`,
        periodId: period.periodId,
        route: 'uki',
        contributedCredits: 100,
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }],
      competition_credit_runs: [{
        runId: 'run-open-stale-pool-projection',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_pool_lots: [{
        _id: 'pool-lot-stale-projection',
        lotId: 'pool-lot-stale-projection',
        bucket: 'pool',
        route: 'uki',
        walletNormalized: null,
        periodId: period.periodId,
        runId: 'run-open-stale-pool-projection',
        runItemId: 'item-stale-projection',
        sourceSlotId: 'slot-stale-projection',
        eligibilityEpoch: 1,
        totalCredits: 100,
        poolDepositedCredits: 0,
        availableCredits: 90,
        reservedCredits: 10,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        expiresAt: new Date('2026-09-07T09:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.pool.materialization).toEqual({ state: 'stale' });
    expect(status.routes.uki.pool.availableCredits).toBe(0);
    expect(status.routes.uki.pool.reservedCredits).toBe(0);
    expect(status.pool.availableCredits).toBe(0);
  });

  it('does not announce a stale account projection even when its own lot is usable', async () => {
    const rule = testCompetitionCreditRule();
    const period = currentCompetitionCreditPeriod(now, rule);
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_account_periods: [{
        _id: `${wallet}:${period.periodId}:uki`,
        walletNormalized: wallet,
        periodId: period.periodId,
        route: 'uki',
        grantedCredits: 100,
        poolDepositedCredits: 0,
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }],
      competition_credit_runs: [{
        runId: 'run-open-stale-account-projection',
        route: 'uki',
        status: 'open',
        settlementPeriod: period,
      }],
      competition_credit_lots: [{
        _id: 'own-lot-stale-projection',
        lotId: 'own-lot-stale-projection',
        bucket: 'own',
        route: 'uki',
        walletNormalized: wallet,
        periodId: period.periodId,
        runId: 'run-open-stale-account-projection',
        runItemId: 'item-stale-account-projection',
        sourceSlotId: 'slot-stale-account-projection',
        eligibilityEpoch: 1,
        totalCredits: 100,
        poolDepositedCredits: 0,
        availableCredits: 90,
        reservedCredits: 10,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        expiresAt: new Date('2026-09-07T09:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.balance.materialization).toEqual({ state: 'stale' });
    expect(status.routes.uki.balance.grantedCredits).toBe(100);
    expect(status.routes.uki.balance.availableCredits).toBe(0);
    expect(status.routes.uki.balance.reservedCredits).toBe(0);
    expect(status.balance.availableCredits).toBe(0);
  });

  it('does not report stale source watermarks as current grant eligibility', async () => {
    mockCollections({
      economy_rule_versions: [testCompetitionCreditRule()],
      competition_credit_source_watermarks: [
        {
          _id: 'cukie-master-slots:uki',
          route: 'uki',
          status: 'healthy',
          observedThrough: new Date('2026-09-07T08:00:00.000Z'),
        },
        {
          _id: 'cukie-master-slots:nft',
          route: 'nft',
          status: 'healthy',
          observedThrough: new Date('2026-09-07T08:00:00.000Z'),
        },
      ],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.grants).toMatchObject({ healthy: false, openIncidents: 0 });
    expect(status.routes.nft.grants).toMatchObject({ healthy: false, openIncidents: 0 });
    expect(status.grants.healthy).toBe(false);
  });

  it('exposes the maturity timestamp and first eligible cutoff for qualifying slots', async () => {
    const eligibleFrom = new Date('2026-09-07T09:00:00.000Z');
    mockCollections({
      economy_rule_versions: [testCompetitionCreditRule()],
      cukie_master_slots: [{
        _id: 'uki-slot-1',
        walletNormalized: wallet,
        route: 'uki',
        ordinal: 1,
        eligibilityEpoch: 1,
        status: 'qualifying',
        qualifiedSince: new Date('2026-09-07T08:00:00.000Z'),
        creditEligibleFrom: eligibleFrom,
        roundId: 'uki-round-v1',
        ruleVersion: 'cukie-master-v1',
        sourceHash: 'c'.repeat(64),
        sourceBlockNumber: 100,
        sourceBlockHash: `0x${'f'.repeat(64)}`,
        sourceBlockTimestamp: new Date('2026-09-07T08:00:00.000Z'),
        revision: 1,
        createdAt: new Date('2026-09-07T08:00:00.000Z'),
        updatedAt: new Date('2026-09-07T08:00:00.000Z'),
      }],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.configurations).toEqual([
      expect.objectContaining({
        slotId: 'uki-slot-1',
        status: 'qualifying',
        creditEligibleFrom: eligibleFrom,
        firstEligibleCutoff: new Date('2026-09-07T12:00:00.000Z'),
      }),
    ]);
  });

  it('contains a valid historical incident when both source watermarks are fresh', async () => {
    const rule = testCompetitionCreditRule();
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_source_watermarks: freshWatermarks(),
      competition_credit_incidents: [incident(rule)],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.grants).toMatchObject({ healthy: true, openIncidents: 0 });
    expect(status.grants).toMatchObject({ healthy: true, openIncidents: 0 });
  });

  const blockingIncidentCases: Array<[
    string,
    (rule: ReturnType<typeof testCompetitionCreditRule>) => string | undefined,
  ]> = [
    ['same cutoff', (rule: ReturnType<typeof testCompetitionCreditRule>) => currentCompetitionCreditPeriod(now, rule).periodId],
    ['future cutoff', (rule: ReturnType<typeof testCompetitionCreditRule>) => {
      const period = currentCompetitionCreditPeriod(now, rule);
      return `${rule.version}:${rule.configHash}:${new Date(period.cutoff.getTime() + 86_400_000).toISOString()}`;
    }],
    ['normal reason', () => undefined],
    ['mixed reasons', () => undefined],
    ['malformed period', () => 'malformed-period'],
  ];

  it.each(blockingIncidentCases)('keeps %s incidents blocking grants', async (label, periodId) => {
    const rule = testCompetitionCreditRule();
    const overrides: Partial<CreditIntegrityIncident> = {
      periodId: periodId(rule) ?? incident(rule).periodId,
      ...(label === 'normal reason' ? { reasonCodes: ['RUNTIME_RUN_INVALID'] } : {}),
      ...(label === 'mixed reasons' ? { reasonCodes: ['SOURCE_SLOT_HISTORY_CORRECTED', 'RUNTIME_RUN_INVALID'] } : {}),
    };
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_source_watermarks: freshWatermarks(),
      competition_credit_incidents: [incident(rule, overrides)],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.grants).toMatchObject({ healthy: false, openIncidents: 1 });
    expect(status.grants.healthy).toBe(false);
    expect(status.balance.blocked).toBe(true);
  });

  it('applies wallet/global route filters while keeping route status independent', async () => {
    const rule = testCompetitionCreditRule();
    const { collections } = mockCollections({
      economy_rule_versions: [rule],
      competition_credit_source_watermarks: freshWatermarks(),
      competition_credit_incidents: [
        incident(rule, {
          _id: 'incident-2',
          incidentId: 'incident-2',
          route: 'nft',
          walletNormalized: wallet,
          reasonCodes: ['RUNTIME_RUN_INVALID'],
        }),
      ],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    const find = collections.competition_credit_incidents.find;
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledWith({
      status: 'open',
      route: 'uki',
      $or: [{ walletNormalized: wallet }, { walletNormalized: null }],
    }, expect.objectContaining({ projection: expect.any(Object) }));
    expect(find).toHaveBeenCalledWith({
      status: 'open',
      route: 'nft',
      $or: [{ walletNormalized: wallet }, { walletNormalized: null }],
    }, expect.objectContaining({ projection: expect.any(Object) }));
    expect(status.routes.uki.grants).toMatchObject({ healthy: true, openIncidents: 0 });
    expect(status.routes.nft.grants).toMatchObject({ healthy: false, openIncidents: 1 });
  });

  it('blocks public availability for an open incident without a recognized route', async () => {
    const rule = testCompetitionCreditRule();
    const { db, collections } = mockCollections({
      economy_rule_versions: [rule],
      competition_credit_source_watermarks: freshWatermarks(),
    });
    db.collection('competition_credit_incidents');
    collections.competition_credit_incidents.countDocuments.mockImplementation(
      (filter: Record<string, unknown>) => filter.$and ? 1 : 0,
    );

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.balance.blocked).toBe(true);
    expect(status.grants).toMatchObject({ healthy: false, openIncidents: 1 });
  });

  it('blocks public availability when an account in another period is blocked', async () => {
    const rule = testCompetitionCreditRule();
    const { db, collections } = mockCollections({
      economy_rule_versions: [rule],
      competition_credit_source_watermarks: freshWatermarks(),
    });
    db.collection('competition_credit_account_periods');
    collections.competition_credit_account_periods.countDocuments.mockImplementation(
      (filter: Record<string, unknown>) => filter.blocked === true ? 1 : 0,
    );

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.balance.blocked).toBe(true);
    expect(status.grants).toMatchObject({ healthy: true, openIncidents: 0 });
  });

  it('keeps a contained incident blocked when its source watermark is stale', async () => {
    const rule = testCompetitionCreditRule();
    const stale = freshWatermarks().map((watermark) => ({
      ...watermark,
      observedThrough: new Date('2026-09-07T08:00:00.000Z'),
    }));
    mockCollections({
      economy_rule_versions: [rule],
      competition_credit_source_watermarks: stale,
      competition_credit_incidents: [incident(rule)],
    });

    const status = await getCompetitionCreditWalletStatus(wallet, now);

    expect(status.routes.uki.grants).toMatchObject({ healthy: false, openIncidents: 0 });
    expect(status.grants.healthy).toBe(false);
  });
});
