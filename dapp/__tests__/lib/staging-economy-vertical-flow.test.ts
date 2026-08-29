jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));

import { createCompetitionCreditService, validateReservationIntegrity } from "@/lib/uki-economy/credits/service";
import {
  createMemoryCompetitionCreditRunner,
  MemoryCompetitionCreditRepository,
  testCompetitionCreditRule,
} from "@/lib/uki-economy/credits/testing";
import type { CukieMasterSlot } from "@/lib/uki-economy/cukie-master/types";
import type {
  FinishGameResourceInput,
  GameCreditResourcePort,
  GameCukieResourcePort,
  ReserveGameCukieInput,
} from "@/lib/uki-economy/game-economy/ports";
import {
  buildGameCreditReservationEvidence,
  buildGameOwnCukieAssignmentEvidence,
} from "@/lib/uki-economy/game-economy/resource-ports";
import { getIsoWeekPeriodId } from "@/lib/uki-economy/periods";
import { createGameEconomyService } from "@/lib/uki-economy/game-economy/service";
import {
  createMemoryGameEconomyRunner,
  MemoryGameEconomyRepository,
  MemoryGameEvidencePort,
  testGameEconomyRule,
} from "@/lib/uki-economy/game-economy/testing";
import { stableGameEconomyHash } from "@/lib/uki-economy/game-economy/rules";
import type { GameEconomySession } from "@/lib/uki-economy/game-economy/types";
import {
  assertOwnCukieAssignmentIntegrity,
  ownCukieAssignmentId,
  ownCukieEpochId,
} from "@/lib/uki-economy/own-cukie/rules";
import type { OwnCukieAssignment } from "@/lib/uki-economy/own-cukie/types";
import {
  assertSettlementResourceBindings,
  RewardCalculationCoordinator,
  type SettleGameRewardsInput,
} from "@/lib/uki-economy/rewards/coordinator";
import { RewardAllocationService } from "@/lib/uki-economy/rewards/service";
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from "@/lib/uki-economy/rewards/testing";

const MASTER = `0x${"1".repeat(40)}`;
const BORROWER = `0x${"2".repeat(40)}`;
const ACTIVE_FROM = new Date("2026-08-10T00:00:00.000Z");
const CUTOFF = new Date("2026-08-24T14:00:00.000Z");
const CREDIT_VERSION = "credits-staging-test-v4";
const GAME_VERSION = "staging-test-v4";
const REWARD_VERSION = "rewards-staging-test-v4";
const SESSION_TTL_MS = 10 * 60 * 1_000;
const TREASURE_HUNT_SHIFT_MS = 14 * 60 * 60 * 1_000;

function nftMasterSlot(ordinal: number): CukieMasterSlot {
  const slotId = `${MASTER.toLowerCase()}:nft:${ordinal}`;
  return {
    _id: slotId,
    walletAddress: MASTER,
    walletNormalized: MASTER.toLowerCase(),
    route: "nft",
    ordinal,
    eligibilityEpoch: 1,
    status: "active",
    qualifiedSince: new Date("2026-08-23T12:00:00.000Z"),
    creditEligibleFrom: new Date("2026-08-24T12:00:00.000Z"),
    roundId: "nft-round-staging-test-v4",
    ruleVersion: "cukie-master-v1",
    sourceHash: stableGameEconomyHash({ kind: "cukie-master-slot", slotId }),
    sourceBlockNumber: 998,
    sourceBlockHash: `0x${"a".repeat(64)}`,
    sourceBlockTimestamp: new Date("2026-08-24T13:59:00.000Z"),
    revision: 1,
    createdAt: new Date("2026-08-23T12:00:00.000Z"),
    updatedAt: CUTOFF,
  };
}

