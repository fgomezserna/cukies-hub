import type { ClientSession, Db, Document } from "mongodb";

// La validación central usa coordinator.ts, cuyo resto de API carga el
// cliente Mongo real. Aislamos solo ese borde de infraestructura; las
// guardas de sesión, crédito, NFT, source y rewards siguen siendo reales.
jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));

import { buildGameCreditReservationEvidence, buildGameOwnCukieAssignmentEvidence } from "@/lib/uki-economy/game-economy/resource-evidence";
import {
  buildGameCreateRequestHash,
  buildGameResourceReservationRequestHash,
  buildGameResourceReservationResultHash,
  buildGameSettlementRequestHash,
  buildGameStartRequestHash,
  buildGameSubmissionRequestHash,
  buildGameValidationRequestHash,
  buildGameValidationResultHash,
  gameSessionId,
  stableGameEconomyHash,
  toGameRuleSnapshot,
} from "@/lib/uki-economy/game-economy/rules";
import type { GameEconomySession } from "@/lib/uki-economy/game-economy/types";
import {
  getTreasureHuntDailyPeriod,
  getTreasureHuntWeeklyPeriod,
  treasureHuntScoreOrderKey,
} from "@/lib/uki-economy/game-economy/treasure-hunt-policy";
import type {
  TreasureHuntEconomyRun,
  TreasureHuntWeeklyBest,
} from "@/lib/uki-economy/game-economy/treasure-hunt-types";
import { stableCreditHash } from "@/lib/uki-economy/credits/rules";
import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import {
  ownCukieAssignmentId,
  ownCukieEpochId,
  stableOwnCukieHash,
} from "@/lib/uki-economy/own-cukie/rules";
import type { OwnCukieAssignment } from "@/lib/uki-economy/own-cukie/types";
import { assertEligibleWeeklyGameResult } from "@/lib/uki-economy/rewards/accounting";
import type {
  WeeklyGameSource,
} from "@/lib/uki-economy/rewards/accounting-types";
import { stableRewardHash } from "@/lib/uki-economy/rewards/rules";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";
import type {
  RewardPeriodSeal,
  RewardPeriodState,
  RewardRule,
  RewardSourceManifest,
} from "@/lib/uki-economy/rewards/types";
import { testGameEconomyRule } from "@/lib/uki-economy/game-economy/testing";
import {
  applyHistoricalOwnWeeklyReprojection,
  HISTORICAL_OWN_WEEKLY_DATABASE,
  isHistoricalOwnWeeklyReprojectionReplay,
  planHistoricalOwnWeeklyReprojection,
  readHistoricalOwnWeeklyReprojectionPlan,
  type HistoricalOwnWeeklyPlan,
  type HistoricalOwnWeeklyRecord,
  type HistoricalOwnWeeklySnapshot,
} from "@/lib/uki-economy/game-economy/historical-own-weekly-reprojection";

const WALLET = `0x${"1".repeat(40)}`;
const CREDIT_RULE_VERSION = "credits-v1";
const CREDIT_RULE_CONFIG_HASH = "c".repeat(64);
const ACTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");
const PLAN_NOW = new Date("2026-07-20T12:00:00.000Z");
const PERIOD_A_START = new Date("2026-07-06T14:00:00.000Z");
const PERIOD_B_START = new Date("2026-07-13T14:00:00.000Z");
const SESSION_TTL_MS = 10 * 60 * 1_000;

type FixtureBundle = {
  input: {
    walletNormalized: string;
    sessionIds: readonly string[];
    now: Date;
  };
  snapshot: HistoricalOwnWeeklySnapshot;
  docs: Record<string, Document[]>;
};

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, clone(child)]),
    ) as T;
  }
  return value;
}

function rewardRuleFixture(): RewardRule {
  const defaults = testRewardRule();
  return testRewardRule({
    _id: "reward_allocations:rewards-staging-cycle-v1",
    version: "rewards-staging-cycle-v1",
    activeFrom: ACTIVE_FROM,
    createdAt: ACTIVE_FROM,
    updatedAt: ACTIVE_FROM,
    emissionBudget: {
      ...defaults.emissionBudget,
      programStartsAt: ACTIVE_FROM,
    },
  });
}

