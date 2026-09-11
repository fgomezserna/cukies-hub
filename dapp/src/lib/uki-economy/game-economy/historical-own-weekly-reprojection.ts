import "server-only";

import type { ClientSession, Db, Document } from "mongodb";

import { validateReservationIntegrity } from "@/lib/uki-economy/credits/service";
import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import { assertGameSessionIntegrity, parseCanonicalRaw, stableGameEconomyHash, validGameText, validGameWallet } from "@/lib/uki-economy/game-economy/rules";
import type { GameEconomySession } from "@/lib/uki-economy/game-economy/types";
import {
  canonicalTreasureHuntScore,
  getTreasureHuntWeeklyPeriod,
  shouldReplaceTreasureHuntWeeklyBest,
  treasureHuntScoreOrderKey,
} from "@/lib/uki-economy/game-economy/treasure-hunt-policy";
import type { TreasureHuntEconomyRun, TreasureHuntWeeklyBest } from "@/lib/uki-economy/game-economy/treasure-hunt-types";
import { assertCukiePoolAssignmentIntegrity } from "@/lib/uki-economy/cukie-pool/service";
import type { CukiePoolAssignment } from "@/lib/uki-economy/cukie-pool/types";
import { assertOwnCukieAssignmentIntegrity } from "@/lib/uki-economy/own-cukie/rules";
import type { OwnCukieAssignment } from "@/lib/uki-economy/own-cukie/types";
import { assertSettlementResourceBindings } from "@/lib/uki-economy/rewards/coordinator";
import { assertEligibleWeeklyGameResult } from "@/lib/uki-economy/rewards/accounting";
import type { WeeklyGameSource } from "@/lib/uki-economy/rewards/accounting-types";
import { assertRewardRule, stableRewardHash } from "@/lib/uki-economy/rewards/rules";
import type { RewardPeriodSeal, RewardPeriodState, RewardRule, RewardSourceManifest } from "@/lib/uki-economy/rewards/types";
import type {
  WeeklyRankingAuditEvent,
  WeeklyRankingManifest,
  WeeklyRankingPeriodState,
  WeeklyRankingRun,
  WeeklyRankingSnapshot,
} from "@/lib/uki-economy/ranking/types";
import type { WeeklyPrizeAccounting } from "@/lib/uki-economy/rewards/accounting-types";
import { DomainConflictError, DomainValidationError, StaleFenceError } from "../errors";

export const HISTORICAL_OWN_WEEKLY_REPROJECTION_VERSION = "historical-own-weekly-reprojection-v1" as const;
export const HISTORICAL_OWN_WEEKLY_DATABASE = "cukieshub-new-staging" as const;
export const HISTORICAL_OWN_WEEKLY_CHAIN_ID = 97 as const;
export const HISTORICAL_OWN_WEEKLY_GAME_ID = "treasure-hunt" as const;
export const HISTORICAL_OWN_WEEKLY_MAX_SESSIONS = 5 as const;

type Artifact = Document & { readonly _id?: string; readonly periodId?: string; readonly sourceId?: string; readonly status?: string };

export type HistoricalOwnWeeklyReprojectionInput = {
  readonly walletNormalized: string;
  readonly sessionIds: readonly string[];
  readonly now: Date;
};

export type HistoricalOwnWeeklyRecord = {
  readonly run: TreasureHuntEconomyRun;
  readonly session: GameEconomySession;
  readonly credit: CreditReservation;
  readonly poolAssignment: CukiePoolAssignment | null;
  readonly ownAssignment: OwnCukieAssignment | null;
  readonly source: WeeklyGameSource;
  readonly rewardRule: RewardRule;
  readonly periodState: RewardPeriodState;
  readonly periodSeal: RewardPeriodSeal | null;
  readonly weeklyRankingManifests: readonly WeeklyRankingManifest[];
  readonly weeklyRankingRuns: readonly WeeklyRankingRun[];
  readonly weeklyRankingStates: readonly WeeklyRankingPeriodState[];
  readonly weeklyRankingAuditEvents: readonly WeeklyRankingAuditEvent[];
  readonly weeklyRankingSnapshots: readonly WeeklyRankingSnapshot[];
  readonly weeklyAccounting: readonly WeeklyPrizeAccounting[];
  readonly sourceManifests: readonly RewardSourceManifest[];
  readonly sourceAllocations: readonly Artifact[];
  readonly sourceAccruals: readonly Artifact[];
  readonly currentBest: TreasureHuntWeeklyBest | null;
};

export type HistoricalOwnWeeklySnapshot = {
  readonly records: readonly HistoricalOwnWeeklyRecord[];
  readonly extraRuns?: readonly TreasureHuntEconomyRun[];
  readonly extraSessions?: readonly GameEconomySession[];
  readonly extraSources?: readonly WeeklyGameSource[];
};

export type HistoricalOwnWeeklyPlanEntry = {
  readonly sessionId: string;
  readonly runId: string;
  readonly periodId: string;
  readonly scoreRaw: string;
  readonly scoreDigits: number;
  readonly achievedAt: Date;
  readonly recordFingerprint: string;
  readonly sourceFingerprint: string;
  readonly periodStateFingerprint: string;
  readonly currentBestFingerprint: string | null;
  readonly action: "insert" | "replace" | "covered_by_candidate" | "covered_by_existing";
  readonly winner: boolean;
};

