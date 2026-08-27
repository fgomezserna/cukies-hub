import "server-only";

import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";

import { DomainConflictError } from "../errors";
import { createMongoGameEconomyPorts } from "./resource-ports";
import { validGameDate, validGameText } from "./rules";
import { createMongoGameEconomyService } from "./service";
import { reconcileTreasureHuntEconomyRuns } from "./treasure-hunt";

const STATE_COLLECTION = "game_economy_runtime_state";
const RUNS_COLLECTION = "game_economy_runtime_runs";
const LEASE_ID = "runtime-tick-lease";
const RUN_RETENTION_MS = 30 * 24 * 60 * 60_000;

export type GameEconomyRuntimeConfig = {
  enabled: boolean;
  recoveryLimit: number;
  expiryLimit: number;
  leaseMs: number;
};

export type GameEconomyRuntimeResult = {
  recovered: number;
  recoveryFailures: Array<{ sessionId: string; code: string }>;
  expired: number;
  expiryFailures: Array<{ sessionId: string; code: string }>;
  treasure: Awaited<ReturnType<typeof reconcileTreasureHuntEconomyRuns>>;
  rewards: { scanned: number; settled: number; replayed: number };
  completedAt: string;
};

type RuntimeLease = {
  leasedBy: string;
  fenceToken: number;
  leaseExpiresAt: Date;
};

type RuntimeState = {
  _id: string;
  leasedBy?: string;
  fenceToken: number;
  leaseExpiresAt: Date;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastErrorCode?: string;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
};

type RuntimeRun = {
  _id: string;
  runId: string;
  workerId: string;
  status: "running" | "success" | "error";
  runtimeFenceToken: number;
  startedAt: Date;
  endedAt?: Date;
  errorCode?: string;
  result?: GameEconomyRuntimeResult;
  expiresAt: Date;
};

export interface GameEconomyRuntimeCoordinator {
  acquire(workerId: string, now: Date, leaseMs: number): Promise<RuntimeLease | null>;
  release(lease: RuntimeLease, now: Date): Promise<void>;
  startRun(workerId: string, lease: RuntimeLease, now: Date): Promise<string>;
  finishRun(
    runId: string,
    lease: RuntimeLease,
    now: Date,
    result: GameEconomyRuntimeResult,
  ): Promise<void>;
  failRun(runId: string, lease: RuntimeLease, now: Date, errorCode: string): Promise<void>;
}

export interface GameEconomyRuntimeService {
  recoverBatch(input: { now: Date; limit: number }): Promise<{
    sessions: Array<{ sessionId: string }>;
    failures: Array<{ sessionId: string; code: string }>;
  }>;
  expireBatch(input: { now: Date; limit: number }): Promise<{
    sessions: Array<{ sessionId: string }>;
    failures: Array<{ sessionId: string; code: string }>;
  }>;
}

export class GameEconomyRuntimeBusyError extends Error {
  constructor() {
    super("Ya existe un tick GameEconomy con lease activo.");
    this.name = "GameEconomyRuntimeBusyError";
  }
}

export class GameEconomyRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameEconomyRuntimeConfigurationError";
  }
}

