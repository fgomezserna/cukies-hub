import "server-only";
import type { EconomyCycleCalendar } from '../cycle-calendar';

import type { ClientSession, Db } from "mongodb";

import { withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import type { CreditReservation } from "../credits/types";
import type { GameEconomySession } from "../game-economy/types";
import { TREASURE_HUNT_ECONOMY_POLICY } from "../game-economy/treasure-hunt-policy";
import {
  WEEKLY_RANKING_RULE_SCOPE,
  type WeeklyRankingAuditEvent,
  type WeeklyRankingManifest,
  type WeeklyRankingPeriodState,
  type WeeklyRankingRule,
  type WeeklyRankingRuleState,
  type WeeklyRankingRun,
  type WeeklyRankingSnapshot,
  type WeeklyRankingSource,
} from "./types";

export type RankingParticipantKey = { gameId: string; walletNormalized: string };

export interface WeeklyRankingRepository {
  countPendingCycleSessions?(start: Date, endExclusive: Date): Promise<number>;
  findRuleByVersion(version: string): Promise<WeeklyRankingRule | null>;
  findFirstRuleBefore(endExclusive: Date): Promise<WeeklyRankingRule | null>;
  findRuleCovering(start: Date, endExclusive: Date): Promise<WeeklyRankingRule | null>;
  findOverlappingRule(activeFrom: Date, activeUntil?: Date): Promise<WeeklyRankingRule | null>;
  findRuleState(): Promise<WeeklyRankingRuleState | null>;
  insertRuleState(state: WeeklyRankingRuleState): Promise<void>;
  replaceRuleState(expectedRevision: number, state: WeeklyRankingRuleState): Promise<boolean>;
  insertRule(rule: WeeklyRankingRule): Promise<void>;
  listSettledSessionsPage(input: {
    calendar?: EconomyCycleCalendar;
    start: Date;
    endExclusive: Date;
    afterId: string | null;
    limit: number;
  }): Promise<GameEconomySession[]>;
  listReservations(reservationIds: string[]): Promise<CreditReservation[]>;
  findPreviousRankings(
    participants: RankingParticipantKey[],
    before: Date,
  ): Promise<WeeklyRankingSnapshot[]>;
  findManifest(periodId: string): Promise<WeeklyRankingManifest | null>;
  findRun(periodId: string): Promise<WeeklyRankingRun | null>;
  findPeriodState(periodId: string): Promise<WeeklyRankingPeriodState | null>;
  findAuditEvent(periodId: string): Promise<WeeklyRankingAuditEvent | null>;
  listStoredSourcesPage(periodId: string, afterId: string | null, limit: number): Promise<WeeklyRankingSource[]>;
  listStoredSnapshotsPage(periodId: string, afterId: string | null, limit: number): Promise<WeeklyRankingSnapshot[]>;
  insertSources(sources: WeeklyRankingSource[]): Promise<void>;
  insertSnapshots(snapshots: WeeklyRankingSnapshot[]): Promise<void>;
  insertManifest(manifest: WeeklyRankingManifest): Promise<void>;
  insertRun(run: WeeklyRankingRun): Promise<void>;
  insertPeriodState(state: WeeklyRankingPeriodState): Promise<void>;
  insertAuditEvent(event: WeeklyRankingAuditEvent): Promise<void>;
}

export type WeeklyRankingTransactionRunner = <T>(
  work: (repository: WeeklyRankingRepository) => Promise<T>,
) => Promise<T>;

export function createMongoWeeklyRankingRepository(db: Db, session: ClientSession): WeeklyRankingRepository {
  const options = { session };
  const rules = db.collection<WeeklyRankingRule>("economy_rule_versions");
  const ruleStates = db.collection<WeeklyRankingRuleState>("weekly_ranking_rule_state");
  const sessions = db.collection<GameEconomySession>("game_economy_sessions");
  const reservations = db.collection<CreditReservation>("competition_credit_reservations");
  const rankings = db.collection<WeeklyRankingSnapshot>("game_weekly_rankings");
  const sources = db.collection<WeeklyRankingSource>("weekly_ranking_sources");
  const manifests = db.collection<WeeklyRankingManifest>("weekly_ranking_manifests");
  const runs = db.collection<WeeklyRankingRun>("weekly_ranking_runs");
  const states = db.collection<WeeklyRankingPeriodState>("weekly_ranking_period_states");
  const events = db.collection<WeeklyRankingAuditEvent>("weekly_ranking_audit_events");

  return {
    findRuleByVersion: (version) => rules.findOne({ scope: WEEKLY_RANKING_RULE_SCOPE, version }, options),
    findFirstRuleBefore: (endExclusive) => rules.findOne({
      scope: WEEKLY_RANKING_RULE_SCOPE,
      active: true,
      activeFrom: { $lt: endExclusive },
    }, { ...options, sort: { activeFrom: 1, _id: 1 } }),
    findRuleCovering: (start, endExclusive) => rules.findOne({
      scope: WEEKLY_RANKING_RULE_SCOPE,
      active: true,
      activeFrom: { $lte: start },
      $or: [
        { activeUntil: { $exists: false } },
        { activeUntil: { $gte: endExclusive } },
      ],
    }, { ...options, sort: { activeFrom: -1, _id: -1 } }),
    findOverlappingRule: (activeFrom, activeUntil) => rules.findOne({
      scope: WEEKLY_RANKING_RULE_SCOPE,
      active: true,
      ...(activeUntil ? { activeFrom: { $lt: activeUntil } } : {}),
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: activeFrom } }],
    }, options),
    findRuleState: () => ruleStates.findOne({ _id: WEEKLY_RANKING_RULE_SCOPE }, options),
    async insertRuleState(state) { await ruleStates.insertOne(state, options); },
    async replaceRuleState(expectedRevision, state) {
      const result = await ruleStates.replaceOne(
        { _id: WEEKLY_RANKING_RULE_SCOPE, revision: expectedRevision },
        state,
        options,
      );
      return result.matchedCount === 1;
    },
    async insertRule(rule) { await rules.insertOne(rule, options); },
    countPendingCycleSessions: (start, endExclusive) => sessions.countDocuments({ createdAt: { $gte: start, $lt: endExclusive }, status: { $nin: ['settled', 'forfeited', 'expired', 'rejected'] } }),
    listSettledSessionsPage: ({ start, endExclusive, afterId, limit, calendar }) => sessions.find({
      status: "settled",
      ...(calendar ? { createdAt: { $gte: start, $lt: endExclusive }, "rule.calendar.version": calendar.version, "rule.calendar.cycleSeconds": calendar.cycleSeconds } : {
      $or: [
        {
          gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
          "rule.version": TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
          createdAt: {
            $gte: new Date(start.getTime() + 14 * 60 * 60_000),
            $lt: new Date(endExclusive.getTime() + 14 * 60 * 60_000),
          },
        },
        {
          $nor: [{
            gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
            "rule.version": TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
          }],
          settledAt: { $gte: start, $lt: endExclusive },
        },
      ],
      }),
      ...(afterId ? { _id: { $gt: afterId } } : {}),
    }, options).sort({ _id: 1 }).limit(limit).toArray(),
    listReservations: (reservationIds) => reservationIds.length === 0
      ? Promise.resolve([])
      : reservations.find({ reservationId: { $in: reservationIds } }, options).toArray(),
    async findPreviousRankings(participants, before) {
      if (participants.length === 0) return [];
      return rankings.aggregate<WeeklyRankingSnapshot>([
        {
          $match: {
            status: "sealed",
            periodStart: { $lt: before },
            $or: participants,
          },
        },
        { $sort: { gameId: 1, walletNormalized: 1, periodStart: -1, _id: -1 } },
        {
          $group: {
            _id: { gameId: "$gameId", walletNormalized: "$walletNormalized" },
            ranking: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$ranking" } },
      ], options).toArray();
    },
    findManifest: (periodId) => manifests.findOne({ periodId }, options),
    findRun: (periodId) => runs.findOne({ periodId }, options),
    findPeriodState: (periodId) => states.findOne({ periodId }, options),
    findAuditEvent: (periodId) => events.findOne({ periodId, type: "period_sealed" }, options),
    listStoredSourcesPage: (periodId, afterId, limit) => sources.find({
      periodId,
      ...(afterId ? { _id: { $gt: afterId } } : {}),
    }, options).sort({ _id: 1 }).limit(limit).toArray(),
    listStoredSnapshotsPage: (periodId, afterId, limit) => rankings.find({
      periodId,
      ...(afterId ? { _id: { $gt: afterId } } : {}),
    }, options).sort({ _id: 1 }).limit(limit).toArray(),
    async insertSources(documents) { if (documents.length) await sources.insertMany(documents, options); },
    async insertSnapshots(documents) { if (documents.length) await rankings.insertMany(documents, options); },
    async insertManifest(document) { await manifests.insertOne(document, options); },
    async insertRun(document) { await runs.insertOne(document, options); },
    async insertPeriodState(document) { await states.insertOne(document, options); },
    async insertAuditEvent(document) { await events.insertOne(document, options); },
  };
}

export const mongoWeeklyRankingTransactionRunner: WeeklyRankingTransactionRunner = (work) =>
  withEconomyTransaction((db, session) => work(createMongoWeeklyRankingRepository(db, session)));
