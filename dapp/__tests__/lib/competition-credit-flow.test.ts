import { createCompetitionCreditService } from "@/lib/uki-economy/credits/service";
import { reconcileCompetitionCreditSnapshot } from "@/lib/uki-economy/credits/reconciliation";
import {
  buildCreditSourceSlotsHash,
  safeCompetitionCreditPeriodScopeId,
  stableCreditHash,
} from "@/lib/uki-economy/credits/rules";
import {
  createMemoryCompetitionCreditRunner,
  MemoryCompetitionCreditRepository,
  testCompetitionCreditRule,
  testCreditSourceWatermark,
} from "@/lib/uki-economy/credits/testing";
import type {
  CompetitionCreditRun,
  CreditLot,
  CreditSnapshotSlot,
} from "@/lib/uki-economy/credits/types";

const WALLET = `0x${"1".repeat(40)}`;
const BORROWER = `0x${"2".repeat(40)}`;
const CUTOFF = new Date("2026-07-10T12:00:00.000Z");

function slot(overrides: Partial<CreditSnapshotSlot> = {}): CreditSnapshotSlot {
  return {
    _id: "uki-slot-1",
    walletNormalized: WALLET,
    route: "uki",
    ordinal: 1,
    eligibilityEpoch: 1,
    status: "active",
    qualifiedSince: new Date("2026-07-09T12:00:00.000Z"),
    creditEligibleFrom: CUTOFF,
    roundId: "uki-round-v1",
    ruleVersion: "cukie-master-v1",
    sourceHash: "c".repeat(64),
    revision: 1,
    createdAt: new Date("2026-07-09T12:00:00.000Z"),
    updatedAt: CUTOFF,
    ...overrides,
  } as CreditSnapshotSlot;
}

async function openDailyRun(input: {
  repository: MemoryCompetitionCreditRepository;
  service: ReturnType<typeof createCompetitionCreditService>;
  route?: "uki" | "nft";
  cutoff?: Date;
  now?: Date;
}) {
  const route = input.route ?? "uki";
  const cutoff = input.cutoff ?? CUTOFF;
  const now = input.now ?? new Date(cutoff.getTime() + 60_000);
  const run = await input.service.createDailyRun({
    route,
    cutoff,
    expectedRuleVersion: "credits-v1",
    now,
  });
  const claimed = await input.service.claimRun({
    runId: run.runId,
    workerId: "worker-1",
    now: new Date(now.getTime() + 1_000),
  });
  await input.service.processRunBatch({
    runId: run.runId,
    workerId: "worker-1",
    fenceToken: claimed.fenceToken,
    now: new Date(now.getTime() + 2_000),
  });
  const opened = await input.service.openRun({
    runId: run.runId,
    workerId: "worker-1",
    fenceToken: claimed.fenceToken,
    now: new Date(now.getTime() + 3_000),
  });
  expect(opened.run.status).toBe("open");
  return opened.run;
}

function replaceWithFragmentedLots(input: {
  repository: MemoryCompetitionCreditRepository;
  run: CompetitionCreditRun;
  bucket: CreditLot["bucket"];
  count: number;
  walletNormalized?: string;
}) {
  const source =
    input.bucket === "own"
      ? input.repository.state.ownLots
      : input.repository.state.poolLots;
  const template = source.find((lot) => lot.runId === input.run.runId);
  if (!template) throw new Error(`Missing ${input.bucket} lot template`);
  const walletNormalized = input.walletNormalized ?? template.walletNormalized;
  const lots = Array.from({ length: input.count }, (_, index): CreditLot => {
    const lotId = stableCreditHash({
      kind: "fragmented-credit-test-lot",
      bucket: input.bucket,
      runId: input.run.runId,
      index,
    });
    return {
      ...template,
      _id: lotId,
      lotId,
      walletNormalized: input.bucket === "own" ? walletNormalized : null,
      runItemId: `${template.runItemId}:fragment:${index}`,
      sourceSlotId: `${template.sourceSlotId}:fragment:${index}`,
      eligibilityEpoch: index + 1,
      totalCredits: 1,
      poolDepositedCredits: 0,
      availableCredits: 1,
      reservedCredits: 0,
      spentCredits: 0,
      expiredCredits: 0,
      revision: 0,
    };
  });
  if (input.bucket === "own") {
    input.repository.state.ownLots = lots;
    const account = input.repository.state.accounts.find(
      (item) =>
        item.walletNormalized === walletNormalized &&
        item.periodId === input.run.period.periodId
    );
    if (!account) throw new Error("Missing own account template");
    Object.assign(account, {
      grantedCredits: input.count,
      poolDepositedCredits: 0,
      availableCredits: input.count,
      reservedCredits: 0,
      spentCredits: 0,
      expiredCredits: 0,
    });
  } else {
    input.repository.state.poolLots = lots;
    const pool = input.repository.state.poolPeriods.find(
      (item) => item.periodId === input.run.period.periodId
    );
    if (!pool) throw new Error("Missing pool period template");
    Object.assign(pool, {
      contributedCredits: input.count,
      availableCredits: input.count,
      reservedCredits: 0,
      spentCredits: 0,
      expiredCredits: 0,
    });
  }
  return lots;
}

