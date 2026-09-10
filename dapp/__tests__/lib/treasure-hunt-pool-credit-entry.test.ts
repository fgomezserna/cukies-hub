import { createCompetitionCreditService, validateReservationIntegrity } from '@/lib/uki-economy/credits/service';
import {
  createMemoryCompetitionCreditRunner,
  MemoryCompetitionCreditRepository,
  testCompetitionCreditRule,
} from '@/lib/uki-economy/credits/testing';
import type { CreditSnapshotSlot } from '@/lib/uki-economy/credits/types';
import { createGameEconomyService } from '@/lib/uki-economy/game-economy/service';
import {
  createMemoryGameEconomyRunner,
  MemoryGameEconomyRepository,
  MemoryGameEvidencePort,
  MemoryGameResourcePorts,
  testGameEconomyRule,
} from '@/lib/uki-economy/game-economy/testing';
import type {
  FinishGameResourceInput,
  GameCreditResourcePort,
  ReserveGameCreditInput,
} from '@/lib/uki-economy/game-economy/ports';
import { buildGameCreditReservationEvidence } from '@/lib/uki-economy/game-economy/resource-evidence';

const WALLET = `0x${'1'.repeat(40)}`;
const CUTOFF = new Date('2026-07-10T12:00:00.000Z');
const RESERVE_AT = new Date('2026-07-10T12:05:00.000Z');

function slot(): CreditSnapshotSlot {
  return {
    _id: 'uki-slot-1',
    walletNormalized: WALLET.toLowerCase(),
    route: 'uki',
    ordinal: 1,
    eligibilityEpoch: 1,
    status: 'active',
    qualifiedSince: new Date('2026-07-09T12:00:00.000Z'),
    creditEligibleFrom: CUTOFF,
    roundId: 'uki-round-v1',
    ruleVersion: 'cukie-master-v1',
    sourceHash: 'c'.repeat(64),
    sourceBlockNumber: 100,
    sourceBlockHash: `0x${'d'.repeat(64)}`,
    sourceBlockTimestamp: CUTOFF,
    revision: 1,
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
    updatedAt: CUTOFF,
  };
}

async function openPoolRun(
  repository: MemoryCompetitionCreditRepository,
  service: ReturnType<typeof createCompetitionCreditService>,
) {
  await service.configurePool({
    walletAddress: WALLET,
    slotId: 'uki-slot-1',
    poolCreditsPerSlot: 100,
    idempotencyKey: 'treasure-pool-config',
    now: new Date('2026-07-10T11:00:00.000Z'),
  });
  const run = await service.createDailyRun({
    route: 'uki',
    cutoff: CUTOFF,
    expectedRuleVersion: 'credits-v1',
    now: new Date('2026-07-10T12:01:00.000Z'),
  });
  const claimed = await service.claimRun({
    runId: run.runId,
    workerId: 'worker-1',
    now: new Date('2026-07-10T12:02:00.000Z'),
  });
  await service.processRunBatch({
    runId: run.runId,
    workerId: 'worker-1',
    fenceToken: claimed.fenceToken,
    now: new Date('2026-07-10T12:03:00.000Z'),
  });
  const opened = await service.openRun({
    runId: run.runId,
    workerId: 'worker-1',
    fenceToken: claimed.fenceToken,
    now: new Date('2026-07-10T12:04:00.000Z'),
  });
  expect(opened.run.status).toBe('open');
  expect(repository.state.ownLots[0]).toMatchObject({ availableCredits: 0 });
  expect(repository.state.poolLots[0]).toMatchObject({ availableCredits: 100 });
  return opened.run;
}

