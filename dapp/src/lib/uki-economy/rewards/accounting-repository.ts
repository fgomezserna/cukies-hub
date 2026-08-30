import "server-only";

import type { ClientSession, Db } from "mongodb";

import { DomainConflictError } from "../errors";
import { getTreasureHuntWeeklyPeriod } from "../game-economy/treasure-hunt-policy";
import { formatRawAmount, parseRawAmount } from "../money";
import { getIsoWeekPeriodId } from "../periods";
import {
  loadCukiePoolVaultRewardParticipants,
  requireCukiePoolVaultConfig,
} from "../cukie-pool/vault-source";
import type {
  CukieRewardAccountingParticipant,
  DailyRewardAccounting,
  DailyRewardSourceLine,
  PriorWeeklyPoolTranche,
  RewardAccountingAllocationDocument,
  RewardAccountingParticipant,
  RewardDailyCapacityMaterialization,
  PoolTrancheAccounting,
  WeeklyPrizeAccounting,
  WeeklyGameResult,
  WeeklyGameSource,
} from "./accounting-types";
import {
  assertEligibleWeeklyGameResult,
  assertWeeklyPrizeAccountingIntegrity,
  selectStoredWeeklyPoolTranche,
} from "./accounting";
import { assertRewardEmissionBudgetState } from "./emission-budget";
import {
  assertRewardRule,
  rewardRuleActiveAtQuery,
  stableRewardHash,
  validRewardDate,
} from "./rules";
import type { RewardRule } from "./types";
import { resolveMongoAmbassadorAttributionsForWallets } from "../ambassadors/repository";
import type { RewardEmissionBudgetDay, RewardEmissionBudgetState } from "./types";

type SettledGameEvidence = {
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  status: "settled";
  settledAt: Date;
  validation: { scoreRaw: string; resultHash: string };
  credit: { state: "consumed"; reservationId: string; evidenceHash: string };
  cukie: { state: "consumed"; reservationId: string; evidenceHash: string };
};

const CANONICAL_REWARD_DAY_ID = /^\d{4}-\d{2}-\d{2}$/;

function rewardDayStart(dayId: string) {
  const value = new Date(`${dayId}T00:00:00.000Z`);
  if (
    !CANONICAL_REWARD_DAY_ID.test(dayId)
    || Number.isNaN(value.getTime())
    || value.toISOString().slice(0, 10) !== dayId
  ) {
    throw new DomainConflictError(`El cierre reward contiene un dayId no canonico: ${dayId}.`);
  }
  return value;
}

export interface RewardAccountingRepository {
  findRewardRuleByVersion(ruleVersion: string): Promise<RewardRule | null>;
  findRewardRule(ruleVersion: string, at: Date): Promise<RewardRule | null>;
  materializeDailyCapacity(input: {
    dayId: string;
    startsAt: Date;
    rule: RewardRule;
    now: Date;
  }): Promise<RewardDailyCapacityMaterialization>;
  findDaily(dayId: string): Promise<DailyRewardAccounting | null>;
  insertDaily(accounting: DailyRewardAccounting): Promise<void>;
  findWeekly(periodId: string): Promise<WeeklyPrizeAccounting | null>;
  insertWeekly(accounting: WeeklyPrizeAccounting): Promise<void>;
  findPoolTranche(id: string): Promise<PoolTrancheAccounting | null>;
  insertPoolTranche(accounting: PoolTrancheAccounting): Promise<void>;
  findSettledGameEvidence(sessionId: string): Promise<SettledGameEvidence | null>;
  findWeeklyGameSource(sessionId: string): Promise<WeeklyGameSource | null>;
  insertWeeklyGameSource(source: WeeklyGameSource): Promise<void>;
  listEligibleWeeklyGameSources(startsAt: Date, endsAt: Date): Promise<WeeklyGameSource[]>;
  listDailyRewardSourceLines(dayId: string): Promise<DailyRewardSourceLine[]>;
  findNextClosableRewardDay(
    ruleVersion: string,
    now: Date,
  ): Promise<{ dayId: string; startsAt: Date } | null>;
  listDailyAccounting(startsOn: string, endsBefore: string): Promise<DailyRewardAccounting[]>;
  findFirstSafeLotteryEntropy(
    cutoff: Date,
  ): Promise<WeeklyPrizeAccounting["lotteryEntropy"] | null>;
  dailyReadiness(startsAt: Date, endsAt: Date): Promise<{
    unfinishedRuns: number;
    missingRewardSources: number;
    missingWeeklySources: number;
  }>;
  listCreditContributors(startsAt: Date): Promise<RewardAccountingParticipant[]>;
  listDailyAmbassadorSnapshots(
    startsAt: Date,
    endsAt: Date,
  ): Promise<Record<string, string | null>>;
  listCukieParticipants(
    generation: "original" | "second_generation",
    startsAt: Date,
    endsAt: Date,
  ): Promise<CukieRewardAccountingParticipant[]>;
  findPriorWeeklyPoolTranche(scheduledAt: Date): Promise<PriorWeeklyPoolTranche | null>;
}

