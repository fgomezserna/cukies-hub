import "server-only";

import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import { DomainConflictError } from "../errors";
import { validRewardDate, validRewardText } from "../rewards/rules";
import { weeklyRankingService } from "./service";

const STATE_COLLECTION = "weekly_ranking_runtime_state";
const RUNS_COLLECTION = "weekly_ranking_runtime_runs";
const LEASE_ID = "runtime-tick-lease";
const RUN_RETENTION_MS = 90 * 24 * 60 * 60_000;

export type WeeklyRankingRuntimeConfig = {
  enabled: boolean;
  pageSize: number;
  catchUpLimit: number;
  leaseMs: number;
};

export type WeeklyRankingRuntimeResult = {
  periodId: string;
  runId: string;
  manifestId: string;
  sourceCount: number;
  participantCount: number;
  replayed: boolean;
  periodsProcessed: number;
  closures: Array<{
    periodId: string;
    runId: string;
    manifestId: string;
    sourceCount: number;
    participantCount: number;
    replayed: boolean;
  }>;
  completedAt: string;
};

type RuntimeLease = { leasedBy: string; fenceToken: number; leaseExpiresAt: Date };
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
  result?: WeeklyRankingRuntimeResult;
  expiresAt: Date;
};

export interface WeeklyRankingRuntimeCoordinator {
  acquire(workerId: string, now: Date, leaseMs: number): Promise<RuntimeLease | null>;
  release(lease: RuntimeLease, now: Date): Promise<void>;
  startRun(workerId: string, lease: RuntimeLease, now: Date): Promise<string>;
  finishRun(runId: string, lease: RuntimeLease, now: Date, result: WeeklyRankingRuntimeResult): Promise<void>;
  failRun(runId: string, lease: RuntimeLease, now: Date, errorCode: string): Promise<void>;
}

export interface WeeklyRankingRuntimeService {
  closeCompletedPeriod(input: { now: Date; pageSize: number }): Promise<{
    periodId: string;
    runId: string;
    manifestId: string;
    sourceCount: number;
    participantCount: number;
    replayed: boolean;
  }>;
}

export class WeeklyRankingRuntimeBusyError extends Error {
  constructor() {
    super("Ya existe un tick de ranking semanal con lease activo.");
    this.name = "WeeklyRankingRuntimeBusyError";
  }
}

export class WeeklyRankingRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeeklyRankingRuntimeConfigurationError";
  }
}

function strictBoolean(value: string | undefined, name: string) {
  if (!value?.trim()) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new WeeklyRankingRuntimeConfigurationError(`${name} debe ser true o false.`);
}