function strictBoolean(value: string | undefined, name: string) {
  if (!value?.trim()) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new GameEconomyRuntimeConfigurationError(`${name} debe ser true o false.`);
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) {
  if (!value?.trim()) return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new GameEconomyRuntimeConfigurationError(`${name} debe ser un entero.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new GameEconomyRuntimeConfigurationError(`${name} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

export function loadGameEconomyRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): GameEconomyRuntimeConfig {
  const tickTimeoutMs = boundedInteger(
    env.GAME_ECONOMY_TICK_TIMEOUT_MS,
    240_000,
    10_000,
    600_000,
    "GAME_ECONOMY_TICK_TIMEOUT_MS",
  );
  return {
    enabled: strictBoolean(env.GAME_ECONOMY_RUNTIME_ENABLED, "GAME_ECONOMY_RUNTIME_ENABLED"),
    recoveryLimit: boundedInteger(
      env.GAME_ECONOMY_RECOVERY_LIMIT,
      100,
      1,
      100,
      "GAME_ECONOMY_RECOVERY_LIMIT",
    ),
    expiryLimit: boundedInteger(
      env.GAME_ECONOMY_EXPIRY_LIMIT,
      100,
      1,
      100,
      "GAME_ECONOMY_EXPIRY_LIMIT",
    ),
    leaseMs: boundedInteger(
      env.GAME_ECONOMY_TICK_LEASE_MS,
      10 * 60_000,
      tickTimeoutMs + 60_000,
      60 * 60_000,
      "GAME_ECONOMY_TICK_LEASE_MS",
    ),
  };
}

export function createMongoGameEconomyRuntimeCoordinator(
  db: Db,
): GameEconomyRuntimeCoordinator {
  const states = db.collection<RuntimeState>(STATE_COLLECTION);
  const runs = db.collection<RuntimeRun>(RUNS_COLLECTION);
  return {
    async acquire(workerId, now, leaseMs) {
      await states.updateOne(
        { _id: LEASE_ID },
        {
          $setOnInsert: {
            _id: LEASE_ID,
            fenceToken: 0,
            leaseExpiresAt: new Date(0),
            consecutiveFailures: 0,
            createdAt: now,
          },
          $set: { lastAttemptAt: now, updatedAt: now },
        },
        { upsert: true },
      );
      const leasedBy = `${workerId}:${randomUUID()}`;
      const state = await states.findOneAndUpdate(
        { _id: LEASE_ID, leaseExpiresAt: { $lte: now } },
        {
          $set: {
            leasedBy,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
            updatedAt: now,
          },
          $inc: { fenceToken: 1 },
        },
        { returnDocument: "after" },
      );
      return state?.leasedBy === leasedBy
        ? { leasedBy, fenceToken: state.fenceToken, leaseExpiresAt: state.leaseExpiresAt }
        : null;
    },
    async release(lease, now) {
      await states.updateOne(
        { _id: LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        { $set: { leaseExpiresAt: now, updatedAt: now }, $unset: { leasedBy: "" } },
      );
    },
    async startRun(workerId, lease, now) {
      const runId = randomUUID();
      await runs.insertOne({
        _id: runId,
        runId,
        workerId,
        status: "running",
        runtimeFenceToken: lease.fenceToken,
        startedAt: now,
        expiresAt: new Date(now.getTime() + RUN_RETENTION_MS),
      });
      return runId;
    },
    async finishRun(runId, lease, now, result) {
      const run = await runs.updateOne(
        { _id: runId, status: "running", runtimeFenceToken: lease.fenceToken },
        { $set: { status: "success", endedAt: now, result } },
      );
      const state = await states.updateOne(
        { _id: LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        {
          $set: { lastSuccessAt: now, updatedAt: now, consecutiveFailures: 0 },
          $unset: { lastFailureAt: "", lastErrorCode: "" },
        },
      );
      if (run.matchedCount !== 1 || state.matchedCount !== 1) {
        throw new DomainConflictError("Se perdio el fence del runtime GameEconomy.");
      }
    },
    async failRun(runId, lease, now, errorCode) {
      await runs.updateOne(
        { _id: runId, status: "running", runtimeFenceToken: lease.fenceToken },
        { $set: { status: "error", endedAt: now, errorCode } },
      );
      await states.updateOne(
        { _id: LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        {
          $set: { lastFailureAt: now, lastErrorCode: errorCode, updatedAt: now },
          $inc: { consecutiveFailures: 1 },
        },
      );
    },
  };
}

function runtimeErrorCode(error: unknown) {
  if (error instanceof GameEconomyRuntimeConfigurationError) return "CONFIGURATION";
  if (error instanceof DomainConflictError) return "DOMAIN_CONFLICT";
  return "TICK_FAILED";
}

export async function runGameEconomyRuntimeTick(input: {
  workerId: string;
  config?: GameEconomyRuntimeConfig;
  clock?: () => Date;
  service?: GameEconomyRuntimeService;
  coordinator?: GameEconomyRuntimeCoordinator;
}) {
  const config = input.config ?? loadGameEconomyRuntimeConfig();
  if (!config.enabled) {
    throw new GameEconomyRuntimeConfigurationError("El runtime GameEconomy esta desactivado.");
  }
  const workerId = validGameText(input.workerId, "workerId");
  const clock = input.clock ?? (() => new Date());
  const now = validGameDate(clock(), "clock");
  const coordinator = input.coordinator
    ?? createMongoGameEconomyRuntimeCoordinator(await getEconomyDb());
  const service = input.service
    ?? createMongoGameEconomyService(createMongoGameEconomyPorts());
  const lease = await coordinator.acquire(workerId, now, config.leaseMs);
  if (!lease) throw new GameEconomyRuntimeBusyError();
  const runId = await coordinator.startRun(workerId, lease, now);
  try {
    const recovery = await service.recoverBatch({ now, limit: config.recoveryLimit });
    const expiry = await service.expireBatch({ now, limit: config.expiryLimit });
    const treasure = input.service
      ? { scanned: 0, settled: 0, forfeited: 0, released: 0, pending: 0, failures: [] }
      : await reconcileTreasureHuntEconomyRuns({ now, limit: config.recoveryLimit });
    const rewards = input.service
      ? { scanned: 0, settled: 0, replayed: 0 }
      : await (await import("../rewards/accounting-runtime"))
        .settlePendingTreasureHuntRewards({ now, limit: config.recoveryLimit });
    const completedAt = validGameDate(clock(), "clock");
    const result: GameEconomyRuntimeResult = {
      recovered: recovery.sessions.length,
      recoveryFailures: recovery.failures,
      expired: expiry.sessions.length,
      expiryFailures: expiry.failures,
      treasure,
      rewards,
      completedAt: completedAt.toISOString(),
    };
    await coordinator.finishRun(runId, lease, completedAt, result);
    return result;
  } catch (error) {
    try {
      await coordinator.failRun(runId, lease, validGameDate(clock(), "clock"), runtimeErrorCode(error));
    } catch {
      // El error operativo original prevalece.
    }
    throw error;
  } finally {
    try {
      await coordinator.release(lease, validGameDate(clock(), "clock"));
    } catch {
      // El TTL del lease es la ultima barrera.
    }
  }
}
