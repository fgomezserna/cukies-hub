import "server-only";

import { DomainValidationError } from "../errors";
import { DomainConflictError } from "../errors";
import type { GameEconomySession } from "../game-economy/types";
import {
  TREASURE_HUNT_ECONOMY_POLICY,
  assertTreasureHuntStagingRuntime,
  getTreasureHuntWeeklyPeriod,
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
  schedulerId: string;
  ruleVersion: string;
};

function explicitGate(value: string | undefined) {
  return value === "true";
}

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new DomainValidationError(`${label} es obligatorio.`);
  return normalized;
}

export function loadRewardAccountingRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RewardAccountingRuntimeConfig {
  return {
    dailyCloseEnabled: explicitGate(env.REWARD_DAILY_ACCOUNTING_ENABLED),
    weeklyPayoutEnabled: explicitGate(env.REWARD_WEEKLY_PAYOUT_ENABLED),
    poolTranchesEnabled: explicitGate(env.REWARD_POOL_TRANCHES_ENABLED),
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

export async function settlePendingTreasureHuntRewards(input: {
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new DomainValidationError("limit debe estar entre 1 y 1000.");
  }
  const { getEconomyDb } = await import("@/lib/indexer-db/mongodb");
  const { rewardCalculationCoordinator } = await import("./coordinator");
  const db = await getEconomyDb();
  const candidates = await db.collection<GameEconomySession>("game_economy_sessions")
    .find({
      status: "settled",
      gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
      "rule.version": TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
      settledAt: { $type: "date" },
    })
    .sort({ createdAt: 1, sessionId: 1 })
    .limit(limit * 4)
    .toArray();
  let settled = 0;
  let replayed = 0;
  let scanned = 0;
  for (const game of candidates) {
    if (scanned >= limit) break;
    const sourceId = `game-session:${game.sessionId}`;
    if (await db.collection<{ _id: string }>("reward_source_manifests").findOne({ _id: sourceId })) continue;
    scanned += 1;
    const result = await rewardCalculationCoordinator.settleGame({
      sessionId: game.sessionId,
      periodId: getIsoWeekPeriodId(new Date(game.createdAt.getTime() - 14 * 60 * 60_000)),
      expectedRuleVersion: game.rule.reward.rewardRuleVersion,
      now,
    });
    if (result.result.status === "allocated" && result.result.replayed) replayed += 1;
    else if (result.result.status === "allocated") settled += 1;
  }
  return { scanned, settled, replayed };
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
}) {
  assertTreasureHuntStagingRuntime(process.env);
  const now = input.now ?? new Date();
  const config = input.config ?? loadRewardAccountingRuntimeConfig();
  const result: {
    daily: { status: "disabled" | "idle" | "sealed" | "pending"; dayId?: string; reason?: string };
    weekly: { status: "disabled" | "idle" | "sealed" | "pending"; periodId?: string; reason?: string };
  } = {
    daily: { status: config.dailyCloseEnabled ? "idle" : "disabled" },
    weekly: { status: config.weeklyPayoutEnabled ? "idle" : "disabled" },
  };
  if (config.dailyCloseEnabled) {
    try {
      const { rewardAccountingService } = await import("./accounting-repository");
      const daily = await rewardAccountingService.closeNextDaily({
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
    const current = getTreasureHuntWeeklyPeriod(now);
    const startsAt = new Date(current.startsAt.getTime() - 7 * 24 * 60 * 60_000);
    const periodId = `th-week:${startsAt.toISOString()}`;
    try {
      const payoutAt = new Date(Date.UTC(
        current.startsAt.getUTCFullYear(),
        current.startsAt.getUTCMonth(),
        current.startsAt.getUTCDate(),
        17,
      ));
      if (now.getTime() >= payoutAt.getTime()) await ensureWeeklyLotteryEntropy(payoutAt);
      const { rewardAccountingService } = await import("./accounting-repository");
      const weekly = await rewardAccountingService.closeWeeklyPeriod({
        periodId,
        startsAt,
        ruleVersion: config.ruleVersion,
        now,
      });
      result.weekly = { status: "sealed", periodId: weekly.periodId };
    } catch (error) {
      const reason = pendingAccountingError(error);
      if (!reason) throw error;
      result.weekly = { status: "pending", periodId, reason };
    }
  }
  return { ...result, completedAt: now.toISOString() };
}