function stagingRewardRule() {
  return testRewardRule({
    _id: `reward_allocations:${REWARD_VERSION}`,
    version: REWARD_VERSION,
    activeFrom: ACTIVE_FROM,
    runCredits: {
      unitScale: 10,
      totalUnits: 100,
      weeklyReserveUnits: 20,
      ambassadorReserveUnits: 5,
      ambassadorOrdinaryUnits: 4,
      ambassadorWeeklyUnits: 1,
      convertibleUnits: 75,
    },
    creditPoolDaily: {
      sourceShareBps: 10_000,
      floorEnabled: true,
      floorCreditsStep: 10,
      floorAmountRaw: "750000000000000000",
    },
    emissionBudget: {
      programStartsAt: ACTIVE_FROM,
      dayBoundarySecondUtc: 14 * 60 * 60,
      lateReservationGraceSeconds: 86_400,
      dailyCapRaw: "500000000000000000000000",
      lifetimeCapRaw: "450000000000000000000000000",
      unusedDailyCapacity: "materialize_undistributed",
      overflowPolicy: "block",
    },
    undistributedBps: {
      treasury: 8_000,
      marketing: 0,
      development: 0,
      marketingDevelopment: 1_000,
      supplyReduction: 1_000,
    },
    destinations: {
      creditPool: "0x9700000000000000000000000000000000000001",
      cukiePoolOriginal: "0x9700000000000000000000000000000000000002",
      cukiePoolSecondPlus: "0x9700000000000000000000000000000000000003",
      treasury: "0x9700000000000000000000000000000000000004",
      marketing: "0x9700000000000000000000000000000000000005",
      development: "0x9700000000000000000000000000000000000006",
      marketingDevelopment: "0x9700000000000000000000000000000000000005",
      supplyReduction: "0x9700000000000000000000000000000000000007",
    },
  });
}

function findReservation(
  repository: MemoryCompetitionCreditRepository,
  input: Pick<FinishGameResourceInput, "reservationId" | "reservationIdempotencyKey">,
) {
  const reservation = input.reservationId
    ? repository.state.reservations.find((item) => item.reservationId === input.reservationId)
    : repository.state.reservations.find(
        (item) => item.idempotencyKey === input.reservationIdempotencyKey,
      );
  return reservation ? validateReservationIntegrity(reservation) : null;
}

function createCreditGamePort(input: {
  repository: MemoryCompetitionCreditRepository;
  service: ReturnType<typeof createCompetitionCreditService>;
}): GameCreditResourcePort {
  return {
    async reserve(reservationInput) {
      const now = new Date(reservationInput.expiresAt.getTime() - SESSION_TTL_MS);
      input.repository.gameEconomySessionIds.add(reservationInput.sessionId);
      const reservation = await input.service.reserve({
        walletAddress: reservationInput.walletNormalized,
        sessionId: reservationInput.sessionId,
        costCode: reservationInput.costCode,
        expectedRuleVersion: reservationInput.creditRuleVersion,
        expectedRuleConfigHash: reservationInput.creditRuleConfigHash,
        idempotencyKey: reservationInput.idempotencyKey,
        expiresAtCap: reservationInput.expiresAt,
        now,
      });
      return buildGameCreditReservationEvidence(validateReservationIntegrity(reservation));
    },
    async consume(finishInput) {
      const reservation = findReservation(input.repository, finishInput);
      if (!reservation || reservation.sessionId !== finishInput.sessionId) {
        throw new Error("La reserva de créditos de la prueba no pertenece a la sesión.");
      }
      const consumed = await input.service.consumeReservation({
        reservationId: reservation.reservationId,
        idempotencyKey: finishInput.idempotencyKey,
        committedAt: finishInput.committedAt,
        now: finishInput.now,
      });
      return {
        outcome: "consumed",
        reservation: buildGameCreditReservationEvidence(
          validateReservationIntegrity(consumed),
        ),
      };
    },
    async release(finishInput) {
      const reservation = findReservation(input.repository, finishInput);
      if (!reservation) return { outcome: "released", reservation: null };
      const released = await input.service.releaseReservation({
        reservationId: reservation.reservationId,
        idempotencyKey: finishInput.idempotencyKey,
        now: finishInput.now,
      });
      return {
        outcome: "released",
        reservation: buildGameCreditReservationEvidence(
          validateReservationIntegrity(released),
        ),
      };
    },
  };
}

class MemoryOwnCukieGamePort implements GameCukieResourcePort {
  readonly assignments = new Map<string, OwnCukieAssignment>();