export type HistoricalOwnWeeklyPeriodPlan = {
  readonly periodId: string;
  readonly state: {
    readonly revision: number;
    readonly allocationRevision: number;
    readonly fingerprint: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly currentBest: TreasureHuntWeeklyBest | null;
  readonly desiredBest: TreasureHuntWeeklyBest | null;
  readonly action: "insert" | "replace" | "covered_by_existing";
  readonly entries: readonly string[];
};

export type HistoricalOwnWeeklyPlan = {
  readonly version: typeof HISTORICAL_OWN_WEEKLY_REPROJECTION_VERSION;
  readonly databaseName: typeof HISTORICAL_OWN_WEEKLY_DATABASE;
  readonly chainId: typeof HISTORICAL_OWN_WEEKLY_CHAIN_ID;
  readonly gameId: typeof HISTORICAL_OWN_WEEKLY_GAME_ID;
  readonly walletNormalized: string;
  readonly sessionIds: readonly string[];
  readonly plannedAt: Date;
  readonly entries: readonly HistoricalOwnWeeklyPlanEntry[];
  readonly periods: readonly HistoricalOwnWeeklyPeriodPlan[];
  readonly planHash: string;
};

export type HistoricalOwnWeeklyApplyResult = {
  readonly status: "applied" | "replayed";
  readonly replayed: boolean;
  readonly planHash: string;
  readonly periodsFenced: number;
  readonly bestsInserted: number;
  readonly bestsReplaced: number;
};

function date(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainConflictError(`${label} no es una fecha valida.`);
  }
  return new Date(value.getTime());
}

function sameDate(left: Date, right: Date) {
  return date(left, "left").getTime() === date(right, "right").getTime();
}

function fingerprint(value: unknown) {
  return stableGameEconomyHash(value);
}

function wallet(value: unknown) {
  const normalized = validGameWallet(value);
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new DomainValidationError("La reconciliacion historica exige una wallet EVM BSC.");
  }
  return normalized;
}

function sessionId(value: unknown) {
  return validGameText(value, "sessionId");
}

function assertBoundedScope(input: HistoricalOwnWeeklyReprojectionInput) {
  const normalizedWallet = wallet(input.walletNormalized);
  if (!Array.isArray(input.sessionIds) || input.sessionIds.length !== HISTORICAL_OWN_WEEKLY_MAX_SESSIONS) {
    throw new DomainValidationError(`La reconciliacion exige exactamente ${HISTORICAL_OWN_WEEKLY_MAX_SESSIONS} sesiones explicitas.`);
  }
  const ids = input.sessionIds.map(sessionId);
  if (new Set(ids).size !== ids.length) {
    throw new DomainValidationError("La reconciliacion no admite sesiones duplicadas.");
  }
  date(input.now, "plannedAt");
  return { walletNormalized: normalizedWallet, sessionIds: [...ids].sort() };
}

function assertPeriodState(state: RewardPeriodState, periodId: string) {
  const allowedKeys = new Set(["_id", "periodId", "status", "allocationRevision", "revision", "createdAt", "updatedAt"]);
  if (state && Object.keys(state).some((key) => !allowedKeys.has(key))) {
    throw new DomainConflictError(`El estado del periodo ${periodId} contiene campos no soportados para un fence historico.`);
  }
  if (
    !state
    || state._id !== periodId
    || state.periodId !== periodId
    || state.status !== "open"
    || !Number.isSafeInteger(state.revision)
    || state.revision < 0
    || !Number.isSafeInteger(state.allocationRevision)
    || state.allocationRevision < 0
    || state.sealId !== undefined
  ) {
    throw new DomainConflictError(`El periodo rewards ${periodId} no esta abierto o su estado es incoherente.`);
  }
  date(state.createdAt, `${periodId}.createdAt`);
  date(state.updatedAt, `${periodId}.updatedAt`);
  return state;
}

function assertEconomyDatabase(db: Db) {
  if (db.databaseName !== HISTORICAL_OWN_WEEKLY_DATABASE) {
    throw new DomainValidationError(`La operacion historica solo admite la base ${HISTORICAL_OWN_WEEKLY_DATABASE}.`);
  }
}

function assertCurrentBestShape(currentBest: TreasureHuntWeeklyBest | null, walletNormalized: string, periodId: string) {
  if (!currentBest) return;
  if (
    !Number.isSafeInteger(currentBest.revision)
    || currentBest.revision < 0
    || !Number.isSafeInteger(currentBest.scoreDigits)
  ) {
    throw new DomainConflictError(`El mejor resultado existente de ${periodId} tiene revision o fechas invalidas.`);
  }
  date(currentBest.achievedAt, `${periodId}.currentBest.achievedAt`);
  date(currentBest.createdAt, `${periodId}.currentBest.createdAt`);
  date(currentBest.updatedAt, `${periodId}.currentBest.updatedAt`);
  const key = treasureHuntScoreOrderKey(currentBest.scoreRaw);
  if (key.scoreRaw !== currentBest.scoreRaw || key.scoreDigits !== currentBest.scoreDigits) {
    throw new DomainConflictError(`El score del mejor resultado existente de ${periodId} no es canonico.`);
  }
  if (
    currentBest._id !== `treasure-weekly-best:${stableGameEconomyHash({ walletNormalized, weeklyPeriodId: periodId, gameId: HISTORICAL_OWN_WEEKLY_GAME_ID })}`
    || currentBest.walletNormalized !== walletNormalized
    || currentBest.weeklyPeriodId !== periodId
    || currentBest.gameId !== HISTORICAL_OWN_WEEKLY_GAME_ID
  ) {
    throw new DomainConflictError(`El mejor resultado existente del periodo ${periodId} no tiene identidad canonica.`);
  }
}

