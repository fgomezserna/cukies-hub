import "server-only";

import { DomainValidationError } from "../errors";
import { DomainConflictError } from "../errors";
import type { GameEconomySession } from "../game-economy/types";
import {
  TREASURE_HUNT_ECONOMY_POLICY,
  assertTreasureHuntStagingRuntime,
} from "../game-economy/treasure-hunt-policy";
import { getIsoWeekPeriodId } from "../periods";
import type { WeeklyLotteryEntropy } from "./accounting-types";

export interface WeeklyLotteryEntropyPort {
  resolveFirstSafeBlockAtOrAfter(cutoff: Date): Promise<WeeklyLotteryEntropy | null>;
}

export async function requireWeeklyLotteryEntropy(
  port: WeeklyLotteryEntropyPort,
  cutoff: Date,
) {
  const entropy = await port.resolveFirstSafeBlockAtOrAfter(cutoff);
  if (!entropy) {
    throw new DomainValidationError(
      "pending_entropy: el indexer aun no confirma el primer bloque BSC posterior al cutoff.",
    );
  }
  return entropy;
}

export type RewardAccountingRuntimeConfig = {
  dailyCloseEnabled: boolean;
  weeklyPayoutEnabled: boolean;
  poolTranchesEnabled: boolean;
  weeklyCatchUpLimit: number;
  schedulerId: string;
  ruleVersion: string;
};

export interface RewardAccountingRuntimeService {
  closeNextDaily(input: {
    ruleVersion: string;
    now: Date;
    includePriorWeekly: boolean;
  }): Promise<{ dayId: string } | null>;
  nextWeeklyPeriod(input: {
    ruleVersion: string;
    now: Date;
  }): Promise<{ periodId: string; startsAt: Date; payoutAt: Date } | null>;
  closeWeeklyPeriod(input: {
    periodId: string;
    startsAt: Date;
    ruleVersion: string;
    now: Date;
  }): Promise<{ periodId: string }>;
}

function explicitGate(value: string | undefined) {
  return value === "true";
}

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new DomainValidationError(`${label} es obligatorio.`);
  return normalized;
}

