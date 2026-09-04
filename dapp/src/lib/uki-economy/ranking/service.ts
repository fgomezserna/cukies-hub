import "server-only";
import { economyCycleDelayMs, type EconomyCycleCalendar } from '../cycle-calendar';

import { validateReservationIntegrity } from "../credits/service";
import type { CreditReservation } from "../credits/types";
import { DomainConflictError, DomainValidationError, StaleFenceError } from "../errors";
import { stableGameEconomyHash, assertGameSessionIntegrity, parseCanonicalRaw } from "../game-economy/rules";
import type { GameEconomySession } from "../game-economy/types";
import { TREASURE_HUNT_ECONOMY_POLICY } from "../game-economy/treasure-hunt-policy";
import { getIsoWeekPeriod, getIsoWeekPeriodId, getIsoWeekPeriodFromId, type UtcPeriod } from "../periods";
import {
  compareRewardText,
  stableRewardHash,
  validRewardDate,
  validRewardText,
  validRewardWallet,
} from "../rewards/rules";
import {
  mongoWeeklyRankingTransactionRunner,
  type RankingParticipantKey,
  type WeeklyRankingRepository,
  type WeeklyRankingTransactionRunner,
} from "./repository";
import {
  assertWeeklyRankingRule,
  assertWeeklyRankingSnapshotIntegrity,
  buildCurrentWeeklyRankingRule,
  calculateNextWeeklyRank,
  calculatePerformanceBps,
  compareParticipantKey,
  weeklyRankingId,
  weeklyRankingSnapshotPayload,
} from "./rules";
import {
  WEEKLY_RANKING_INITIAL_RANK,
  WEEKLY_RANKING_RULE_SCOPE,
  type WeeklyRankingAuditEvent,
  type WeeklyRankingManifest,
  type WeeklyRankingPeriodState,
  type WeeklyRankingRule,
  type WeeklyRankingRun,
  type WeeklyRankingSnapshot,
  type WeeklyRankingSource,
} from "./types";

const MAX_PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 500;

function pageSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new DomainValidationError(`pageSize debe estar entre 1 y ${MAX_PAGE_SIZE}.`);
  }
  return value;
}

function sha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainConflictError(`${label} no es SHA-256 canonico.`);
  }
  return value;
}

function participantKey(value: RankingParticipantKey) {
  return `${value.gameId}\u0000${value.walletNormalized}`;
}

function rankingCreditEvidenceHash(input: {
  reservationId: string;
  sessionId: string;
  walletNormalized: string;
  costCode: string;
  amountCredits: number;
  bucket: "own" | "pool";
  expiresAt: Date;
  payloadHash: string;
}) {
  return stableGameEconomyHash({
    kind: "game-credit-reservation-evidence",
    reservationId: input.reservationId,
    sessionId: input.sessionId,
    walletNormalized: input.walletNormalized,
    costCode: input.costCode,
    amountCredits: input.amountCredits,
    bucket: input.bucket,
    expiresAt: input.expiresAt,
    payloadHash: input.payloadHash,
  });
}

function assertRankingCreditBinding(game: GameEconomySession, credit: CreditReservation) {
  validateReservationIntegrity(credit);
  if (game.status !== "settled"
    || !game.settledAt
    || !game.validation
    || game.credit.state !== "consumed"
    || credit.status !== "consumed"
    || game.credit.reservationId !== credit.reservationId
    || game.credit.evidenceHash !== rankingCreditEvidenceHash(credit)
    || credit.sessionId !== game.sessionId
    || credit.walletNormalized !== game.walletNormalized
    || credit.costCode !== game.rule.credit.costCode
    || credit.ruleVersion !== game.rule.credit.creditRuleVersion
    || credit.ruleConfigHash !== game.rule.credit.creditRuleConfigHash
    || credit.expectedRuleVersion !== game.rule.credit.creditRuleVersion
    || credit.expectedRuleConfigHash !== game.rule.credit.creditRuleConfigHash) {
    throw new DomainConflictError(`La reserva de ${game.sessionId} no liga el settlement de ranking.`);
  }
  return credit;
}

