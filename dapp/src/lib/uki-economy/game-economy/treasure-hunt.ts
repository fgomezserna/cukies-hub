import "server-only";

import type { ClientSession, Db } from "mongodb";

import { prisma } from "@/lib/prisma";
import { getEconomyDb, withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import type { CukiePoolAssignment } from "@/lib/uki-economy/cukie-pool/types";
import type { OwnCukieAssignment } from "@/lib/uki-economy/own-cukie/types";
import { resolveMongoAmbassadorAttribution } from "@/lib/uki-economy/ambassadors/repository";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  StaleFenceError,
  UkiEconomyError,
} from "../errors";
import { openGameSession } from "./coordinator";
import {
  TREASURE_HUNT_ECONOMY_POLICY,
  canonicalTreasureHuntScore,
  finishTreasureHuntPoolQuota,
  getTreasureHuntDailyPeriod,
  getTreasureHuntWeeklyPeriod,
  reserveTreasureHuntPoolQuota,
  shouldReplaceTreasureHuntWeeklyBest,
  treasureHuntScoreOrderKey,
  treasureHuntResultEligibility,
  validateTreasureHuntEvidence,
} from "./treasure-hunt-policy";
import type {
  TreasureHuntEconomyRun,
  TreasureHuntEconomyResultResponse,
  TreasureHuntEconomyStartResponse,
  TreasureHuntEvidencePoint,
  TreasureHuntPoolDailyUsage,
  TreasureHuntPoolQuotaReservation,
  TreasureHuntWeeklyBest,
} from "./treasure-hunt-types";
import type { GameEconomySession } from "./types";
import {
  stableGameEconomyHash,
  validGameText,
  validGameWallet,
} from "./rules";
import { completeGameSession, rejectGameSession } from "./coordinator";
import {
  createMongoGameEconomyPorts,
} from "./resource-ports";
import { createMongoGameEconomyService } from "./service";
import { rewardAccountingService } from "../rewards/accounting-repository";
import type { WeeklyGameResult } from "../rewards/accounting-types";
import { resolveAppliedArenaRanking } from "../rewards/arena-ranking";
import { rewardRuleActiveAtQuery } from "../rewards/rules";
import type { RewardRule } from "../rewards/types";

type CompetitionAttemptAuthority = {
  attemptId: string;
  userId: string;
  gameId: string;
  gameSessionId: string;
  walletAddress: string;
  score: number;
  gameTimeMs: number;
  status: "active" | "valid" | "invalid" | "review" | "abandoned";
  finishedAt: string | null;
  finishPendingAuthority?: boolean;
  updatedAt?: string;
};

type FinishAuthority = {
  scoreRaw: string;
  gameTimeMs: number;
  achievedAt: Date;
  authorityReference: string;
};

function quotaUsageId(walletNormalized: string, dailyPeriodId: string) {
  return `treasure-usage-${stableGameEconomyHash({ walletNormalized, dailyPeriodId })}`;
}

function quotaReservationId(runId: string) {
  return `treasure-quota-${stableGameEconomyHash({ runId })}`;
}

function runIdFor(input: {
  authorityGameSessionId: string;
  walletNormalized: string;
}) {
  return `treasure-run-${stableGameEconomyHash(input)}`;
}

function responseForRun(run: TreasureHuntEconomyRun): TreasureHuntEconomyStartResponse {
  if (run.status !== "active") {
    throw new DomainConflictError(
      `La GameSession ya tiene un run de Treasure Hunt en estado ${run.status}.`,
    );
  }
  return {
    runId: run.runId,
    gameEconomySessionId: run.gameEconomySessionId,
    creditSource: run.creditSource,
    cukieSource: run.cukieSource,
    cukieAssetId: run.cukieAssetId,
    dailyPeriodId: run.dailyPeriodId,
    dailyPeriodEndsAt: run.dailyPeriodEndsAt.toISOString(),
  };
}

function assertRunOwner(
  run: TreasureHuntEconomyRun,
  identity: { userId: string; walletNormalized: string },
) {
  if (
    run.authorityUserId !== identity.userId ||
    run.walletNormalized !== identity.walletNormalized
  ) {
    throw new DomainNotFoundError("No existe el run solicitado.");
  }
  return run;
}

function evidenceState(run: TreasureHuntEconomyRun) {
  const last = run.evidence.at(-1);
  return {
    startedAt: run.startedAt,
    nextSequence: run.evidence.length,
    lastScoreRaw: last?.scoreRaw ?? "0",
    lastGameTimeMs: last?.gameTimeMs ?? 0,
  };
}

function evidencePoint(input: {
  run: TreasureHuntEconomyRun;
  evidencePointId: string;
  kind: TreasureHuntEvidencePoint["kind"];
  scoreRaw: string;
  gameTimeMs: number;
  receivedAt: Date;
}) {
  const validated = input.kind === "forfeit"
    ? {
        sequence: input.run.evidence.length,
        scoreRaw: "0",
        gameTimeMs: input.gameTimeMs,
        receivedAt: input.receivedAt,
      }
    : validateTreasureHuntEvidence(evidenceState(input.run), {
        scoreRaw: input.scoreRaw,
        gameTimeMs: input.gameTimeMs,
        receivedAt: input.receivedAt,
      });
  const payload = {
    evidencePointId: validGameText(input.evidencePointId, "evidencePointId"),
    sequence: validated.sequence,
    kind: input.kind,
    scoreRaw: validated.scoreRaw,
    gameTimeMs: validated.gameTimeMs,
    receivedAt: validated.receivedAt,
    previousHash: input.run.lastEvidenceHash,
  };
  return {
    ...payload,
    evidenceHash: stableGameEconomyHash(payload),
  } satisfies TreasureHuntEvidencePoint;
}