function gameRuleFixture(rewardRule: RewardRule) {
  const defaults = testGameEconomyRule();
  return toGameRuleSnapshot(testGameEconomyRule({
    _id: "treasure-hunt:staging-test-v4",
    gameId: "treasure-hunt",
    version: "staging-test-v4",
    activeFrom: ACTIVE_FROM,
    createdAt: ACTIVE_FROM,
    updatedAt: ACTIVE_FROM,
    credit: {
      ...defaults.credit,
      costCode: "treasure-hunt:start",
      creditRuleVersion: CREDIT_RULE_VERSION,
      creditRuleConfigHash: CREDIT_RULE_CONFIG_HASH,
    },
    reward: {
      rewardRuleVersion: rewardRule.version,
      rewardRuleConfigHash: rewardRule.configHash,
      maxConvertibleRaw: "1500",
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
      scoreCapRaw: "1000",
      weightNumeratorRaw: "3",
      weightDenominatorRaw: "2",
    },
  }));
}

function creditFixture(input: {
  sessionId: string;
  createdAt: Date;
  settledAt: Date;
  index: number;
}): CreditReservation {
  const expiresAt = new Date(input.createdAt.getTime() + SESSION_TTL_MS);
  const periodId = `${CREDIT_RULE_VERSION}:${CREDIT_RULE_CONFIG_HASH}:2026-07-07`;
  const allocation = {
    lotId: `${String(input.index).padStart(2, "0")}${"a".repeat(62)}`,
    runId: `credit-run-${input.index}`,
    route: "nft" as const,
    amountCredits: 10,
    lotRevision: 0,
    lotExpiresAt: new Date(input.createdAt.getTime() + 24 * 60 * 60 * 1_000),
    reservedUntil: expiresAt,
  };
  const requestHash = stableCreditHash({
    walletNormalized: WALLET,
    sessionId: input.sessionId,
    costCode: "treasure-hunt:start",
    expectedRuleVersion: CREDIT_RULE_VERSION,
    expectedRuleConfigHash: CREDIT_RULE_CONFIG_HASH,
    expiresAtCap: undefined,
  });
  const payloadHash = stableCreditHash({
    walletNormalized: WALLET,
    sessionId: input.sessionId,
    periodId,
    costCode: "treasure-hunt:start",
    amountCredits: 10,
    expiresAt,
    expiresAtCap: undefined,
    ruleVersion: CREDIT_RULE_VERSION,
    ruleConfigHash: CREDIT_RULE_CONFIG_HASH,
  });
  const reservationId = stableCreditHash({
    kind: "credit-reservation",
    walletNormalized: WALLET,
    sessionId: input.sessionId,
    periodId,
    costCode: "treasure-hunt:start",
    ruleVersion: CREDIT_RULE_VERSION,
    ruleConfigHash: CREDIT_RULE_CONFIG_HASH,
  });
  const terminalPayloadHash = stableCreditHash({
    operation: "consume",
    reservationId,
    sessionId: input.sessionId,
    committedAt: input.settledAt,
  });
  return {
    _id: reservationId,
    reservationId,
    sessionId: input.sessionId,
    walletNormalized: WALLET,
    periodId,
    costCode: "treasure-hunt:start",
    expectedRuleVersion: CREDIT_RULE_VERSION,
    expectedRuleConfigHash: CREDIT_RULE_CONFIG_HASH,
    ruleVersion: CREDIT_RULE_VERSION,
    ruleConfigHash: CREDIT_RULE_CONFIG_HASH,
    amountCredits: 10,
    bucket: "own",
    allocations: [allocation],
    status: "consumed",
    expiresAt,
    revision: 1,
    idempotencyKey: `credit-reserve-${input.index}`,
    requestHash,
    payloadHash,
    createdAt: new Date(input.createdAt.getTime() - 60_000),
    updatedAt: input.settledAt,
    terminalAt: input.settledAt,
    terminalCommittedAt: input.settledAt,
    terminalIdempotencyKey: `credit-consume-${input.index}`,
    terminalPayloadHash,
  };
}

function ownAssignmentFixture(input: {
  sessionId: string;
  createdAt: Date;
  settledAt: Date;
  index: number;
  expiresAt: Date;
}): OwnCukieAssignment {
  const assetId = `cukie-own-${input.index}`;
  const ownershipEventId = `ownership-event-${input.index}`;
  const epochId = ownCukieEpochId({
    assetId,
    ownerNormalized: WALLET,
    ownershipEventId,
  });
  const assignmentId = ownCukieAssignmentId(input.sessionId);
  return {
    _id: assignmentId,
    assignmentId,
    sessionId: input.sessionId,
    status: "completed",
    epochId,
    assetId,
    tokenId: String(100 + input.index),
    ownerNormalized: WALLET,
    ownershipEventId,
    generation: "original",
    rarity: "rare",
    lockId: `own-lock-${input.index}`,
    lockFencingToken: 1,
    restoreSoftStake: true,
    idempotencyKey: `own-reserve-${input.index}`,
    requestHash: stableOwnCukieHash({
      kind: "own-cukie-test-reservation",
      assignmentId,
      sessionId: input.sessionId,
    }),
    assignedAt: input.createdAt,
    expiresAt: input.expiresAt,
    revision: 1,
    updatedAt: input.settledAt,
  };
}