export type RewardAccountingTransactionRunner = <T>(
  work: (repository: RewardAccountingRepository) => Promise<T>,
) => Promise<T>;

export function createMongoRewardAccountingRepository(
  db: Db,
  session: ClientSession,
): RewardAccountingRepository {
  const daily = db.collection<DailyRewardAccounting>("reward_daily_accounting");
  const weekly = db.collection<WeeklyPrizeAccounting>("reward_weekly_prize_accounting");
  const capacityMaterializations = db.collection<RewardDailyCapacityMaterialization>(
    "reward_daily_capacity_materializations",
  );
  const accountingAllocations = db.collection<RewardAccountingAllocationDocument>(
    "reward_accounting_allocations",
  );
  const budgetDays = db.collection<RewardEmissionBudgetDay>("reward_emission_budget_days");
  const budgetStates = db.collection<RewardEmissionBudgetState>("reward_emission_budget_state");
  const tranches = db.collection<PoolTrancheAccounting>("reward_pool_tranche_accounting");
  const sources = db.collection<WeeklyGameSource>("reward_weekly_game_sources");
  const games = db.collection<SettledGameEvidence>("game_economy_sessions");
  const rules = db.collection<{
    scope: string;
    version: string;
    activeFrom: Date;
    emissionBudget: {
      programStartsAt: Date;
      dayBoundarySecondUtc: number;
      lateReservationGraceSeconds: number;
    };
  }>("economy_rule_versions");
  const rewardRules = db.collection<RewardRule>("economy_rule_versions");
  const canonicalBlocks = db.collection<{
    chainId: number;
    blockNumber: number;
    blockHash: string;
    blockTimestamp: Date;
    observedAt: Date;
  }>("chain_bsc_canonical_blocks");
  const emissionEvents = db.collection<{ sourceId: string; sourceTotalRaw: string; dayId: string; status: string }>(
    "reward_emission_budget_events",
  );
  const allocations = db.collection<{
    allocationId: string;
    sourceId: string;
    walletNormalized: string;
    category: string;
    amountRaw: string;
  }>("reward_allocations");
  const accruals = db.collection<{
    accrualId: string;
    sourceId: string;
    category: string;
    amountRaw: string;
  }>("reward_pool_accruals");
  const options = { session };
  const referralsFor = async (wallets: string[], effectiveAt: Date) => {
    if (wallets.length === 0) return new Map<string, string | null>();
    const rows = await resolveMongoAmbassadorAttributionsForWallets(
      db,
      wallets,
      effectiveAt,
      session,
    );
    return new Map([...rows].map(([wallet, attribution]) => [
      wallet,
      attribution?.ambassadorWalletNormalized ?? null,
    ]));
  };
  return {
    findRewardRuleByVersion: (ruleVersion) => rewardRules.findOne({
      scope: "reward_allocations",
      version: ruleVersion,
    }, options),
    findRewardRule: (ruleVersion, at) => rewardRules.findOne({
      scope: "reward_allocations",
      version: ruleVersion,
      ...rewardRuleActiveAtQuery(at),
    }, options),
    async materializeDailyCapacity(input) {
      const current = await capacityMaterializations.findOne({ dayId: input.dayId }, options);
      if (current) return current;
      assertRewardRule(input.rule, input.startsAt);
      const expectedStartsAt = new Date(
        rewardDayStart(input.dayId).getTime()
          + input.rule.emissionBudget.dayBoundarySecondUtc * 1_000,
      );
      if (
        input.rule.emissionBudget.unusedDailyCapacity !== "materialize_undistributed"
        || input.startsAt.getTime() !== expectedStartsAt.getTime()
      ) {
        throw new DomainConflictError("La regla no permite materializar la capacidad diaria solicitada.");
      }
      const budgetDayId = input.startsAt.toISOString();
      const day = await budgetDays.findOne({ _id: budgetDayId }, options);
      const state = await budgetStates.findOne({ _id: "reward_allocations" }, options);
      if (state) assertRewardEmissionBudgetState(state, input.rule);
      const previousDaily = day ? parseRawAmount(day.reservedRaw) : BigInt(0);
      const cap = parseRawAmount(input.rule.emissionBudget.dailyCapRaw);
      const capRaw = formatRawAmount(cap);
      if (previousDaily > cap) throw new DomainConflictError("El budget diario ya excede su cap.");
      const capacity = cap - previousDaily;
      const previousLifetime = state ? parseRawAmount(state.reservedLifetimeRaw) : BigInt(0);
      const resultingLifetime = previousLifetime + capacity;
      if (resultingLifetime > parseRawAmount(input.rule.emissionBudget.lifetimeCapRaw)) {
        throw new DomainConflictError("La capacidad diaria excede el lifetime cap de rewards.");
      }
      const resultingDay: RewardEmissionBudgetDay = day
        ? {
            ...day,
            reservedRaw: capRaw,
            revision: day.revision + 1,
            updatedAt: input.now,
          }
        : {
            _id: budgetDayId,
            dayId: budgetDayId,
            startsAt: input.startsAt,
            endsAt: new Date(input.startsAt.getTime() + 24 * 60 * 60_000),
            reservationClosesAt: new Date(
              input.startsAt.getTime()
                + (24 * 60 * 60 + input.rule.emissionBudget.lateReservationGraceSeconds) * 1_000,
            ),
            reservedRaw: capRaw,
            revision: 0,
            createdAt: input.now,
            updatedAt: input.now,
          };
      const resultingState: RewardEmissionBudgetState = state
        ? {
            ...state,
            reservedLifetimeRaw: formatRawAmount(resultingLifetime),
            revision: state.revision + 1,
            updatedAt: input.now,
          }
        : {
            _id: "reward_allocations",
            scope: "reward_allocations",
            programStartsAt: input.rule.emissionBudget.programStartsAt,
            dayBoundarySecondUtc: input.rule.emissionBudget.dayBoundarySecondUtc,
            lateReservationGraceSeconds: input.rule.emissionBudget.lateReservationGraceSeconds,
            unusedDailyCapacity: input.rule.emissionBudget.unusedDailyCapacity,
            overflowPolicy: input.rule.emissionBudget.overflowPolicy,
            lifetimeCapRaw: input.rule.emissionBudget.lifetimeCapRaw,
            reservedLifetimeRaw: formatRawAmount(resultingLifetime),
            revision: 0,
            createdAt: input.now,
            updatedAt: input.now,
          };
      const payload = {
        dayId: input.dayId,
        budgetDayId,
        ruleVersion: input.rule.version,
        ruleConfigHash: input.rule.configHash,
        previousDailyRaw: formatRawAmount(previousDaily),
        capacityMaterializedRaw: formatRawAmount(capacity),
        resultingDailyRaw: capRaw,
        previousLifetimeRaw: formatRawAmount(previousLifetime),
        resultingLifetimeRaw: formatRawAmount(resultingLifetime),
      };
      const document: RewardDailyCapacityMaterialization = {
        _id: `reward-daily-capacity:${input.dayId}`,
        ...payload,
        payloadHash: stableRewardHash({ kind: "reward-daily-capacity", ...payload }),
        status: "sealed",
        sealedAt: input.now,
      };
      if (day) {
        const replaced = await budgetDays.replaceOne(
          { _id: day._id, revision: day.revision },
          resultingDay,
          options,
        );
        if (replaced.matchedCount !== 1) throw new DomainConflictError("Fence diario obsoleto.");
      } else await budgetDays.insertOne(resultingDay, options);
      if (state) {
        const replaced = await budgetStates.replaceOne(
          { _id: state._id, revision: state.revision },
          resultingState,
          options,
        );
        if (replaced.matchedCount !== 1) throw new DomainConflictError("Fence lifetime obsoleto.");
      } else await budgetStates.insertOne(resultingState, options);
      await capacityMaterializations.insertOne(document, options);
      return document;
    },
    findDaily: (dayId) => daily.findOne({ dayId }, options),
    async insertDaily(accounting) {
      await daily.insertOne(accounting, options);
      const documents = accounting.allocations.map((allocation) => {
        const immutable = {
          accountingId: accounting._id,
          accountingKind: "daily" as const,
          periodId: accounting.dayId,
          allocationId: allocation.allocationId,
          walletNormalized: allocation.walletNormalized,
          category: allocation.category,
          amountRaw: allocation.amountRaw,
          fundingMode: allocation.fundingMode,
          sourceIds: allocation.sourceIds,
          availableAt: accounting.sealedAt,
          status: "allocated_offchain" as const,
          createdAt: accounting.sealedAt,
        };
        return {
          _id: allocation.allocationId,
          ...immutable,
          payloadHash: stableRewardHash({ kind: "reward-accounting-allocation-document", ...immutable }),
        };
      });
      if (documents.length > 0) await accountingAllocations.insertMany(documents, options);
    },
    findWeekly: (periodId) => weekly.findOne({ periodId }, options),
    async insertWeekly(accounting) {
      await weekly.insertOne(accounting, options);
      const documents = accounting.allocations.map((allocation) => {
        const immutable = {
          accountingId: accounting._id,
          accountingKind: "weekly" as const,
          periodId: accounting.periodId,
          allocationId: allocation.allocationId,
          walletNormalized: allocation.walletNormalized,
          category: allocation.category,
          amountRaw: allocation.amountRaw,
          fundingMode: allocation.fundingMode,
          sourceIds: allocation.sourceIds,
          availableAt: accounting.payoutAt,
          status: "allocated_offchain" as const,
          createdAt: accounting.sealedAt,
        };
        return {
          _id: allocation.allocationId,
          ...immutable,
          payloadHash: stableRewardHash({ kind: "reward-accounting-allocation-document", ...immutable }),
        };
      });
      if (documents.length > 0) await accountingAllocations.insertMany(documents, options);
    },
    findPoolTranche: (id) => tranches.findOne({ _id: id }, options),
    async insertPoolTranche(accounting) { await tranches.insertOne(accounting, options); },
    findSettledGameEvidence: (sessionId) => games.findOne({
      sessionId,
      status: "settled",
      settledAt: { $type: "date" },
      validation: { $exists: true },
      "credit.state": "consumed",
      "cukie.state": "consumed",
    }, options),
    findWeeklyGameSource: (sessionId) => sources.findOne({ sessionId }, options),
    async insertWeeklyGameSource(source) { await sources.insertOne(source, options); },
    listEligibleWeeklyGameSources: (startsAt, endsAt) => sources.find({
      status: "settled",
      outcome: "completed",
      resultValid: true,
      periodAnchorAt: { $gte: startsAt, $lt: endsAt },
    }, options).sort({ periodAnchorAt: 1, playedAt: 1, sessionId: 1 }).toArray(),
    async listDailyRewardSourceLines(dayId) {
      const events = await emissionEvents.find({
        dayId: { $regex: `^${dayId}T` },
        status: "reserved",
      }, options)
        .sort({ sourceId: 1 }).toArray();
      return Promise.all(events.map(async (event) => ({
        sourceId: event.sourceId,
        sourceTotalRaw: event.sourceTotalRaw,
        allocations: await allocations.find({ sourceId: event.sourceId }, options)
          .project<{
            allocationId: string;
            walletNormalized: string;
            category: string;
            amountRaw: string;
          }>({ _id: 0, allocationId: 1, walletNormalized: 1, category: 1, amountRaw: 1 })
          .toArray(),
        accruals: await accruals.find({ sourceId: event.sourceId }, options)
          .project<{ accrualId: string; category: string; amountRaw: string }>(
            { _id: 0, accrualId: 1, category: 1, amountRaw: 1 },
          )
          .toArray(),
      })));
    },
    async findNextClosableRewardDay(ruleVersion, now) {
      const rule = await rules.findOne({ scope: "reward_allocations", version: ruleVersion }, options);
      if (!rule) throw new DomainConflictError(`No existe la regla reward ${ruleVersion}.`);
      const latest = await daily.findOne({
        ruleVersion,
        status: "sealed",
        dayId: { $regex: CANONICAL_REWARD_DAY_ID },
      }, { ...options, sort: { dayId: -1 } });
      const next = latest
        ? rewardDayStart(latest.dayId)
        : new Date(`${rule.activeFrom.toISOString().slice(0, 10)}T00:00:00.000Z`);
      if (latest) next.setUTCDate(next.getUTCDate() + 1);
      const startsAt = new Date(next.getTime() + rule.emissionBudget.dayBoundarySecondUtc * 1_000);
      const closesAt = new Date(startsAt.getTime() + 26 * 60 * 60_000);
      return now.getTime() >= closesAt.getTime()
        ? { dayId: next.toISOString().slice(0, 10), startsAt }
        : null;
    },
    listDailyAccounting: (startsOn, endsBefore) => daily.find({
      dayId: { $gte: startsOn, $lt: endsBefore },
      status: "sealed",
    }, options).sort({ dayId: 1 }).toArray(),
    async findFirstSafeLotteryEntropy(cutoff) {
      const block = await canonicalBlocks.findOne({
        chainId: 97,
        blockTimestamp: { $gte: cutoff },
      }, { ...options, sort: { blockTimestamp: 1, blockNumber: 1 } });
      if (!block) return null;
      const previous = await canonicalBlocks.findOne({
        chainId: 97,
        blockNumber: block.blockNumber - 1,
        blockTimestamp: { $lt: cutoff },
      }, options);
      if (!previous) return null;
      return {
        chainId: 97,
        selectionPolicy: "first_safe_block_at_or_after_cutoff",
        blockNumber: block.blockNumber,
        blockHash: block.blockHash,
        blockTimestamp: block.blockTimestamp,
        previousBlockNumber: previous.blockNumber,
        previousBlockHash: previous.blockHash,
        previousBlockTimestamp: previous.blockTimestamp,
        canonical: true,
        confirmedAt: block.observedAt,
      };
    },
    async dailyReadiness(startsAt, endsAt) {
      const unfinishedRuns = await db.collection("treasure_hunt_economy_runs").countDocuments({
        reservedAt: { $gte: startsAt, $lt: endsAt },
        status: { $in: ["active", "finishing"] },
      }, { ...options, limit: 1 });
      const pipeline = (target: "reward_source_manifests" | "reward_weekly_game_sources") => [
        {
          $match: {
            status: "settled",
            gameId: "treasure-hunt",
            "rule.version": "staging-test-v4",
            createdAt: { $gte: startsAt, $lt: endsAt },
          },
        },
        {
          $lookup: {
            from: target,
            let: { sessionId: "$sessionId" },
            pipeline: target === "reward_source_manifests"
              ? [{ $match: { $expr: { $eq: ["$_id", { $concat: ["game-session:", "$$sessionId"] }] } } }]
              : [{ $match: { $expr: { $eq: ["$sessionId", "$$sessionId"] } } }],
            as: "bound",
          },
        },
        { $match: { bound: { $size: 0 } } },
        { $limit: 1 },
        { $count: "count" },
      ];
      const missingReward = await db.collection("game_economy_sessions")
        .aggregate<{ count: number }>(pipeline("reward_source_manifests"), options).toArray();
      const missingWeekly = await db.collection("game_economy_sessions")
        .aggregate<{ count: number }>(pipeline("reward_weekly_game_sources"), options).toArray();
      return {
        unfinishedRuns,
        missingRewardSources: missingReward[0]?.count ?? 0,
        missingWeeklySources: missingWeekly[0]?.count ?? 0,
      };
    },
    async listCreditContributors(startsAt) {
      const suffix = startsAt.toISOString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rows = await db.collection<{
        walletNormalized: string;
        credits: number;
        status: string;
        periodId: string;
      }>("credit_pool_positions").aggregate<{
        _id: string;
        units: number;
      }>([
        { $match: { status: "open", periodId: { $regex: `${suffix}$` } } },
        { $group: { _id: "$walletNormalized", units: { $sum: "$credits" } } },
        { $sort: { _id: 1 } },
      ], options).toArray();
      const referrals = await referralsFor(rows.map((row) => row._id), startsAt);
      return rows.map((row) => ({
        walletNormalized: row._id,
        units: row.units,
        ambassadorWalletNormalized: referrals.get(row._id) ?? null,
      }));
    },
    async listDailyAmbassadorSnapshots(startsAt, endsAt) {
      const rows = await sources.find({
        status: "settled",
        outcome: "completed",
        resultValid: true,
        periodAnchorAt: { $gte: startsAt, $lt: endsAt },
      }, options).project<{
        wallet: string;
        ambassadorSnapshot: { walletNormalized: string | null };
      }>({ _id: 0, wallet: 1, ambassadorSnapshot: 1 }).toArray();
      const snapshots: Record<string, string | null> = {};
      for (const row of rows) {
        const value = row.ambassadorSnapshot.walletNormalized;
        if (row.wallet in snapshots && snapshots[row.wallet] !== value) {
          throw new DomainConflictError(`Snapshot ambassador contradictorio para ${row.wallet}.`);
        }
        snapshots[row.wallet] = value;
      }
      return snapshots;
    },
    async listCukieParticipants(generation, startsAt, endsAt) {
      const positions = await loadCukiePoolVaultRewardParticipants(
        db,
        requireCukiePoolVaultConfig(),
        startsAt,
        endsAt,
      );
      const rarityLevel = new Map([
        ["common", 0], ["uncommon", 1], ["rare", 2], ["epic", 3],
        ["legendary", 4], ["goat", 5],
      ]);
      const grouped = new Map<string, { wallet: string; rarity: string; units: number }>();
      for (const position of positions) {
        if (position.generation !== generation) continue;
        const key = `${position.ownerNormalized}:${position.rarity}`;
        const current = grouped.get(key);
        grouped.set(key, {
          wallet: position.ownerNormalized,
          rarity: position.rarity,
          units: (current?.units ?? 0) + 1,
        });
      }
      const rows = [...grouped.values()].sort((left, right) => (
        left.wallet.localeCompare(right.wallet) || left.rarity.localeCompare(right.rarity)
      ));
      const referrals = await referralsFor(
        [...new Set(rows.map((row) => row.wallet))],
        startsAt,
      );
      return rows.map((row) => {
        const rarity = rarityLevel.get(row.rarity);
        if (rarity === undefined) {
          throw new DomainConflictError(`Rareza no elegible en Cukie Pool: ${row.rarity}.`);
        }
        return {
          walletNormalized: row.wallet,
          units: row.units,
          rarityLevel: rarity,
          ambassadorWalletNormalized: referrals.get(row.wallet) ?? null,
        };
      });
    },
    async findPriorWeeklyPoolTranche(scheduledAt) {
      const accounting = await weekly.findOne({
        status: "sealed",
        poolTrancheSchedule: scheduledAt,
      }, options);
      if (!accounting) return null;
      return selectStoredWeeklyPoolTranche(accounting, scheduledAt);
    },
  };
}