function creditPortFor(
  service: ReturnType<typeof createCompetitionCreditService>,
): GameCreditResourcePort {
  return {
    async reserve(input: ReserveGameCreditInput) {
      const reservation = await service.reserve({
        walletAddress: input.walletNormalized,
        sessionId: input.sessionId,
        costCode: input.costCode,
        expectedRuleVersion: input.creditRuleVersion,
        expectedRuleConfigHash: input.creditRuleConfigHash,
        idempotencyKey: input.idempotencyKey,
        expiresAtCap: input.expiresAt,
        now: RESERVE_AT,
      });
      return buildGameCreditReservationEvidence(validateReservationIntegrity(reservation));
    },
    async consume(input: FinishGameResourceInput) {
      if (!input.reservationId) throw new Error('MISSING_RESERVATION_ID');
      const reservation = await service.consumeReservation({
        reservationId: input.reservationId,
        idempotencyKey: input.idempotencyKey,
        committedAt: input.committedAt,
        now: input.now,
      });
      return {
        outcome: 'consumed' as const,
        reservation: buildGameCreditReservationEvidence(validateReservationIntegrity(reservation)),
      };
    },
    async release(input: FinishGameResourceInput) {
      if (!input.reservationId) throw new Error('MISSING_RESERVATION_ID');
      const reservation = await service.releaseReservation({
        reservationId: input.reservationId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });
      return {
        outcome: 'released' as const,
        reservation: buildGameCreditReservationEvidence(validateReservationIntegrity(reservation)),
      };
    },
  };
}

describe('entrada Treasure Hunt con fallback de créditos al pool', () => {
  it('prepara la sesión con own=0, reserva el pool una vez y repite por idempotencia', async () => {
    const creditRule = testCompetitionCreditRule();
    const creditRepository = new MemoryCompetitionCreditRepository({
      rule: creditRule,
      slots: [slot()],
    });
    const creditService = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(creditRepository),
    );
    const run = await openPoolRun(creditRepository, creditService);

    const baseGameRule = testGameEconomyRule();
    const gameRule = testGameEconomyRule({
      gameId: 'treasure-hunt',
      version: 'staging-test-v4',
      credit: {
        ...baseGameRule.credit,
        costCode: 'treasure-hunt:start',
        creditRuleVersion: creditRule.version,
        creditRuleConfigHash: creditRule.configHash,
      },
      cukie: {
        ...baseGameRule.cukie,
        required: false,
        minAssets: 0,
        maxAssets: 0,
      },
    });
    const gameRepository = new MemoryGameEconomyRepository({ rules: [gameRule] });
    const resources = new MemoryGameResourcePorts();
    const gameService = createGameEconomyService(
      createMemoryGameEconomyRunner(gameRepository),
      {
        credits: creditPortFor(creditService),
        cukies: resources.cukiePort(),
        evidence: new MemoryGameEvidencePort(),
      },
    );
    const createInput = {
      walletAddress: WALLET,
      gameId: 'treasure-hunt',
      cukieAssetIds: [],
      expectedRuleVersion: 'staging-test-v4',
      idempotencyKey: 'treasure-pool-entry',
      now: RESERVE_AT,
    } as const;

    const prepared = await gameService.createSession(createInput);

    expect(prepared.status).toBe('resources_reserved');
    expect(prepared.credit).toMatchObject({ state: 'active' });
    expect(creditRepository.state.reservations).toHaveLength(1);
    expect(creditRepository.state.reservations[0]).toMatchObject({
      bucket: 'pool',
      amountCredits: 10,
      sessionId: prepared.sessionId,
      periodId: run.settlementPeriod.periodId,
    });
    expect(creditRepository.state.ownLots[0]).toMatchObject({
      availableCredits: 0,
      reservedCredits: 0,
    });
    expect(creditRepository.state.poolLots[0]).toMatchObject({
      availableCredits: 90,
      reservedCredits: 10,
    });

    const replay = await gameService.createSession(createInput);
    expect(replay).toEqual(prepared);
    expect(creditRepository.state.reservations).toHaveLength(1);
    expect(creditRepository.state.poolLots[0]).toMatchObject({
      availableCredits: 90,
      reservedCredits: 10,
    });

    const started = await gameService.startSession({
      sessionId: prepared.sessionId,
      walletAddress: WALLET,
      idempotencyKey: 'treasure-pool-start',
      expectedRevision: prepared.revision,
      now: new Date(RESERVE_AT.getTime() + 1_000),
    });
    const startedReplay = await gameService.startSession({
      sessionId: prepared.sessionId,
      walletAddress: WALLET,
      idempotencyKey: 'treasure-pool-start',
      expectedRevision: prepared.revision,
      now: new Date(RESERVE_AT.getTime() + 2_000),
    });
    expect(started.status).toBe('started');
    expect(startedReplay).toEqual(started);
    expect(creditRepository.state.reservations).toHaveLength(1);
  });
});