function sessionFixture(input: {
  scoreRaw: string;
  periodStart: Date;
  index: number;
  rewardRule: RewardRule;
}) {
  const createdAt = new Date(input.periodStart.getTime() + 60 * 60 * 1_000 + input.index * 1_000);
  const startedAt = new Date(createdAt.getTime() + 1_000);
  const submittedAt = new Date(createdAt.getTime() + 2_000);
  const verifiedAt = new Date(createdAt.getTime() + 3_000);
  const settlementAt = new Date(createdAt.getTime() + 4_000);
  const settledAt = new Date(createdAt.getTime() + 5_000);
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  const gameRule = gameRuleFixture(input.rewardRule);
  const createIdempotencyKey = `create-own-weekly-${input.index}`;
  const createRequestHash = buildGameCreateRequestHash({
    walletNormalized: WALLET,
    gameId: "treasure-hunt",
    cukieAssetIds: [],
    expectedRuleVersion: "staging-test-v4",
  });
  const sessionId = gameSessionId(createIdempotencyKey, createRequestHash);
  const credit = creditFixture({ sessionId, createdAt, settledAt, index: input.index });
  const ownAssignment = ownAssignmentFixture({
    sessionId,
    createdAt,
    settledAt,
    index: input.index,
    expiresAt,
  });
  const creditEvidenceHash = buildGameCreditReservationEvidence(credit).evidenceHash;
  const cukieEvidenceHash = buildGameOwnCukieAssignmentEvidence(ownAssignment).evidenceHash;
  const resource = (kind: "credit" | "cukie", reservationId: string, evidenceHash: string) => {
    const reservationRequestHash = buildGameResourceReservationRequestHash({
      kind,
      sessionId,
      walletNormalized: WALLET,
      gameId: "treasure-hunt",
      rule: gameRule,
      cukieAssetIds: [],
      expiresAt,
    });
    return {
      kind,
      state: "consumed" as const,
      reservationId,
      evidenceHash,
      operationIdempotencyKey: `${sessionId}:${kind}`,
      reservationRequestHash,
      reservationResultHash: buildGameResourceReservationResultHash({
        requestHash: reservationRequestHash,
        reservationId,
        evidenceHash,
      }),
      updatedAt: settledAt,
    };
  };
  const submissionPayloadHash = `${String(input.index).padStart(2, "0")}${"d".repeat(62)}`;
  const evidenceHash = `${String(input.index).padStart(2, "0")}${"e".repeat(62)}`;
  const cappedScoreRaw = BigInt(input.scoreRaw) > BigInt("1000") ? "1000" : input.scoreRaw;
  const weightRaw = ((BigInt(cappedScoreRaw) * BigInt("3")) / BigInt("2")).toString(10);
  const resultHash = buildGameValidationResultHash({
    sessionId,
    ruleConfigHash: gameRule.configHash,
    submissionEvidenceReference: `server-result-${input.index}`,
    submissionPayloadHash,
    evidenceId: `evidence-${input.index}`,
    evidenceHash,
    scoreRaw: input.scoreRaw,
    cappedScoreRaw,
    weightRaw,
  });
  const settlementIntent = {
    idempotencyKey: `settle-own-weekly-${input.index}`,
    requestHash: buildGameSettlementRequestHash({
      sessionId,
      resourceActions: { credit: "consume", cukie: "consume" },
    }),
    decidedAt: settlementAt,
    resourceActions: { credit: "consume" as const, cukie: "consume" as const },
  };
  const session: GameEconomySession = {
    _id: sessionId,
    sessionId,
    walletNormalized: WALLET,
    gameId: "treasure-hunt",
    expectedRuleVersion: "staging-test-v4",
    status: "settled",
    rule: gameRule,
    cukieAssetIds: [],
    credit: resource("credit", credit.reservationId, creditEvidenceHash),
    cukie: resource("cukie", ownAssignment.assignmentId, cukieEvidenceHash),
    reservationPhase: "ready",
    createCommand: {
      idempotencyKey: createIdempotencyKey,
      requestHash: createRequestHash,
      completedAt: createdAt,
      resultingRevision: 0,
    },
    startCommand: {
      idempotencyKey: `start-own-weekly-${input.index}`,
      requestHash: buildGameStartRequestHash({ sessionId, walletNormalized: WALLET }),
      completedAt: startedAt,
      resultingRevision: 1,
    },
    submission: {
      evidenceReference: `server-result-${input.index}`,
      payloadHash: submissionPayloadHash,
      submittedAt,
      command: {
        idempotencyKey: `submit-own-weekly-${input.index}`,
        requestHash: buildGameSubmissionRequestHash({
          sessionId,
          walletNormalized: WALLET,
          evidenceReference: `server-result-${input.index}`,
          payloadHash: submissionPayloadHash,
        }),
        completedAt: submittedAt,
        resultingRevision: 2,
      },
    },
    validation: {
      evidenceId: `evidence-${input.index}`,
      evidenceHash,
      scoreRaw: input.scoreRaw,
      cappedScoreRaw,
      weightRaw,
      resultHash,
      verifiedAt,
      verifier: "server_authorized",
      command: {
        idempotencyKey: `validate-own-weekly-${input.index}`,
        requestHash: buildGameValidationRequestHash(sessionId),
        completedAt: verifiedAt,
        resultingRevision: 3,
      },
    },
    settlementIntent,
    settlementCommand: {
      idempotencyKey: settlementIntent.idempotencyKey,
      requestHash: settlementIntent.requestHash,
      completedAt: settledAt,
      resultingRevision: 5,
    },
    revision: 5,
    fenceToken: 1,
    expiresAt,
    createdAt,
    updatedAt: settledAt,
    startedAt,
    settledAt,
  };
  const daily = getTreasureHuntDailyPeriod(createdAt);
  const weekly = getTreasureHuntWeeklyPeriod(createdAt);
  const runId = `run-own-weekly-${input.index}`;
  const achievedAt = new Date(createdAt.getTime() + 3_500);
  const run: TreasureHuntEconomyRun = {
    _id: runId,
    runId,
    gameEconomySessionId: sessionId,
    authorityGameSessionId: `authority-session-${input.index}`,
    authorityUserId: `user-${input.index}`,
    walletNormalized: WALLET,
    status: "settled",
    policyVersion: "treasure-hunt-staging-v1",
    gameRuleVersion: "staging-test-v4",
    reservedAt: createdAt,
    startedAt,
    dailyPeriodId: daily.periodId,
    dailyPeriodStartsAt: daily.startsAt,
    dailyPeriodEndsAt: daily.endsAt,
    weeklyPeriodId: weekly.periodId,
    weeklyPeriodStartsAt: weekly.startsAt,
    weeklyPeriodEndsAt: weekly.endsAt,
    creditReservationId: credit.reservationId,
    creditPeriodId: credit.periodId,
    creditSource: "own",
    creditEvidenceHash: creditEvidenceHash,
    cukieAssignmentId: ownAssignment.assignmentId,
    cukieSource: "own",
    cukieAssetId: ownAssignment.assetId,
    cukieTokenId: ownAssignment.tokenId,
    cukieGeneration: ownAssignment.generation,
    cukieRarity: ownAssignment.rarity,
    cukieAssignmentKind: "own",
    cukieEvidenceHash,
    ambassadorWalletNormalized: null,
    ambassadorCapturedAt: createdAt,
    ambassadorEvidenceHash: `${"f".repeat(64)}`,
    quotaReservationId: null,
    evidence: [],
    lastEvidenceHash: evidenceHash,
    terminalResultId: `terminal-result-${input.index}`,
    outcome: "completed",
    scoreRaw: input.scoreRaw,
    achievedAt,
    authoritySource: "economy",
    authorityReference: `authority-reference-${input.index}`,
    leaderboardEligible: true,
    rewardEligible: true,
    jackpotEligible: true,
    resultPayloadHash: stableGameEconomyHash({ sessionId, scoreRaw: input.scoreRaw, resultHash }),
    terminalAuthoritySource: "economy",
    terminalAuthorityReference: `terminal-authority-${input.index}`,
    revision: 5,
    createdAt,
    updatedAt: settledAt,
  };
  const sourceBase = {
    sessionId,
    wallet: WALLET,
    gameId: "treasure-hunt",
    scoreRaw: input.scoreRaw,
    periodAnchorAt: createdAt,
    playedAt: achievedAt,
    settledAt,
    status: "settled" as const,
    outcome: "completed" as const,
    resultValid: true as const,
    resultHash,
    creditSnapshot: {
      source: "own" as const,
      reservationId: credit.reservationId,
      evidenceHash: creditEvidenceHash,
    },
    cukieSnapshot: {
      source: "own" as const,
      assignmentId: ownAssignment.assignmentId,
      generation: ownAssignment.generation,
      evidenceHash: cukieEvidenceHash,
    },
    ambassadorSnapshot: {
      walletNormalized: null,
      capturedAt: createdAt,
      evidenceHash: `${"b".repeat(64)}`,
    },
    arenaRankingSnapshot: {
      rank: null,
      rewardBps: 10_000,
      sourceRankingId: null,
      evidenceHash: `${"a".repeat(64)}`,
    },
  };
  const canonicalSource = assertEligibleWeeklyGameResult(sourceBase);
  const source: WeeklyGameSource = {
    _id: `reward-weekly-source:${sessionId}`,
    ...sourceBase,
    payloadHash: stableRewardHash(canonicalSource),
    recordedAt: settledAt,
  };
  const periodState: RewardPeriodState = {
    _id: weekly.periodId,
    periodId: weekly.periodId,
    status: "open",
    allocationRevision: 0,
    revision: 0,
    createdAt: weekly.startsAt,
    updatedAt: weekly.startsAt,
  };
  return {
    run,
    session,
    credit,
    poolAssignment: null,
    ownAssignment,
    source,
    rewardRule: input.rewardRule,
    periodState,
    periodSeal: null,
    weeklyRankingManifests: [],
    weeklyRankingRuns: [],
    weeklyRankingStates: [],
    weeklyRankingAuditEvents: [],
    weeklyRankingSnapshots: [],
    weeklyAccounting: [],
    sourceManifests: [],
    sourceAllocations: [],
    sourceAccruals: [],
    currentBest: null,
  } satisfies HistoricalOwnWeeklyRecord;
}