function bounded(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  if (!value?.trim()) return fallback;
  if (!/^\d+$/.test(value.trim())) throw new WeeklyRankingRuntimeConfigurationError(`${name} debe ser entero.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new WeeklyRankingRuntimeConfigurationError(`${name} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

export function loadWeeklyRankingRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): WeeklyRankingRuntimeConfig {
  const timeoutMs = bounded(
    env.WEEKLY_RANKING_TICK_TIMEOUT_MS,
    240_000,
    10_000,
    600_000,
    "WEEKLY_RANKING_TICK_TIMEOUT_MS",
  );
  return {
    enabled: strictBoolean(env.WEEKLY_RANKING_RUNTIME_ENABLED, "WEEKLY_RANKING_RUNTIME_ENABLED"),
    pageSize: bounded(env.WEEKLY_RANKING_PAGE_SIZE, 500, 1, 1_000, "WEEKLY_RANKING_PAGE_SIZE"),
    catchUpLimit: bounded(
      env.WEEKLY_RANKING_CATCH_UP_LIMIT,
      8,
      1,
      52,
      "WEEKLY_RANKING_CATCH_UP_LIMIT",
    ),
    leaseMs: bounded(
      env.WEEKLY_RANKING_TICK_LEASE_MS,
      10 * 60_000,
      timeoutMs + 60_000,
      60 * 60_000,
      "WEEKLY_RANKING_TICK_LEASE_MS",
    ),
  };
}

export function createMongoWeeklyRankingRuntimeCoordinator(db: Db): WeeklyRankingRuntimeCoordinator {
  const states = db.collection<RuntimeState>(STATE_COLLECTION);
  const runs = db.collection<RuntimeRun>(RUNS_COLLECTION);
  return {
    async acquire(workerId, now, leaseMs) {
      await states.updateOne(
        { _id: LEASE_ID },
        {
          $setOnInsert: { _id: LEASE_ID, fenceToken: 0, leaseExpiresAt: new Date(0), consecutiveFailures: 0, createdAt: now },
          $set: { lastAttemptAt: now, updatedAt: now },
        },
        { upsert: true },
      );
      const leasedBy = `${workerId}:${randomUUID()}`;
      const state = await states.findOneAndUpdate(
        { _id: LEASE_ID, leaseExpiresAt: { $lte: now } },
        { $set: { leasedBy, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now }, $inc: { fenceToken: 1 } },
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
        { $set: { lastSuccessAt: now, updatedAt: now, consecutiveFailures: 0 }, $unset: { lastFailureAt: "", lastErrorCode: "" } },
      );
      if (run.matchedCount !== 1 || state.matchedCount !== 1) {
        throw new DomainConflictError("Se perdio el fence del runtime de ranking semanal.");
      }
    },
    async failRun(runId, lease, now, errorCode) {
      await runs.updateOne(
        { _id: runId, status: "running", runtimeFenceToken: lease.fenceToken },
        { $set: { status: "error", endedAt: now, errorCode } },
      );
      await states.updateOne(
        { _id: LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        { $set: { lastFailureAt: now, lastErrorCode: errorCode, updatedAt: now }, $inc: { consecutiveFailures: 1 } },
      );
    },
  };
}

function errorCode(error: unknown) {
  if (error instanceof WeeklyRankingRuntimeConfigurationError) return "CONFIGURATION";
  if (error instanceof DomainConflictError) return "DOMAIN_CONFLICT";
  return "TICK_FAILED";
}

export async function runWeeklyRankingRuntimeTick(input: {
  workerId: string;
  config?: WeeklyRankingRuntimeConfig;
  clock?: () => Date;
  service?: WeeklyRankingRuntimeService;
  coordinator?: WeeklyRankingRuntimeCoordinator;
}) {
  const config = input.config ?? loadWeeklyRankingRuntimeConfig();
  if (!config.enabled) throw new WeeklyRankingRuntimeConfigurationError("El runtime de ranking esta desactivado.");
  const workerId = validRewardText(input.workerId, "workerId");
  const clock = input.clock ?? (() => new Date());
  const now = validRewardDate(clock(), "clock");
  const coordinator = input.coordinator ?? createMongoWeeklyRankingRuntimeCoordinator(await getEconomyDb());
  const service = input.service ?? weeklyRankingService;
  const lease = await coordinator.acquire(workerId, now, config.leaseMs);
  if (!lease) throw new WeeklyRankingRuntimeBusyError();
  const runtimeRunId = await coordinator.startRun(workerId, lease, now);
  try {
    const closures: WeeklyRankingRuntimeResult["closures"] = [];
    for (let index = 0; index < config.catchUpLimit; index += 1) {
      const closed = await service.closeCompletedPeriod({ now, pageSize: config.pageSize });
      closures.push(closed);
      if (closed.replayed) break;
    }
    const closed = closures[closures.length - 1]!;
    const completedAt = validRewardDate(clock(), "clock");
    const result: WeeklyRankingRuntimeResult = {
      ...closed,
      periodsProcessed: closures.length,
      closures,
      completedAt: completedAt.toISOString(),
    };
    await coordinator.finishRun(runtimeRunId, lease, completedAt, result);
    return result;
  } catch (error) {
    try {
      await coordinator.failRun(runtimeRunId, lease, validRewardDate(clock(), "clock"), errorCode(error));
    } catch {
      // El error original prevalece; el lease expira como ultima barrera.
    }
    throw error;
  } finally {
    try {
      await coordinator.release(lease, validRewardDate(clock(), "clock"));
    } catch {
      // El TTL libera un lease cuyo release haya fallado.
    }
  }
}