function boundedInteger(
  value: string | undefined,
  label: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  if (!/^\d+$/.test(normalized)) {
    throw new DomainValidationError(`${label} debe ser un entero.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DomainValidationError(`${label} debe estar entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

export function loadRewardAccountingRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RewardAccountingRuntimeConfig {
  return {
    dailyCloseEnabled: explicitGate(env.REWARD_DAILY_ACCOUNTING_ENABLED),
    weeklyPayoutEnabled: explicitGate(env.REWARD_WEEKLY_PAYOUT_ENABLED),
    poolTranchesEnabled: explicitGate(env.REWARD_POOL_TRANCHES_ENABLED),
    weeklyCatchUpLimit: boundedInteger(
      env.REWARD_WEEKLY_CATCH_UP_LIMIT,
      "REWARD_WEEKLY_CATCH_UP_LIMIT",
      8,
      1,
      52,
    ),
    schedulerId: required(env.REWARD_ACCOUNTING_SCHEDULER_ID, "REWARD_ACCOUNTING_SCHEDULER_ID"),
    ruleVersion: required(env.REWARD_ACCOUNTING_RULE_VERSION, "REWARD_ACCOUNTING_RULE_VERSION"),
  };
}

export function assertRewardAccountingActionEnabled(
  config: RewardAccountingRuntimeConfig,
  action: "daily" | "weekly" | "pool_tranche",
) {
  const enabled = action === "daily"
    ? config.dailyCloseEnabled
    : action === "weekly"
      ? config.weeklyPayoutEnabled
      : config.poolTranchesEnabled;
  if (!enabled) {
    throw new DomainValidationError(`La accion reward ${action} esta deshabilitada por runtime gate.`);
  }
}

export function buildPendingTreasureHuntRewardPipeline(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new DomainValidationError("limit debe estar entre 1 y 1000.");
  }
  return [
    {
      $match: {
        status: "settled",
        gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
        "rule.version": TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
        settledAt: { $type: "date" },
      },
    },
    { $sort: { settledAt: 1 as const, sessionId: 1 as const } },
    {
      $set: {
        __rewardSourceId: { $concat: ["game-session:", "$sessionId"] },
      },
    },
    {
      $lookup: {
        from: "reward_source_manifests",
        localField: "__rewardSourceId",
        foreignField: "_id",
        as: "__rewardManifest",
      },
    },
    { $match: { "__rewardManifest.0": { $exists: false } } },
    { $limit: limit },
    { $project: { __rewardSourceId: 0, __rewardManifest: 0 } },
  ];
}

export async function settlePendingTreasureHuntRewards(input: {
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;
  const pipeline = buildPendingTreasureHuntRewardPipeline(limit);
  const { getEconomyDb } = await import("@/lib/indexer-db/mongodb");
  const { rewardCalculationCoordinator } = await import("./coordinator");
  const db = await getEconomyDb();
  const candidates = await db.collection<GameEconomySession>("game_economy_sessions")
    .aggregate<GameEconomySession>(pipeline)
    .toArray();
  let settled = 0;
  let replayed = 0;
  for (const game of candidates) {
    const result = await rewardCalculationCoordinator.settleGame({
      sessionId: game.sessionId,
      periodId: game.rule.calendar
        ? getIsoWeekPeriodId(game.createdAt, game.rule.calendar)
        : getIsoWeekPeriodId(new Date(game.createdAt.getTime() - 14 * 60 * 60_000)),
      expectedRuleVersion: game.rule.reward.rewardRuleVersion,
      now,
    });
    if (result.result.status === "allocated" && result.result.replayed) replayed += 1;
    else if (result.result.status === "allocated") settled += 1;
  }
  return { scanned: candidates.length, settled, replayed };
}

function pendingAccountingError(error: unknown) {
  if (!(error instanceof DomainConflictError)) return null;
  const message = error.message;
  return /sigue pendiente|exige siete cierres|pending_entropy|aun no puede pagarse|gate de tramos/.test(message)
    ? message
    : null;
}

async function ensureWeeklyLotteryEntropy(cutoff: Date) {
  const { getEconomyDb } = await import("@/lib/indexer-db/mongodb");
  const db = await getEconomyDb();
  const existing = await db.collection<{
    blockNumber: number;
    blockTimestamp: Date;
  }>("chain_bsc_canonical_blocks").findOne({
    chainId: 97,
    blockTimestamp: { $gte: cutoff },
  }, { sort: { blockTimestamp: 1, blockNumber: 1 } });
  if (existing) {
    const previous = await db.collection("chain_bsc_canonical_blocks").findOne({
      chainId: 97,
      blockNumber: existing.blockNumber - 1,
      blockTimestamp: { $lt: cutoff },
    });
    if (previous) return;
  }
  const urls = (process.env.CHAIN_INDEXER_BSC_RPC_URLS
    ?? process.env.CHAIN_INDEXER_BSC_RPC_URL
    ?? process.env.BSC_RPC_URL
    ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    throw new DomainConflictError("pending_entropy: no hay RPC BSC Testnet configurado.");
  }
  const confirmations = Number(process.env.CHAIN_INDEXER_BSC_CONFIRMATIONS ?? "12");
  if (!Number.isSafeInteger(confirmations) || confirmations < 1 || confirmations > 10_000) {
    throw new DomainConflictError("pending_entropy: confirmaciones BSC invalidas.");
  }
  const { createPublicClient, http } = await import("viem");
  const { bscTestnet } = await import("viem/chains");
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const client = createPublicClient({ chain: bscTestnet, transport: http(url) });
      if (await client.getChainId() !== 97) throw new Error("RPC no pertenece a BSC Testnet.");
      const latest = await client.getBlockNumber();
      if (latest <= BigInt(confirmations)) return;
      const safeNumber = latest - BigInt(confirmations);
      const blockAt = async (number: bigint) => client.getBlock({ blockNumber: number });
      const safe = await blockAt(safeNumber);
      if (Number(safe.timestamp * BigInt(1_000)) < cutoff.getTime()) return;
      let low = BigInt(0);
      let high = safeNumber;
      let predecessor = BigInt(-1);
      while (low <= high) {
        const middle = low + (high - low) / BigInt(2);
        const block = middle === safeNumber ? safe : await blockAt(middle);
        if (Number(block.timestamp * BigInt(1_000)) < cutoff.getTime()) {
          predecessor = middle;
          low = middle + BigInt(1);
        } else {
          high = middle - BigInt(1);
        }
      }
      if (predecessor < BigInt(0)) throw new Error("No existe predecessor canonico.");
      const previous = await blockAt(predecessor);
      const first = predecessor + BigInt(1) === safeNumber
        ? safe
        : await blockAt(predecessor + BigInt(1));
      if (
        !previous.hash || !first.hash
        || Number(previous.timestamp * BigInt(1_000)) >= cutoff.getTime()
        || Number(first.timestamp * BigInt(1_000)) < cutoff.getTime()
      ) throw new Error("El RPC no probo el primer bloque contiguo posterior al cutoff.");
      const observedAt = new Date();
      for (const block of [previous, first]) {
        const blockNumber = Number(block.number);
        const document = {
          _id: String(blockNumber),
          chain: "BSC" as const,
          chainId: 97 as const,
          blockNumber,
          blockHash: block.hash!.toLowerCase(),
          blockTimestamp: new Date(Number(block.timestamp * BigInt(1_000))),
          observedAt,
          createdAt: observedAt,
        };
        const current = await db.collection<typeof document>("chain_bsc_canonical_blocks")
          .findOne({ _id: document._id });
        if (current && current.blockHash !== document.blockHash) {
          throw new DomainConflictError(`Fork canonico detectado en bloque ${blockNumber}.`);
        }
        if (!current) await db.collection<typeof document>("chain_bsc_canonical_blocks").insertOne(document);
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new DomainConflictError(
    `pending_entropy: ningun RPC BSC pudo resolver el cutoff (${lastError instanceof Error ? lastError.message : "unknown"}).`,
  );
}

export async function runRewardAccountingRuntimeTick(input: {
  now?: Date;
  config?: RewardAccountingRuntimeConfig;
  service?: RewardAccountingRuntimeService;
  ensureWeeklyEntropy?: (cutoff: Date) => Promise<void>;
}) {
  assertTreasureHuntStagingRuntime(process.env);
  const now = input.now ?? new Date();
  const config = input.config ?? loadRewardAccountingRuntimeConfig();
  const result: {
    daily: { status: "disabled" | "idle" | "sealed" | "pending"; dayId?: string; reason?: string };
    weekly: {
      status: "disabled" | "idle" | "sealed" | "pending";
      periodId?: string;
      reason?: string;
      periodsProcessed?: number;
    };
  } = {
    daily: { status: config.dailyCloseEnabled ? "idle" : "disabled" },
    weekly: { status: config.weeklyPayoutEnabled ? "idle" : "disabled" },
  };
  let service = input.service;
  const accountingService = async () => {
    service ??= (await import("./accounting-repository")).rewardAccountingService;
    return service;
  };
  if (config.dailyCloseEnabled) {
    try {
      const daily = await (await accountingService()).closeNextDaily({
        ruleVersion: config.ruleVersion,
        now,
        includePriorWeekly: config.poolTranchesEnabled,
      });
      if (daily) result.daily = { status: "sealed", dayId: daily.dayId };
    } catch (error) {
      const reason = pendingAccountingError(error);
      if (!reason) throw error;
      result.daily = { status: "pending", reason };
    }
  }
  if (config.weeklyPayoutEnabled) {
    let pendingPeriodId: string | undefined;
    try {
      const rewardAccountingService = await accountingService();
      let periodsProcessed = 0;
      for (let index = 0; index < config.weeklyCatchUpLimit; index += 1) {
        const candidate = await rewardAccountingService.nextWeeklyPeriod({
          ruleVersion: config.ruleVersion,
          now,
        });
        if (!candidate) break;
        pendingPeriodId = candidate.periodId;
        await (input.ensureWeeklyEntropy ?? ensureWeeklyLotteryEntropy)(candidate.payoutAt);
        const weekly = await rewardAccountingService.closeWeeklyPeriod({
          periodId: candidate.periodId,
          startsAt: candidate.startsAt,
          ruleVersion: config.ruleVersion,
          now,
        });
        periodsProcessed += 1;
        result.weekly = {
          status: "sealed",
          periodId: weekly.periodId,
          periodsProcessed,
        };
      }
    } catch (error) {
      const reason = pendingAccountingError(error);
      if (!reason) throw error;
      result.weekly = {
        status: "pending",
        ...(pendingPeriodId ? { periodId: pendingPeriodId } : {}),
        reason,
      };
    }
  }
  return { ...result, completedAt: now.toISOString() };
}