  async reserve(input: ReserveGameCukieInput) {
    const replay = [...this.assignments.values()].find(
      (assignment) => assignment.idempotencyKey === input.idempotencyKey,
    );
    if (replay) return buildGameOwnCukieAssignmentEvidence(replay);
    const assignedAt = new Date(input.expiresAt.getTime() - SESSION_TTL_MS);
    const assetId = `cukies:testnet:${input.walletNormalized.slice(-8)}`;
    const ownershipEventId = `testnet-ownership:${input.walletNormalized}`;
    const assignmentId = ownCukieAssignmentId(input.sessionId);
    const assignment: OwnCukieAssignment = {
      _id: assignmentId,
      assignmentId,
      sessionId: input.sessionId,
      status: "active",
      epochId: ownCukieEpochId({
        assetId,
        ownerNormalized: input.walletNormalized,
        ownershipEventId,
      }),
      assetId,
      tokenId: input.walletNormalized === MASTER.toLowerCase() ? "101" : "202",
      ownerNormalized: input.walletNormalized,
      ownershipEventId,
      generation: "original",
      rarity: "rare",
      lockId: `testnet-lock:${input.sessionId}`,
      lockFencingToken: input.fenceToken,
      restoreSoftStake: true,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      assignedAt,
      expiresAt: input.expiresAt,
      revision: 0,
      updatedAt: assignedAt,
    };
    assertOwnCukieAssignmentIntegrity(assignment);
    this.assignments.set(assignmentId, assignment);
    return buildGameOwnCukieAssignmentEvidence(assignment);
  }

  private finish(
    expectedOutcome: "consumed" | "released",
    input: FinishGameResourceInput,
  ) {
    const assignment = input.reservationId
      ? this.assignments.get(input.reservationId)
      : [...this.assignments.values()].find(
          (item) => item.idempotencyKey === input.reservationIdempotencyKey,
        );
    if (!assignment || assignment.sessionId !== input.sessionId) {
      if (expectedOutcome === "released") {
        return { outcome: expectedOutcome, reservation: null } as const;
      }
      throw new Error("No existe la asignación de Cukie propia para consumir.");
    }
    const expectedStatus = expectedOutcome === "consumed" ? "completed" : "released";
    if (assignment.status !== expectedStatus) {
      if (assignment.status !== "active") {
        throw new Error(`La asignación ya terminó como ${assignment.status}.`);
      }
      Object.assign(assignment, {
        status: expectedStatus,
        lockFencingToken: Math.max(assignment.lockFencingToken, input.fenceToken),
        terminalAt: input.now,
        terminalReason: `game_economy_${expectedOutcome}`,
        revision: assignment.revision + 1,
        updatedAt: input.now,
      });
    }
    assertOwnCukieAssignmentIntegrity(assignment);
    return {
      outcome: expectedOutcome,
      reservation: buildGameOwnCukieAssignmentEvidence(assignment),
    } as const;
  }

  async consume(input: FinishGameResourceInput) {
    return this.finish("consumed", input);
  }

  async release(input: FinishGameResourceInput) {
    return this.finish("released", input);
  }
}

async function openNftCreditRun(input: {
  repository: MemoryCompetitionCreditRepository;
  service: ReturnType<typeof createCompetitionCreditService>;
}) {
  await input.service.refreshSourceWatermark({
    route: "nft",
    expectedRuleVersion: CREDIT_VERSION,
    now: CUTOFF,
  });
  const run = await input.service.createDailyRun({
    route: "nft",
    cutoff: CUTOFF,
    expectedRuleVersion: CREDIT_VERSION,
    now: new Date(CUTOFF.getTime() + 1_000),
  });
  const claimed = await input.service.claimRun({
    runId: run.runId,
    workerId: "staging-e2e-worker",
    now: new Date(CUTOFF.getTime() + 2_000),
  });
  await input.service.processRunBatch({
    runId: run.runId,
    workerId: "staging-e2e-worker",
    fenceToken: claimed.fenceToken,
    now: new Date(CUTOFF.getTime() + 3_000),
  });
  const opened = await input.service.openRun({
    runId: run.runId,
    workerId: "staging-e2e-worker",
    fenceToken: claimed.fenceToken,
    now: new Date(CUTOFF.getTime() + 4_000),
  });
  expect(opened.run.status).toBe("open");
  return opened.run;
}