function resultResponse(run: TreasureHuntEconomyRun): TreasureHuntEconomyResultResponse {
  if (run.status !== "settled" && run.status !== "forfeited") {
    throw new DomainConflictError(`El run ${run.runId} aun no es terminal.`);
  }
  const eligibility = treasureHuntResultEligibility({
    status: run.status,
    creditSource: run.creditSource,
  });
  return {
    runId: run.runId,
    status: run.status,
    scoreRaw: run.scoreRaw ?? "0",
    creditSource: run.creditSource,
    cukieSource: run.cukieSource,
    cukieAssetId: run.cukieAssetId,
    weeklyPeriodId: run.weeklyPeriodId,
    weeklyPeriodEndsAt: run.weeklyPeriodEndsAt.toISOString(),
    ...eligibility,
  };
}

async function loadOwnedRun(input: {
  runId: string;
  userId: string;
  walletNormalized: string;
}) {
  const db = await getEconomyDb();
  const run = await db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
    .findOne({ runId: validGameText(input.runId, "runId") });
  if (!run) throw new DomainNotFoundError("No existe el run solicitado.");
  return assertRunOwner(run, input);
}

async function canonicalFinishAuthority(input: {
  run: TreasureHuntEconomyRun;
  outcome: "completed" | "voluntary_forfeit";
  authoritySource: "competition" | "economy";
  authorityReference?: string;
  scoreRaw: string;
  gameTimeMs: number;
  now: Date;
}): Promise<FinishAuthority> {
  if (input.outcome === "voluntary_forfeit") {
    return {
      scoreRaw: "0",
      gameTimeMs: input.gameTimeMs,
      achievedAt: input.run.achievedAt ?? input.now,
      authorityReference: validGameText(
        input.authorityReference ?? `forfeit:${input.run.runId}`,
        "authorityReference",
      ),
    };
  }
  if (input.authoritySource === "competition") {
    const authorityReference = validGameText(
      input.authorityReference,
      "authorityReference",
    );
    const db = await getEconomyDb();
    const attempt = await db.collection<CompetitionAttemptAuthority>("presale_game_attempts")
      .findOne({ attemptId: authorityReference });
    if (
      !attempt ||
      attempt.status !== "valid" ||
      attempt.userId !== input.run.authorityUserId ||
      attempt.gameId !== "treasure-hunt" ||
      attempt.gameSessionId !== input.run.authorityGameSessionId ||
      attempt.walletAddress.toLowerCase() !== input.run.walletNormalized ||
      !Number.isSafeInteger(attempt.score) || attempt.score < 0 ||
      !Number.isSafeInteger(attempt.gameTimeMs) || attempt.gameTimeMs < 0 ||
      !attempt.finishedAt
    ) {
      throw new DomainConflictError(
        "La partida de competicion aun no tiene una autoridad valida y enlazada.",
      );
    }
    const achievedAt = new Date(attempt.finishedAt);
    if (Number.isNaN(achievedAt.getTime())) {
      throw new DomainConflictError("La autoridad de competicion no tiene finishedAt valido.");
    }
    return {
      scoreRaw: canonicalTreasureHuntScore(String(attempt.score)),
      gameTimeMs: attempt.gameTimeMs,
      achievedAt,
      authorityReference,
    };
  }
  const parent = await prisma.gameSession.findUnique({
    where: { sessionId: input.run.authorityGameSessionId },
    select: { competitionAttemptId: true },
  });
  if (!parent || parent.competitionAttemptId) {
    throw new DomainConflictError(
      "Una sesion de competicion no puede cerrarse con autoridad economica local.",
    );
  }
  return {
    scoreRaw: canonicalTreasureHuntScore(input.scoreRaw),
    gameTimeMs: input.gameTimeMs,
    achievedAt: input.run.achievedAt ?? input.now,
    authorityReference: validGameText(
      input.authorityReference ?? `economy:${input.run.runId}`,
      "authorityReference",
    ),
  };
}

export async function assertTreasureHuntAuthorityGameSession(input: {
  userId: string;
  gameSessionId: string;
}) {
  const gameSessionId = validGameText(input.gameSessionId, "gameSessionId");
  const current = await prisma.gameSession.findUnique({
    where: { sessionId: gameSessionId },
    select: { sessionId: true, userId: true, gameId: true, isActive: true },
  });
  if (
    !current ||
    current.userId !== input.userId ||
    current.gameId !== "sybil-slayer" ||
    current.isActive !== true
  ) {
    throw new DomainNotFoundError("La GameSession no autoriza un run de Treasure Hunt.");
  }
  return current;
}