export function weeklyRankingSourcePayload(
  source: Omit<WeeklyRankingSource, "sourceHash" | "createdAt">,
) {
  return {
    kind: "weekly-ranking-source",
    sourceId: source.sourceId,
    periodId: source.periodId,
    sessionId: source.sessionId,
    reservationId: source.reservationId,
    gameId: source.gameId,
    walletNormalized: source.walletNormalized,
    periodAnchorAt: source.periodAnchorAt,
    settledAt: source.settledAt,
    creditBucket: source.creditBucket,
    creditCostCode: source.creditCostCode,
    creditAmountCredits: source.creditAmountCredits,
    creditExpiresAt: source.creditExpiresAt,
    creditEvidenceHash: source.creditEvidenceHash,
    cappedScoreRaw: source.cappedScoreRaw,
    scoreCapRaw: source.scoreCapRaw,
    gameResultHash: source.gameResultHash,
    creditPayloadHash: source.creditPayloadHash,
    gameRuleVersion: source.gameRuleVersion,
    gameRuleConfigHash: source.gameRuleConfigHash,
  };
}

function buildSource(game: GameEconomySession, credit: CreditReservation, period: UtcPeriod, createdAt: Date) {
  assertGameSessionIntegrity(game);
  assertRankingCreditBinding(game, credit);
  if (credit.bucket !== "pool") {
    throw new DomainConflictError(`La session ${game.sessionId} no usa creditos del pool.`);
  }
  const periodAnchorAt = game.rule.calendar ? game.createdAt : game.gameId === TREASURE_HUNT_ECONOMY_POLICY.gameId
    && game.rule.version === TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion
    ? new Date(game.createdAt.getTime() - 14 * 60 * 60_000)
    : game.settledAt!;
  if (!game.settledAt || getIsoWeekPeriodId(periodAnchorAt, game.rule.calendar) !== period.id) {
    throw new DomainConflictError(`La session ${game.sessionId} no pertenece a ${period.id}.`);
  }
  const cappedScore = parseCanonicalRaw(game.validation!.cappedScoreRaw, "cappedScoreRaw");
  const scoreCap = parseCanonicalRaw(game.rule.calculation.scoreCapRaw, "scoreCapRaw");
  if (scoreCap === BigInt(0) || cappedScore > scoreCap) {
    throw new DomainConflictError(`La conversion lineal de ${game.sessionId} no es valida.`);
  }
  const sourceId = stableRewardHash({
    kind: "weekly-ranking-source-id",
    periodId: period.id,
    sessionId: game.sessionId,
  });
  const base = {
    _id: sourceId,
    sourceId,
    periodId: period.id,
    sessionId: game.sessionId,
    reservationId: credit.reservationId,
    gameId: game.gameId,
    walletNormalized: game.walletNormalized,
    periodAnchorAt: game.rule.calendar ? game.createdAt : game.gameId === TREASURE_HUNT_ECONOMY_POLICY.gameId
      && game.rule.version === TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion
      ? game.createdAt
      : game.settledAt,
    settledAt: game.settledAt,
    creditBucket: credit.bucket,
    creditCostCode: credit.costCode,
    creditAmountCredits: credit.amountCredits,
    creditExpiresAt: credit.expiresAt,
    creditEvidenceHash: game.credit.evidenceHash!,
    cappedScoreRaw: cappedScore.toString(10),
    scoreCapRaw: scoreCap.toString(10),
    gameResultHash: sha256(game.validation!.resultHash, "game.validation.resultHash"),
    creditPayloadHash: sha256(credit.payloadHash, "credit.payloadHash"),
    gameRuleVersion: game.rule.version,
    gameRuleConfigHash: sha256(game.rule.configHash, "game.rule.configHash"),
  };
  return assertWeeklyRankingSourceIntegrity({
    ...base,
    sourceHash: stableRewardHash(weeklyRankingSourcePayload(base)),
    createdAt,
  } satisfies WeeklyRankingSource);
}