async function settleTreasureHunt(input: {
  service: ReturnType<typeof createGameEconomyService>;
  evidence: MemoryGameEvidencePort;
  wallet: string;
  suffix: string;
  scoreRaw: string;
  now: Date;
}) {
  const created = await input.service.createSession({
    walletAddress: input.wallet,
    gameId: "treasure-hunt",
    cukieAssetIds: [],
    expectedRuleVersion: GAME_VERSION,
    idempotencyKey: `create-${input.suffix}`,
    now: input.now,
  });
  const started = await input.service.startSession({
    sessionId: created.sessionId,
    walletAddress: input.wallet,
    idempotencyKey: `start-${input.suffix}`,
    expectedRevision: created.revision,
    now: new Date(input.now.getTime() + 1_000),
  });
  const evidenceReference = `evidence-${input.suffix}`;
  const submitted = await input.service.submitResult({
    sessionId: created.sessionId,
    walletAddress: input.wallet,
    evidenceReference,
    payloadHash: stableGameEconomyHash({ kind: "score-payload", suffix: input.suffix }),
    idempotencyKey: `submit-${input.suffix}`,
    expectedRevision: started.revision,
    now: new Date(input.now.getTime() + 2_000),
  });
  input.evidence.result = {
    authorization: "server_authorized",
    evidenceId: evidenceReference,
    evidenceHash: stableGameEconomyHash({ kind: "score-evidence", suffix: input.suffix }),
    scoreRaw: input.scoreRaw,
  };
  const validated = await input.service.validateResult({
    sessionId: created.sessionId,
    idempotencyKey: `validate-${input.suffix}`,
    expectedRevision: submitted.revision,
    now: new Date(input.now.getTime() + 3_000),
  });
  const settled = await input.service.settleSession({
    sessionId: created.sessionId,
    idempotencyKey: `settle-${input.suffix}`,
    expectedRevision: validated.revision,
    now: new Date(input.now.getTime() + 4_000),
  });
  return { settled, validated };
}

function rewardPeriod(session: GameEconomySession) {
  return getIsoWeekPeriodId(
    new Date(session.createdAt.getTime() - TREASURE_HUNT_SHIFT_MS),
  );
}