async function loadReservedResources(session: GameEconomySession, materializedAt: Date) {
  if (
    session.status !== "started" ||
    !session.startedAt ||
    !session.credit.reservationId ||
    !session.credit.evidenceHash ||
    !session.cukie.reservationId ||
    !session.cukie.evidenceHash
  ) {
    throw new DomainConflictError("GameEconomy no dejo ambos recursos reservados y activos.");
  }
  const db = await getEconomyDb();
  const credit = await db.collection<CreditReservation>("competition_credit_reservations")
    .findOne({ reservationId: session.credit.reservationId, status: "active" });
  if (!credit || credit.walletNormalized !== session.walletNormalized) {
    throw new DomainConflictError("La reserva de creditos no liga el run economico.");
  }
  const own = await db.collection<OwnCukieAssignment>("game_owned_cukie_assignments")
    .findOne({ assignmentId: session.cukie.reservationId, status: "active" });
  const pool = own
    ? null
    : await db.collection<CukiePoolAssignment>("cukie_pool_assignments")
      .findOne({ assignmentId: session.cukie.reservationId, status: "active" });
  if (!own && !pool) {
    throw new DomainConflictError("La asignacion Cukie no liga el run economico.");
  }
  const assignment = own ?? pool!;
  if (assignment.sessionId !== session.sessionId) {
    throw new DomainConflictError("La asignacion Cukie pertenece a otra sesion.");
  }
  const ambassadorAttribution = await resolveMongoAmbassadorAttribution(
    db,
    session.walletNormalized,
    session.createdAt,
    undefined,
    materializedAt,
  );
  const ambassadorWalletNormalized = ambassadorAttribution?.ambassadorWalletNormalized ?? null;
  if (ambassadorWalletNormalized === session.walletNormalized) {
    throw new DomainConflictError("La autorreferencia no puede fijarse como ambassador.");
  }
  return {
    credit,
    assignment,
    own: Boolean(own),
    creditEvidenceHash: session.credit.evidenceHash,
    cukieEvidenceHash: session.cukie.evidenceHash,
    ambassadorWalletNormalized,
    ambassadorAttributionEvidence: ambassadorAttribution ? {
      attributionId: ambassadorAttribution.attributionId,
      evidenceHash: ambassadorAttribution.evidenceHash,
      policyVersion: ambassadorAttribution.policyVersion,
      commissionBps: ambassadorAttribution.commissionBpsSnapshot,
      levels: ambassadorAttribution.levelsSnapshot,
    } : null,
  };
}