export function assertWeeklyRankingSourceIntegrity(source: WeeklyRankingSource) {
  const capped = parseCanonicalRaw(source.cappedScoreRaw, "source.cappedScoreRaw");
  const cap = parseCanonicalRaw(source.scoreCapRaw, "source.scoreCapRaw");
  const creditExpiresAt = validRewardDate(source.creditExpiresAt, "source.creditExpiresAt");
  const expectedEvidenceHash = rankingCreditEvidenceHash({
    reservationId: source.reservationId,
    sessionId: source.sessionId,
    walletNormalized: source.walletNormalized,
    costCode: source.creditCostCode,
    amountCredits: source.creditAmountCredits,
    bucket: source.creditBucket,
    expiresAt: creditExpiresAt,
    payloadHash: source.creditPayloadHash,
  });
  if (source._id !== source.sourceId
    || !/^[0-9a-f]{64}$/.test(source.sourceId)
    || validRewardText(source.sessionId, "source.sessionId") !== source.sessionId
    || validRewardText(source.reservationId, "source.reservationId") !== source.reservationId
    || validRewardText(source.gameId, "source.gameId") !== source.gameId
    || validRewardWallet(source.walletNormalized) !== source.walletNormalized
    || source.creditBucket !== "pool"
    || validRewardText(source.creditCostCode, "source.creditCostCode") !== source.creditCostCode
    || !Number.isSafeInteger(source.creditAmountCredits)
    || source.creditAmountCredits < 1
    || source.creditAmountCredits > 1_000
    || !/^[0-9a-f]{64}$/.test(source.creditEvidenceHash)
    || source.creditEvidenceHash !== expectedEvidenceHash
    || cap === BigInt(0)
    || capped > cap
    || !/^[0-9a-f]{64}$/.test(source.gameResultHash)
    || !/^[0-9a-f]{64}$/.test(source.creditPayloadHash)
    || !/^[0-9a-f]{64}$/.test(source.gameRuleConfigHash)
    || source.sourceHash !== stableRewardHash(weeklyRankingSourcePayload(source))
    || !sourceBelongsToPeriod(source)) {
    throw new DomainConflictError(`Source ${source._id} no supera integridad.`);
  }
  validRewardDate(source.createdAt, "source.createdAt");
  return source;
}

function sourceBelongsToPeriod(source: WeeklyRankingSource) {
  const period = getIsoWeekPeriodFromId(source.periodId);
  const shift = !period.calendar && source.gameId === TREASURE_HUNT_ECONOMY_POLICY.gameId ? 14 * 60 * 60_000 : 0;
  const anchor = source.periodAnchorAt.getTime() - shift;
  return anchor >= period.start.getTime() && anchor < period.endExclusive.getTime();
}

function manifestPayload(manifest: Omit<WeeklyRankingManifest, "payloadHash" | "createdAt">) {
  return {
    kind: "weekly-ranking-manifest",
    manifestId: manifest.manifestId,
    periodId: manifest.periodId,
    periodStart: manifest.periodStart,
    periodEndExclusive: manifest.periodEndExclusive,
    ruleVersion: manifest.ruleVersion,
    ruleConfigHash: manifest.ruleConfigHash,
    sourceCount: manifest.sourceCount,
    participantCount: manifest.participantCount,
    sourceSetHash: manifest.sourceSetHash,
    snapshotSetHash: manifest.snapshotSetHash,
    runId: manifest.runId,
    status: manifest.status,
    sealedAt: manifest.sealedAt,
  };
}