export const mongoRewardAccountingTransactionRunner: RewardAccountingTransactionRunner =
  async (work) => {
    const { withEconomyTransaction } = await import("@/lib/indexer-db/mongodb");
    return withEconomyTransaction((db, session) =>
      work(createMongoRewardAccountingRepository(db, session)));
  };

function assertReplay<T extends { payloadHash: string }>(
  current: T,
  requested: T,
  label: string,
) {
  if (current.payloadHash !== requested.payloadHash) {
    throw new DomainConflictError(`${label} ya existe con un payload distinto.`);
  }
  return current;
}

export class RewardAccountingService {
  constructor(private readonly runTransaction: RewardAccountingTransactionRunner) {}

  nextWeeklyPeriod(input: { ruleVersion: string; now: Date }) {
    return this.runTransaction(async (repository) => {
      const now = validRewardDate(input.now, "now");
      const rule = await repository.findRewardRuleByVersion(input.ruleVersion);
      if (!rule) throw new DomainConflictError(`No existe la regla reward ${input.ruleVersion}.`);
      assertRewardRule(rule);
      const firstContainingPeriod = getTreasureHuntWeeklyPeriod(rule.activeFrom);
      let startsAt = firstContainingPeriod.startsAt.getTime() < rule.activeFrom.getTime()
        ? new Date(firstContainingPeriod.startsAt.getTime() + 7 * 24 * 60 * 60_000)
        : firstContainingPeriod.startsAt;
      const effectiveUntil = [rule.activeUntil, rule.supersededAt]
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => left.getTime() - right.getTime())[0];
      while (true) {
        const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60_000);
        const payoutAt = new Date(endsAt.getTime() + 3 * 60 * 60_000);
        if (
          payoutAt.getTime() > now.getTime()
          || (effectiveUntil && endsAt.getTime() > effectiveUntil.getTime())
        ) return null;
        const periodId = getIsoWeekPeriodId(startsAt);
        const current = await repository.findWeekly(periodId);
        if (!current) return { periodId, startsAt, payoutAt };
        assertWeeklyPrizeAccountingIntegrity(current);
        startsAt = endsAt;
      }
    });
  }

  sealDaily(accounting: DailyRewardAccounting) {
    return this.runTransaction(async (repository) => {
      const current = await repository.findDaily(accounting.dayId);
      if (current) return assertReplay(current, accounting, `El cierre diario ${accounting.dayId}`);
      await repository.insertDaily(accounting);
      return accounting;
    });
  }

  closeDailyFromReservedSources(input: {
    dayId: string;
    ruleVersion: string;
    sealedAt: Date;
  }) {
    return this.runTransaction(async (repository) => {
      const current = await repository.findDaily(input.dayId);
      if (current) return current;
      const startsAt = new Date(`${input.dayId}T14:00:00.000Z`);
      const rule = await repository.findRewardRule(input.ruleVersion, startsAt);
      if (!rule) throw new DomainConflictError(`No existe regla ${input.ruleVersion} para ${input.dayId}.`);
      const {
        assertCurrentUndistributedRule,
        dailyBucketsFromSources,
        sealDailyRewardAccounting,
      } = await import("./accounting");
      const policy = assertCurrentUndistributedRule(rule);
      const sources = dailyBucketsFromSources(
        await repository.listDailyRewardSourceLines(input.dayId),
      );
      const accounting = sealDailyRewardAccounting({
        ...input,
        ...sources,
        ruleConfigHash: policy.ruleConfigHash,
        emissionRaw: rule.emissionBudget.dailyCapRaw,
        destinations: policy.destinations,
      });
      await repository.insertDaily(accounting);
      return accounting;
    });
  }

  closeNextDaily(input: {
    ruleVersion: string;
    now: Date;
    includePriorWeekly: boolean;
  }) {
    return this.runTransaction(async (repository) => {
      const candidate = await repository.findNextClosableRewardDay(input.ruleVersion, input.now);
      if (!candidate) return null;
      const { dayId, startsAt } = candidate;
      const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60_000);
      const readiness = await repository.dailyReadiness(startsAt, endsAt);
      if (
        readiness.unfinishedRuns > 0
        || readiness.missingRewardSources > 0
        || readiness.missingWeeklySources > 0
      ) {
        throw new DomainConflictError(
          `El dia ${dayId} sigue pendiente: runs=${readiness.unfinishedRuns}, rewards=${readiness.missingRewardSources}, weekly=${readiness.missingWeeklySources}.`,
        );
      }
      const current = await repository.findDaily(dayId);
      if (current) return current;
      const rule = await repository.findRewardRule(input.ruleVersion, startsAt);
      if (!rule) throw new DomainConflictError(`No existe regla ${input.ruleVersion} para ${dayId}.`);
      const [
        sourceLines,
        creditContributors,
        original,
        second,
        priorWeekly,
        ambassadorByWallet,
      ] = await Promise.all([
        repository.listDailyRewardSourceLines(dayId),
        repository.listCreditContributors(startsAt),
        repository.listCukieParticipants("original", startsAt, endsAt),
        repository.listCukieParticipants("second_generation", startsAt, endsAt),
        repository.findPriorWeeklyPoolTranche(new Date(endsAt.getTime() + 2 * 60 * 60_000)),
        repository.listDailyAmbassadorSnapshots(startsAt, endsAt),
      ]);
      const capacity = await repository.materializeDailyCapacity({
        dayId,
        startsAt,
        rule,
        now: input.now,
      });
      if (priorWeekly && !input.includePriorWeekly) {
        throw new DomainConflictError(
          `El dia ${dayId} tiene un tramo weekly pendiente y el gate de tramos esta apagado.`,
        );
      }
      const { calculateDailyRewardSettlement } = await import("./accounting");
      const accounting = calculateDailyRewardSettlement({
        dayId,
        rule,
        sourceLines,
        creditContributors,
        cukieOriginalParticipants: original,
        cukieSecondPlusParticipants: second,
        ambassadorByWallet,
        priorWeekly: input.includePriorWeekly ? priorWeekly ?? undefined : undefined,
        sealedAt: input.now,
      });
      if (accounting.capacityMaterializedRaw !== capacity.capacityMaterializedRaw) {
        throw new DomainConflictError(
          `La capacidad materializada de ${dayId} no coincide con sus sources canonicos.`,
        );
      }
      await repository.insertDaily(accounting);
      return accounting;
    });
  }

  sealWeekly(accounting: WeeklyPrizeAccounting) {
    return this.runTransaction(async (repository) => {
      assertWeeklyPrizeAccountingIntegrity(accounting);
      const current = await repository.findWeekly(accounting.periodId);
      if (current) {
        assertWeeklyPrizeAccountingIntegrity(current);
        return assertReplay(current, accounting, `El cierre weekly ${accounting.periodId}`);
      }
      await repository.insertWeekly(accounting);
      return accounting;
    });
  }

  closeWeeklyPeriod(input: {
    periodId: string;
    startsAt: Date;
    ruleVersion: string;
    now: Date;
  }) {
    return this.runTransaction(async (repository) => {
      const current = await repository.findWeekly(input.periodId);
      if (current) assertWeeklyPrizeAccountingIntegrity(current);
      const startsAt = validRewardDate(input.startsAt, "startsAt");
      const now = validRewardDate(input.now, "now");
      const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60_000);
      const payoutAt = new Date(Date.UTC(
        endsAt.getUTCFullYear(),
        endsAt.getUTCMonth(),
        endsAt.getUTCDate(),
        17,
      ));
      if (
        startsAt.getUTCDay() !== 1
        || startsAt.getUTCHours() !== 14
        || startsAt.getUTCMinutes() !== 0
        || startsAt.getUTCSeconds() !== 0
        || startsAt.getUTCMilliseconds() !== 0
        || getIsoWeekPeriodId(startsAt) !== input.periodId
        || now.getTime() < payoutAt.getTime()
      ) {
        throw new DomainConflictError(
          "El periodo weekly debe empezar el lunes 14:00 UTC y pagarse el lunes siguiente a las 17:00 UTC.",
        );
      }
      const daily = (await repository.listDailyAccounting(
        startsAt.toISOString().slice(0, 10),
        endsAt.toISOString().slice(0, 10),
      )).sort((left, right) => left.dayId.localeCompare(right.dayId));
      const expectedDays = Array.from({ length: 7 }, (_, index) =>
        new Date(startsAt.getTime() + index * 24 * 60 * 60_000).toISOString().slice(0, 10));
      if (
        daily.length !== 7
        || daily.some((row, index) =>
          row.dayId !== expectedDays[index]
          || row._id !== `reward-daily:${expectedDays[index]}`
          || row.ruleVersion !== input.ruleVersion
          || row.status !== "sealed")
      ) {
        throw new DomainConflictError(
          `El weekly ${input.periodId} exige siete cierres diarios canonicos de la misma regla.`,
        );
      }
      const rule = await repository.findRewardRule(input.ruleVersion, startsAt);
      if (!rule) {
        throw new DomainConflictError(`No existe regla ${input.ruleVersion} para ${input.periodId}.`);
      }
      assertRewardRule(rule, startsAt);
      const potRaw = daily.reduce(
        (sum, row) => sum + BigInt(row.buckets.weeklyPrizeRaw),
        BigInt(0),
      ).toString(10);
      const ambassadorReserveRaw = daily.reduce(
        (sum, row) => sum + BigInt(row.buckets.ambassadorWeeklyRaw),
        BigInt(0),
      ).toString(10);
      const resolvedEntropy = await repository.findFirstSafeLotteryEntropy(payoutAt);
      const entropy = resolvedEntropy ?? current?.lotteryEntropy;
      const results = await repository.listEligibleWeeklyGameSources(startsAt, endsAt);
      const { assertCurrentUndistributedRule, calculateWeeklyPrize } = await import("./accounting");
      const policy = assertCurrentUndistributedRule(rule);
      const accounting = calculateWeeklyPrize({
        periodId: input.periodId,
        ruleVersion: policy.ruleVersion,
        ruleConfigHash: policy.ruleConfigHash,
        potRaw,
        ambassadorReserveRaw,
        sourceDailyAccountingIds: daily.map((row) => row._id),
        results,
        lotteryEntropy: entropy ?? undefined,
        destinations: policy.destinations,
        payoutAt,
        sealedAt: current?.sealedAt ?? now,
      });
      if (current) {
        return assertReplay(current, accounting, `El cierre weekly ${accounting.periodId}`);
      }
      await repository.insertWeekly(accounting);
      return accounting;
    });
  }

  sealPoolTranche(accounting: PoolTrancheAccounting) {
    return this.runTransaction(async (repository) => {
      const current = await repository.findPoolTranche(accounting._id);
      if (current) return assertReplay(current, accounting, `El tramo ${accounting._id}`);
      await repository.insertPoolTranche(accounting);
      return accounting;
    });
  }

  recordWeeklyGameSource(input: WeeklyGameResult, recordedAt: Date) {
    return this.runTransaction(async (repository) => {
      const source = assertEligibleWeeklyGameResult(input);
      const evidence = await repository.findSettledGameEvidence(source.sessionId);
      if (
        !evidence
        || evidence.walletNormalized !== source.wallet
        || evidence.gameId !== source.gameId
        || evidence.validation.scoreRaw !== source.scoreRaw
        || evidence.validation.resultHash !== source.resultHash
        || evidence.settledAt.getTime() !== source.settledAt.getTime()
        || evidence.credit.reservationId !== source.creditSnapshot.reservationId
        || evidence.credit.evidenceHash !== source.creditSnapshot.evidenceHash
        || evidence.cukie.reservationId !== source.cukieSnapshot.assignmentId
        || evidence.cukie.evidenceHash !== source.cukieSnapshot.evidenceHash
      ) {
        throw new DomainConflictError(
          `La fuente weekly ${source.sessionId} no liga la sesion settled canonica.`,
        );
      }
      const payloadHash = stableRewardHash(source);
      const document: WeeklyGameSource = {
        _id: `reward-weekly-source:${source.sessionId}`,
        ...source,
        payloadHash,
        recordedAt,
      };
      const current = await repository.findWeeklyGameSource(source.sessionId);
      if (current) return assertReplay(current, document, `La fuente weekly ${source.sessionId}`);
      await repository.insertWeeklyGameSource(document);
      return document;
    });
  }
}

export const rewardAccountingService = new RewardAccountingService(
  mongoRewardAccountingTransactionRunner,
);