function bestFixture(record: HistoricalOwnWeeklyRecord, scoreRaw: string, achievedAt: Date, revision = 0): TreasureHuntWeeklyBest {
  const { run } = record;
  const identity = {
    walletNormalized: WALLET,
    weeklyPeriodId: run.weeklyPeriodId,
    gameId: "treasure-hunt" as const,
  };
  const key = treasureHuntScoreOrderKey(scoreRaw);
  return {
    _id: `treasure-weekly-best:${stableGameEconomyHash(identity)}`,
    walletNormalized: WALLET,
    weeklyPeriodId: run.weeklyPeriodId,
    gameId: "treasure-hunt",
    scoreRaw: key.scoreRaw,
    scoreDigits: key.scoreDigits,
    achievedAt,
    winningGameId: run.gameEconomySessionId,
    authorityGameSessionId: run.authorityGameSessionId,
    creditSource: run.creditSource,
    creditReservationId: run.creditReservationId,
    cukieSource: run.cukieSource,
    cukieAssignmentId: run.cukieAssignmentId,
    cukieAssetId: run.cukieAssetId,
    revision,
    createdAt: record.periodState.createdAt,
    updatedAt: record.periodState.updatedAt,
  };
}

export function fixtureBundle(): FixtureBundle {
  const rewardRule = rewardRuleFixture();
  const records = [
    sessionFixture({ scoreRaw: "43", periodStart: PERIOD_A_START, index: 1, rewardRule }),
    sessionFixture({ scoreRaw: "2", periodStart: PERIOD_A_START, index: 2, rewardRule }),
    sessionFixture({ scoreRaw: "6", periodStart: PERIOD_A_START, index: 3, rewardRule }),
    sessionFixture({ scoreRaw: "117", periodStart: PERIOD_B_START, index: 4, rewardRule }),
    sessionFixture({ scoreRaw: "6", periodStart: PERIOD_B_START, index: 5, rewardRule }),
  ];
  const snapshot: HistoricalOwnWeeklySnapshot = { records };
  const input = {
    walletNormalized: WALLET,
    sessionIds: records.map((record) => record.session.sessionId),
    now: PLAN_NOW,
  };
  const unique = <T extends Document>(rows: readonly T[], key: (row: T) => string) => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const value = key(row);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    }).map(clone);
  };
  const docs: Record<string, Document[]> = {
    game_economy_sessions: records.map((record) => clone(record.session)),
    treasure_hunt_economy_runs: records.map((record) => clone(record.run)),
    reward_weekly_game_sources: records.map((record) => clone(record.source)),
    competition_credit_reservations: records.map((record) => clone(record.credit)),
    game_owned_cukie_assignments: records.map((record) => clone(record.ownAssignment!)),
    economy_rule_versions: [clone(rewardRule)],
    reward_period_states: unique(records.map((record) => record.periodState), (row) => row._id),
    reward_period_seals: [],
    weekly_ranking_manifests: [],
    weekly_ranking_runs: [],
    weekly_ranking_period_states: [],
    weekly_ranking_audit_events: [],
    game_weekly_rankings: [],
    reward_weekly_prize_accounting: [],
    reward_source_manifests: [],
    reward_allocations: [],
    reward_pool_accruals: [],
    treasure_hunt_weekly_bests: [],
  };
  return { input, snapshot, docs };
}