function assertNoBlockedArtifacts(record: HistoricalOwnWeeklyRecord) {
  const blocked = [
    ...(record.periodSeal ? [record.periodSeal] : []),
    ...record.weeklyRankingManifests,
    ...record.weeklyRankingRuns,
    ...record.weeklyRankingStates,
    ...record.weeklyRankingAuditEvents,
    ...record.weeklyRankingSnapshots,
    ...record.weeklyAccounting,
    ...record.sourceManifests,
    ...record.sourceAllocations,
    ...record.sourceAccruals,
  ];
  if (blocked.length > 0) {
    const ids = blocked.map((item) => item?._id ?? "unknown").sort();
    throw new DomainConflictError(`El periodo/source tiene sello, manifest o accounting; se aborta (${ids.join(",")}).`);
  }
}

function sourceCukieKind(record: HistoricalOwnWeeklyRecord) {
  const canonical = assertSettlementResourceBindings(
    record.session,
    record.credit,
    record.poolAssignment,
    record.ownAssignment,
  );
  if (
    record.run.cukieSource !== (canonical === "own" ? "own" : "pool")
    || record.source.cukieSnapshot.source !== canonical
  ) {
    throw new DomainConflictError(`La fuente Cukie de ${record.session.sessionId} no liga el run.`);
  }
  return canonical;
}

function validateRecord(record: HistoricalOwnWeeklyRecord, expectedWallet: string) {
  const { run, session, credit, source, rewardRule, periodState } = record;
  assertNoBlockedArtifacts(record);
  assertGameSessionIntegrity(session);
  if (
    session.sessionId !== run.gameEconomySessionId
    || session._id !== session.sessionId
    || session.gameId !== HISTORICAL_OWN_WEEKLY_GAME_ID
    || session.status !== "settled"
    || session.walletNormalized !== expectedWallet
    || !session.settledAt
    || !session.validation
    || session.credit.state !== "consumed"
    || session.cukie.state !== "consumed"
  ) {
    throw new DomainConflictError(`La sesion ${session.sessionId} no es un settlement Treasure Hunt valido.`);
  }
  if (
    run.runId !== run._id
    || run.gameEconomySessionId !== session.sessionId
    || run.status !== "settled"
    || run.walletNormalized !== expectedWallet
    || run.policyVersion !== "treasure-hunt-staging-v1"
    || run.gameRuleVersion !== session.rule.version
    || session.rule.gameId !== HISTORICAL_OWN_WEEKLY_GAME_ID
    || session.rule.version !== "staging-test-v4"
    || run.outcome !== "completed"
    || !run.terminalResultId
    || !run.resultPayloadHash
    || !run.scoreRaw
    || canonicalTreasureHuntScore(run.scoreRaw) !== canonicalTreasureHuntScore(session.validation.scoreRaw)
    || !sameDate(run.reservedAt, session.createdAt)
    || !run.achievedAt
    || run.achievedAt.getTime() < session.createdAt.getTime()
    || run.achievedAt.getTime() > session.settledAt.getTime()
  ) {
    throw new DomainConflictError(`El run ${run.runId} no liga exactamente la sesion settled.`);
  }
  const period = getTreasureHuntWeeklyPeriod(run.reservedAt, session.rule.calendar);
  if (
    run.weeklyPeriodId !== period.periodId
    || !sameDate(run.weeklyPeriodStartsAt, period.startsAt)
    || !sameDate(run.weeklyPeriodEndsAt, period.endsAt)
    || run.weeklyPeriodStartsAt.getTime() >= run.weeklyPeriodEndsAt.getTime()
    || run.reservedAt.getTime() < run.weeklyPeriodStartsAt.getTime()
    || run.reservedAt.getTime() >= run.weeklyPeriodEndsAt.getTime()
  ) {
    throw new DomainConflictError(`El periodo weekly guardado del run ${run.runId} no es canonico.`);
  }
  assertPeriodState(periodState, run.weeklyPeriodId);
  const reservedAtMs = run.reservedAt.getTime();
  const activeUntilMs = rewardRule.activeUntil?.getTime();
  const supersededAtMs = rewardRule.supersededAt?.getTime();
  if (
    session.rule.reward.rewardRuleVersion !== rewardRule.version
    || session.rule.reward.rewardRuleConfigHash !== rewardRule.configHash
    || rewardRule.version !== "rewards-staging-cycle-v1"
    || !rewardRule.active
    || rewardRule.activeFrom.getTime() > reservedAtMs
    || (activeUntilMs !== undefined && reservedAtMs >= activeUntilMs)
    || (supersededAtMs !== undefined && reservedAtMs >= supersededAtMs)
  ) {
    throw new DomainConflictError(`La regla rewards del run ${run.runId} no liga su periodo.`);
  }
  assertRewardRule(rewardRule, run.reservedAt);
  const canonicalSource = assertEligibleWeeklyGameResult(source);
  if (
    !session.credit.reservationId
    || run.creditReservationId !== session.credit.reservationId
    || run.creditSource !== "own"
    || credit.reservationId !== session.credit.reservationId
    || credit.sessionId !== session.sessionId
    || credit.walletNormalized !== expectedWallet
    || credit.status !== "consumed"
    || credit.bucket !== "own"
    || credit.ruleVersion !== session.rule.credit.creditRuleVersion
    || credit.ruleConfigHash !== session.rule.credit.creditRuleConfigHash
    || session.credit.evidenceHash !== run.creditEvidenceHash
  ) {
    throw new DomainConflictError(`La reserva de creditos de ${run.runId} no liga la sesion.`);
  }
  validateReservationIntegrity(credit);
  const cukieKind = sourceCukieKind(record);
  if (
    !run.cukieAssignmentId
    || run.cukieAssignmentId !== session.cukie.reservationId
    || source.creditSnapshot.source !== "own"
    || source.creditSnapshot.reservationId !== run.creditReservationId
    || source.creditSnapshot.evidenceHash !== run.creditEvidenceHash
    || source.cukieSnapshot.assignmentId !== run.cukieAssignmentId
    || source.cukieSnapshot.evidenceHash !== run.cukieEvidenceHash
    || source.cukieSnapshot.generation !== run.cukieGeneration
    || source.resultHash !== session.validation.resultHash
    || source.sessionId !== session.sessionId
    || source.wallet !== expectedWallet
    || source.gameId !== HISTORICAL_OWN_WEEKLY_GAME_ID
    || source.status !== "settled"
    || source.outcome !== "completed"
    || source.resultValid !== true
    || source.scoreRaw !== canonicalTreasureHuntScore(session.validation.scoreRaw)
    || !sameDate(source.periodAnchorAt, run.reservedAt)
    || !sameDate(source.settledAt, session.settledAt)
    || !sameDate(source.playedAt, run.achievedAt)
    || source._id !== `reward-weekly-source:${session.sessionId}`
    || source.payloadHash !== stableRewardHash(canonicalSource)
  ) {
    throw new DomainConflictError(`La fuente weekly de ${run.runId} no liga el settlement canonico.`);
  }
  if (cukieKind === "seiku" && run.cukieAssignmentKind !== "seiku") {
    throw new DomainConflictError(`La asignacion seiku de ${run.runId} no conserva su kind.`);
  }
  if (cukieKind === "pool_original" && run.cukieGeneration !== "original") {
    throw new DomainConflictError(`La generacion pool original de ${run.runId} es inconsistente.`);
  }
  if (cukieKind === "pool_second_plus" && run.cukieGeneration === "original") {
    throw new DomainConflictError(`La generacion pool second+ de ${run.runId} es inconsistente.`);
  }
  if (record.poolAssignment) assertCukiePoolAssignmentIntegrity(record.poolAssignment);
  if (record.ownAssignment) assertOwnCukieAssignmentIntegrity(record.ownAssignment);
  parseCanonicalRaw(source.scoreRaw, "source.scoreRaw");
  return { periodId: run.weeklyPeriodId, scoreRaw: canonicalTreasureHuntScore(source.scoreRaw), achievedAt: date(run.achievedAt, "run.achievedAt") };
}