export function assertWeeklyRankingManifestIntegrity(manifest: WeeklyRankingManifest) {
  if (manifest._id !== manifest.manifestId
    || !/^[0-9a-f]{64}$/.test(manifest.manifestId)
    || manifest.status !== "sealed"
    || getIsoWeekPeriodFromId(manifest.periodId).start.getTime() !== manifest.periodStart.getTime()
    || getIsoWeekPeriodFromId(manifest.periodId).endExclusive.getTime() !== manifest.periodEndExclusive.getTime()
    || !Number.isSafeInteger(manifest.sourceCount)
    || manifest.sourceCount < 0
    || !Number.isSafeInteger(manifest.participantCount)
    || manifest.participantCount < 0
    || !/^[0-9a-f]{64}$/.test(manifest.sourceSetHash)
    || !/^[0-9a-f]{64}$/.test(manifest.snapshotSetHash)
    || !/^[0-9a-f]{64}$/.test(manifest.runId)
    || manifest.payloadHash !== stableRewardHash(manifestPayload(manifest))) {
    throw new DomainConflictError(`Manifest ${manifest._id} no supera integridad.`);
  }
  validRewardDate(manifest.sealedAt, "manifest.sealedAt");
  validRewardDate(manifest.createdAt, "manifest.createdAt");
  if (manifest.createdAt.getTime() !== manifest.sealedAt.getTime()) {
    throw new DomainConflictError(`Manifest ${manifest._id} tiene cronologia invalida.`);
  }
  return manifest;
}

function runPayload(run: Omit<WeeklyRankingRun, "payloadHash">) {
  return {
    kind: "weekly-ranking-run",
    runId: run.runId,
    periodId: run.periodId,
    manifestId: run.manifestId,
    ruleVersion: run.ruleVersion,
    ruleConfigHash: run.ruleConfigHash,
    sourceSetHash: run.sourceSetHash,
    snapshotSetHash: run.snapshotSetHash,
    sourceCount: run.sourceCount,
    participantCount: run.participantCount,
    status: run.status,
    startedAt: run.startedAt,
    sealedAt: run.sealedAt,
  };
}

function auditPayload(event: Omit<WeeklyRankingAuditEvent, "payloadHash">) {
  return {
    kind: "weekly-ranking-audit",
    eventId: event.eventId,
    type: event.type,
    periodId: event.periodId,
    runId: event.runId,
    manifestId: event.manifestId,
    ruleVersion: event.ruleVersion,
    ruleConfigHash: event.ruleConfigHash,
    sourceSetHash: event.sourceSetHash,
    snapshotSetHash: event.snapshotSetHash,
    sourceCount: event.sourceCount,
    participantCount: event.participantCount,
    createdAt: event.createdAt,
  };
}

async function scanSources(
  repository: WeeklyRankingRepository,
  period: UtcPeriod,
  sealedAt: Date,
  size: number,
) {
  const sources: WeeklyRankingSource[] = [];
  let afterId: string | null = null;
  while (true) {
    const sessions = await repository.listSettledSessionsPage({
      start: period.start,
      endExclusive: period.endExclusive,
      ...(period.calendar ? { calendar: period.calendar } : {}),
      afterId,
      limit: size,
    });
    if (sessions.length === 0) break;
    const ids = sessions.map((game) => {
      assertGameSessionIntegrity(game);
      if (!game.credit.reservationId) {
        throw new DomainConflictError(`La session ${game.sessionId} no fija credit reservation.`);
      }
      return game.credit.reservationId;
    });
    const credits = await repository.listReservations([...new Set(ids)]);
    const creditById = new Map(credits.map((credit) => [credit.reservationId, credit]));
    if (creditById.size !== new Set(ids).size) {
      throw new DomainConflictError(`Faltan reservas canonicas en ${period.id}.`);
    }
    for (const game of sessions) {
      const credit = creditById.get(game.credit.reservationId!);
      if (!credit) throw new DomainConflictError(`Falta reserva para ${game.sessionId}.`);
      assertRankingCreditBinding(game, credit);
      if (credit.bucket === "pool") sources.push(buildSource(game, credit, period, sealedAt));
    }
    afterId = sessions[sessions.length - 1]!._id;
    if (sessions.length < size) break;
  }
  sources.sort((left, right) => compareRewardText(left.sourceId, right.sourceId));
  return sources;
}