export async function openTreasureHuntEconomyRun(input: {
  userId: string;
  walletAddress: string;
  authorityGameSessionId: string;
  requestId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const walletNormalized = validGameWallet(input.walletAddress);
  validGameText(input.requestId, "requestId");
  await assertTreasureHuntAuthorityGameSession({
    userId: input.userId,
    gameSessionId: input.authorityGameSessionId,
  });
  const authorityGameSessionId = validGameText(
    input.authorityGameSessionId,
    "authorityGameSessionId",
  );
  const runId = runIdFor({ authorityGameSessionId, walletNormalized });
  const existingDb = await getEconomyDb();
  const existing = await existingDb.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
    .findOne({ runId });
  if (existing) {
    return responseForRun(assertRunOwner(existing, {
      userId: input.userId,
      walletNormalized,
    }));
  }

  const gameSession = await openGameSession({
    walletAddress: walletNormalized,
    gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
    expectedRuleVersion: TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
    idempotencyKey: `treasure-open-${stableGameEconomyHash({ runId })}`,
    now,
  });
  const resources = await loadReservedResources(gameSession, now);
  const daily = getTreasureHuntDailyPeriod(gameSession.createdAt, gameSession.rule.calendar);
  const weekly = getTreasureHuntWeeklyPeriod(gameSession.createdAt, gameSession.rule.calendar);
  const quotaId = resources.credit.bucket === "pool"
    ? quotaReservationId(runId)
    : null;
  const ambassadorCapturedAt = gameSession.createdAt;
  const run: TreasureHuntEconomyRun = {
    _id: runId,
    runId,
    gameEconomySessionId: gameSession.sessionId,
    authorityGameSessionId,
    authorityUserId: input.userId,
    walletNormalized,
    status: "active",
    policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion,
    gameRuleVersion: TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
    reservedAt: gameSession.createdAt,
    startedAt: gameSession.startedAt!,
    dailyPeriodId: daily.periodId,
    dailyPeriodStartsAt: daily.startsAt,
    dailyPeriodEndsAt: daily.endsAt,
    weeklyPeriodId: weekly.periodId,
    weeklyPeriodStartsAt: weekly.startsAt,
    weeklyPeriodEndsAt: weekly.endsAt,
    creditReservationId: resources.credit.reservationId,
    creditPeriodId: resources.credit.periodId,
    creditSource: resources.credit.bucket,
    creditEvidenceHash: resources.creditEvidenceHash,
    cukieAssignmentId: resources.assignment.assignmentId,
    cukieSource: resources.own ? "own" : "pool",
    cukieAssetId: resources.assignment.assetId,
    cukieTokenId: resources.assignment.tokenId,
    cukieGeneration: resources.assignment.generation,
    cukieRarity: resources.assignment.rarity,
    cukieAssignmentKind: resources.own
      ? "own"
      : (resources.assignment as CukiePoolAssignment).kind,
    cukieEvidenceHash: resources.cukieEvidenceHash,
    ambassadorWalletNormalized: resources.ambassadorWalletNormalized,
    ambassadorCapturedAt,
    ambassadorEvidenceHash: stableGameEconomyHash({
      walletNormalized,
      ambassadorWalletNormalized: resources.ambassadorWalletNormalized,
      attribution: resources.ambassadorAttributionEvidence,
      capturedAt: ambassadorCapturedAt,
    }),
    quotaReservationId: quotaId,
    evidence: [],
    lastEvidenceHash: stableGameEconomyHash({ kind: "treasure-genesis", runId }),
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const persisted = await withEconomyTransaction(async (db, mongoSession) => {
      const replay = await db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
        .findOne({ runId }, { session: mongoSession });
      if (replay) return assertRunOwner(replay, {
        userId: input.userId,
        walletNormalized,
      });
      if (quotaId) {
        const usageId = quotaUsageId(walletNormalized, daily.periodId);
        const current = await db.collection<TreasureHuntPoolDailyUsage>("treasure_hunt_pool_daily_usage")
          .findOne({ _id: usageId }, { session: mongoSession });
        const counters = reserveTreasureHuntPoolQuota(current ?? {
          reservedGames: 0,
          reservedLowScoreSlots: 0,
          countedGames: 0,
          lowScoreGames: 0,
        });
        const usage: TreasureHuntPoolDailyUsage = current
          ? { ...current, ...counters, revision: current.revision + 1, updatedAt: now }
          : {
              _id: usageId,
              walletNormalized,
              dailyPeriodId: daily.periodId,
              policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion,
              ...counters,
              revision: 0,
              createdAt: now,
              updatedAt: now,
            };
        if (current) {
          const result = await db.collection<TreasureHuntPoolDailyUsage>("treasure_hunt_pool_daily_usage")
            .replaceOne({ _id: current._id, revision: current.revision }, usage, { session: mongoSession });
          if (result.matchedCount !== 1) throw new StaleFenceError("La cuota diaria cambio durante la reserva.");
        } else {
          await db.collection<TreasureHuntPoolDailyUsage>("treasure_hunt_pool_daily_usage")
            .insertOne(usage, { session: mongoSession });
        }
        const quota: TreasureHuntPoolQuotaReservation = {
          _id: quotaId,
          reservationId: quotaId,
          runId,
          walletNormalized,
          dailyPeriodId: daily.periodId,
          status: "reserved",
          countedLowScore: null,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection<TreasureHuntPoolQuotaReservation>("treasure_hunt_pool_quota_reservations")
          .insertOne(quota, { session: mongoSession });
      }
      await db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
        .insertOne(run, { session: mongoSession });
      return run;
    });
    return responseForRun(persisted);
  } catch (error) {
    const winner = await existingDb.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
      .findOne({ runId });
    if (!winner) {
      try {
        const cleanup = createMongoGameEconomyService(createMongoGameEconomyPorts());
        await cleanup.rejectSession({
          sessionId: gameSession.sessionId,
          reasonCode: "treasure_open_failed",
          idempotencyKey: `treasure-open-cleanup:${stableGameEconomyHash({ runId })}`,
          expectedRevision: gameSession.revision,
          now,
        });
      } catch {
        // El sweeper de GameEconomy reanuda intents parciales. Conservamos el
        // error original para que el cliente no crea que la partida comenzo.
      }
      throw error;
    }
    return responseForRun(assertRunOwner(winner, {
      userId: input.userId,
      walletNormalized,
    }));
  }
}

export async function appendTreasureHuntEconomyCheckpoint(input: {
  userId: string;
  walletAddress: string;
  runId: string;
  checkpointId: string;
  scoreRaw: string;
  gameTimeMs: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const walletNormalized = validGameWallet(input.walletAddress);
  const runId = validGameText(input.runId, "runId");
  const checkpointId = validGameText(input.checkpointId, "checkpointId");
  const evidencePointId = `checkpoint:${stableGameEconomyHash({ runId, checkpointId })}`;
  return withEconomyTransaction(async (db, mongoSession) => {
    const collection = db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs");
    const current = await collection.findOne({ runId }, { session: mongoSession });
    if (!current) throw new DomainNotFoundError("No existe el run solicitado.");
    assertRunOwner(current, { userId: input.userId, walletNormalized });
    const replay = current.evidence.find((point) => point.evidencePointId === evidencePointId);
    if (replay) {
      const requested = evidencePoint({
        run: { ...current, evidence: current.evidence.slice(0, replay.sequence), lastEvidenceHash: replay.previousHash },
        evidencePointId,
        kind: "checkpoint",
        scoreRaw: input.scoreRaw,
        gameTimeMs: input.gameTimeMs,
        receivedAt: replay.receivedAt,
      });
      if (requested.evidenceHash !== replay.evidenceHash) {
        throw new DomainConflictError("El checkpoint ya existe con otro payload.");
      }
      return { sequence: replay.sequence, evidenceHash: replay.evidenceHash };
    }
    if (current.status !== "active") {
      throw new DomainConflictError(`No se puede anadir evidencia desde ${current.status}.`);
    }
    const point = evidencePoint({
      run: current,
      evidencePointId,
      kind: "checkpoint",
      scoreRaw: input.scoreRaw,
      gameTimeMs: input.gameTimeMs,
      receivedAt: now,
    });
    const updated = await collection.updateOne(
      { runId, revision: current.revision, status: "active" },
      {
        $push: { evidence: point },
        $set: { lastEvidenceHash: point.evidenceHash, updatedAt: now },
        $inc: { revision: 1 },
      },
      { session: mongoSession },
    );
    if (updated.matchedCount !== 1) {
      throw new StaleFenceError("El run cambio durante el checkpoint.");
    }
    return { sequence: point.sequence, evidenceHash: point.evidenceHash };
  });
}

async function finalizePoolQuota(input: {
  db: Db;
  mongoSession: ClientSession;
  run: TreasureHuntEconomyRun;
  outcome: "completed" | "voluntary_forfeit" | "system_failure";
  scoreRaw: string;
  now: Date;
}) {
  if (!input.run.quotaReservationId) return;
  const quotas = input.db.collection<TreasureHuntPoolQuotaReservation>(
    "treasure_hunt_pool_quota_reservations",
  );
  const quota = await quotas.findOne(
    { reservationId: input.run.quotaReservationId },
    { session: input.mongoSession },
  );
  if (!quota) throw new DomainConflictError("Falta la reserva de cuota del run.");
  if (quota.status !== "reserved") return;
  const usages = input.db.collection<TreasureHuntPoolDailyUsage>(
    "treasure_hunt_pool_daily_usage",
  );
  const usage = await usages.findOne(
    { _id: quotaUsageId(input.run.walletNormalized, input.run.dailyPeriodId) },
    { session: input.mongoSession },
  );
  if (!usage) throw new DomainConflictError("Falta el contador diario del run.");
  const next = finishTreasureHuntPoolQuota({
    counters: usage,
    outcome: input.outcome,
    scoreRaw: input.scoreRaw,
  });
  const updatedUsage = await usages.updateOne(
    { _id: usage._id, revision: usage.revision },
    { $set: { ...next, updatedAt: input.now }, $inc: { revision: 1 } },
    { session: input.mongoSession },
  );
  if (updatedUsage.matchedCount !== 1) {
    throw new StaleFenceError("La cuota diaria cambio durante el cierre.");
  }
  const updatedQuota = await quotas.updateOne(
    { reservationId: quota.reservationId, status: "reserved" },
    {
      $set: {
        status: input.outcome === "system_failure" ? "released" : "counted",
        countedLowScore: input.outcome === "system_failure"
          ? null
          : input.outcome === "voluntary_forfeit" || BigInt(input.scoreRaw) < BigInt(100),
        updatedAt: input.now,
      },
    },
    { session: input.mongoSession },
  );
  if (updatedQuota.matchedCount !== 1) {
    throw new StaleFenceError("La reserva de cuota cambio durante el cierre.");
  }
}

async function claimTreasureHuntFinish(input: {
  userId: string;
  walletNormalized: string;
  runId: string;
  resultId: string;
  outcome: "completed" | "voluntary_forfeit";
  authoritySource: "competition" | "economy";
  authority: FinishAuthority;
  now: Date;
}) {
  const resultPayload = {
    runId: input.runId,
    resultId: input.resultId,
    outcome: input.outcome,
    authoritySource: input.authoritySource,
    authorityReference: input.authority.authorityReference,
    scoreRaw: input.authority.scoreRaw,
    gameTimeMs: input.authority.gameTimeMs,
    achievedAt: input.authority.achievedAt,
  };
  const resultPayloadHash = stableGameEconomyHash(resultPayload);
  return withEconomyTransaction(async (db, mongoSession) => {
    const collection = db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs");
    const current = await collection.findOne({ runId: input.runId }, { session: mongoSession });
    if (!current) throw new DomainNotFoundError("No existe el run solicitado.");
    assertRunOwner(current, {
      userId: input.userId,
      walletNormalized: input.walletNormalized,
    });
    if (current.terminalResultId) {
      if (
        current.terminalResultId !== input.resultId ||
        current.resultPayloadHash !== resultPayloadHash ||
        current.outcome !== input.outcome
      ) {
        throw new DomainConflictError("El run ya tiene otro resultado terminal.");
      }
      return current;
    }
    if (current.status !== "active") {
      throw new DomainConflictError(`No se puede cerrar el run desde ${current.status}.`);
    }
    const kind = input.outcome === "voluntary_forfeit" ? "forfeit" : "finish";
    const point = evidencePoint({
      run: current,
      evidencePointId: `terminal:${stableGameEconomyHash({ runId: input.runId, resultId: input.resultId })}`,
      kind,
      scoreRaw: input.authority.scoreRaw,
      gameTimeMs: input.authority.gameTimeMs,
      receivedAt: input.now,
    });
    const updated = await collection.findOneAndUpdate(
      { runId: input.runId, revision: current.revision, status: "active" },
      {
        $push: { evidence: point },
        $set: {
          status: "finishing",
          terminalResultId: input.resultId,
          outcome: input.outcome,
          scoreRaw: input.authority.scoreRaw,
          achievedAt: input.authority.achievedAt,
          resultPayloadHash,
          terminalAuthoritySource: input.authoritySource,
          terminalAuthorityReference: input.authority.authorityReference,
          lastEvidenceHash: point.evidenceHash,
          updatedAt: input.now,
        },
        $inc: { revision: 1 },
      },
      { session: mongoSession, returnDocument: "after" },
    );
    if (!updated) throw new StaleFenceError("El run cambio durante el cierre.");
    return updated;
  });
}

async function weeklyResultFor(
  run: TreasureHuntEconomyRun,
  session: GameEconomySession,
): Promise<WeeklyGameResult> {
  if (
    session.status !== "settled" ||
    !session.settledAt ||
    !session.validation ||
    session.credit.state !== "consumed" ||
    session.cukie.state !== "consumed"
  ) {
    throw new DomainConflictError("La sesion no acredita un resultado settled consumido.");
  }
  const cukieSource = run.cukieAssignmentKind === "seiku"
    ? "seiku" as const
    : run.cukieSource === "own"
      ? "own" as const
      : run.cukieGeneration === "original"
        ? "pool_original" as const
        : "pool_second_plus" as const;
  const db = await getEconomyDb();
  const rewardRule = await db.collection<RewardRule>("economy_rule_versions").findOne({
    scope: "reward_allocations",
    version: session.rule.reward.rewardRuleVersion,
    configHash: session.rule.reward.rewardRuleConfigHash,
    ...rewardRuleActiveAtQuery(run.reservedAt),
  });
  if (!rewardRule) {
    throw new DomainConflictError("La partida no liga la regla rewards de su periodo.");
  }
  const arenaRankingSnapshot = await resolveAppliedArenaRanking({
    db,
    gameId: session.gameId,
    walletAddress: run.walletNormalized,
    creditSource: run.creditSource,
    periodAnchorAt: run.reservedAt,
    rewardRule,
  });
  return {
    sessionId: session.sessionId,
    wallet: run.walletNormalized,
    gameId: "treasure-hunt",
    scoreRaw: session.validation.scoreRaw,
    periodAnchorAt: run.reservedAt,
    playedAt: run.achievedAt ?? session.settledAt,
    settledAt: session.settledAt,
    status: "settled",
    outcome: "completed",
    resultValid: true,
    resultHash: session.validation.resultHash,
    creditSnapshot: {
      source: run.creditSource,
      reservationId: run.creditReservationId,
      evidenceHash: run.creditEvidenceHash,
    },
    cukieSnapshot: {
      source: cukieSource,
      assignmentId: run.cukieAssignmentId,
      generation: run.cukieGeneration,
      evidenceHash: run.cukieEvidenceHash,
    },
    ambassadorSnapshot: {
      walletNormalized: run.ambassadorWalletNormalized,
      capturedAt: run.ambassadorCapturedAt,
      evidenceHash: run.ambassadorEvidenceHash,
    },
    arenaRankingSnapshot,
  };
}

async function finalizeTreasureHuntRun(input: {
  claimed: TreasureHuntEconomyRun;
  terminalStatus: "settled" | "forfeited";
  now: Date;
}) {
  return withEconomyTransaction(async (db, mongoSession) => {
    const collection = db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs");
    const current = await collection.findOne({ runId: input.claimed.runId }, { session: mongoSession });
    if (!current) throw new DomainNotFoundError("No existe el run solicitado.");
    if (current.status === input.terminalStatus) return current;
    if (
      current.status !== "finishing" ||
      current.terminalResultId !== input.claimed.terminalResultId ||
      current.resultPayloadHash !== input.claimed.resultPayloadHash
    ) {
      throw new DomainConflictError("El resultado terminal del run no coincide.");
    }
    await finalizePoolQuota({
      db,
      mongoSession,
      run: current,
      outcome: input.terminalStatus === "settled" ? "completed" : "voluntary_forfeit",
      scoreRaw: current.scoreRaw ?? "0",
      now: input.now,
    });
    if (input.terminalStatus === "settled" && current.creditSource === "pool") {
      const key = treasureHuntScoreOrderKey(current.scoreRaw ?? "0");
      const weekly = db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests");
      const currentBest = await weekly.findOne({
        walletNormalized: current.walletNormalized,
        weeklyPeriodId: current.weeklyPeriodId,
        gameId: "treasure-hunt",
      }, { session: mongoSession });
      const achievedAt = current.achievedAt ?? input.now;
      if (!currentBest || currentBest.creditSource !== "pool" || shouldReplaceTreasureHuntWeeklyBest({
        currentScoreRaw: currentBest.scoreRaw,
        currentAchievedAt: currentBest.achievedAt,
        candidateScoreRaw: key.scoreRaw,
        candidateAchievedAt: achievedAt,
      })) {
        const document: TreasureHuntWeeklyBest = currentBest
          ? {
              ...currentBest,
              scoreRaw: key.scoreRaw,
              scoreDigits: key.scoreDigits,
              achievedAt,
              winningGameId: current.gameEconomySessionId,
              authorityGameSessionId: current.authorityGameSessionId,
              creditSource: current.creditSource,
              creditReservationId: current.creditReservationId,
              cukieSource: current.cukieSource,
              cukieAssignmentId: current.cukieAssignmentId,
              cukieAssetId: current.cukieAssetId,
              revision: currentBest.revision + 1,
              updatedAt: input.now,
            }
          : {
              _id: `treasure-weekly-best:${stableGameEconomyHash({
                walletNormalized: current.walletNormalized,
                weeklyPeriodId: current.weeklyPeriodId,
                gameId: "treasure-hunt",
              })}`,
              walletNormalized: current.walletNormalized,
              weeklyPeriodId: current.weeklyPeriodId,
              gameId: "treasure-hunt",
              scoreRaw: key.scoreRaw,
              scoreDigits: key.scoreDigits,
              achievedAt,
              winningGameId: current.gameEconomySessionId,
              authorityGameSessionId: current.authorityGameSessionId,
              creditSource: current.creditSource,
              creditReservationId: current.creditReservationId,
              cukieSource: current.cukieSource,
              cukieAssignmentId: current.cukieAssignmentId,
              cukieAssetId: current.cukieAssetId,
              revision: 0,
              createdAt: input.now,
              updatedAt: input.now,
            };
        if (currentBest) {
          const replaced = await weekly.replaceOne(
            { _id: currentBest._id, revision: currentBest.revision },
            document,
            { session: mongoSession },
          );
          if (replaced.matchedCount !== 1) {
            throw new StaleFenceError("El mejor resultado semanal cambio durante el cierre.");
          }
        } else {
          await weekly.insertOne(document, { session: mongoSession });
        }
      }
    }
    const updated = await collection.findOneAndUpdate(
      { runId: current.runId, revision: current.revision, status: "finishing" },
      {
        $set: { status: input.terminalStatus, updatedAt: input.now },
        $inc: { revision: 1 },
      },
      { session: mongoSession, returnDocument: "after" },
    );
    if (!updated) throw new StaleFenceError("El run cambio al finalizar.");
    return updated;
  });
}

export async function finishTreasureHuntEconomyRun(input: {
  userId: string;
  walletAddress: string;
  runId: string;
  resultId: string;
  scoreRaw: string;
  gameTimeMs: number;
  outcome: "completed" | "voluntary_forfeit";
  authoritySource: "competition" | "economy";
  authorityReference?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const walletNormalized = validGameWallet(input.walletAddress);
  const runId = validGameText(input.runId, "runId");
  const resultId = validGameText(input.resultId, "resultId");
  if (!Number.isSafeInteger(input.gameTimeMs) || input.gameTimeMs < 0) {
    throw new DomainValidationError("gameTimeMs debe ser un entero no negativo.");
  }
  const current = await loadOwnedRun({ runId, userId: input.userId, walletNormalized });
  const authority = await canonicalFinishAuthority({
    run: current,
    outcome: input.outcome,
    authoritySource: input.authoritySource,
    authorityReference: input.authorityReference,
    scoreRaw: input.scoreRaw,
    gameTimeMs: input.gameTimeMs,
    now,
  });
  const claimed = await claimTreasureHuntFinish({
    userId: input.userId,
    walletNormalized,
    runId,
    resultId,
    outcome: input.outcome,
    authoritySource: input.authoritySource,
    authority,
    now,
  });
  const service = createMongoGameEconomyService(createMongoGameEconomyPorts());
  let economicSession: GameEconomySession;
  if (input.outcome === "voluntary_forfeit") {
    const db = await getEconomyDb();
    if (input.authorityReference) {
      const attempt = await db.collection<CompetitionAttemptAuthority>("presale_game_attempts")
        .findOne({ attemptId: input.authorityReference });
      if (
        !attempt ||
        attempt.userId !== claimed.authorityUserId ||
        attempt.gameId !== "treasure-hunt" ||
        attempt.gameSessionId !== claimed.authorityGameSessionId ||
        attempt.walletAddress.toLowerCase() !== claimed.walletNormalized ||
        (attempt.status !== "active" && attempt.status !== "abandoned")
      ) {
        throw new DomainConflictError("El abandono no liga el intento competitivo activo.");
      }
      if (attempt.status === "active") {
        const abandoned = await db.collection<CompetitionAttemptAuthority>("presale_game_attempts")
          .updateOne(
            { attemptId: attempt.attemptId, status: "active" },
            {
              $set: {
                status: "abandoned",
                finishedAt: now.toISOString(),
                updatedAt: now.toISOString(),
                finishPendingAuthority: false,
              },
            },
          );
        if (abandoned.matchedCount !== 1) {
          throw new StaleFenceError("El intento competitivo cambio durante el abandono.");
        }
      }
    }
    const session = await db.collection<GameEconomySession>("game_economy_sessions")
      .findOne({ sessionId: claimed.gameEconomySessionId });
    if (!session) throw new DomainNotFoundError("No existe la sesion economica del run.");
    economicSession = await service.forfeitSession({
      sessionId: session.sessionId,
      reasonCode: "voluntary_forfeit",
      idempotencyKey: `treasure-forfeit:${stableGameEconomyHash({ runId, resultId })}`,
      expectedRevision: session.revision,
      now,
    });
  } else {
    economicSession = await completeGameSession({
      sessionId: claimed.gameEconomySessionId,
      walletAddress: walletNormalized,
      evidenceReference: claimed.lastEvidenceHash,
      payloadHash: claimed.resultPayloadHash!,
      scoreRaw: authority.scoreRaw,
      idempotencyKey: `treasure-complete:${stableGameEconomyHash({ runId, resultId })}`,
      now,
    });
    await rewardAccountingService.recordWeeklyGameSource(
      await weeklyResultFor(claimed, economicSession),
      now,
    );
  }
  const terminalStatus = economicSession.status === "settled"
    ? "settled" as const
    : economicSession.status === "forfeited"
      ? "forfeited" as const
      : null;
  if (!terminalStatus) {
    throw new DomainConflictError(
      `La sesion economica no termino tras el resultado: ${economicSession.status}.`,
    );
  }
  const terminal = await finalizeTreasureHuntRun({ claimed, terminalStatus, now });
  return resultResponse(terminal);
}

export async function releaseUnstartedTreasureHuntEconomyRun(input: {
  userId: string;
  walletAddress: string;
  runId: string;
  requestId: string;
  reasonCode: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const walletNormalized = validGameWallet(input.walletAddress);
  const runId = validGameText(input.runId, "runId");
  const requestId = validGameText(input.requestId, "requestId");
  const reasonCode = validGameText(input.reasonCode, "reasonCode");
  const releaseHash = stableGameEconomyHash({ runId, requestId, reasonCode });
  const claimed = await withEconomyTransaction(async (db, mongoSession) => {
    const collection = db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs");
    const current = await collection.findOne({ runId }, { session: mongoSession });
    if (!current) throw new DomainNotFoundError("No existe el run solicitado.");
    assertRunOwner(current, { userId: input.userId, walletNormalized });
    if (current.status === "released") {
      if (current.resultPayloadHash !== releaseHash) {
        throw new DomainConflictError("El run ya fue liberado por otra solicitud.");
      }
      return current;
    }
    if (current.status === "finishing" && current.outcome === "system_failure") {
      if (current.resultPayloadHash !== releaseHash) {
        throw new DomainConflictError("El run ya esta siendo liberado por otra solicitud.");
      }
      return current;
    }
    if (current.status !== "active" || current.evidence.length > 0) {
      throw new DomainConflictError("Solo puede liberarse un run que aun no ha empezado.");
    }
    const updated = await collection.findOneAndUpdate(
      { runId, revision: current.revision, status: "active", evidence: { $size: 0 } },
      {
        $set: {
          status: "finishing",
          terminalResultId: requestId,
          outcome: "system_failure",
          scoreRaw: "0",
          achievedAt: now,
          resultPayloadHash: releaseHash,
          updatedAt: now,
        },
        $inc: { revision: 1 },
      },
      { session: mongoSession, returnDocument: "after" },
    );
    if (!updated) throw new StaleFenceError("El run cambio durante la liberacion.");
    return updated;
  });
  if (claimed.status === "released") return { runId, status: "released" as const };
  const db = await getEconomyDb();
  const session = await db.collection<GameEconomySession>("game_economy_sessions")
    .findOne({ sessionId: claimed.gameEconomySessionId });
  if (!session) throw new DomainNotFoundError("No existe la sesion economica del run.");
  await rejectGameSession({
    sessionId: session.sessionId,
    reasonCode,
    idempotencyKey: `treasure-release:${releaseHash}`,
    expectedRevision: session.revision,
    now,
  });
  await withEconomyTransaction(async (transactionDb, mongoSession) => {
    const collection = transactionDb.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs");
    const current = await collection.findOne({ runId }, { session: mongoSession });
    if (!current) throw new DomainNotFoundError("No existe el run solicitado.");
    if (current.status === "released") return;
    if (
      current.status !== "finishing" ||
      current.outcome !== "system_failure" ||
      current.resultPayloadHash !== releaseHash
    ) {
      throw new DomainConflictError("El run no conserva la intencion de liberacion.");
    }
    await finalizePoolQuota({
      db: transactionDb,
      mongoSession,
      run: current,
      outcome: "system_failure",
      scoreRaw: "0",
      now,
    });
    const updated = await collection.updateOne(
      { runId, revision: current.revision, status: "finishing" },
      { $set: { status: "released", updatedAt: now }, $inc: { revision: 1 } },
      { session: mongoSession },
    );
    if (updated.matchedCount !== 1) {
      throw new StaleFenceError("El run cambio al liberar recursos.");
    }
  });
  return { runId, status: "released" as const };
}

export async function reconcileTreasureHuntEconomyRuns(input: {
  now?: Date;
  limit?: number;
  staleUnstartedMs?: number;
}) {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;
  const staleUnstartedMs = input.staleUnstartedMs ?? 120_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new DomainValidationError("limit debe estar entre 1 y 500.");
  }
  if (!Number.isSafeInteger(staleUnstartedMs) || staleUnstartedMs < 30_000) {
    throw new DomainValidationError("staleUnstartedMs debe ser al menos 30000.");
  }
  const db = await getEconomyDb();
  const candidates = await db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
    .find({ status: { $in: ["active", "finishing"] } })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
  const result = {
    scanned: candidates.length,
    settled: 0,
    forfeited: 0,
    released: 0,
    pending: 0,
    failures: [] as Array<{ runId: string; code: string }>,
  };
  for (const candidate of candidates) {
    try {
      const session = await db.collection<GameEconomySession>("game_economy_sessions")
        .findOne({ sessionId: candidate.gameEconomySessionId });
      if (!session) throw new DomainNotFoundError("Falta GameEconomy para el run Treasure.");
      if (session.status === "settled" || session.status === "forfeited") {
        if (candidate.status !== "finishing") {
          throw new DomainConflictError("CORE_TERMINAL_WITHOUT_TREASURE_INTENT");
        }
        if (session.status === "settled") {
          await rewardAccountingService.recordWeeklyGameSource(
            await weeklyResultFor(candidate, session),
            now,
          );
        }
        await finalizeTreasureHuntRun({
          claimed: candidate,
          terminalStatus: session.status,
          now,
        });
        result[session.status === "settled" ? "settled" : "forfeited"] += 1;
        continue;
      }
      if (session.status === "expired" || session.status === "rejected") {
        await withEconomyTransaction(async (transactionDb, mongoSession) => {
          const runs = transactionDb.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs");
          const current = await runs.findOne({ runId: candidate.runId }, { session: mongoSession });
          if (!current || current.status === "released") return;
          if (current.status !== "active" && current.status !== "finishing") {
            throw new DomainConflictError("El run no puede reconciliarse como system failure.");
          }
          await finalizePoolQuota({
            db: transactionDb,
            mongoSession,
            run: current,
            outcome: "system_failure",
            scoreRaw: "0",
            now,
          });
          const updated = await runs.updateOne(
            { runId: current.runId, revision: current.revision, status: current.status },
            {
              $set: {
                status: "released",
                outcome: "system_failure",
                scoreRaw: "0",
                achievedAt: now,
                updatedAt: now,
              },
              $inc: { revision: 1 },
            },
            { session: mongoSession },
          );
          if (updated.matchedCount !== 1) {
            throw new StaleFenceError("El run cambio durante la reconciliacion.");
          }
        });
        result.released += 1;
        continue;
      }
      if (
        candidate.status === "active" &&
        candidate.evidence.length === 0 &&
        now.getTime() - candidate.updatedAt.getTime() >= staleUnstartedMs
      ) {
        await releaseUnstartedTreasureHuntEconomyRun({
          userId: candidate.authorityUserId,
          walletAddress: candidate.walletNormalized,
          runId: candidate.runId,
          requestId: `runtime-release:${candidate.runId}`,
          reasonCode: "unstarted_timeout",
          now,
        });
        result.released += 1;
        continue;
      }
      result.pending += 1;
    } catch (error) {
      result.failures.push({
        runId: candidate.runId,
        code: error instanceof UkiEconomyError ? error.code : "RECONCILE_FAILED",
      });
    }
  }
  return result;
}