class FakeCollection<T extends Document> {
  constructor(private readonly db: FakeDb, private readonly name: string) {}

  private rows() {
    return this.db.docs[this.name] as T[];
  }

  private matches(row: T, filter: Record<string, unknown>) {
    return Object.entries(filter).every(([key, expected]) => {
      if (expected && typeof expected === "object" && "$in" in expected) {
        return (expected as { $in: unknown[] }).$in.includes((row as Record<string, unknown>)[key]);
      }
      return expected === undefined || (row as Record<string, unknown>)[key] === expected;
    });
  }

  find(filter: object, _options?: object) {
    return { toArray: async () => this.rows().filter((row) => this.matches(row, filter as Record<string, unknown>)).map(clone) };
  }

  async findOne(filter: Record<string, unknown>, _options?: object) {
    const id = filter._id;
    return this.rows().find((row) => this.matches(row, filter)) ?? null;
  }

  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, _options?: object) {
    const row = this.rows().find((candidate) => (
      candidate._id === filter._id
      && (filter.status === undefined || candidate.status === filter.status)
      && (filter.revision === undefined || candidate.revision === filter.revision)
      && (filter.allocationRevision === undefined || candidate.allocationRevision === filter.allocationRevision)
    ));
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    const inc = update.$inc as Record<string, number> | undefined;
    const set = update.$set as Record<string, unknown> | undefined;
    if (inc) Object.entries(inc).forEach(([key, value]) => { (row as Record<string, unknown>)[key] = ((row as Record<string, unknown>)[key] as number) + value; });
    if (set) Object.assign(row, set);
    this.db.writes.updates += 1;
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async insertOne(document: T, _options?: object) {
    if (this.rows().some((row) => row._id === document._id)) {
      throw Object.assign(new Error("duplicate"), { code: 11000 });
    }
    this.rows().push(clone(document));
    this.db.writes.inserts += 1;
    return { acknowledged: true, insertedId: document._id };
  }

  async replaceOne(filter: Record<string, unknown>, replacement: T, _options?: object) {
    const index = this.rows().findIndex((row) => row._id === filter._id && row.revision === filter.revision);
    if (index < 0) return { matchedCount: 0, modifiedCount: 0 };
    this.rows()[index] = clone(replacement);
    this.db.writes.replaces += 1;
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async deleteMany(_filter: object) {
    const count = this.rows().length;
    this.db.docs[this.name] = [];
    return { deletedCount: count };
  }
}

class FakeDb {
  readonly databaseName = HISTORICAL_OWN_WEEKLY_DATABASE;
  readonly writes = { updates: 0, inserts: 0, replaces: 0 };
  constructor(readonly docs: Record<string, Document[]>) {}
  collection<T extends Document>(name: string) {
    if (!this.docs[name]) this.docs[name] = [];
    return new FakeCollection<T>(this, name);
  }
}

function tx(inTransaction = true) {
  return { inTransaction: () => inTransaction } as unknown as ClientSession;
}

function docsForDb(bundle: FixtureBundle) {
  return clone(bundle.docs);
}

describe("reproyección histórica OWN semanal", () => {
  it("elige 43/117 por periodo y conserva la identidad de source, sesión, cuotas, rewards y Arena", () => {
    const bundle = fixtureBundle();
    const plan = planHistoricalOwnWeeklyReprojection(bundle.snapshot, bundle.input);

    expect(plan.periods).toHaveLength(2);
    expect(plan.periods.map((period) => period.desiredBest?.scoreRaw)).toEqual(["43", "117"]);
    expect(plan.periods.map((period) => period.action)).toEqual(["insert", "insert"]);
    expect(plan.entries.filter((entry) => entry.action === "covered_by_candidate")).toHaveLength(3);
    expect(plan.entries.filter((entry) => entry.winner)).toHaveLength(2);
    expect(plan.periods[0].desiredBest).toMatchObject({
      winningGameId: bundle.snapshot.records[0].session.sessionId,
      creditSource: "own",
      cukieSource: "own",
      creditReservationId: bundle.snapshot.records[0].credit.reservationId,
      cukieAssignmentId: bundle.snapshot.records[0].ownAssignment?.assignmentId,
    });
    expect(bundle.snapshot.records.map((record) => record.source.scoreRaw)).toEqual(["43", "2", "6", "117", "6"]);
  });

  it("conserva un mejor actual en empate posterior y sustituye solo el empate anterior", () => {
    const laterTie = fixtureBundle();
    const baseline = bestFixture(
      laterTie.snapshot.records[0],
      "43",
      new Date(laterTie.snapshot.records[0].run.achievedAt!.getTime() - 1_000),
      7,
    );
    for (const record of laterTie.snapshot.records.slice(0, 3)) {
      (record as unknown as { currentBest: TreasureHuntWeeklyBest | null }).currentBest = clone(baseline);
    }
    const preserved = planHistoricalOwnWeeklyReprojection(laterTie.snapshot, laterTie.input);
    expect(preserved.periods[0]).toMatchObject({ action: "covered_by_existing", currentBest: baseline, desiredBest: baseline });

    const higherExisting = fixtureBundle();
    const higherBaseline = bestFixture(
      higherExisting.snapshot.records[0],
      "999",
      new Date(higherExisting.snapshot.records[0].run.achievedAt!.getTime() - 1_000),
      8,
    );
    for (const record of higherExisting.snapshot.records.slice(0, 3)) {
      (record as unknown as { currentBest: TreasureHuntWeeklyBest | null }).currentBest = clone(higherBaseline);
    }
    const higherPreserved = planHistoricalOwnWeeklyReprojection(higherExisting.snapshot, higherExisting.input);
    expect(higherPreserved.periods[0]).toMatchObject({ action: "covered_by_existing" });
    expect(higherPreserved.periods[0].currentBest?.scoreRaw).toBe("999");
    expect(higherPreserved.periods[0].desiredBest?.scoreRaw).toBe("999");

    const earlierTie = fixtureBundle();
    const laterBaseline = bestFixture(
      earlierTie.snapshot.records[0],
      "43",
      new Date(earlierTie.snapshot.records[0].run.achievedAt!.getTime() + 1_000),
      7,
    );
    for (const record of earlierTie.snapshot.records.slice(0, 3)) {
      (record as unknown as { currentBest: TreasureHuntWeeklyBest | null }).currentBest = clone(laterBaseline);
    }
    const replaced = planHistoricalOwnWeeklyReprojection(earlierTie.snapshot, earlierTie.input);
    expect(replaced.periods[0].action).toBe("replace");
    expect(replaced.periods[0].desiredBest?.winningGameId).toBe(earlierTie.snapshot.records[0].session.sessionId);
  });

  it.each([
    ["source", (record: HistoricalOwnWeeklyRecord) => { record.source.scoreRaw = "44"; }],
    ["regla rewards", (record: HistoricalOwnWeeklyRecord) => { record.rewardRule.active = false; }],
    ["reserva", (record: HistoricalOwnWeeklyRecord) => { record.credit.status = "released"; }],
    ["asignación NFT", (record: HistoricalOwnWeeklyRecord) => { record.ownAssignment!.assetId = "mutated-asset"; }],
  ])("rechaza datos incongruentes de %s usando las guardas canónicas", (_label, mutate) => {
    const bundle = fixtureBundle();
    const broken = clone(bundle.snapshot);
    mutate(broken.records[0]);
    expect(() => planHistoricalOwnWeeklyReprojection(broken, bundle.input)).toThrow();
  });

  it("bloquea un manifiesto reward con sourceId canónico y el namespace game-session duplicado desde Mongo", async () => {
    const bundle = fixtureBundle();
    const sessionId = bundle.snapshot.records[0].session.sessionId;
    expect(sessionId).toMatch(/^game-session:/);
    bundle.docs.reward_source_manifests.push({
      _id: "reward-source-manifest-blocked",
      sourceId: `game-session:${sessionId}`,
    } as RewardSourceManifest);
    const db = new FakeDb(docsForDb(bundle));
    await expect(readHistoricalOwnWeeklyReprojectionPlan(db as unknown as Db, bundle.input)).rejects.toThrow(/manifest|source/i);
  });

  it.each([
    ["estado cerrado", (record: HistoricalOwnWeeklyRecord) => { record.periodState.status = "sealed"; }],
    ["sello", (record: HistoricalOwnWeeklyRecord) => { (record as unknown as { periodSeal: RewardPeriodSeal | null }).periodSeal = { _id: "period-seal" } as RewardPeriodSeal; }],
    ["accounting", (record: HistoricalOwnWeeklyRecord) => { (record as unknown as { weeklyAccounting: HistoricalOwnWeeklyRecord["weeklyAccounting"] }).weeklyAccounting = [{ _id: "weekly-accounting" } as HistoricalOwnWeeklyRecord["weeklyAccounting"][number]]; }],
  ])("rechaza %s antes de escribir", (_label, mutate) => {
    const bundle = fixtureBundle();
    const broken = clone(bundle.snapshot);
    mutate(broken.records[0]);
    expect(() => planHistoricalOwnWeeklyReprojection(broken, bundle.input)).toThrow();
  });

  it("rechaza un payload adulterado aunque conserve el planHash", async () => {
    const bundle = fixtureBundle();
    const plan = planHistoricalOwnWeeklyReprojection(bundle.snapshot, bundle.input);
    const adultered = clone(plan) as HistoricalOwnWeeklyPlan & { entries: HistoricalOwnWeeklyPlan["entries"] };
    (adultered.entries[0] as { scoreRaw: string }).scoreRaw = "999";
    await expect(applyHistoricalOwnWeeklyReprojection(
      new FakeDb(docsForDb(bundle)) as unknown as Db,
      tx(),
      adultered,
    )).rejects.toThrow(/hash|payload/i);
  });

  it("aplica y el replay exacto posterior produce cero escrituras", async () => {
    const bundle = fixtureBundle();
    const db = new FakeDb(docsForDb(bundle));
    const plan = await readHistoricalOwnWeeklyReprojectionPlan(db as unknown as Db, bundle.input);
    const applied = await applyHistoricalOwnWeeklyReprojection(db as unknown as Db, tx(), plan);
    expect(applied).toMatchObject({ status: "applied", replayed: false, periodsFenced: 2, bestsInserted: 2, bestsReplaced: 0 });
    const writesAfterApply = clone(db.writes);
    const replayed = await applyHistoricalOwnWeeklyReprojection(db as unknown as Db, tx(), plan);
    expect(replayed).toMatchObject({ status: "replayed", replayed: true, periodsFenced: 0, bestsInserted: 0, bestsReplaced: 0 });
    expect(db.writes).toEqual(writesAfterApply);
    expect(db.docs.treasure_hunt_weekly_bests).toHaveLength(2);
    expect(isHistoricalOwnWeeklyReprojectionReplay(plan, await readHistoricalOwnWeeklyReprojectionPlan(db as unknown as Db, bundle.input))).toBe(true);
  });

  it.each([
    ["revision", (db: FakeDb, bundle: FixtureBundle) => {
      const state = db.docs.reward_period_states.find((row) => row._id === bundle.snapshot.records[0].run.weeklyPeriodId)!;
      state.revision = 9;
      state.updatedAt = new Date(PLAN_NOW.getTime() + 1_000);
    }],
    ["mejor actual", (db: FakeDb, bundle: FixtureBundle) => {
      const record = bundle.snapshot.records[0];
      db.docs.treasure_hunt_weekly_bests.push(bestFixture(record, "999", record.run.achievedAt!, 0));
    }],
  ])("rechaza una carrera de %s entre plan y apply sin escribir", async (_label, race) => {
    const bundle = fixtureBundle();
    const db = new FakeDb(docsForDb(bundle));
    const plan = await readHistoricalOwnWeeklyReprojectionPlan(db as unknown as Db, bundle.input);
    race(db, bundle);
    const before = clone(db.writes);
    const bestsBefore = db.docs.treasure_hunt_weekly_bests.length;
    await expect(applyHistoricalOwnWeeklyReprojection(db as unknown as Db, tx(), plan)).rejects.toThrow(/hash|cambio|revisado/i);
    expect(db.writes).toEqual(before);
    expect(db.docs.treasure_hunt_weekly_bests).toHaveLength(bestsBefore);
  });

  it("rechaza apply fuera de transacción y en una base distinta", async () => {
    const bundle = fixtureBundle();
    const plan = planHistoricalOwnWeeklyReprojection(bundle.snapshot, bundle.input);
    await expect(applyHistoricalOwnWeeklyReprojection(new FakeDb(docsForDb(bundle)) as unknown as Db, tx(false), plan)).rejects.toThrow(/transacci[oó]n/i);
    const wrongDb = Object.assign(new FakeDb(docsForDb(bundle)), { databaseName: "other-db" });
    await expect(applyHistoricalOwnWeeklyReprojection(wrongDb as unknown as Db, tx(), plan)).rejects.toThrow(/base/i);
  });
});