async function previousRankings(
  repository: WeeklyRankingRepository,
  participants: RankingParticipantKey[],
  before: Date,
  size: number,
) {
  const result = new Map<string, WeeklyRankingSnapshot>();
  for (let offset = 0; offset < participants.length; offset += size) {
    const rows = await repository.findPreviousRankings(participants.slice(offset, offset + size), before);
    for (const row of rows) {
      assertWeeklyRankingSnapshotIntegrity(row);
      if (row.periodStart.getTime() >= before.getTime()) {
        throw new DomainConflictError(`Ranking previo ${row.rankingId} no es anterior.`);
      }
      result.set(participantKey(row), row);
    }
  }
  return result;
}

function buildSnapshots(input: {
  sources: WeeklyRankingSource[];
  previous: Map<string, WeeklyRankingSnapshot>;
  period: UtcPeriod;
  rule: WeeklyRankingRule;
  sourceSetHash: string;
  runId: string;
  manifestId: string;
  sealedAt: Date;
}) {
  const grouped = new Map<string, WeeklyRankingSource[]>();
  for (const source of input.sources) {
    const key = participantKey(source);
    grouped.set(key, [...(grouped.get(key) ?? []), source]);
  }
  const keys = [...grouped.values()]
    .map((rows) => ({ gameId: rows[0]!.gameId, walletNormalized: rows[0]!.walletNormalized }))
    .sort(compareParticipantKey);
  return keys.map((key) => {
    const rows = grouped.get(participantKey(key))!;
    const totalCapped = rows.reduce((sum, row) => sum + BigInt(row.cappedScoreRaw), BigInt(0));
    const totalCap = rows.reduce((sum, row) => sum + BigInt(row.scoreCapRaw), BigInt(0));
    const performanceBps = calculatePerformanceBps(totalCapped.toString(10), totalCap.toString(10));
    const rank = input.previous.get(participantKey(key))?.nextRank ?? WEEKLY_RANKING_INITIAL_RANK;
    const nextRank = calculateNextWeeklyRank({
      appliedRank: rank,
      gamesPlayed: rows.length,
      performanceBps,
      rule: input.rule,
    });
    const rankingId = weeklyRankingId(input.period.id, key.gameId, key.walletNormalized);
    const base = {
      _id: rankingId,
      rankingId,
      periodId: input.period.id,
      periodStart: input.period.start,
      periodEndExclusive: input.period.endExclusive,
      ...key,
      rank,
      nextRank,
      movement: nextRank - rank,
      rewardBps: input.rule.tiers[rank - 1]!.rewardBps,
      gamesPlayed: rows.length,
      totalCappedScoreRaw: totalCapped.toString(10),
      totalScoreCapRaw: totalCap.toString(10),
      performanceBps,
      participantSourceSetHash: stableRewardHash({
        kind: "weekly-ranking-participant-source-set",
        periodId: input.period.id,
        gameId: key.gameId,
        walletNormalized: key.walletNormalized,
        sourceHashes: rows.map((row) => row.sourceHash).sort(compareRewardText),
      }),
      sourceSetHash: input.sourceSetHash,
      ruleVersion: input.rule.version,
      ruleConfigHash: input.rule.configHash,
      runId: input.runId,
      manifestId: input.manifestId,
      status: "sealed" as const,
      sealedAt: input.sealedAt,
      createdAt: input.sealedAt,
    };
    return assertWeeklyRankingSnapshotIntegrity({
      ...base,
      payloadHash: stableRewardHash(weeklyRankingSnapshotPayload(base)),
    });
  });
}

async function listStored<T extends { _id: string }>(
  loader: (afterId: string | null, limit: number) => Promise<T[]>,
  size: number,
) {
  const rows: T[] = [];
  let afterId: string | null = null;
  while (true) {
    const page = await loader(afterId, size);
    if (page.length === 0) break;
    rows.push(...page);
    afterId = page[page.length - 1]!._id;
    if (page.length < size) break;
  }
  return rows;
}

