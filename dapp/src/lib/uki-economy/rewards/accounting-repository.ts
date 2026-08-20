import "server-only";

import type { ClientSession, Db } from "mongodb";

import { DomainConflictError } from "../errors";
import { formatRawAmount, parseRawAmount } from "../money";
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
import { assertEligibleWeeklyGameResult } from "./accounting";
import { stableRewardHash } from "./rules";
import type { RewardRule } from "./types";
import type { RewardEmissionBudgetDay, RewardEmissionBudgetState } from "./types";
import { DAILY_REWARD_EMISSION_RAW } from "./accounting-types";

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

export interface RewardAccountingRepository {
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
  findNextClosableRewardDay(ruleVersion: string, now: Date): Promise<string | null>;
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
  const referralsFor = async (wallets: string[]) => {
    if (wallets.length === 0) return new Map<string, string | null>();
    const rows = await db.collection<{
      normalizedWalletAddress: string;
      lockedSponsorWalletAddress?: string | null;
    }>("presale_participants").find({
      normalizedWalletAddress: { $in: wallets },
    }, options).project({
      _id: 0,
      normalizedWalletAddress: 1,
      lockedSponsorWalletAddress: 1,
    }).toArray();
    return new Map(rows.map((row) => [
      row.normalizedWalletAddress,
      row.lockedSponsorWalletAddress ?? null,
    ]));
  };
  return {
    findRewardRule: (ruleVersion, at) => rewardRules.findOne({
      scope: "reward_allocations",
      version: ruleVersion,
      active: true,
      activeFrom: { $lte: at },
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: at } }],
    }, options),
    async materializeDailyCapacity(input) {
      const current = await capacityMaterializations.findOne({ dayId: input.dayId }, options);
      if (current) return current;
      if (
        input.rule.emissionBudget.unusedDailyCapacity !== "materialize_undistributed"
        || input.rule.emissionBudget.dailyCapRaw !== DAILY_REWARD_EMISSION_RAW
        || input.startsAt.toISOString() !== `${input.dayId}T14:00:00.000Z`
      ) {
        throw new DomainConflictError("La regla no permite materializar la capacidad diaria fija.");
      }
      const budgetDayId = input.startsAt.toISOString();
      const day = await budgetDays.findOne({ _id: budgetDayId }, options);
      const state = await budgetStates.findOne({ _id: "reward_allocations" }, options);
      const previousDaily = day ? parseRawAmount(day.reservedRaw) : BigInt(0);
      const cap = parseRawAmount(input.rule.emissionBudget.dailyCapRaw);
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
            reservedRaw: DAILY_REWARD_EMISSION_RAW,
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
            reservedRaw: DAILY_REWARD_EMISSION_RAW,
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
        resultingDailyRaw: DAILY_REWARD_EMISSION_RAW,
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
      const latest = await daily.findOne({}, { ...options, sort: { dayId: -1 } });
      const next = latest
        ? new Date(`${latest.dayId}T00:00:00.000Z`)
        : new Date(`${rule.activeFrom.toISOString().slice(0, 10)}T00:00:00.000Z`);
      if (latest) next.setUTCDate(next.getUTCDate() + 1);
      const startsAt = new Date(next.getTime() + rule.emissionBudget.dayBoundarySecondUtc * 1_000);
      const closesAt = new Date(startsAt.getTime() + 26 * 60 * 60_000);
      return now.getTime() >= closesAt.getTime() ? next.toISOString().slice(0, 10) : null;
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
      const referrals = await referralsFor(rows.map((row) => row._id));
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
      const referrals = await referralsFor([...new Set(rows.map((row) => row.wallet))]);
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
      const tranche = accounting.poolTrancheSchedule.findIndex((at) =>
        at.getTime() === scheduledAt.getTime());
      if (tranche < 0) return null;
      const { splitIntoSevenTranches } = await import("./accounting");
      const value = (pool: "credit" | "cukie_original" | "cukie_second_plus") => {
        const row = accounting.poolReservations.find((item) => item.pool === pool);
        return {
          amount: row ? splitIntoSevenTranches(row.amountRaw)[tranche] : "0",
          ambassador: row ? splitIntoSevenTranches(row.ambassadorReserveRaw)[tranche] : "0",
        };
      };
      const credit = value("credit");
      const original = value("cukie_original");
      const second = value("cukie_second_plus");
      return {
        weeklyAccountingId: accounting._id,
        creditPoolRaw: credit.amount,
        creditPoolAmbassadorRaw: credit.ambassador,
        cukiePoolOriginalRaw: original.amount,
        cukiePoolOriginalAmbassadorRaw: original.ambassador,
        cukiePoolSecondPlusRaw: second.amount,
        cukiePoolSecondPlusAmbassadorRaw: second.ambassador,
      };
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
    destinations: DailyRewardAccounting["destinations"];
    sealedAt: Date;
  }) {
    return this.runTransaction(async (repository) => {
      const current = await repository.findDaily(input.dayId);
      if (current) return current;
      const { dailyBucketsFromSources, sealDailyRewardAccounting } = await import("./accounting");
      const sources = dailyBucketsFromSources(
        await repository.listDailyRewardSourceLines(input.dayId),
      );
      const accounting = sealDailyRewardAccounting({ ...input, ...sources });
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
      const dayId = await repository.findNextClosableRewardDay(input.ruleVersion, input.now);
      if (!dayId) return null;
      const startsAt = new Date(`${dayId}T14:00:00.000Z`);
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
        destinations: {
          treasury: rule.destinations.treasury,
          marketingDevelopment:
            rule.destinations.marketingDevelopment ?? rule.destinations.marketing,
          supplyReduction: rule.destinations.supplyReduction,
        },
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
      const current = await repository.findWeekly(accounting.periodId);
      if (current) return assertReplay(current, accounting, `El cierre weekly ${accounting.periodId}`);
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
      if (current) return current;
      const startsAt = new Date(input.startsAt);
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
        || input.now.getTime() < payoutAt.getTime()
      ) {
        throw new DomainConflictError("El periodo weekly aun no puede pagarse el lunes a las 17 UTC.");
      }
      const daily = await repository.listDailyAccounting(
        startsAt.toISOString().slice(0, 10),
        endsAt.toISOString().slice(0, 10),
      );
      if (daily.length !== 7) {
        throw new DomainConflictError(
          `El weekly ${input.periodId} exige siete cierres diarios; disponibles=${daily.length}.`,
        );
      }
      const rule = await repository.findRewardRule(input.ruleVersion, startsAt);
      if (!rule) {
        throw new DomainConflictError(`No existe regla ${input.ruleVersion} para ${input.periodId}.`);
      }
      const potRaw = daily.reduce(
        (sum, row) => sum + BigInt(row.buckets.weeklyPrizeRaw),
        BigInt(0),
      ).toString(10);
      const ambassadorReserveRaw = daily.reduce(
        (sum, row) => sum + BigInt(row.buckets.ambassadorWeeklyRaw),
        BigInt(0),
      ).toString(10);
      const entropy = await repository.findFirstSafeLotteryEntropy(payoutAt);
      const results = await repository.listEligibleWeeklyGameSources(startsAt, endsAt);
      const { calculateWeeklyPrize } = await import("./accounting");
      const accounting = calculateWeeklyPrize({
        periodId: input.periodId,
        ruleVersion: input.ruleVersion,
        potRaw,
        ambassadorReserveRaw,
        sourceDailyAccountingIds: daily.map((row) => row._id),
        results,
        lotteryEntropy: entropy ?? undefined,
        destinations: {
          treasury: rule.destinations.treasury,
          marketingDevelopment:
            rule.destinations.marketingDevelopment ?? rule.destinations.marketing,
          supplyReduction: rule.destinations.supplyReduction,
        },
        payoutAt,
        sealedAt: input.now,
      });
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