describe("staging v4 Cukie Master -> credits -> game -> rewards", () => {
  it("usa créditos propios y del pool una sola vez y materializa rewards sin duplicados", async () => {
    const creditRule = testCompetitionCreditRule({
      _id: `competition_credits:${CREDIT_VERSION}`,
      version: CREDIT_VERSION,
      activeFrom: ACTIVE_FROM,
      cutoffHourUtc: 14,
      cutoffMinuteUtc: 0,
      settlementHourUtc: 14,
      settlementMinuteUtc: 0,
      expectedBscChainId: 97,
      maxSnapshotSlots: 5_000,
      costs: [{ costCode: "treasure-hunt:start", credits: 10, active: true }],
    });
    const masterSlots = [nftMasterSlot(1), nftMasterSlot(2)];
    const creditRepository = new MemoryCompetitionCreditRepository({
      rule: creditRule,
      slots: masterSlots,
      watermark: null,
    });
    creditRepository.state.sourceHealth.observedThrough = CUTOFF;
    creditRepository.state.sourceHealth.checkedAt = CUTOFF;
    const creditService = createCompetitionCreditService(
      createMemoryCompetitionCreditRunner(creditRepository),
    );

    await creditService.configurePool({
      walletAddress: MASTER,
      slotId: masterSlots[0]._id,
      poolCreditsPerSlot: 10,
      idempotencyKey: "master-slot-1-pool-10",
      now: new Date(CUTOFF.getTime() - 10 * 60 * 1_000),
    });
    const creditRun = await openNftCreditRun({
      repository: creditRepository,
      service: creditService,
    });

    expect(creditRule.expectedBscChainId).toBe(97);
    expect(creditRun).toMatchObject({
      route: "nft",
      expectedItemCount: 2,
      expectedGrantCredits: 200,
      expectedOwnCredits: 190,
      expectedPoolCredits: 10,
    });
    expect(creditRepository.state.accounts).toContainEqual(
      expect.objectContaining({
        walletNormalized: MASTER.toLowerCase(),
        route: "nft",
        grantedCredits: 200,
        poolDepositedCredits: 10,
        availableCredits: 190,
      }),
    );
    expect(creditRepository.state.poolPeriods).toContainEqual(
      expect.objectContaining({
        route: "nft",
        contributedCredits: 10,
        availableCredits: 10,
      }),
    );
    expect(creditRepository.state.poolPositions).toContainEqual(
      expect.objectContaining({
        walletNormalized: MASTER.toLowerCase(),
        sourceSlotId: masterSlots[0]._id,
        credits: 10,
        status: "open",
      }),
    );

    const rewardRule = stagingRewardRule();
    const gameRule = testGameEconomyRule({
      gameId: "treasure-hunt",
      version: GAME_VERSION,
      activeFrom: ACTIVE_FROM,
      sessionTtlMs: SESSION_TTL_MS,
      credit: {
        required: true,
        consumeOnSettle: true,
        costCode: "treasure-hunt:start",
        creditRuleVersion: creditRule.version,
        creditRuleConfigHash: creditRule.configHash,
      },
      reward: {
        rewardRuleVersion: rewardRule.version,
        rewardRuleConfigHash: rewardRule.configHash,
        maxConvertibleRaw: "7500000000000000000",
      },
      cukie: {
        required: true,
        consumeOnSettle: true,
        minAssets: 0,
        maxAssets: 0,
        role: "own_or_pool",
        selectionPolicy: "owned_bsc_quota_then_pool_v1",
      },
      calculation: {
        scoreCapRaw: "3000",
        weightNumeratorRaw: "2500000000000000",
        weightDenominatorRaw: "1",
      },
    });
    const gameRepository = new MemoryGameEconomyRepository({ rules: [gameRule] });
    const evidence = new MemoryGameEvidencePort();
    const ownCukiePort = new MemoryOwnCukieGamePort();
    const gameService = createGameEconomyService(
      createMemoryGameEconomyRunner(gameRepository),
      {
        credits: createCreditGamePort({
          repository: creditRepository,
          service: creditService,
        }),
        cukies: ownCukiePort,
        evidence,
      },
    );

    const ownGame = await settleTreasureHunt({
      service: gameService,
      evidence,
      wallet: MASTER,
      suffix: "master-own-credits",
      scoreRaw: "1000",
      now: new Date(CUTOFF.getTime() + 60_000),
    });
    const poolGame = await settleTreasureHunt({
      service: gameService,
      evidence,
      wallet: BORROWER,
      suffix: "borrower-pool-credits",
      scoreRaw: "600",
      now: new Date(CUTOFF.getTime() + 70_000),
    });

    const ownReservation = creditRepository.state.reservations.find(
      (item) => item.sessionId === ownGame.settled.sessionId,
    )!;
    const poolReservation = creditRepository.state.reservations.find(
      (item) => item.sessionId === poolGame.settled.sessionId,
    )!;
    expect(ownReservation).toMatchObject({ bucket: "own", status: "consumed" });
    expect(poolReservation).toMatchObject({ bucket: "pool", status: "consumed" });
    expect(ownGame.settled).toMatchObject({
      status: "settled",
      credit: { state: "consumed" },
      cukie: { state: "consumed" },
    });
    expect(poolGame.settled).toMatchObject({
      status: "settled",
      credit: { state: "consumed" },
      cukie: { state: "consumed" },
    });

    const replayedPoolSettlement = await gameService.settleSession({
      sessionId: poolGame.settled.sessionId,
      idempotencyKey: "settle-borrower-pool-credits",
      expectedRevision: poolGame.validated.revision,
      now: new Date(CUTOFF.getTime() + 90_000),
    });
    expect(replayedPoolSettlement).toEqual(poolGame.settled);
    expect(
      creditRepository.state.ledger.filter((entry) => entry.operation === "spend"),
    ).toHaveLength(2);
    expect(creditRepository.state.accounts).toContainEqual(
      expect.objectContaining({
        walletNormalized: MASTER.toLowerCase(),
        availableCredits: 180,
        spentCredits: 10,
      }),
    );
    expect(creditRepository.state.poolPeriods).toContainEqual(
      expect.objectContaining({ availableCredits: 0, spentCredits: 10 }),
    );

    const rewardRepository = new MemoryRewardRepository(rewardRule);
    const rewardService = new RewardAllocationService(
      createMemoryRewardTransactionRunner(rewardRepository),
    );
    const loadSnapshot = async (snapshotInput: SettleGameRewardsInput) => {
      const game = gameRepository.state.sessions.find(
        (session) => session.sessionId === snapshotInput.sessionId,
      );
      if (!game || game.status !== "settled" || !game.settledAt || !game.validation) {
        throw new Error("La sesión no está liquidada para rewards.");
      }
      const periodId = rewardPeriod(game);
      if (
        snapshotInput.periodId !== periodId ||
        snapshotInput.expectedRuleVersion !== rewardRule.version
      ) {
        throw new Error("La sesión no liga el periodo o ruleset esperado.");
      }
      const credit = creditRepository.state.reservations.find(
        (reservation) => reservation.reservationId === game.credit.reservationId,
      );
      const ownAssignment = ownCukiePort.assignments.get(game.cukie.reservationId!);
      if (!credit || !ownAssignment) throw new Error("Faltan recursos canónicos.");
      const cukieSource = assertSettlementResourceBindings(
        game,
        credit,
        null,
        ownAssignment,
      );
      const usesPoolCredits = credit.bucket === "pool";
      return {
        game,
        rule: rewardRule,
        credit,
        assignment: null,
        ownAssignment,
        arenaRanking: {
          sourceRankingId: usesPoolCredits ? `ranking:${game.sessionId}` : null,
          evidenceHash: stableGameEconomyHash({
            kind: "ranking-evidence",
            sessionId: game.sessionId,
          }),
          rank: usesPoolCredits ? 5 : null,
          rewardBps: usesPoolCredits ? 6_000 : 10_000,
        },
        periodId,
        rewardEffectiveAt: game.createdAt,
        sourceId: `game-session:${game.sessionId}`,
        creditSource: credit.bucket,
        cukieSource,
      };
    };
    const rewardCoordinator = new RewardCalculationCoordinator(
      rewardService,
      loadSnapshot,
    );
    const ownReward = await rewardCoordinator.settleGame({
      sessionId: ownGame.settled.sessionId,
      periodId: rewardPeriod(ownGame.settled),
      expectedRuleVersion: rewardRule.version,
      now: new Date(CUTOFF.getTime() + 2 * 60_000),
    });
    const poolReward = await rewardCoordinator.settleGame({
      sessionId: poolGame.settled.sessionId,
      periodId: rewardPeriod(poolGame.settled),
      expectedRuleVersion: rewardRule.version,
      now: new Date(CUTOFF.getTime() + 3 * 60_000),
    });
    expect(ownReward.status).toBe("allocated");
    expect(poolReward.status).toBe("allocated");

    const replayedPoolReward = await rewardCoordinator.settleGame({
      sessionId: poolGame.settled.sessionId,
      periodId: rewardPeriod(poolGame.settled),
      expectedRuleVersion: rewardRule.version,
      now: new Date(CUTOFF.getTime() + 4 * 60_000),
    });
    expect(replayedPoolReward.result.replayed).toBe(true);
    expect(rewardRepository.state.sourceManifests).toHaveLength(2);
    expect(rewardRepository.state.emissionBudgetEvents).toHaveLength(2);
    expect(rewardRepository.state.incidents).toEqual([]);
    expect(
      rewardRepository.state.allocations.filter(
        (allocation) => allocation.category === "player",
      ),
    ).toHaveLength(2);
    expect(rewardRepository.state.accruals).toContainEqual(
      expect.objectContaining({
        sourceId: `game-session:${poolGame.settled.sessionId}`,
        category: "credit_pool_weekly",
      }),
    );
    const emittedRaw = rewardRepository.state.sourceManifests.reduce(
      (total, manifest) => total + BigInt(manifest.sourceTotalRaw),
      BigInt(0),
    );
    expect(emittedRaw).toBe(BigInt("20000000000000000000"));
    expect(rewardRepository.state.emissionBudgetDays).toContainEqual(
      expect.objectContaining({ reservedRaw: emittedRaw.toString() }),
    );
  });
});