describe("competition credit grant -> pool -> reservation flow", () => {
  it('grants 100 per slot every 30 minutes, expires only unused credits and preserves a real reservation across the cutoff', async () => {
    const at = (seconds: number) => new Date(CUTOFF.getTime() + seconds * 1000);
    const calendar = { version: 'cycle-v1' as const, chainId: 97 as const, cycleSeconds: 1800 as const, anchorAt: CUTOFF.toISOString() };
    const rule = testCompetitionCreditRule({ calendar, expectedBscChainId: 97, activeFrom: CUTOFF, cutoffHourUtc: 12, settlementHourUtc: 12 });
    const sourceSlot = slot();
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [sourceSlot],
      watermark: testCreditSourceWatermark({ observedThrough: CUTOFF, updatedAt: CUTOFF, sourceHash: buildCreditSourceSlotsHash([sourceSlot]), slotCount: 1 }),
    });
    const service = createCompetitionCreditService(createMemoryCompetitionCreditRunner(repository));
    const first = await openDailyRun({ repository, service, cutoff: CUTOFF, now: at(60) });
    expect(first.expectedGrantCredits).toBe(100);
    expect(first.period.calendar).toEqual(calendar);
    expect(first.period.nextCutoff).toEqual(at(1800));
    const spent = await service.reserve({ walletAddress: WALLET, sessionId: 'fast-spent', costCode: 'treasure-hunt:start', idempotencyKey: 'fast-spent-reserve', now: at(120) });
    await service.consumeReservation({ reservationId: spent.reservationId, idempotencyKey: 'fast-spent-consume', committedAt: at(121), now: at(122) });
    expect(repository.state.ownLots[0]).toMatchObject({ availableCredits: 90, spentCredits: 10 });
    const crossing = await service.reserve({ walletAddress: WALLET, sessionId: 'fast-cross-cutoff', costCode: 'treasure-hunt:start', idempotencyKey: 'fast-cross-reserve', now: at(1799) });
    expect(crossing.periodId).toBe(first.period.periodId);
    expect(crossing.expiresAt).toEqual(at(2399));
    await expect(service.expireAvailableLotsBatch({ now: at(1799) })).resolves.toMatchObject({ expired: 0 });
    await expect(service.expireAvailableLotsBatch({ now: at(1800) })).resolves.toMatchObject({ expired: 1 });
    expect(repository.state.ownLots[0]).toMatchObject({ availableCredits: 0, reservedCredits: 10, spentCredits: 10, expiredCredits: 80, expiresAt: at(1800) });
    await expect(service.expireAvailableLotsBatch({ now: at(1800) })).resolves.toMatchObject({ expired: 0 });

    repository.state.sourceHealth.observedThrough = at(1800);
    repository.state.sourceHealth.checkedAt = at(1800);
    await service.refreshSourceWatermark({ route: 'uki', expectedRuleVersion: rule.version, now: at(1800) });
    const second = await openDailyRun({ repository, service, cutoff: at(1800), now: at(1801) });
    expect(second.expectedGrantCredits).toBe(100);
    expect(second.period.periodId).not.toBe(first.period.periodId);
    expect(second.period.nextCutoff).toEqual(at(3600));
    const consumed = await service.consumeReservation({ reservationId: crossing.reservationId, idempotencyKey: 'fast-cross-consume', committedAt: at(1860), now: at(1861) });
    expect(consumed).toMatchObject({ status: 'consumed', periodId: first.period.periodId });
    expect(repository.state.ownLots.find((lot) => lot.runId === first.runId)).toMatchObject({ availableCredits: 0, reservedCredits: 0, spentCredits: 20, expiredCredits: 80 });
    expect(repository.state.ownLots.find((lot) => lot.runId === second.runId)).toMatchObject({ availableCredits: 100, reservedCredits: 0, spentCredits: 0, expiredCredits: 0 });
    await expect(service.createDailyRun({ cutoff: at(1800), expectedRuleVersion: rule.version, now: at(1862) })).resolves.toMatchObject({ runId: second.runId, status: 'open' });
    await expect(service.consumeReservation({ reservationId: crossing.reservationId, idempotencyKey: 'fast-cross-consume', committedAt: at(1860), now: at(1863) })).resolves.toMatchObject({ status: 'consumed' });
    expect(repository.state.runs).toHaveLength(2);
    expect(repository.state.ownLots).toHaveLength(2);
    expect(repository.state.ledger.filter((entry) => entry.operation === 'grant')).toHaveLength(2);
    expect(repository.state.ledger.filter((entry) => entry.operation === 'expire')).toHaveLength(1);
    expect(new Set(repository.state.ledger.map((entry) => entry._id)).size).toBe(repository.state.ledger.length);
    expect(repository.state.incidents).toEqual([]);
  });

  it("grants every eligible UKI and NFT slot exactly once for a 5+5 Cukie Master", async () => {
    const stagingCutoff = new Date("2026-07-10T14:00:00.000Z");
    const maximumWalletSlots = (["uki", "nft"] as const).flatMap((route) =>
      Array.from({ length: 5 }, (_, index) =>
        slot({
          _id: `${route}-max-wallet-${index + 1}`,
          walletNormalized: WALLET,
          route,
          ordinal: index + 1,
        })
      )
    );
    const secondWalletSlots = (["uki", "nft"] as const).map((route) =>
      slot({
        _id: `${route}-second-wallet-1`,
        walletNormalized: BORROWER,
        route,
        ordinal: 1,
      })
    );
    const repository = new MemoryCompetitionCreditRepository({
      rule: testCompetitionCreditRule({
        cutoffHourUtc: 14,
        settlementHourUtc: 16,
        expectedBscChainId: 97,
      }),
      slots: [...maximumWalletSlots, ...secondWalletSlots],
    });
    repository.state.sourceHealth.observedThrough = stagingCutoff;
    repository.state.sourceHealth.checkedAt = stagingCutoff;
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );

    const openedRuns: CompetitionCreditRun[] = [];
    for (const [index, route] of (["uki", "nft"] as const).entries()) {
      const refreshAt = new Date(stagingCutoff.getTime() + index * 10_000);
      await service.refreshSourceWatermark({
        route,
        expectedRuleVersion: "credits-v1",
        now: refreshAt,
      });
      const run = await openDailyRun({
        repository,
        service,
        route,
        cutoff: stagingCutoff,
        now: new Date(refreshAt.getTime() + 1_000),
      });
      expect(run).toMatchObject({
        route,
        expectedItemCount: 6,
        expectedGrantCredits: 600,
        expectedOwnCredits: 600,
        expectedPoolCredits: 0,
      });
      openedRuns.push(run);
    }

    expect(repository.state.runs).toHaveLength(2);
    expect(repository.state.items).toHaveLength(12);
    expect(repository.state.ownLots).toHaveLength(12);
    expect(
      repository.state.ledger.filter((entry) => entry.operation === "grant")
    ).toHaveLength(12);
    expect(
      new Set(repository.state.ledger.map((entry) => entry._id)).size
    ).toBe(repository.state.ledger.length);
    expect(repository.state.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          walletNormalized: WALLET.toLowerCase(),
          route: "uki",
          grantedCredits: 500,
          availableCredits: 500,
        }),
        expect.objectContaining({
          walletNormalized: WALLET.toLowerCase(),
          route: "nft",
          grantedCredits: 500,
          availableCredits: 500,
        }),
        expect.objectContaining({
          walletNormalized: BORROWER.toLowerCase(),
          route: "uki",
          grantedCredits: 100,
          availableCredits: 100,
        }),
        expect.objectContaining({
          walletNormalized: BORROWER.toLowerCase(),
          route: "nft",
          grantedCredits: 100,
          availableCredits: 100,
        }),
      ])
    );

    for (const run of openedRuns) {
      const replay = await service.createDailyRun({
        route: run.route,
        cutoff: stagingCutoff,
        expectedRuleVersion: "credits-v1",
        now: new Date(stagingCutoff.getTime() + 60_000),
      });
      expect(replay.runId).toBe(run.runId);
    }
    expect(repository.state.runs).toHaveLength(2);
    expect(repository.state.items).toHaveLength(12);
    expect(
      repository.state.ledger.filter((entry) => entry.operation === "grant")
    ).toHaveLength(12);
  });

  it("does not replay a rule marked unrecoverable by the schema migration", async () => {
    const legacyRule = testCompetitionCreditRule({
      _id: "competition-credits:legacy",
      version: "credits-legacy",
      activeFrom: new Date("2026-08-10T00:00:00.000Z"),
      activeUntil: new Date("2026-08-21T14:00:00.000Z"),
      supersededByVersion: "credits-v3",
      supersededReason: "unrecoverable_pre_migration",
    });
    const currentRule = testCompetitionCreditRule({
      _id: "competition-credits:v3",
      version: "credits-v3",
      activeFrom: new Date("2026-08-21T14:00:00.000Z"),
      cutoffHourUtc: 14,
      settlementHourUtc: 16,
    });
    const repository = new MemoryCompetitionCreditRepository({ rule: currentRule });
    repository.state.rules = [legacyRule, currentRule];
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );

    await expect(service.findOldestPendingRoutePeriod({
      route: "uki",
      rule: currentRule,
      now: new Date("2026-08-20T18:00:00.000Z"),
    })).resolves.toBeNull();
  });

  it("includes a pre-cutoff chain event even when its slot projection is processed afterwards", async () => {
    const delayedSlot = slot({
      sourceBlockNumber: 998,
      sourceBlockHash: `0x${"a".repeat(64)}`,
      sourceBlockTimestamp: new Date("2026-07-10T11:59:59.000Z"),
      createdAt: new Date("2026-07-10T12:03:00.000Z"),
      updatedAt: new Date("2026-07-10T12:03:00.000Z"),
    });
    const repository = new MemoryCompetitionCreditRepository({
      slots: [delayedSlot],
      watermark: testCreditSourceWatermark({
        observedThrough: new Date("2026-07-10T12:05:00.000Z"),
        updatedAt: new Date("2026-07-10T12:05:00.000Z"),
        sourceHash: buildCreditSourceSlotsHash([delayedSlot]),
        slotCount: 1,
      }),
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );

    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });

    expect(run.expectedItemCount).toBe(1);
    expect(repository.state.items[0]?.slotId).toBe(delayedSlot._id);
  });

  it("excludes a slot whose effective chain event is after the cutoff", async () => {
    const laterSlot = slot({
      sourceBlockNumber: 1_000,
      sourceBlockHash: `0x${"b".repeat(64)}`,
      sourceBlockTimestamp: new Date("2026-07-10T12:00:01.000Z"),
      createdAt: new Date("2026-07-10T12:01:00.000Z"),
      updatedAt: new Date("2026-07-10T12:01:00.000Z"),
    });
    const repository = new MemoryCompetitionCreditRepository({
      slots: [laterSlot],
      watermark: testCreditSourceWatermark({
        observedThrough: new Date("2026-07-10T12:05:00.000Z"),
        updatedAt: new Date("2026-07-10T12:05:00.000Z"),
        sourceHash: buildCreditSourceSlotsHash([laterSlot]),
        slotCount: 1,
      }),
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );

    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });

    expect(run.expectedItemCount).toBe(0);
    expect(repository.state.items).toHaveLength(0);
  });

  it("keeps the original period on a game reserved just before cutoff and lets its TTL cross it", async () => {
    const cutoff = new Date("2026-07-10T14:00:00.000Z");
    const rule = testCompetitionCreditRule({
      cutoffHourUtc: 14,
      settlementHourUtc: 16,
    });
    const sourceSlot = slot({ creditEligibleFrom: cutoff, updatedAt: cutoff });
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [sourceSlot],
      watermark: testCreditSourceWatermark({
        observedThrough: cutoff,
        updatedAt: cutoff,
        sourceHash: buildCreditSourceSlotsHash([sourceSlot]),
        slotCount: 1,
      }),
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({
      repository,
      service,
      cutoff,
      now: new Date("2026-07-10T16:01:00.000Z"),
    });
    const reservedAt = new Date("2026-07-11T13:59:00.000Z");
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "cross-cutoff-session",
      costCode: "treasure-hunt:start",
      idempotencyKey: "cross-cutoff-reserve",
      now: reservedAt,
    });
    expect(reservation.periodId).toBe(run.period.periodId);
    expect(reservation.expiresAt).toEqual(
      new Date("2026-07-11T14:09:00.000Z")
    );
    await service.expireAvailableLotsBatch({
      now: new Date("2026-07-11T14:00:00.000Z"),
    });
    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 0,
      reservedCredits: 10,
      expiredCredits: 90,
    });
    const consumed = await service.consumeReservation({
      reservationId: reservation.reservationId,
      idempotencyKey: "cross-cutoff-consume",
      committedAt: new Date("2026-07-11T14:04:00.000Z"),
      now: new Date("2026-07-11T14:05:00.000Z"),
    });
    expect(consumed.status).toBe("consumed");
    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 0,
      reservedCredits: 0,
      spentCredits: 10,
      expiredCredits: 90,
      expiresAt: new Date("2026-07-11T14:00:00.000Z"),
    });
  });

  it("keeps grants unusable until the immutable run is complete and open", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const runner = createMemoryCompetitionCreditRunner(repository);
    const service = createCompetitionCreditService(runner);
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 40,
      idempotencyKey: "pool-config-1",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:00.000Z"),
    });
    const claimed = await service.claimRun({
      runId: run.runId,
      workerId: "worker-1",
      now: new Date("2026-07-10T12:02:00.000Z"),
    });
    await service.processRunBatch({
      runId: run.runId,
      workerId: "worker-1",
      fenceToken: claimed.fenceToken,
      now: new Date("2026-07-10T12:03:00.000Z"),
    });
    await expect(
      service.reserve({
        walletAddress: WALLET,
        sessionId: "session-before-open",
        costCode: "treasure-hunt:start",
        idempotencyKey: "reserve-before-open",
        now: new Date("2026-07-10T12:03:10.000Z"),
      })
    ).rejects.toThrow(/No hay creditos/);
    const opened = await service.openRun({
      runId: run.runId,
      workerId: "worker-1",
      fenceToken: claimed.fenceToken,
      now: new Date("2026-07-10T12:04:00.000Z"),
    });
    expect(opened.reconciliation.ok).toBe(true);
    expect(repository.state.ownLots[0]).toMatchObject({
      totalCredits: 100,
      poolDepositedCredits: 40,
      availableCredits: 60,
    });
    expect(repository.state.poolLots[0].totalCredits).toBe(40);
    expect(repository.state.poolPositions[0].credits).toBe(40);
  });

  it("reserves full pool when own balance is partial; it never mixes buckets", async () => {
    const rule = testCompetitionCreditRule({
      costs: [{ costCode: "treasure-hunt:start", credits: 15, active: true }],
    });
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 90,
      idempotencyKey: "pool-config-90",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    await openDailyRun({ repository, service });
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "session-pool-fallback",
      costCode: "treasure-hunt:start",
      idempotencyKey: "reserve-pool-fallback",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    expect(reservation.bucket).toBe("pool");
    expect(reservation.amountCredits).toBe(15);
    expect(repository.state.ownLots[0].availableCredits).toBe(10);
    expect(repository.state.poolLots[0]).toMatchObject({
      availableCredits: 75,
      reservedCredits: 15,
    });
  });

  it("paginates the maximum 1,000 fragmented own lots without a false insufficient result", async () => {
    const rule = testCompetitionCreditRule({
      costs: [{ costCode: "fragmented-own", credits: 1_000, active: true }],
    });
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    replaceWithFragmentedLots({
      repository,
      run,
      bucket: "own",
      count: 1_000,
      walletNormalized: WALLET,
    });

    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "fragmented-own-session",
      costCode: "fragmented-own",
      idempotencyKey: "fragmented-own-reserve",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    expect(reservation.bucket).toBe("own");
    expect(reservation.allocations).toHaveLength(1_000);
    expect(repository.state.ownLots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availableCredits: 0, reservedCredits: 1 }),
      ])
    );
    expect(
      repository.state.ownLots.reduce(
        (total, lot) => total + lot.reservedCredits,
        0
      )
    ).toBe(1_000);
    const consumed = await service.consumeReservation({
      reservationId: reservation.reservationId,
      idempotencyKey: "fragmented-own-consume",
      now: new Date("2026-07-10T12:06:00.000Z"),
    });
    expect(consumed.status).toBe("consumed");
    expect(
      repository.state.ownLots.reduce(
        (total, lot) => total + lot.spentCredits,
        0
      )
    ).toBe(1_000);
  });

  it("paginates more than 100 fragmented pool lots and still never mixes buckets", async () => {
    const rule = testCompetitionCreditRule({
      costs: [{ costCode: "fragmented-pool", credits: 150, active: true }],
    });
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 100,
      idempotencyKey: "fragmented-pool-config",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    const run = await openDailyRun({ repository, service });
    replaceWithFragmentedLots({
      repository,
      run,
      bucket: "pool",
      count: 150,
    });

    const reservation = await service.reserve({
      walletAddress: BORROWER,
      sessionId: "fragmented-pool-session",
      costCode: "fragmented-pool",
      idempotencyKey: "fragmented-pool-reserve",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    expect(reservation.bucket).toBe("pool");
    expect(reservation.allocations).toHaveLength(150);
    expect(repository.state.ownLots[0].reservedCredits).toBe(0);
    expect(
      repository.state.poolLots.reduce(
        (total, lot) => total + lot.reservedCredits,
        0
      )
    ).toBe(150);
  });

  it("does not mutate balances when all paginated own and pool lots are truly insufficient", async () => {
    const rule = testCompetitionCreditRule({
      costs: [
        { costCode: "fragmented-insufficient", credits: 150, active: true },
      ],
    });
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    replaceWithFragmentedLots({
      repository,
      run,
      bucket: "own",
      count: 120,
      walletNormalized: WALLET,
    });
    const before = repository.snapshot();

    await expect(
      service.reserve({
        walletAddress: WALLET,
        sessionId: "fragmented-insufficient-session",
        costCode: "fragmented-insufficient",
        idempotencyKey: "fragmented-insufficient-reserve",
        now: new Date("2026-07-10T12:05:00.000Z"),
      })
    ).rejects.toThrow(/No hay creditos/);
    expect(repository.state).toEqual(before);
  });

  it("uses FIFO own lots and release before TTL restores exactly once", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot(), slot({ _id: "uki-slot-2", ordinal: 2 })],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await openDailyRun({ repository, service });
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "session-release",
      costCode: "treasure-hunt:start",
      idempotencyKey: "reserve-release",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    expect(reservation.allocations).toHaveLength(1);
    const fifoLot = [...repository.state.ownLots].sort((left, right) =>
      left.lotId < right.lotId ? -1 : left.lotId > right.lotId ? 1 : 0
    )[0];
    expect(reservation.allocations[0].lotId).toBe(fifoLot.lotId);
    const released = await service.releaseReservation({
      reservationId: reservation.reservationId,
      idempotencyKey: "release-once",
      now: new Date("2026-07-10T12:06:00.000Z"),
    });
    expect(released.status).toBe("released");
    expect(fifoLot).toMatchObject({
      availableCredits: 100,
      reservedCredits: 0,
    });
    expect(
      (
        await service.releaseReservation({
          reservationId: reservation.reservationId,
          idempotencyKey: "release-once",
          now: new Date("2026-07-10T12:20:00.000Z"),
        })
      ).status
    ).toBe("released");
    await expect(
      service.consumeReservation({
        reservationId: reservation.reservationId,
        idempotencyKey: "consume-loser",
        now: new Date("2026-07-10T12:06:01.000Z"),
      })
    ).rejects.toThrow(/solo una transicion terminal/);
  });

  it("expires active reservations without reviving credits and expires remaining lots at cutoff", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "session-expire",
      costCode: "treasure-hunt:start",
      idempotencyKey: "reserve-expire",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    expect(reservation.expiresAt).toEqual(new Date("2026-07-10T12:15:00.000Z"));
    const reservationJob = await service.expireReservationsBatch({
      now: new Date("2026-07-10T12:15:00.000Z"),
    });
    expect(reservationJob).toEqual({ scanned: 1, expired: 1, skipped: 0 });
    expect(repository.state.reservations[0].status).toBe("expired");
    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 100,
      reservedCredits: 0,
      expiredCredits: 0,
    });
    const lotJob = await service.expireAvailableLotsBatch({
      now: new Date("2026-07-11T12:00:00.000Z"),
    });
    expect(lotJob.expired).toBe(1);
    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 0,
      expiredCredits: 100,
    });
    expect(
      (
        await service.expireAvailableLotsBatch({
          now: new Date("2026-07-11T12:00:01.000Z"),
        })
      ).scanned
    ).toBe(0);
    expect(
      reconcileCompetitionCreditSnapshot(
        (await repository.readReconciliationSnapshot(run.runId))!
      ).reasonCodes
    ).toEqual([]);
  });

  it("expires own and pooled unused credits exactly once at the same daily cutoff", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 40,
      idempotencyKey: "pool-config-daily-expiry",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    const run = await openDailyRun({ repository, service });

    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 60,
      expiredCredits: 0,
    });
    expect(repository.state.poolLots[0]).toMatchObject({
      availableCredits: 40,
      expiredCredits: 0,
    });

    const cutoff = new Date("2026-07-11T12:00:00.000Z");
    await expect(service.expireAvailableLotsBatch({ now: cutoff })).resolves.toEqual({
      scanned: 2,
      expired: 2,
      skipped: 0,
    });
    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 0,
      expiredCredits: 60,
    });
    expect(repository.state.poolLots[0]).toMatchObject({
      availableCredits: 0,
      expiredCredits: 40,
    });
    expect(repository.state.accounts).toContainEqual(expect.objectContaining({
      walletNormalized: WALLET.toLowerCase(),
      availableCredits: 0,
      expiredCredits: 60,
      poolDepositedCredits: 40,
    }));
    expect(repository.state.poolPeriods).toContainEqual(expect.objectContaining({
      availableCredits: 0,
      expiredCredits: 40,
      contributedCredits: 40,
    }));
    expect(
      repository.state.ledger
        .filter((entry) => entry.operation === "expire")
        .map((entry) => ({ bucket: entry.bucket, amountCredits: entry.amountCredits }))
    ).toEqual(expect.arrayContaining([
      { bucket: "own", amountCredits: 60 },
      { bucket: "pool", amountCredits: 40 },
    ]));

    await expect(service.expireAvailableLotsBatch({
      now: new Date(cutoff.getTime() + 1_000),
    })).resolves.toEqual({ scanned: 0, expired: 0, skipped: 0 });
    expect(
      reconcileCompetitionCreditSnapshot(
        (await repository.readReconciliationSnapshot(run.runId))!
      ).reasonCodes
    ).toEqual([]);
  });

  it("rolls back the complete transaction when persistence fails after work", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const runner = createMemoryCompetitionCreditRunner(repository);
    const service = createCompetitionCreditService(runner);
    runner.failAfterNextWork();
    await expect(
      service.createDailyRun({
        cutoff: CUTOFF,
        expectedRuleVersion: "credits-v1",
        now: new Date("2026-07-10T12:01:00.000Z"),
      })
    ).rejects.toThrow(/simulated transaction/);
    expect(repository.state.runs).toHaveLength(0);
    expect(repository.state.items).toHaveLength(0);
  });

  it("rolls back a failed grant item and resumes it without duplicate value", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const runner = createMemoryCompetitionCreditRunner(repository);
    const service = createCompetitionCreditService(runner);
    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:00.000Z"),
    });
    const claimed = await service.claimRun({
      runId: run.runId,
      workerId: "worker-1",
      now: new Date("2026-07-10T12:02:00.000Z"),
    });
    runner.failAfterNextWork();
    await expect(
      service.processRunBatch({
        runId: run.runId,
        workerId: "worker-1",
        fenceToken: claimed.fenceToken,
        now: new Date("2026-07-10T12:03:00.000Z"),
      })
    ).rejects.toThrow(/simulated transaction/);
    expect(repository.state.items[0].status).toBe("pending");
    expect(repository.state.ledger).toHaveLength(0);
    expect(repository.state.ownLots).toHaveLength(0);
    await service.processRunBatch({
      runId: run.runId,
      workerId: "worker-1",
      fenceToken: claimed.fenceToken,
      now: new Date("2026-07-10T12:03:01.000Z"),
    });
    expect(
      repository.state.ledger.filter((entry) => entry.operation === "grant")
    ).toHaveLength(1);
    expect(repository.state.ownLots).toHaveLength(1);
  });

  it("rejects matured qualifying slots but keeps a late period eligible for catch-up", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot({ status: "qualifying" })],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await expect(
      service.createDailyRun({
        cutoff: CUTOFF,
        expectedRuleVersion: "credits-v1",
        now: new Date("2026-07-10T12:01:00.000Z"),
      })
    ).rejects.toThrow(/qualifying ya maduros/);
    repository.state.slots = [];
    repository.state.sourceHealth.observedThrough = new Date("2026-07-11T12:00:00.000Z");
    repository.state.watermark = testCreditSourceWatermark({
      observedThrough: new Date("2026-07-11T12:00:00.000Z"),
      updatedAt: new Date("2026-07-11T12:00:00.000Z"),
      sourceHash: buildCreditSourceSlotsHash([]),
      slotCount: 0,
    });
    await expect(
      service.createDailyRun({
        cutoff: CUTOFF,
        expectedRuleVersion: "credits-v1",
        now: new Date("2026-07-11T12:00:00.000Z"),
      })
    ).resolves.toMatchObject({ route: "uki", status: "snapshotted" });
  });

  it("adds one idempotent late compensation after 24h and preserves the original own/pool split", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 20,
      idempotencyKey: "late-compensation-pool-split",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    const lateNow = new Date("2026-07-11T12:00:00.001Z");
    repository.state.sourceHealth.observedThrough = lateNow;
    repository.state.watermark = testCreditSourceWatermark({
      observedThrough: lateNow,
      updatedAt: lateNow,
      sourceHash: buildCreditSourceSlotsHash(repository.state.slots),
      slotCount: repository.state.slots.length,
    });

    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: lateNow,
    });
    const claimed = await service.claimRun({
      runId: run.runId,
      workerId: "late-worker",
      now: new Date(lateNow.getTime() + 1_000),
    });
    await service.processRunBatch({
      runId: run.runId,
      workerId: "late-worker",
      fenceToken: claimed.fenceToken,
      now: new Date(lateNow.getTime() + 2_000),
    });
    const opened = await service.openRun({
      runId: run.runId,
      workerId: "late-worker",
      fenceToken: claimed.fenceToken,
      now: new Date(lateNow.getTime() + 3_000),
    });
    expect(repository.state.incidents).toEqual([]);
    expect(opened.run.status).toBe("open");
    const item = repository.state.items.find(
      (candidate) => candidate.runId === run.runId
    )!;
    expect(item).toMatchObject({
      baseGrantCredits: 100,
      compensationCredits: 100,
      compensationReason: "late_gt_24h",
      baseOwnCredits: 80,
      basePoolCredits: 20,
      compensationOwnCredits: 80,
      compensationPoolCredits: 20,
      grantCredits: 200,
      ownCredits: 160,
      poolCredits: 40,
    });
    expect(
      repository.state.ledger.filter(
        (entry) => entry.runItemId === item.itemId && entry.operation === "grant"
      )
    ).toHaveLength(1);
    expect(
      repository.state.ledger.filter(
        (entry) =>
          entry.runItemId === item.itemId &&
          entry.operation === "late_compensation"
      )
    ).toEqual([
      expect.objectContaining({
        amountCredits: 100,
        periodId: item.periodId,
      }),
    ]);
    expect(repository.state.accounts).toContainEqual(
      expect.objectContaining({
        periodId: item.periodId,
        grantedCredits: 200,
        poolDepositedCredits: 40,
        availableCredits: 160,
      })
    );
    expect(repository.state.poolPeriods).toContainEqual(
      expect.objectContaining({
        periodId: item.periodId,
        contributedCredits: 40,
        availableCredits: 40,
      })
    );

    await expect(
      service.createDailyRun({
        cutoff: CUTOFF,
        expectedRuleVersion: "credits-v1",
        now: new Date(lateNow.getTime() + 10_000),
      })
    ).resolves.toMatchObject({ runId: run.runId });
    expect(
      repository.state.ledger.filter(
        (entry) =>
          entry.runItemId === item.itemId &&
          entry.operation === "late_compensation"
      )
    ).toHaveLength(1);
  });

  it("opens and re-reconciles two delayed runs settled into the same route period", async () => {
    const historicalSlot = slot({
      qualifiedSince: new Date("2026-07-01T12:00:00.000Z"),
      creditEligibleFrom: new Date("2026-07-02T12:00:00.000Z"),
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
      updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      sourceBlockTimestamp: new Date("2026-07-01T11:59:00.000Z"),
    });
    const repository = new MemoryCompetitionCreditRepository({ slots: [historicalSlot] });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: historicalSlot._id,
      poolCreditsPerSlot: 20,
      idempotencyKey: "multi-late-pool-config",
      now: new Date("2026-07-08T11:00:00.000Z"),
    });
    const lateNow = new Date("2026-07-11T12:00:00.001Z");
    repository.state.sourceHealth.observedThrough = lateNow;
    repository.state.watermark = testCreditSourceWatermark({
      observedThrough: lateNow,
      updatedAt: lateNow,
      sourceHash: buildCreditSourceSlotsHash(repository.state.slots),
      slotCount: 1,
    });
    const openedRuns: CompetitionCreditRun[] = [];
    for (const [index, cutoff] of [
      new Date("2026-07-09T12:00:00.000Z"),
      new Date("2026-07-10T12:00:00.000Z"),
    ].entries()) {
      const run = await service.createDailyRun({
        cutoff,
        expectedRuleVersion: "credits-v1",
        now: new Date(lateNow.getTime() + index * 10_000),
      });
      const claimed = await service.claimRun({
        runId: run.runId,
        workerId: `multi-late-${index}`,
        now: new Date(lateNow.getTime() + index * 10_000 + 1_000),
      });
      await service.processRunBatch({
        runId: run.runId,
        workerId: `multi-late-${index}`,
        fenceToken: claimed.fenceToken,
        now: new Date(lateNow.getTime() + index * 10_000 + 2_000),
      });
      const opened = await service.openRun({
        runId: run.runId,
        workerId: `multi-late-${index}`,
        fenceToken: claimed.fenceToken,
        now: new Date(lateNow.getTime() + index * 10_000 + 3_000),
      });
      expect(opened.reconciliation.ok).toBe(true);
      expect(opened.run.status).toBe("open");
      openedRuns.push(opened.run);
    }
    expect(openedRuns[0].settlementPeriod.periodId).toBe(
      openedRuns[1].settlementPeriod.periodId
    );
    expect(repository.state.accounts).toContainEqual(expect.objectContaining({
      periodId: openedRuns[0].settlementPeriod.periodId,
      grantedCredits: 400,
      poolDepositedCredits: 80,
      availableCredits: 320,
    }));
    expect(repository.state.poolPeriods).toContainEqual(expect.objectContaining({
      periodId: openedRuns[0].settlementPeriod.periodId,
      contributedCredits: 80,
      availableCredits: 80,
    }));
    await expect(
      service.openRun({
        runId: openedRuns[0].runId,
        workerId: "multi-late-0",
        fenceToken: openedRuns[0].fenceToken,
        now: new Date(lateNow.getTime() + 30_000),
      })
    ).resolves.toMatchObject({ reconciliation: { ok: true } });
  });

  it("grants only active or still-valid grace slots, with exact cutoff maturity", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [
        slot({ _id: "active-exact", status: "active", ordinal: 1 }),
        slot({
          _id: "grace-valid",
          route: "nft",
          status: "grace",
          ordinal: 1,
          graceEndsAt: new Date("2026-07-10T12:00:00.001Z"),
        }),
        slot({
          _id: "grace-ended",
          route: "nft",
          status: "grace",
          ordinal: 2,
          graceEndsAt: CUTOFF,
        }),
        slot({ _id: "inactive-slot", status: "inactive", ordinal: 2 }),
        slot({
          _id: "qualifying-not-mature",
          status: "qualifying",
          ordinal: 3,
          creditEligibleFrom: new Date("2026-07-10T12:00:00.001Z"),
        }),
      ],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:00.000Z"),
    });
    expect(run.expectedItemCount).toBe(1);
    await service.refreshSourceWatermark({
      route: "nft",
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:01.000Z"),
    });
    const nftRun = await service.createDailyRun({
      route: "nft",
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:02.000Z"),
    });
    expect(nftRun.expectedItemCount).toBe(1);
    expect(repository.state.items.map((item) => item.slotId).sort()).toEqual([
      "active-exact",
      "grace-valid",
    ]);
  });

  it("binds pool config to eligibilityEpoch and restarts the 24h maturity gate", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 100,
      idempotencyKey: "epoch-1-config",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    repository.state.slots[0].eligibilityEpoch = 2;
    repository.state.slots[0].creditEligibleFrom = new Date(
      "2026-07-11T12:00:00.000Z"
    );
    repository.state.slotVersions[0].slot = {
      ...repository.state.slots[0],
      qualifiedSince: new Date(repository.state.slots[0].qualifiedSince),
      creditEligibleFrom: new Date(repository.state.slots[0].creditEligibleFrom),
      createdAt: new Date(repository.state.slots[0].createdAt),
      updatedAt: new Date(repository.state.slots[0].updatedAt),
    };
    repository.state.sourceHealth.observedThrough = new Date(
      "2026-07-11T12:00:00.000Z"
    );
    repository.state.watermark = testCreditSourceWatermark({
      observedThrough: new Date("2026-07-11T12:00:00.000Z"),
      updatedAt: new Date("2026-07-11T12:00:00.000Z"),
      sourceHash: buildCreditSourceSlotsHash(repository.state.slots),
      slotCount: repository.state.slots.length,
    });
    const run = await service.createDailyRun({
      cutoff: new Date("2026-07-11T12:00:00.000Z"),
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-11T12:01:00.000Z"),
    });
    const item = repository.state.items.find(
      (candidate) => candidate.runId === run.runId
    )!;
    expect(item).toMatchObject({
      eligibilityEpoch: 2,
      ownCredits: 100,
      poolCredits: 0,
    });
  });

  it("rejects idempotency reuse with a different payload", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 20,
      idempotencyKey: "same-key",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    expect(
      (
        await service.configurePool({
          walletAddress: WALLET,
          slotId: "uki-slot-1",
          poolCreditsPerSlot: 20,
          idempotencyKey: "same-key",
          now: new Date("2026-07-10T11:01:00.000Z"),
        })
      ).poolCreditsPerSlot
    ).toBe(20);
    await expect(
      service.configurePool({
        walletAddress: WALLET,
        slotId: "uki-slot-1",
        poolCreditsPerSlot: 30,
        idempotencyKey: "same-key",
        now: new Date("2026-07-10T11:00:00.000Z"),
      })
    ).rejects.toThrow(/otro payload/);
  });

  it("fails closed instead of replaying tampered idempotency winners", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 20,
      idempotencyKey: "tampered-config-winner",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    repository.state.configs[0].payloadHash = "0".repeat(64);
    await expect(
      service.configurePool({
        walletAddress: WALLET,
        slotId: "uki-slot-1",
        poolCreditsPerSlot: 20,
        idempotencyKey: "tampered-config-winner",
        now: new Date("2026-07-10T11:01:00.000Z"),
      })
    ).rejects.toThrow(/manipulada/);

    repository.state.configs = [];
    await openDailyRun({ repository, service });
    await service.reserve({
      walletAddress: WALLET,
      sessionId: "tampered-reservation-session",
      costCode: "treasure-hunt:start",
      idempotencyKey: "tampered-reservation-winner",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    repository.state.reservations[0].payloadHash = "0".repeat(64);
    await expect(
      service.reserve({
        walletAddress: WALLET,
        sessionId: "tampered-reservation-session",
        costCode: "treasure-hunt:start",
        idempotencyKey: "tampered-reservation-winner",
        now: new Date("2026-07-10T12:06:00.000Z"),
      })
    ).rejects.toThrow(/manipulada/);
  });

  it("blocks the run and opens an incident when reconciliation detects tampering", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    repository.state.ownLots[0].availableCredits += 1;
    const before = repository.state.ownLots[0].availableCredits;
    const result = await service.reconcileRun(
      run.runId,
      new Date("2026-07-10T12:10:00.000Z")
    );
    expect(result.ok).toBe(false);
    expect(repository.state.runs[0].status).toBe("blocked");
    expect(repository.state.incidents).toHaveLength(1);
    expect(repository.state.ownLots[0].availableCredits).toBe(before);
  });

  it("reconciles reservation lifecycle ledger and detects a deleted terminal event", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "session-consume",
      costCode: "treasure-hunt:start",
      idempotencyKey: "reserve-consume",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    await service.consumeReservation({
      reservationId: reservation.reservationId,
      idempotencyKey: "consume-terminal",
      now: new Date("2026-07-10T12:06:00.000Z"),
    });
    const healthy = reconcileCompetitionCreditSnapshot(
      (await repository.readReconciliationSnapshot(run.runId))!
    );
    expect(healthy.reasonCodes).toEqual([]);
    repository.state.ledger = repository.state.ledger.filter(
      (entry) => entry.operation !== "spend"
    );
    const tampered = reconcileCompetitionCreditSnapshot(
      (await repository.readReconciliationSnapshot(run.runId))!
    );
    expect(tampered.ok).toBe(false);
    expect(tampered.reasonCodes).toEqual(
      expect.arrayContaining([
        "RESERVATION_TERMINAL_LEDGER_MISMATCH",
        "LOT_LEDGER_STATE_MISMATCH",
      ])
    );
  });

  it("returns verified winners after duplicate-key races without double application", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const runner = createMemoryCompetitionCreditRunner(repository);
    const service = createCompetitionCreditService(runner);
    runner.duplicateAfterNextCommit();
    const config = await service.configurePool({
      walletAddress: WALLET,
      slotId: "uki-slot-1",
      poolCreditsPerSlot: 20,
      idempotencyKey: "concurrent-config",
      now: new Date("2026-07-10T11:00:00.000Z"),
    });
    expect(config.poolCreditsPerSlot).toBe(20);
    expect(repository.state.configs).toHaveLength(1);
    runner.duplicateAfterNextCommit();
    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:00.000Z"),
    });
    expect(repository.state.runs).toHaveLength(1);
    const claimed = await service.claimRun({
      runId: run.runId,
      workerId: "worker-1",
      now: new Date("2026-07-10T12:02:00.000Z"),
    });
    await service.processRunBatch({
      runId: run.runId,
      workerId: "worker-1",
      fenceToken: claimed.fenceToken,
      now: new Date("2026-07-10T12:03:00.000Z"),
    });
    await service.openRun({
      runId: run.runId,
      workerId: "worker-1",
      fenceToken: claimed.fenceToken,
      now: new Date("2026-07-10T12:04:00.000Z"),
    });
    runner.duplicateAfterNextCommit();
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "concurrent-session",
      costCode: "treasure-hunt:start",
      idempotencyKey: "concurrent-reserve",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    expect(
      (
        await service.reserve({
          walletAddress: WALLET,
          sessionId: "concurrent-session",
          costCode: "treasure-hunt:start",
          idempotencyKey: "concurrent-reserve",
          now: new Date("2026-07-10T12:06:00.000Z"),
        })
      ).reservationId
    ).toBe(reservation.reservationId);
    expect(repository.state.reservations).toHaveLength(1);
    expect(repository.state.ownLots[0].reservedCredits).toBe(10);
    runner.duplicateAfterNextCommit();
    const consumed = await service.consumeReservation({
      reservationId: reservation.reservationId,
      idempotencyKey: "concurrent-consume",
      now: new Date("2026-07-10T12:06:00.000Z"),
    });
    expect(consumed.status).toBe("consumed");
    expect(
      repository.state.ledger.filter((entry) => entry.operation === "spend")
    ).toHaveLength(1);
    expect(repository.state.ownLots[0]).toMatchObject({
      reservedCredits: 0,
      spentCredits: 10,
    });
  });

  it("does not consider another wallet when reserving own credits", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot({ walletNormalized: BORROWER })],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    await openDailyRun({ repository, service });
    await expect(
      service.reserve({
        walletAddress: WALLET,
        sessionId: "wrong-wallet",
        costCode: "treasure-hunt:start",
        idempotencyKey: "wrong-wallet-reserve",
        now: new Date("2026-07-10T12:05:00.000Z"),
      })
    ).rejects.toThrow(/No hay creditos/);
  });

  it("never spends lots from another rule-config period after a mid-period rule change", async () => {
    const oldRule = testCompetitionCreditRule({
      activeUntil: new Date("2026-07-10T13:00:00.000Z"),
    });
    const repository = new MemoryCompetitionCreditRepository({
      rule: oldRule,
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const oldRun = await openDailyRun({ repository, service });
    expect(repository.state.ownLots[0].periodId).toBe(oldRun.period.periodId);

    repository.state.rules.push(
      testCompetitionCreditRule({
        _id: "competition-credits:v2",
        version: "credits-v2",
        activeFrom: new Date("2026-07-10T13:00:00.000Z"),
        costs: [{ costCode: "treasure-hunt:start", credits: 10, active: true }],
      })
    );
    await expect(
      service.reserve({
        walletAddress: WALLET,
        sessionId: "new-rule-period",
        costCode: "treasure-hunt:start",
        idempotencyKey: "new-rule-period-reserve",
        now: new Date("2026-07-10T13:05:00.000Z"),
      })
    ).rejects.toThrow(/No hay creditos/);
    expect(repository.state.ownLots[0]).toMatchObject({
      availableCredits: 100,
      reservedCredits: 0,
    });
  });

  it("keeps a retired rule queryable for historical catch-up after a version rotation", async () => {
    const retired = testCompetitionCreditRule({
      active: false,
      activeFrom: new Date("2026-07-01T12:00:00.000Z"),
      activeUntil: new Date("2026-07-11T12:00:00.000Z"),
    });
    const repository = new MemoryCompetitionCreditRepository({ rule: retired });
    repository.state.rules.push(
      testCompetitionCreditRule({
        _id: "competition-credits:v2",
        version: "credits-v2",
        activeFrom: new Date("2026-07-11T12:00:00.000Z"),
      })
    );

    await expect(
      repository.findRuleAt(new Date("2026-07-10T12:00:00.000Z"))
    ).resolves.toMatchObject({ version: "credits-v1", active: false });
    await expect(repository.findOldestRule()).resolves.toMatchObject({
      version: "credits-v1",
    });
    await expect(
      repository.findRuleAt(new Date("2026-07-11T12:00:00.000Z"))
    ).resolves.toMatchObject({ version: "credits-v2" });
  });

  it("refreshes a source-bound watermark, detects slot races and supports route rule divergence", async () => {
    const nftSlot = slot({
      _id: "nft-slot-1",
      route: "nft",
      ordinal: 1,
      ruleVersion: "nft-route-v3",
    });
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot({ ruleVersion: "uki-route-v2" }), nftSlot],
    });
    repository.state.sourceHealth.sourceRuleVersions = {
      uki: "uki-route-v2",
      nft: "nft-route-v3",
    };
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const watermark = await service.refreshSourceWatermark({
      expectedRuleVersion: "credits-v1",
      now: CUTOFF,
    });
    expect(watermark.sourceRuleVersions).toEqual({
      uki: "uki-route-v2",
      nft: "nft-route-v3",
    });
    expect(watermark.sourceHash).toBe(
      buildCreditSourceSlotsHash(
        repository.state.slots.filter((candidate) => candidate.route === "uki")
      )
    );
    repository.state.slots[0].revision += 1;
    await expect(
      service.createDailyRun({
        cutoff: CUTOFF,
        expectedRuleVersion: "credits-v1",
        now: new Date("2026-07-10T12:01:00.000Z"),
      })
    ).rejects.toThrow(/cambiaron/);
    await service.refreshSourceWatermark({
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:01:00.000Z"),
    });
    const run = await service.createDailyRun({
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:02:00.000Z"),
    });
    expect(run.expectedItemCount).toBe(1);
    await service.refreshSourceWatermark({
      route: "nft",
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:02:01.000Z"),
    });
    const nftRun = await service.createDailyRun({
      route: "nft",
      cutoff: CUTOFF,
      expectedRuleVersion: "credits-v1",
      now: new Date("2026-07-10T12:02:02.000Z"),
    });
    expect(nftRun.expectedItemCount).toBe(1);
  });

  it("fails closed on unhealthy source refresh and overlapping active credit rules", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    repository.state.sourceHealth.healthy = false;
    repository.state.sourceHealth.warnings = [
      "CURSOR_UNHEALTHY:UKI_STAKING:Staked",
    ];
    await expect(
      service.refreshSourceWatermark({
        expectedRuleVersion: "credits-v1",
        now: CUTOFF,
      })
    ).rejects.toThrow(/no saludables/);
    repository.state.sourceHealth.healthy = true;
    repository.state.sourceHealth.warnings = [];
    repository.state.rules.push(
      testCompetitionCreditRule({
        _id: "competition-credits:v2",
        version: "credits-v2",
        activeFrom: new Date("2026-07-01T00:00:00.000Z"),
      })
    );
    await expect(
      service.configurePool({
        walletAddress: WALLET,
        slotId: "uki-slot-1",
        poolCreditsPerSlot: 10,
        idempotencyKey: "overlap-config",
        now: new Date("2026-07-10T11:00:00.000Z"),
      })
    ).rejects.toThrow(/solapadas/);
  });

  it("turns malformed Mongo runtime values into a blocking incident instead of throwing", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "malformed-session",
      costCode: "treasure-hunt:start",
      idempotencyKey: "malformed-reserve",
      now: new Date("2026-07-10T12:05:00.000Z"),
    });
    repository.state.ownLots[0].availableCredits = -1;
    const stored = repository.state.reservations.find(
      (item) => item.reservationId === reservation.reservationId
    )!;
    stored.allocations = "not-an-array" as never;
    repository.state.items[0].creditEligibleFrom = "bad-date" as never;
    const result = await service.reconcileRun(
      run.runId,
      new Date("2026-07-10T12:06:00.000Z")
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "RUNTIME_LOT_AVAILABLECREDITS_INVALID",
        "RUNTIME_RESERVATION_ALLOCATIONS_NOT_ARRAY",
        "RUNTIME_RUN_ITEM_DATE_INVALID",
      ])
    );
    expect(repository.state.runs[0].status).toBe("blocked");
    expect(repository.state.incidents).toHaveLength(1);
  });

  it("blocks malformed null, missing, string and invalid-date periods with a safe run-bound scope", async () => {
    const mutations: Array<{
      expectedReason: string;
      mutate: (run: Record<string, unknown>) => void;
    }> = [
      {
        expectedReason: "RUNTIME_RUN_INVALID",
        mutate: (run) => {
          run.period = null;
        },
      },
      {
        expectedReason: "RUNTIME_RUN_INVALID",
        mutate: (run) => {
          delete run.period;
        },
      },
      {
        expectedReason: "RUNTIME_RUN_INVALID",
        mutate: (run) => {
          run.period = "not-an-object";
        },
      },
      {
        expectedReason: "RUNTIME_RUN_CUTOFF_INVALID",
        mutate: (run) => {
          const period = run.period as Record<string, unknown>;
          period.cutoff = new Date(Number.NaN);
        },
      },
    ];

    for (const { expectedReason, mutate } of mutations) {
      const repository = new MemoryCompetitionCreditRepository({
        slots: [slot()],
      });
      const service = createCompetitionCreditService(
        createMemoryCompetitionCreditRunner(repository)
      );
      const run = await openDailyRun({ repository, service });
      const storedRun = repository.state.runs[0] as unknown as Record<
        string,
        unknown
      >;
      mutate(storedRun);
      const expectedPeriodScope = safeCompetitionCreditPeriodScopeId(
        storedRun,
        run.runId
      );

      const result = await service.reconcileRun(
        run.runId,
        new Date("2026-07-10T12:10:00.000Z")
      );
      expect(result.ok).toBe(false);
      expect(result.reasonCodes).toContain(expectedReason);
      expect(repository.state.runs[0].status).toBe("blocked");
      expect(repository.state.incidents).toHaveLength(1);
      expect(repository.state.incidents[0]).toMatchObject({
        runId: run.runId,
        periodId: expectedPeriodScope,
        walletNormalized: null,
      });
      expect(repository.state.incidents[0].periodId).toMatch(
        /^malformed-credit-period:[0-9a-f]{64}$/
      );
    }
  });

  it("returns safe evidence for null, missing or non-object run snapshots and opens a global run incident", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    const healthy = (await repository.readReconciliationSnapshot(run.runId))!;
    const missingRun = { ...healthy } as Record<string, unknown>;
    delete missingRun.run;
    for (const malformed of [
      { ...healthy, run: null },
      missingRun,
      { ...healthy, run: "not-an-object" },
    ]) {
      const result = reconcileCompetitionCreditSnapshot(malformed, run.runId);
      expect(result.ok).toBe(false);
      expect(result.reasonCodes).toContain("RUNTIME_RUN_INVALID");
      expect(result.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    }

    repository.readReconciliationSnapshot = async () =>
      ({ ...healthy, run: null } as never);
    const result = await service.reconcileRun(
      run.runId,
      new Date("2026-07-10T12:11:00.000Z")
    );
    expect(result.reasonCodes).toContain("RUNTIME_RUN_INVALID");
    expect(repository.state.incidents[0]).toMatchObject({
      runId: run.runId,
      walletNormalized: null,
    });
    expect(repository.state.incidents[0].periodId).toMatch(
      /^malformed-credit-period:[0-9a-f]{64}$/
    );
  });

  it("opens a blocking incident when idempotent open sees a malformed persisted period", async () => {
    const repository = new MemoryCompetitionCreditRepository({
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository)
    );
    const run = await openDailyRun({ repository, service });
    (repository.state.runs[0] as unknown as Record<string, unknown>).period =
      null;

    const result = await service.openRun({
      runId: run.runId,
      workerId: "worker-1",
      fenceToken: run.fenceToken,
      now: new Date("2026-07-10T12:10:00.000Z"),
    });
    expect(result.reconciliation.reasonCodes).toContain("RUNTIME_RUN_INVALID");
    expect(result.run.status).toBe("blocked");
    expect(repository.state.incidents).toHaveLength(1);
  });

  it("leaves GameEconomy reservations to its saga and honors a pre-expiry settlement intent", async () => {
    const rule = testCompetitionCreditRule({
      costs: [{ costCode: "game:settle", credits: 1, active: true }],
    });
    const repository = new MemoryCompetitionCreditRepository({
      rule,
      slots: [slot()],
    });
    const service = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(repository),
    );
    await openDailyRun({ repository, service });
    const reservedAt = new Date("2026-07-10T12:05:00.000Z");
    const expiresAt = new Date("2026-07-10T12:06:00.000Z");
    const reservation = await service.reserve({
      walletAddress: WALLET,
      sessionId: "game-owned-session",
      costCode: "game:settle",
      expectedRuleVersion: rule.version,
      expectedRuleConfigHash: rule.configHash,
      expiresAtCap: expiresAt,
      idempotencyKey: "game-owned-reserve",
      now: reservedAt,
    });
    repository.gameEconomySessionIds.add(reservation.sessionId);

    const expiry = await service.expireReservationsBatch({
      now: new Date("2026-07-10T12:07:00.000Z"),
      limit: 10,
    });
    expect(expiry).toMatchObject({ scanned: 1, expired: 0, skipped: 1 });
    expect(repository.state.reservations[0].status).toBe("active");

    const consumed = await service.consumeReservation({
      reservationId: reservation.reservationId,
      idempotencyKey: "game-owned-consume",
      committedAt: new Date("2026-07-10T12:05:59.000Z"),
      now: new Date("2026-07-10T12:07:00.000Z"),
    });
    expect(consumed).toMatchObject({
      status: "consumed",
      terminalCommittedAt: new Date("2026-07-10T12:05:59.000Z"),
    });
  });
});
