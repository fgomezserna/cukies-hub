import "server-only";
import type { EconomyCycleCalendar } from '../cycle-calendar';

import type { ClientSession, Db } from "mongodb";

import { DomainConflictError } from "../errors";
import {
  REWARD_MAX_ALLOCATIONS_PER_SOURCE,
  REWARD_RULE_SCOPE,
  type RewardAllocation,
  type RewardClaimBatch,
  type RewardClaimProof,
  type RewardIntegrityIncident,
  type RewardEmissionBudgetDay,
  type RewardEmissionBudgetEvent,
  type RewardEmissionBudgetState,
  type RewardPeriodSeal,
  type RewardPeriodState,
  type RewardPoolAccrual,
  type RewardRule,
  type RewardRuleState,
  type RewardSourceManifest,
} from "./types";
import { rewardRuleActiveAtQuery } from "./rules";

export interface RewardRepository {
  findRuleAt(at: Date, expectedVersion: string): Promise<RewardRule | null>;
  findRuleByVersion(version: string): Promise<RewardRule | null>;
  findOverlappingActiveRule(
    activeFrom: Date,
    activeUntil?: Date,
  ): Promise<RewardRule | null>;
  supersedeRule(
    version: string,
    supersededAt: Date,
    supersededByVersion: string,
    now: Date,
  ): Promise<RewardRule>;
  insertRule(rule: RewardRule): Promise<void>;
  advanceRuleScope(now: Date): Promise<RewardRuleState>;
  findEmissionBudgetEvent(sourceId: string): Promise<RewardEmissionBudgetEvent | null>;
  insertEmissionBudgetEvent(event: RewardEmissionBudgetEvent): Promise<void>;
  findEmissionBudgetState(): Promise<RewardEmissionBudgetState | null>;
  persistEmissionBudgetState(
    expectedRevision: number | null,
    state: RewardEmissionBudgetState,
  ): Promise<void>;
  findEmissionBudgetDay(dayId: string): Promise<RewardEmissionBudgetDay | null>;
  persistEmissionBudgetDay(
    expectedRevision: number | null,
    day: RewardEmissionBudgetDay,
  ): Promise<void>;
  findSourceManifest(sourceId: string): Promise<RewardSourceManifest | null>;
  findAnyAllocationBySourceId(sourceId: string): Promise<RewardAllocation | null>;
  findAnyAccrualBySourceId(sourceId: string): Promise<RewardPoolAccrual | null>;
  insertSourceManifest(manifest: RewardSourceManifest): Promise<void>;
  listSourceAllocations(periodId: string, sourceId: string): Promise<RewardAllocation[]>;
  insertAllocations(allocations: RewardAllocation[]): Promise<void>;
  listSourceAccruals(periodId: string, sourceId: string): Promise<RewardPoolAccrual[]>;
  insertAccruals(accruals: RewardPoolAccrual[]): Promise<void>;
  blockSourceAndOpenIncident(incident: RewardIntegrityIncident): Promise<void>;
  listPeriodAllocationsPage(
    periodId: string,
    afterAllocationId: string | null,
    limit: number,
  ): Promise<RewardAllocation[]>;
  listPeriodSourceManifestsPage(
    periodId: string,
    afterSourceId: string | null,
    limit: number,
  ): Promise<RewardSourceManifest[]>;
  listPeriodEmissionBudgetEventsPage(
    periodId: string,
    afterSourceId: string | null,
    limit: number,
  ): Promise<RewardEmissionBudgetEvent[]>;
  listPeriodAccrualsPage(
    periodId: string,
    afterAccrualId: string | null,
    limit: number,
  ): Promise<RewardPoolAccrual[]>;
  listSettledGameSessionsPage(
    periodStart: Date,
    periodEndExclusive: Date,
    afterSessionId: string | null,
    limit: number,
    calendar?: EconomyCycleCalendar,
  ): Promise<Array<{ sessionId: string; settledAt: Date; createdAt?: Date }>>;
  countPendingGameSettlements(
    periodStart: Date,
    periodEndExclusive: Date,
    calendar?: EconomyCycleCalendar,
  ): Promise<number>;
  countOpenPeriodIncidents(periodId: string): Promise<number>;
  findPeriodState(periodId: string): Promise<RewardPeriodState | null>;
  advanceOpenPeriod(periodId: string, now: Date): Promise<RewardPeriodState>;
  sealPeriodState(periodId: string, sealId: string, now: Date): Promise<RewardPeriodState>;
  findPeriodSeal(periodId: string): Promise<RewardPeriodSeal | null>;
  insertPeriodSeal(seal: RewardPeriodSeal): Promise<void>;
  findDraftBatch(draftKey: string): Promise<RewardClaimBatch | null>;
  listDraftProofsPage(
    batchId: RewardClaimProof["batchId"],
    afterProofId: string | null,
    limit: number,
  ): Promise<RewardClaimProof[]>;
  insertDraftProofs(proofs: RewardClaimProof[]): Promise<void>;
  insertDraftBatch(batch: RewardClaimBatch): Promise<void>;
}