async function insertBatches<T>(documents: T[], insert: (batch: T[]) => Promise<void>) {
  for (let offset = 0; offset < documents.length; offset += WRITE_BATCH_SIZE) {
    await insert(documents.slice(offset, offset + WRITE_BATCH_SIZE));
  }
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === 11000);
}

export class WeeklyRankingService {
  constructor(private readonly runTransaction: WeeklyRankingTransactionRunner) {}

  async persistCurrentRule(input: { calendar?: EconomyCycleCalendar; version: string; activeFrom: Date; activeUntil?: Date; now: Date }) {
    const candidate = buildCurrentWeeklyRankingRule(input);
    const attempt = () => this.runTransaction(async (repository) => {
      const existing = await repository.findRuleByVersion(candidate.version);
      if (existing) {
        assertWeeklyRankingRule(existing);
        if (existing.configHash !== candidate.configHash) {
          throw new DomainConflictError(`La regla ${candidate.version} ya es inmutable.`);
        }
        return { rule: existing, replayed: true };
      }
      const state = await repository.findRuleState();
      if (!state) {
        await repository.insertRuleState({
          _id: WEEKLY_RANKING_RULE_SCOPE,
          scope: WEEKLY_RANKING_RULE_SCOPE,
          revision: 0,
          createdAt: candidate.createdAt,
          updatedAt: candidate.createdAt,
        });
      } else {
        const updated = await repository.replaceRuleState(state.revision, {
          ...state,
          revision: state.revision + 1,
          updatedAt: candidate.createdAt,
        });
        if (!updated) throw new StaleFenceError("Otra regla de ranking gano el fence.");
      }
      const overlap = await repository.findOverlappingRule(candidate.activeFrom, candidate.activeUntil);
      if (overlap) {
        throw new DomainConflictError(`La regla ${candidate.version} solapa ${overlap.version}.`);
      }
      await repository.insertRule(candidate);
      return { rule: candidate, replayed: false };
    });
    try {
      return await attempt();
    } catch (error) {
      if (isDuplicateKey(error)) return attempt();
      throw error;
    }
  }

  async closeCompletedPeriod(input: { now: Date; pageSize?: number }) {
    const now = validRewardDate(input.now, "now");
    const period = await this.runTransaction(async (repository) => {
      const firstRule = await repository.findFirstRuleBefore(now);
      if (!firstRule) {
        throw new DomainConflictError("No hay una regla de ranking activa antes del cierre actual.");
      }
      assertWeeklyRankingRule(firstRule);
      const current = getIsoWeekPeriod(now, firstRule.calendar);
      let cursor = getIsoWeekPeriod(firstRule.activeFrom, firstRule.calendar);
      let latestCovered: UtcPeriod | null = null;
      while (cursor.endExclusive.getTime() <= current.start.getTime()) {
        const coveringRule = await repository.findRuleCovering(cursor.start, cursor.endExclusive);
        if (coveringRule) {
          latestCovered = cursor;
          const state = await repository.findPeriodState(cursor.id);
          if (!state) return cursor;
        }
        cursor = getIsoWeekPeriod(new Date(cursor.endExclusive.getTime() + 1), firstRule.calendar);
      }
      if (!latestCovered) {
        throw new DomainConflictError("No hay semanas completas cubiertas por una regla de ranking.");
      }
      // Cuando el catch-up esta al dia se repite la ultima semana para detectar
      // cualquier settlement tardio que intentase alterar un manifest sellado.
      return latestCovered;
    });
    return this.closePeriod({ period, now, pageSize: input.pageSize ?? 500 });
  }