function candidateBest(record: HistoricalOwnWeeklyRecord, scoreRaw: string, achievedAt: Date, now: Date): TreasureHuntWeeklyBest {
  const { run } = record;
  const key = treasureHuntScoreOrderKey(scoreRaw);
  const identity = { walletNormalized: run.walletNormalized, weeklyPeriodId: run.weeklyPeriodId, gameId: HISTORICAL_OWN_WEEKLY_GAME_ID };
  return {
    _id: `treasure-weekly-best:${stableGameEconomyHash(identity)}`,
    walletNormalized: run.walletNormalized,
    weeklyPeriodId: run.weeklyPeriodId,
    gameId: HISTORICAL_OWN_WEEKLY_GAME_ID,
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
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function bestWins(current: TreasureHuntWeeklyBest | null, candidate: TreasureHuntWeeklyBest) {
  if (!current) return true;
  return shouldReplaceTreasureHuntWeeklyBest({
    currentScoreRaw: current.scoreRaw,
    currentAchievedAt: current.achievedAt,
    candidateScoreRaw: candidate.scoreRaw,
    candidateAchievedAt: candidate.achievedAt,
  });
}

function buildPlanHashPayload(plan: Omit<HistoricalOwnWeeklyPlan, "planHash">) {
  return {
    version: plan.version,
    databaseName: plan.databaseName,
    chainId: plan.chainId,
    gameId: plan.gameId,
    walletNormalized: plan.walletNormalized,
    sessionIds: plan.sessionIds,
    plannedAt: plan.plannedAt,
    entries: plan.entries,
    periods: plan.periods,
  };
}

export function planHistoricalOwnWeeklyReprojection(
  snapshot: HistoricalOwnWeeklySnapshot,
  input: HistoricalOwnWeeklyReprojectionInput,
): HistoricalOwnWeeklyPlan {
  const scope = assertBoundedScope(input);
  if (snapshot.records.length !== scope.sessionIds.length) {
    throw new DomainConflictError("La lectura no contiene exactamente una fila por sesion solicitada.");
  }
  const byId = new Map<string, HistoricalOwnWeeklyRecord>();
  for (const record of snapshot.records) {
    const id = sessionId(record.session.sessionId);
    if (byId.has(id)) throw new DomainConflictError(`La sesion ${id} aparece duplicada en la lectura.`);
    byId.set(id, record);
  }
  for (const id of scope.sessionIds) {
    if (!byId.has(id)) throw new DomainConflictError(`Falta la sesion historica ${id}.`);
  }
  if (snapshot.extraRuns?.length || snapshot.extraSessions?.length || snapshot.extraSources?.length) {
    throw new DomainConflictError("La lectura contiene documentos extra para el scope explicito.");
  }

  const validated = scope.sessionIds.map((id) => {
    const record = byId.get(id)!;
    const result = validateRecord(record, scope.walletNormalized);
    return { id, record, ...result };
  });
  const periodIds = [...new Set(validated.map((item) => item.periodId))].sort();
  if (periodIds.length > 2) {
    throw new DomainConflictError("La reconciliacion no admite mas de dos periodos historicos.");
  }
  const periodRecords = new Map<string, HistoricalOwnWeeklyRecord>();
  for (const item of validated) {
    const previous = periodRecords.get(item.periodId);
    if (previous) {
      if (fingerprint(previous.periodState) !== fingerprint(item.record.periodState)) {
        throw new DomainConflictError(`El estado del periodo ${item.periodId} diverge dentro de la lectura.`);
      }
      if (fingerprint(previous.currentBest) !== fingerprint(item.record.currentBest)) {
        throw new DomainConflictError(`El mejor resultado del periodo ${item.periodId} diverge dentro de la lectura.`);
      }
    }
    periodRecords.set(item.periodId, item.record);
  }
  const periods: HistoricalOwnWeeklyPeriodPlan[] = [];
  const entries: HistoricalOwnWeeklyPlanEntry[] = [];
  for (const periodId of periodIds) {
    const candidates = validated
      .filter((item) => item.periodId === periodId)
      .sort((left, right) => left.achievedAt.getTime() - right.achievedAt.getTime() || left.id.localeCompare(right.id));
    const currentBest = candidates[0].record.currentBest;
    assertCurrentBestShape(currentBest, scope.walletNormalized, periodId);
    let winner: HistoricalOwnWeeklyRecord | null = null;
    let winnerScore = "0";
    let winnerAt = candidates[0].achievedAt;
    for (const item of candidates) {
      const candidateScore = item.scoreRaw;
      if (!winner || bestWins({ scoreRaw: winnerScore, achievedAt: winnerAt } as TreasureHuntWeeklyBest, candidateBest(item.record, candidateScore, item.achievedAt, input.now))) {
        winner = item.record;
        winnerScore = candidateScore;
        winnerAt = item.achievedAt;
      }
    }
    const desiredCandidate = candidateBest(winner!, winnerScore, winnerAt, input.now);
    const candidateBeatsCurrent = bestWins(currentBest, desiredCandidate);
    const action = !currentBest
      ? "insert" as const
      : candidateBeatsCurrent
        ? "replace" as const
        : "covered_by_existing" as const;
    const state = candidates[0].record.periodState;
    const desiredBest = candidateBeatsCurrent
      ? (action === "replace" && currentBest
        ? { ...desiredCandidate, revision: currentBest.revision + 1, createdAt: currentBest.createdAt }
        : desiredCandidate)
      : currentBest;
    periods.push({
      periodId,
      state: {
        revision: state.revision,
        allocationRevision: state.allocationRevision,
        fingerprint: fingerprint(state),
        createdAt: date(state.createdAt, `${periodId}.createdAt`),
        updatedAt: date(state.updatedAt, `${periodId}.updatedAt`),
      },
      currentBest,
      desiredBest,
      action,
      entries: candidates.map((item) => item.id),
    });
    const desired = periods.at(-1)!.desiredBest;
    for (const item of candidates) {
      const candidate = candidateBest(item.record, item.scoreRaw, item.achievedAt, input.now);
      const winnerEntry = desired?.winningGameId === item.record.run.gameEconomySessionId;
      const action = desired?.winningGameId === item.record.run.gameEconomySessionId
        ? periods.at(-1)!.action
        : (currentBest && !bestWins(currentBest, candidate) ? "covered_by_existing" : "covered_by_candidate");
      entries.push({
        sessionId: item.id,
        runId: item.record.run.runId,
        periodId,
        scoreRaw: item.scoreRaw,
        scoreDigits: candidate.scoreDigits,
        achievedAt: item.achievedAt,
        recordFingerprint: fingerprint({ run: item.record.run, session: item.record.session, credit: item.record.credit, poolAssignment: item.record.poolAssignment, ownAssignment: item.record.ownAssignment, rewardRule: item.record.rewardRule }),
        sourceFingerprint: fingerprint(item.record.source),
        periodStateFingerprint: fingerprint(item.record.periodState),
        currentBestFingerprint: currentBest ? fingerprint(currentBest) : null,
        action,
        winner: winnerEntry,
      });
    }
  }
  const planWithoutHash: Omit<HistoricalOwnWeeklyPlan, "planHash"> = {
    version: HISTORICAL_OWN_WEEKLY_REPROJECTION_VERSION,
    databaseName: HISTORICAL_OWN_WEEKLY_DATABASE,
    chainId: HISTORICAL_OWN_WEEKLY_CHAIN_ID,
    gameId: HISTORICAL_OWN_WEEKLY_GAME_ID,
    walletNormalized: scope.walletNormalized,
    sessionIds: scope.sessionIds,
    plannedAt: new Date(input.now),
    entries,
    periods,
  };
  return { ...planWithoutHash, planHash: fingerprint(buildPlanHashPayload(planWithoutHash)) };
}

function sameBest(left: TreasureHuntWeeklyBest | null, right: TreasureHuntWeeklyBest | null) {
  return fingerprint(left) === fingerprint(right);
}

export function historicalOwnWeeklyReprojectionPlanHash(plan: Omit<HistoricalOwnWeeklyPlan, "planHash">) {
  return fingerprint(buildPlanHashPayload(plan));
}

function assertPlanIntegrity(plan: HistoricalOwnWeeklyPlan) {
  if (
    !plan
    || typeof plan !== "object"
    || typeof plan.planHash !== "string"
    || !Array.isArray(plan.sessionIds)
    || !Array.isArray(plan.entries)
    || !Array.isArray(plan.periods)
    || !(plan.plannedAt instanceof Date)
    || Number.isNaN(plan.plannedAt.getTime())
  ) {
    throw new DomainValidationError("El plan historico no tiene una estructura valida.");
  }
  assertBoundedScope({ walletNormalized: plan.walletNormalized, sessionIds: plan.sessionIds, now: plan.plannedAt });
  if (plan.entries.length !== HISTORICAL_OWN_WEEKLY_MAX_SESSIONS || plan.periods.length === 0 || plan.periods.length > 2) {
    throw new DomainValidationError("El plan historico excede el limite de sesiones o periodos.");
  }
  const allowedActions = new Set(["insert", "replace", "covered_by_candidate", "covered_by_existing"]);
  const allowedStateKeys = new Set(["revision", "allocationRevision", "fingerprint", "createdAt", "updatedAt"]);
  for (const period of plan.periods) {
    if (
      !period
      || typeof period.periodId !== "string"
      || !period.state
      || !Array.isArray(period.entries)
      || !allowedActions.has(period.action)
      || Object.keys(period.state).some((key) => !allowedStateKeys.has(key))
      || !Number.isSafeInteger(period.state.revision)
      || period.state.revision < 0
      || !Number.isSafeInteger(period.state.allocationRevision)
      || period.state.allocationRevision < 0
      || !/^[0-9a-f]{64}$/.test(period.state.fingerprint)
      || !(period.state.createdAt instanceof Date)
      || Number.isNaN(period.state.createdAt.getTime())
      || !(period.state.updatedAt instanceof Date)
      || Number.isNaN(period.state.updatedAt.getTime())
      || (period.action === "insert" && (period.currentBest !== null || !period.desiredBest))
      || (period.action === "replace" && (!period.currentBest || !period.desiredBest))
      || (period.action === "covered_by_existing" && (!period.currentBest || !period.desiredBest))
    ) {
      throw new DomainValidationError(`El periodo ${period?.periodId ?? "unknown"} del plan no tiene una estructura valida.`);
    }
    assertCurrentBestShape(period.currentBest, plan.walletNormalized, period.periodId);
    assertCurrentBestShape(period.desiredBest, plan.walletNormalized, period.periodId);
  }
  for (const entry of plan.entries) {
    if (
      !entry
      || typeof entry.sessionId !== "string"
      || typeof entry.runId !== "string"
      || typeof entry.periodId !== "string"
      || !(entry.achievedAt instanceof Date)
      || Number.isNaN(entry.achievedAt.getTime())
      || !/^[0-9a-f]{64}$/.test(entry.recordFingerprint)
      || !/^[0-9a-f]{64}$/.test(entry.sourceFingerprint)
      || !/^[0-9a-f]{64}$/.test(entry.periodStateFingerprint)
      || (entry.currentBestFingerprint !== null && !/^[0-9a-f]{64}$/.test(entry.currentBestFingerprint))
      || !allowedActions.has(entry.action)
      || typeof entry.winner !== "boolean"
    ) {
      throw new DomainValidationError("Una entrada del plan historico no tiene una estructura valida.");
    }
  }
  if (!/^[0-9a-f]{64}$/.test(plan.planHash) || historicalOwnWeeklyReprojectionPlanHash(plan) !== plan.planHash) {
    throw new DomainValidationError("El hash del plan historico no corresponde a su payload.");
  }
}

export function isHistoricalOwnWeeklyReprojectionReplay(
  plan: HistoricalOwnWeeklyPlan,
  current: HistoricalOwnWeeklyPlan,
) {
  if (
    plan.version !== current.version
    || plan.databaseName !== current.databaseName
    || plan.chainId !== current.chainId
    || plan.gameId !== current.gameId
    || plan.walletNormalized !== current.walletNormalized
    || fingerprint(plan.sessionIds) !== fingerprint(current.sessionIds)
    || plan.periods.length !== current.periods.length
    || plan.entries.length !== current.entries.length
    || !sameDate(plan.plannedAt, current.plannedAt)
  ) return false;
  const currentByPeriod = new Map(current.periods.map((period) => [period.periodId, period]));
  if (currentByPeriod.size !== plan.periods.length) return false;
  for (const expected of plan.periods) {
    const actual = currentByPeriod.get(expected.periodId);
    if (!actual || actual.state.allocationRevision !== expected.state.allocationRevision) return false;
    const changed = expected.action === "insert" || expected.action === "replace";
    const expectedRevision = expected.state.revision + (changed ? 1 : 0);
    if (actual.state.revision !== expectedRevision) return false;
    if (changed) {
      if (!expected.desiredBest || !sameBest(actual.currentBest, expected.desiredBest)) return false;
      if (actual.state.createdAt.getTime() !== expected.state.createdAt.getTime()) return false;
      if (actual.state.updatedAt.getTime() !== plan.plannedAt.getTime()) return false;
      const expectedStateFingerprint = fingerprint({
        _id: expected.periodId,
        periodId: expected.periodId,
        status: "open",
        allocationRevision: expected.state.allocationRevision,
        revision: expectedRevision,
        createdAt: expected.state.createdAt,
        updatedAt: plan.plannedAt,
      });
      if (actual.state.fingerprint !== expectedStateFingerprint) return false;
    } else if (!sameBest(actual.currentBest, expected.currentBest) || actual.state.fingerprint !== expected.state.fingerprint) {
      return false;
    }
  }
  const expectedEntries = new Map(plan.entries.map((entry) => [entry.sessionId, entry]));
  if (expectedEntries.size !== plan.entries.length) return false;
  return current.entries.every((entry) => {
    const expected = expectedEntries.get(entry.sessionId);
    const period = currentByPeriod.get(entry.periodId);
    const expectedPeriod = plan.periods.find((item) => item.periodId === entry.periodId);
    if (!expected || !period || !expectedPeriod) return false;
    return entry.recordFingerprint === expected.recordFingerprint
      && entry.sourceFingerprint === expected.sourceFingerprint
      && expected.periodStateFingerprint === expectedPeriod.state.fingerprint
      && entry.periodStateFingerprint === period.state.fingerprint;
  });
}

async function findMany<T extends Document>(db: Db, collection: string, filter: object, session?: ClientSession) {
  return db.collection<T>(collection).find(filter, session ? { session } : undefined).toArray();
}

export async function readHistoricalOwnWeeklyReprojectionPlan(
  db: Db,
  input: HistoricalOwnWeeklyReprojectionInput,
  mongoSession?: ClientSession,
): Promise<HistoricalOwnWeeklyPlan> {
  assertEconomyDatabase(db);
  const scope = assertBoundedScope(input);
  const sessionRows = await findMany<GameEconomySession>(db, "game_economy_sessions", { sessionId: { $in: scope.sessionIds } }, mongoSession);
  const runRows = await findMany<TreasureHuntEconomyRun>(db, "treasure_hunt_economy_runs", { gameEconomySessionId: { $in: scope.sessionIds } }, mongoSession);
  const sourceRows = await findMany<WeeklyGameSource>(db, "reward_weekly_game_sources", { sessionId: { $in: scope.sessionIds } }, mongoSession);
  const extraRuns = runRows.filter((run) => !scope.sessionIds.includes(run.gameEconomySessionId));
  const extraSessions = sessionRows.filter((row) => !scope.sessionIds.includes(row.sessionId));
  const extraSources = sourceRows.filter((row) => !scope.sessionIds.includes(row.sessionId));
  if (sessionRows.length !== scope.sessionIds.length || runRows.length !== scope.sessionIds.length || sourceRows.length !== scope.sessionIds.length) {
    throw new DomainConflictError("La lectura de Mongo no contiene exactamente una sesion, run y source por ID.");
  }
  const creditIds = sessionRows.map((row) => row.credit.reservationId).filter((value): value is string => Boolean(value));
  if (creditIds.length !== sessionRows.length) {
    throw new DomainConflictError("La lectura contiene una sesion OWN sin reservationId de creditos.");
  }
  const rewardVersions = [...new Set(sessionRows.map((row) => row.rule.reward.rewardRuleVersion))];
  const credits = await findMany<CreditReservation>(db, "competition_credit_reservations", { reservationId: { $in: creditIds } }, mongoSession);
  const poolAssignments = await findMany<CukiePoolAssignment>(db, "cukie_pool_assignments", { sessionId: { $in: scope.sessionIds } }, mongoSession);
  const ownAssignments = await findMany<OwnCukieAssignment>(db, "game_owned_cukie_assignments", { sessionId: { $in: scope.sessionIds } }, mongoSession);
  const rewardRules = await findMany<RewardRule>(db, "economy_rule_versions", { scope: "reward_allocations", version: { $in: rewardVersions } }, mongoSession);
  const periodIds = [...new Set(runRows.map((run) => run.weeklyPeriodId))];
  const periodStates = await findMany<RewardPeriodState>(db, "reward_period_states", { _id: { $in: periodIds } }, mongoSession);
  const periodSeals = await findMany<RewardPeriodSeal>(db, "reward_period_seals", { periodId: { $in: periodIds } }, mongoSession);
  const weeklyRankingManifests = await findMany<WeeklyRankingManifest>(db, "weekly_ranking_manifests", { periodId: { $in: periodIds } }, mongoSession);
  const weeklyRankingRuns = await findMany<WeeklyRankingRun>(db, "weekly_ranking_runs", { periodId: { $in: periodIds } }, mongoSession);
  const weeklyRankingStates = await findMany<WeeklyRankingPeriodState>(db, "weekly_ranking_period_states", { periodId: { $in: periodIds } }, mongoSession);
  const weeklyRankingAuditEvents = await findMany<WeeklyRankingAuditEvent>(db, "weekly_ranking_audit_events", { periodId: { $in: periodIds } }, mongoSession);
  const weeklyRankingSnapshots = await findMany<WeeklyRankingSnapshot>(db, "game_weekly_rankings", { periodId: { $in: periodIds } }, mongoSession);
  const weeklyAccounting = await findMany<WeeklyPrizeAccounting>(db, "reward_weekly_prize_accounting", { periodId: { $in: periodIds } }, mongoSession);
  const sourceIds = sourceRows.map((source) => `game-session:${source.sessionId}`);
  const sourceManifests = await findMany<RewardSourceManifest>(db, "reward_source_manifests", { sourceId: { $in: sourceIds } }, mongoSession);
  const sourceAllocations = await findMany<Artifact>(db, "reward_allocations", { sourceId: { $in: sourceIds } }, mongoSession);
  const sourceAccruals = await findMany<Artifact>(db, "reward_pool_accruals", { sourceId: { $in: sourceIds } }, mongoSession);
  const bestRows = await findMany<TreasureHuntWeeklyBest>(db, "treasure_hunt_weekly_bests", { walletNormalized: scope.walletNormalized, weeklyPeriodId: { $in: periodIds }, gameId: HISTORICAL_OWN_WEEKLY_GAME_ID }, mongoSession);
  const records = sessionRows.map((session) => {
    const run = runRows.find((item) => item.gameEconomySessionId === session.sessionId)!;
    const source = sourceRows.find((item) => item.sessionId === session.sessionId)!;
    const credit = credits.find((item) => item.reservationId === session.credit.reservationId);
    if (!credit) throw new DomainConflictError(`Falta la reserva de creditos de ${session.sessionId}.`);
    const periodId = run.weeklyPeriodId;
    const currentBestRows = bestRows.filter((best) => best.weeklyPeriodId === periodId);
    if (currentBestRows.length > 1) throw new DomainConflictError(`Hay varios mejores resultados para ${scope.walletNormalized}/${periodId}.`);
    const rewardRule = rewardRules.find((item) => item.version === session.rule.reward.rewardRuleVersion && item.configHash === session.rule.reward.rewardRuleConfigHash);
    if (!rewardRule) throw new DomainConflictError(`Falta la regla rewards ${session.rule.reward.rewardRuleVersion}/${session.rule.reward.rewardRuleConfigHash}.`);
    const periodState = periodStates.find((item) => item.periodId === periodId);
    if (!periodState) throw new DomainConflictError(`Falta el estado rewards del periodo ${periodId}.`);
    return {
      run,
      session,
      credit,
      poolAssignment: poolAssignments.find((item) => item.sessionId === session.sessionId) ?? null,
      ownAssignment: ownAssignments.find((item) => item.sessionId === session.sessionId) ?? null,
      source,
      rewardRule,
      periodState,
      periodSeal: periodSeals.find((item) => item.periodId === periodId) ?? null,
      weeklyRankingManifests: weeklyRankingManifests.filter((item) => item.periodId === periodId),
      weeklyRankingRuns: weeklyRankingRuns.filter((item) => item.periodId === periodId),
      weeklyRankingStates: weeklyRankingStates.filter((item) => item.periodId === periodId),
      weeklyRankingAuditEvents: weeklyRankingAuditEvents.filter((item) => item.periodId === periodId),
      weeklyRankingSnapshots: weeklyRankingSnapshots.filter((item) => item.periodId === periodId),
      weeklyAccounting: weeklyAccounting.filter((item) => item.periodId === periodId),
      sourceManifests: sourceManifests.filter((item) => item.sourceId === `game-session:${source.sessionId}`),
      sourceAllocations: sourceAllocations.filter((item) => item.sourceId === `game-session:${source.sessionId}`),
      sourceAccruals: sourceAccruals.filter((item) => item.sourceId === `game-session:${source.sessionId}`),
      currentBest: currentBestRows[0] ?? null,
    } satisfies HistoricalOwnWeeklyRecord;
  });
  return planHistoricalOwnWeeklyReprojection({ records, extraRuns, extraSessions, extraSources }, input);
}

export async function applyHistoricalOwnWeeklyReprojection(
  db: Db,
  mongoSession: ClientSession,
  plan: HistoricalOwnWeeklyPlan,
): Promise<HistoricalOwnWeeklyApplyResult> {
  assertEconomyDatabase(db);
  if (!mongoSession.inTransaction()) {
    throw new DomainValidationError("El apply historico exige una transaccion Mongo activa.");
  }
  assertPlanIntegrity(plan);
  if (plan.version !== HISTORICAL_OWN_WEEKLY_REPROJECTION_VERSION || plan.databaseName !== HISTORICAL_OWN_WEEKLY_DATABASE || plan.chainId !== HISTORICAL_OWN_WEEKLY_CHAIN_ID || plan.gameId !== HISTORICAL_OWN_WEEKLY_GAME_ID) {
    throw new DomainValidationError("El plan historico no pertenece al reconciliador staging esperado.");
  }
  const fresh = await readHistoricalOwnWeeklyReprojectionPlan(db, {
    walletNormalized: plan.walletNormalized,
    sessionIds: plan.sessionIds,
    now: plan.plannedAt,
  }, mongoSession);
  if (fresh.planHash !== plan.planHash) {
    if (isHistoricalOwnWeeklyReprojectionReplay(plan, fresh)) {
      return { status: "replayed", replayed: true, planHash: plan.planHash, periodsFenced: 0, bestsInserted: 0, bestsReplaced: 0 };
    }
    throw new StaleFenceError("El plan historico cambio desde su lectura y no coincide con el hash revisado.");
  }
  if (plan.periods.every((period) => period.action === "covered_by_existing")) {
    return { status: "replayed", replayed: true, planHash: plan.planHash, periodsFenced: 0, bestsInserted: 0, bestsReplaced: 0 };
  }
  const states = db.collection<RewardPeriodState>("reward_period_states");
  const bests = db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests");
  let periodsFenced = 0;
  let bestsInserted = 0;
  let bestsReplaced = 0;
  for (const period of plan.periods) {
    if (period.action === "covered_by_existing" || !period.desiredBest) continue;
    const currentState = await states.findOne({ _id: period.periodId }, { session: mongoSession });
    if (!currentState || currentState.status !== "open" || currentState.revision !== period.state.revision || currentState.allocationRevision !== period.state.allocationRevision || fingerprint(currentState) !== period.state.fingerprint) {
      throw new StaleFenceError(`El estado del periodo ${period.periodId} cambio durante el apply.`);
    }
    if (plan.plannedAt.getTime() < currentState.updatedAt.getTime()) {
      throw new StaleFenceError(`El plan del periodo ${period.periodId} es anterior a su ultima actualizacion.`);
    }
    const fenced = await states.updateOne(
      { _id: period.periodId, status: "open", revision: period.state.revision, allocationRevision: period.state.allocationRevision },
      { $inc: { revision: 1 }, $set: { updatedAt: plan.plannedAt } },
      { session: mongoSession },
    );
    if (fenced.matchedCount !== 1) throw new StaleFenceError(`No se pudo sellar la concurrencia del periodo ${period.periodId}.`);
    periodsFenced += 1;
    const desired = period.desiredBest;
    if (period.action === "insert") {
      try {
        await bests.insertOne(desired, { session: mongoSession });
      } catch (error) {
        if ((error as { code?: number })?.code === 11000) throw new StaleFenceError(`El mejor resultado ${desired._id} aparecio durante el apply.`);
        throw error;
      }
      bestsInserted += 1;
    } else {
      if (!period.currentBest) throw new DomainConflictError(`El periodo ${period.periodId} requiere replace sin baseline.`);
      const replaced = await bests.replaceOne({ _id: period.currentBest._id, revision: period.currentBest.revision }, desired, { session: mongoSession });
      if (replaced.matchedCount !== 1) throw new StaleFenceError(`El mejor resultado ${desired._id} cambio durante el apply.`);
      bestsReplaced += 1;
    }
  }
  return { status: "applied", replayed: false, planHash: plan.planHash, periodsFenced, bestsInserted, bestsReplaced };
}