export type RewardTransactionRunner = <T>(
  work: (repository: RewardRepository) => Promise<T>
) => Promise<T>;

function duplicateKey(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
  );
}

export function createMongoRewardRepository(
  db: Db,
  session: ClientSession
): RewardRepository {
  const rules = db.collection<RewardRule>("economy_rule_versions");
  const ruleStates = db.collection<RewardRuleState>("reward_rule_state");
  const emissionBudgetEvents = db.collection<RewardEmissionBudgetEvent>(
    "reward_emission_budget_events",
  );
  const emissionBudgetStates = db.collection<RewardEmissionBudgetState>(
    "reward_emission_budget_state",
  );
  const emissionBudgetDays = db.collection<RewardEmissionBudgetDay>(
    "reward_emission_budget_days",
  );
  const sourceManifests = db.collection<RewardSourceManifest>("reward_source_manifests");
  const allocations = db.collection<RewardAllocation>("reward_allocations");
  const accruals = db.collection<RewardPoolAccrual>("reward_pool_accruals");
  const batches = db.collection<RewardClaimBatch>("reward_claim_batches");
  const proofs = db.collection<RewardClaimProof>("reward_claim_proofs");
  const incidents = db.collection<RewardIntegrityIncident>("reward_integrity_incidents");
  const periodSeals = db.collection<RewardPeriodSeal>("reward_period_seals");
  const periodStates = db.collection<RewardPeriodState>("reward_period_states");
  const options = { session };

  return {
    findRuleAt: (at, expectedVersion) =>
      rules.findOne(
        {
          scope: REWARD_RULE_SCOPE,
          version: expectedVersion,
          ...rewardRuleActiveAtQuery(at),
        },
        { ...options, sort: { activeFrom: -1, _id: -1 } }
      ),
    findRuleByVersion: (version) => rules.findOne(
      { scope: REWARD_RULE_SCOPE, version },
      options,
    ),
    findOverlappingActiveRule: (activeFrom, activeUntil) => rules.findOne({
      scope: REWARD_RULE_SCOPE,
      active: true,
      ...(activeUntil ? { activeFrom: { $lt: activeUntil } } : {}),
      $and: [
        {
          $or: [
            { activeUntil: { $exists: false } },
            { activeUntil: { $type: "null" as const } },
            { activeUntil: { $gt: activeFrom } },
          ],
        },
        {
          $or: [
            { supersededAt: { $exists: false } },
            { supersededAt: { $type: "null" as const } },
            { supersededAt: { $gt: activeFrom } },
          ],
        },
      ],
    }, { ...options, sort: { activeFrom: -1, _id: -1 } }),
    async supersedeRule(version, supersededAt, supersededByVersion, now) {
      const result = await rules.updateOne({
        scope: REWARD_RULE_SCOPE,
        version,
        active: true,
        activeFrom: { $lt: supersededAt },
        $and: [
          {
            $or: [
              { supersededAt: { $exists: false } },
              { supersededAt: { $type: "null" as const } },
            ],
          },
          {
            $or: [
              { activeUntil: { $exists: false } },
              { activeUntil: { $type: "null" as const } },
              { activeUntil: { $gte: supersededAt } },
            ],
          },
        ],
      }, {
        $set: { supersededAt, supersededByVersion, updatedAt: now },
      }, options);
      if (result.matchedCount !== 1) {
        throw new DomainConflictError(`La regla ${version} perdio su fence de supersesion.`);
      }
      const updated = await rules.findOne({ scope: REWARD_RULE_SCOPE, version }, options);
      if (!updated) throw new DomainConflictError(`La regla ${version} desaparecio al supersederla.`);
      return updated;
    },
    async insertRule(rule) {
      await rules.insertOne(rule, options);
    },
    async advanceRuleScope(now) {
      const current = await ruleStates.findOne({ _id: REWARD_RULE_SCOPE }, options);
      if (!current) {
        const created: RewardRuleState = {
          _id: REWARD_RULE_SCOPE,
          scope: REWARD_RULE_SCOPE,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        };
        await ruleStates.insertOne(created, options);
        return created;
      }
      const replacement: RewardRuleState = {
        ...current,
        revision: current.revision + 1,
        updatedAt: now,
      };
      const result = await ruleStates.replaceOne(
        { _id: REWARD_RULE_SCOPE, revision: current.revision },
        replacement,
        options,
      );
      if (result.matchedCount !== 1) {
        throw new DomainConflictError("Fence obsoleto del scope de reglas rewards.");
      }
      return replacement;
    },
    findEmissionBudgetEvent: (sourceId) => emissionBudgetEvents.findOne(
      { _id: sourceId },
      options,
    ),
    async insertEmissionBudgetEvent(event) {
      await emissionBudgetEvents.insertOne(event, options);
    },
    findEmissionBudgetState: () => emissionBudgetStates.findOne(
      { _id: REWARD_RULE_SCOPE },
      options,
    ),
    async persistEmissionBudgetState(expectedRevision, state) {
      if (expectedRevision === null) {
        await emissionBudgetStates.insertOne(state, options);
        return;
      }
      const result = await emissionBudgetStates.replaceOne(
        { _id: REWARD_RULE_SCOPE, revision: expectedRevision },
        state,
        options,
      );
      if (result.matchedCount !== 1) {
        throw new DomainConflictError("Fence obsoleto del presupuesto acumulado rewards.");
      }
    },
    findEmissionBudgetDay: (dayId) => emissionBudgetDays.findOne({ _id: dayId }, options),
    async persistEmissionBudgetDay(expectedRevision, day) {
      if (expectedRevision === null) {
        await emissionBudgetDays.insertOne(day, options);
        return;
      }
      const result = await emissionBudgetDays.replaceOne(
        { _id: day._id, revision: expectedRevision },
        day,
        options,
      );
      if (result.matchedCount !== 1) {
        throw new DomainConflictError(`Fence obsoleto del presupuesto diario ${day.dayId}.`);
      }
    },
    findSourceManifest: (sourceId) => sourceManifests.findOne({ _id: sourceId }, options),
    findAnyAllocationBySourceId: (sourceId) => allocations.findOne(
      { sourceId },
      { ...options, sort: { periodId: 1, _id: 1 } },
    ),
    findAnyAccrualBySourceId: (sourceId) => accruals.findOne(
      { sourceId },
      { ...options, sort: { periodId: 1, _id: 1 } },
    ),
    async insertSourceManifest(manifest) {
      await sourceManifests.insertOne(manifest, options);
    },
    listSourceAllocations: (periodId, sourceId) =>
      allocations
        .find({ periodId, sourceId }, options)
        .sort({ _id: 1 })
        .limit(REWARD_MAX_ALLOCATIONS_PER_SOURCE + 1)
        .toArray(),
    async insertAllocations(documents) {
      if (documents.length > 0) await allocations.insertMany(documents, options);
    },
    listSourceAccruals: (periodId, sourceId) => accruals
      .find({ periodId, sourceId }, options)
      .sort({ _id: 1 })
      .limit(REWARD_MAX_ALLOCATIONS_PER_SOURCE + 1)
      .toArray(),
    async insertAccruals(documents) {
      if (documents.length > 0) await accruals.insertMany(documents, options);
    },
    async blockSourceAndOpenIncident(incident) {
      await incidents.updateOne(
        { _id: incident._id },
        { $setOnInsert: incident },
        { ...options, upsert: true }
      );
      await allocations.updateMany(
        { periodId: incident.periodId, sourceId: incident.sourceId },
        {
          $set: {
            status: "blocked",
            updatedAt: incident.detectedAt,
          },
        },
        options
      );
      await accruals.updateMany(
        { periodId: incident.periodId, sourceId: incident.sourceId },
        { $set: { status: "blocked", updatedAt: incident.detectedAt } },
        options,
      );
      await sourceManifests.updateOne(
        { _id: incident.sourceId, periodId: incident.periodId },
        {
          $set: {
            status: "blocked",
            updatedAt: incident.detectedAt,
          },
        },
        options,
      );
    },
    listPeriodAllocationsPage: (periodId, afterAllocationId, limit) =>
      allocations
        .find({
          periodId,
          ...(afterAllocationId ? { _id: { $gt: afterAllocationId } } : {}),
        }, options)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray(),
    listPeriodSourceManifestsPage: (periodId, afterSourceId, limit) =>
      sourceManifests
        .find({
          periodId,
          ...(afterSourceId ? { _id: { $gt: afterSourceId } } : {}),
        }, options)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray(),
    listPeriodEmissionBudgetEventsPage: (periodId, afterSourceId, limit) =>
      emissionBudgetEvents
        .find({
          periodId,
          ...(afterSourceId ? { _id: { $gt: afterSourceId } } : {}),
        }, options)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray(),
    listPeriodAccrualsPage: (periodId, afterAccrualId, limit) => accruals
      .find({
        periodId,
        ...(afterAccrualId ? { _id: { $gt: afterAccrualId } } : {}),
      }, options)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray(),
    listSettledGameSessionsPage: (
      periodStart,
      periodEndExclusive,
      afterSessionId,
      limit,
      calendar,
    ) => db.collection<{ sessionId: string; settledAt: Date; createdAt?: Date }>("game_economy_sessions")
      .find({
        status: "settled",
        ...(calendar ? { createdAt: { $gte: periodStart, $lt: periodEndExclusive } } : { settledAt: { $gte: periodStart, $lt: periodEndExclusive } }),
        ...(afterSessionId ? { sessionId: { $gt: afterSessionId } } : {}),
      }, { ...options, projection: { _id: 0, sessionId: 1, settledAt: 1, ...(calendar ? { createdAt: 1 } : {}) } })
      .sort({ sessionId: 1 })
      .limit(limit)
      .toArray(),
    countPendingGameSettlements: (periodStart, periodEndExclusive, calendar) =>
      db.collection("game_economy_sessions").countDocuments({
        ...(calendar ? { createdAt: { $gte: periodStart, $lt: periodEndExclusive }, status: { $nin: ['settled', 'forfeited', 'expired', 'rejected'] } } : {
        "settlementIntent.decidedAt": { $gte: periodStart, $lt: periodEndExclusive },
        settlementCommand: { $exists: false },
        }),
      }, { ...options, limit: 1 }),
    countOpenPeriodIncidents: (periodId) => incidents.countDocuments(
      { periodId, status: "open" },
      { ...options, limit: 1 },
    ),
    findPeriodState: (periodId) => periodStates.findOne({ _id: periodId }, options),
    async advanceOpenPeriod(periodId, now) {
      const current = await periodStates.findOne({ _id: periodId }, options);
      if (current?.status === "sealed") {
        throw new DomainConflictError(`El periodo ${periodId} ya esta sellado.`);
      }
      if (!current) {
        const created: RewardPeriodState = {
          _id: periodId,
          periodId,
          status: "open",
          allocationRevision: 1,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        };
        await periodStates.insertOne(created, options);
        return created;
      }
      const replacement: RewardPeriodState = {
        ...current,
        allocationRevision: current.allocationRevision + 1,
        revision: current.revision + 1,
        updatedAt: now,
      };
      const result = await periodStates.replaceOne(
        { _id: periodId, status: "open", revision: current.revision },
        replacement,
        options,
      );
      if (result.matchedCount !== 1) {
        throw new DomainConflictError(`Fence obsoleto para el periodo ${periodId}.`);
      }
      return replacement;
    },
    async sealPeriodState(periodId, sealId, now) {
      const current = await periodStates.findOne({ _id: periodId }, options);
      if (current?.status === "sealed") {
        if (current.sealId !== sealId) {
          throw new DomainConflictError(`El periodo ${periodId} ya tiene otro sello.`);
        }
        return current;
      }
      if (!current) {
        const sealed: RewardPeriodState = {
          _id: periodId,
          periodId,
          status: "sealed",
          allocationRevision: 0,
          revision: 0,
          sealId,
          createdAt: now,
          updatedAt: now,
        };
        await periodStates.insertOne(sealed, options);
        return sealed;
      }
      const sealed: RewardPeriodState = {
        ...current,
        status: "sealed",
        sealId,
        revision: current.revision + 1,
        updatedAt: now,
      };
      const result = await periodStates.replaceOne(
        { _id: periodId, status: "open", revision: current.revision },
        sealed,
        options,
      );
      if (result.matchedCount !== 1) {
        throw new DomainConflictError(`Fence obsoleto al sellar ${periodId}.`);
      }
      return sealed;
    },
    findPeriodSeal: (periodId) => periodSeals.findOne({ periodId }, options),
    async insertPeriodSeal(seal) {
      await periodSeals.insertOne(seal, options);
    },
    findDraftBatch: (draftKey) => batches.findOne({ draftKey }, options),
    listDraftProofsPage: (batchId, afterProofId, limit) => proofs.find({
      batchId,
      ...(afterProofId ? { _id: { $gt: afterProofId } } : {}),
    }, options).sort({ _id: 1 }).limit(limit).toArray(),
    async insertDraftProofs(documents) {
      if (documents.length > 0) await proofs.insertMany(documents, options);
    },
    async insertDraftBatch(batch) {
      await batches.insertOne(batch, options);
    },
  };
}

export const mongoRewardTransactionRunner: RewardTransactionRunner = async (work) => {
  const { withEconomyTransaction } = await import("@/lib/indexer-db/mongodb");
  return withEconomyTransaction(async (db, session) =>
    work(createMongoRewardRepository(db, session))
  );
};

export function mapRewardPersistenceError(error: unknown) {
  if (duplicateKey(error)) {
    return new DomainConflictError(
      "Conflicto de unicidad en allocations o draft batch de rewards.",
      { persistenceFailure: "DUPLICATE_KEY", mongoCode: 11000 }
    );
  }
  return error;
}