  async closePeriod(input: { period: UtcPeriod; now: Date; pageSize: number }) {
    const size = pageSize(input.pageSize);
    const now = validRewardDate(input.now, "now");
    const canonical = getIsoWeekPeriodFromId(input.period.id);
    if (input.period.id !== canonical.id
      || input.period.start.getTime() !== canonical.start.getTime()
      || input.period.endExclusive.getTime() !== canonical.endExclusive.getTime()) {
      throw new DomainValidationError("El periodo de ranking no es ISO UTC canonico.");
    }
    if (canonical.endExclusive.getTime() > now.getTime()) {
      throw new DomainConflictError(`El periodo ${canonical.id} aun no ha terminado.`);
    }
    if (canonical.endExclusive.getTime() + (canonical.calendar ? economyCycleDelayMs(2, canonical.calendar) : 14 * 60 * 60_000) > now.getTime()) {
      throw new DomainConflictError(
        `El periodo ${canonical.id} de Treasure Hunt no termina hasta las 14:00 UTC.`,
      );
    }
    return this.runTransaction(async (repository) => {
      const rule = await repository.findRuleCovering(canonical.start, canonical.endExclusive);
      if (!rule) throw new DomainConflictError(`No existe regla que cubra todo ${canonical.id}.`);
      if (getIsoWeekPeriodId(canonical.start, rule.calendar) !== canonical.id) throw new DomainConflictError('La regla ranking no corresponde al calendario del periodo.');
      if (canonical.calendar && (!repository.countPendingCycleSessions || await repository.countPendingCycleSessions(canonical.start, canonical.endExclusive) > 0)) throw new DomainConflictError('El periodo ranking contiene sesiones pendientes.');
      assertWeeklyRankingRule(rule, canonical.start);
      const existing = await repository.findManifest(canonical.id);
      const sealedAt = existing?.sealedAt ?? now;
      const sources = await scanSources(repository, canonical, sealedAt, size);
      const sourceSetHash = stableRewardHash({
        kind: "weekly-ranking-source-set",
        periodId: canonical.id,
        sourceHashes: sources.map((source) => source.sourceHash),
      });
      const participants = [...new Map(sources.map((source) => [participantKey(source), {
        gameId: source.gameId,
        walletNormalized: source.walletNormalized,
      }])).values()].sort(compareParticipantKey);
      const previous = await previousRankings(repository, participants, canonical.start, size);
      const manifestId = stableRewardHash({
        kind: "weekly-ranking-manifest-id",
        periodId: canonical.id,
        ruleVersion: rule.version,
      });
      const runId = stableRewardHash({
        kind: "weekly-ranking-run-id",
        periodId: canonical.id,
        ruleVersion: rule.version,
        ruleConfigHash: rule.configHash,
        sourceSetHash,
      });
      const snapshots = buildSnapshots({
        sources,
        previous,
        period: canonical,
        rule,
        sourceSetHash,
        runId,
        manifestId,
        sealedAt,
      });
      const snapshotSetHash = stableRewardHash({
        kind: "weekly-ranking-snapshot-set",
        periodId: canonical.id,
        snapshotHashes: snapshots.map((snapshot) => snapshot.payloadHash).sort(compareRewardText),
      });
      const manifestBase = {
        _id: manifestId,
        manifestId,
        periodId: canonical.id,
        periodStart: canonical.start,
        periodEndExclusive: canonical.endExclusive,
        ruleVersion: rule.version,
        ruleConfigHash: rule.configHash,
        sourceCount: sources.length,
        participantCount: snapshots.length,
        sourceSetHash,
        snapshotSetHash,
        runId,
        status: "sealed" as const,
        sealedAt,
        createdAt: sealedAt,
      };
      const manifest: WeeklyRankingManifest = {
        ...manifestBase,
        payloadHash: stableRewardHash(manifestPayload(manifestBase)),
      };
      const runBase = {
        _id: runId,
        runId,
        periodId: canonical.id,
        manifestId,
        ruleVersion: rule.version,
        ruleConfigHash: rule.configHash,
        sourceSetHash,
        snapshotSetHash,
        sourceCount: sources.length,
        participantCount: snapshots.length,
        status: "sealed" as const,
        startedAt: sealedAt,
        sealedAt,
      };
      const run: WeeklyRankingRun = { ...runBase, payloadHash: stableRewardHash(runPayload(runBase)) };
      const state: WeeklyRankingPeriodState = {
        _id: canonical.id,
        periodId: canonical.id,
        status: "sealed",
        runId,
        manifestId,
        sourceSetHash,
        revision: 1,
        sealedAt,
        createdAt: sealedAt,
        updatedAt: sealedAt,
      };
      const eventBase = {
        _id: stableRewardHash({ kind: "weekly-ranking-period-sealed-event-id", periodId: canonical.id }),
        eventId: stableRewardHash({ kind: "weekly-ranking-period-sealed-event-id", periodId: canonical.id }),
        type: "period_sealed" as const,
        periodId: canonical.id,
        runId,
        manifestId,
        ruleVersion: rule.version,
        ruleConfigHash: rule.configHash,
        sourceSetHash,
        snapshotSetHash,
        sourceCount: sources.length,
        participantCount: snapshots.length,
        createdAt: sealedAt,
      };
      const event: WeeklyRankingAuditEvent = {
        ...eventBase,
        payloadHash: stableRewardHash(auditPayload(eventBase)),
      };

      if (existing) {
        const storedRun = await repository.findRun(canonical.id);
        const storedState = await repository.findPeriodState(canonical.id);
        const storedEvent = await repository.findAuditEvent(canonical.id);
        assertWeeklyRankingManifestIntegrity(existing);
        if (existing.payloadHash !== manifest.payloadHash
          || !storedRun
          || storedRun.payloadHash !== stableRewardHash(runPayload(storedRun))
          || storedRun?.payloadHash !== run.payloadHash
          || !storedEvent
          || storedEvent.payloadHash !== stableRewardHash(auditPayload(storedEvent))
          || storedEvent?.payloadHash !== event.payloadHash
          || stableRewardHash(storedState) !== stableRewardHash(state)) {
          throw new DomainConflictError(`El cierre existente de ${canonical.id} diverge del source canonico.`);
        }
        const storedSources = await listStored(
          (afterId, limit) => repository.listStoredSourcesPage(canonical.id, afterId, limit),
          size,
        );
        const storedSnapshots = await listStored(
          (afterId, limit) => repository.listStoredSnapshotsPage(canonical.id, afterId, limit),
          size,
        );
        storedSources.forEach(assertWeeklyRankingSourceIntegrity);
        storedSnapshots.forEach(assertWeeklyRankingSnapshotIntegrity);
        const expectedSnapshots = [...snapshots].sort((left, right) => compareRewardText(left._id, right._id));
        if (stableRewardHash(storedSources.map((source) => [source._id, source.sourceHash]))
          !== stableRewardHash(sources.map((source) => [source._id, source.sourceHash]))
          || stableRewardHash(storedSnapshots.map((snapshot) => [snapshot._id, snapshot.payloadHash]))
          !== stableRewardHash(expectedSnapshots.map((snapshot) => [snapshot._id, snapshot.payloadHash]))) {
          throw new DomainConflictError(`Los documentos de ${canonical.id} divergen del manifest.`);
        }
        return { periodId: canonical.id, runId, manifestId, sourceCount: sources.length, participantCount: snapshots.length, replayed: true };
      }

      await insertBatches(sources, (batch) => repository.insertSources(batch));
      await insertBatches(snapshots, (batch) => repository.insertSnapshots(batch));
      await repository.insertManifest(manifest);
      await repository.insertRun(run);
      await repository.insertPeriodState(state);
      await repository.insertAuditEvent(event);
      return { periodId: canonical.id, runId, manifestId, sourceCount: sources.length, participantCount: snapshots.length, replayed: false };
    });
  }
}

export const weeklyRankingService = new WeeklyRankingService(mongoWeeklyRankingTransactionRunner);
