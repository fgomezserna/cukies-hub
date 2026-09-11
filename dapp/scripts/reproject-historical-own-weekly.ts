#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { MongoClient, ReadPreference, type Db } from "mongodb";

import { assertEconomySchema } from "../src/lib/indexer-db/mongodb";
import {
  HISTORICAL_OWN_WEEKLY_CHAIN_ID,
  HISTORICAL_OWN_WEEKLY_DATABASE,
  HISTORICAL_OWN_WEEKLY_MAX_SESSIONS,
  applyHistoricalOwnWeeklyReprojection,
  historicalOwnWeeklyReprojectionPlanHash,
  readHistoricalOwnWeeklyReprojectionPlan,
  type HistoricalOwnWeeklyPlan,
  type HistoricalOwnWeeklyReprojectionInput,
} from "../src/lib/uki-economy/game-economy/historical-own-weekly-reprojection";

export const HISTORICAL_OWN_WEEKLY_APPLY_CONFIRMATION = "APPLY_HISTORICAL_OWN_WEEKLY_STAGE97" as const;

const FINANCIAL_GATES = [
  "GAME_ECONOMY_RUNTIME_ENABLED",
  "WEEKLY_RANKING_RUNTIME_ENABLED",
  "REWARD_ACCOUNTING_RUNTIME_ENABLED",
  "REWARD_DAILY_ACCOUNTING_ENABLED",
  "REWARD_WEEKLY_PAYOUT_ENABLED",
  "REWARD_POOL_TRANCHES_ENABLED",
  "REWARD_BATCH_PUBLISHER_ENABLED",
  "REWARD_ACCOUNTING_SCHEDULER_ENABLED",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

export type HistoricalOwnWeeklyCliArgs = {
  readonly mode: "plan" | "apply";
  readonly walletNormalized: string;
  readonly sessionIds: readonly string[];
  readonly planFile?: string;
  readonly planHash?: string;
  readonly plannedAt?: Date;
  readonly confirmation?: string;
};

type PlanArtifact = {
  readonly event: "historical_own_weekly_reprojection";
  readonly mode: "plan";
  readonly plan: HistoricalOwnWeeklyPlan;
  readonly summary: Record<string, unknown>;
};

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function mongoDatabaseName(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("CHAIN_INDEXER_MONGO_URL debe ser una URL MongoDB.");
  }
  if (parsed.protocol !== "mongodb:" && parsed.protocol !== "mongodb+srv:") {
    throw new Error("CHAIN_INDEXER_MONGO_URL debe usar mongodb:// o mongodb+srv://.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim();
  if (!databaseName) throw new Error("CHAIN_INDEXER_MONGO_URL debe incluir la base explicita.");
  return databaseName;
}

export function validateHistoricalOwnWeeklyEnvironment(environment: Environment = process.env) {
  if (environment.APP_ENV?.trim() !== "staging") throw new Error("APP_ENV debe ser staging.");
  if (environment.STAGING_ONLY_GUARD?.trim() !== "true") throw new Error("STAGING_ONLY_GUARD debe ser true.");
  if (environment.NEXT_PUBLIC_UKI_CHAIN_ID?.trim() !== String(HISTORICAL_OWN_WEEKLY_CHAIN_ID)) {
    throw new Error("NEXT_PUBLIC_UKI_CHAIN_ID debe ser 97.");
  }
  if (environment.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID?.trim() !== String(HISTORICAL_OWN_WEEKLY_CHAIN_ID)) {
    throw new Error("CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID debe ser 97.");
  }
  if (environment.CHAIN_INDEXER_DB_NAME?.trim() !== HISTORICAL_OWN_WEEKLY_DATABASE) {
    throw new Error(`CHAIN_INDEXER_DB_NAME debe ser ${HISTORICAL_OWN_WEEKLY_DATABASE}.`);
  }
  for (const gate of FINANCIAL_GATES) {
    if (environment[gate]?.trim() !== "false") {
      throw new Error(`${gate} debe estar explicitamente en false durante la reconciliacion.`);
    }
  }
  const mongoUrl = required(environment, "CHAIN_INDEXER_MONGO_URL");
  if (mongoDatabaseName(mongoUrl) !== HISTORICAL_OWN_WEEKLY_DATABASE) {
    throw new Error(`CHAIN_INDEXER_MONGO_URL debe apuntar a ${HISTORICAL_OWN_WEEKLY_DATABASE}.`);
  }
  return {
    mongoUrl,
    databaseName: HISTORICAL_OWN_WEEKLY_DATABASE,
  } as const;
}

function validHexHash(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("El hash del plan debe ser SHA-256 hexadecimal.");
  return value;
}

function parseDate(value: string, label: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} debe ser una fecha ISO UTC canonica.`);
  }
  return parsed;
}

function nextValue(argv: readonly string[], index: number, name: string) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requiere un valor.`);
  return value;
}

export function parseHistoricalOwnWeeklyReprojectionArgs(argv: readonly string[]): HistoricalOwnWeeklyCliArgs {
  let mode: "plan" | "apply" | undefined;
  let walletNormalized: string | undefined;
  const sessionIds: string[] = [];
  let planFile: string | undefined;
  let planHash: string | undefined;
  let plannedAt: Date | undefined;
  let confirmation: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") {
      if (mode === "apply") throw new Error("Usa exactamente --plan o --apply.");
      mode = "plan";
    } else if (arg === "--apply") {
      if (mode === "plan") throw new Error("Usa exactamente --plan o --apply.");
      mode = "apply";
    } else if (arg === "--wallet") {
      walletNormalized = nextValue(argv, index, "--wallet").toLowerCase();
      index += 1;
    } else if (arg === "--session-id") {
      sessionIds.push(nextValue(argv, index, "--session-id"));
      index += 1;
    } else if (arg === "--plan-file") {
      planFile = nextValue(argv, index, "--plan-file");
      index += 1;
    } else if (arg === "--plan-hash") {
      planHash = validHexHash(nextValue(argv, index, "--plan-hash"));
      index += 1;
    } else if (arg === "--planned-at") {
      plannedAt = parseDate(nextValue(argv, index, "--planned-at"), "--planned-at");
      index += 1;
    } else if (arg === "--confirm") {
      confirmation = nextValue(argv, index, "--confirm");
      index += 1;
    } else if (arg.length > 0) {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  const selectedMode = mode ?? "plan";
  if (!walletNormalized || !/^0x[0-9a-f]{40}$/.test(walletNormalized)) {
    throw new Error("--wallet debe ser una direccion EVM de 20 bytes.");
  }
  if (sessionIds.length !== HISTORICAL_OWN_WEEKLY_MAX_SESSIONS) {
    throw new Error(`Se requieren exactamente ${HISTORICAL_OWN_WEEKLY_MAX_SESSIONS} argumentos --session-id.`);
  }
  if (new Set(sessionIds).size !== sessionIds.length) throw new Error("--session-id no admite duplicados.");
  if (selectedMode === "plan" && (planFile || planHash || confirmation)) {
    throw new Error("--plan no acepta --plan-file, --plan-hash ni --confirm.");
  }
  if (selectedMode === "apply") {
    if (!planFile) throw new Error("--apply requiere --plan-file.");
    if (!planHash) throw new Error("--apply requiere --plan-hash.");
    if (confirmation !== HISTORICAL_OWN_WEEKLY_APPLY_CONFIRMATION) {
      throw new Error(`--apply requiere --confirm ${HISTORICAL_OWN_WEEKLY_APPLY_CONFIRMATION}.`);
    }
  }
  return {
    mode: selectedMode,
    walletNormalized,
    sessionIds: [...sessionIds],
    ...(planFile ? { planFile } : {}),
    ...(planHash ? { planHash } : {}),
    ...(plannedAt ? { plannedAt } : {}),
    ...(confirmation ? { confirmation } : {}),
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("El plan JSON debe ser un objeto.");
  return value as Record<string, unknown>;
}

function reviveBest(value: unknown, label: string) {
  if (value === null) return null;
  const raw = jsonRecord(value);
  if (typeof raw.achievedAt !== "string" || typeof raw.createdAt !== "string" || typeof raw.updatedAt !== "string") {
    throw new Error(`${label} no contiene fechas canonicas.`);
  }
  return {
    ...raw,
    achievedAt: parseDate(raw.achievedAt, `${label}.achievedAt`),
    createdAt: parseDate(raw.createdAt, `${label}.createdAt`),
    updatedAt: parseDate(raw.updatedAt, `${label}.updatedAt`),
  } as unknown as HistoricalOwnWeeklyPlan["periods"][number]["currentBest"];
}

function revivePlan(value: unknown): HistoricalOwnWeeklyPlan {
  const raw = jsonRecord(value);
  if (!Array.isArray(raw.sessionIds) || !Array.isArray(raw.entries) || !Array.isArray(raw.periods)) {
    throw new Error("El artefacto no contiene un plan historico completo.");
  }
  if (typeof raw.plannedAt !== "string" || typeof raw.planHash !== "string") throw new Error("El plan no contiene plannedAt/planHash.");
  const entries = raw.entries.map((entry, index) => {
    const item = jsonRecord(entry);
    if (typeof item.achievedAt !== "string") throw new Error(`entries[${index}].achievedAt no es canonico.`);
    return { ...item, achievedAt: parseDate(item.achievedAt, `entries[${index}].achievedAt`) };
  }) as unknown as HistoricalOwnWeeklyPlan["entries"];
  const periods = raw.periods.map((period, index) => {
    const item = jsonRecord(period);
    const state = jsonRecord(item.state);
    if (typeof state.createdAt !== "string" || typeof state.updatedAt !== "string") {
      throw new Error(`periods[${index}].state no contiene fechas canonicas.`);
    }
    return {
      ...item,
      state: {
        ...state,
        createdAt: parseDate(state.createdAt, `periods[${index}].state.createdAt`),
        updatedAt: parseDate(state.updatedAt, `periods[${index}].state.updatedAt`),
      },
      currentBest: reviveBest(item.currentBest, `periods[${index}].currentBest`),
      desiredBest: reviveBest(item.desiredBest, `periods[${index}].desiredBest`),
    };
  }) as unknown as HistoricalOwnWeeklyPlan["periods"];
  const plan = {
    ...raw,
    plannedAt: parseDate(raw.plannedAt, "plannedAt"),
    entries,
    periods,
  } as HistoricalOwnWeeklyPlan;
  validHexHash(plan.planHash);
  return plan;
}

async function readPlanFile(filePath: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error("No se pudo leer el artefacto de plan JSON.");
  }
  const artifact = jsonRecord(parsed);
  return revivePlan(artifact.plan ?? artifact);
}

async function readPlanInSnapshot(client: MongoClient, db: Db, input: HistoricalOwnWeeklyReprojectionInput) {
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        await assertEconomySchema(db, HISTORICAL_OWN_WEEKLY_DATABASE, session);
        return readHistoricalOwnWeeklyReprojectionPlan(db, input, session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: ReadPreference.primary,
      },
    );
  } finally {
    await session.endSession();
  }
}

function planSummary(plan: HistoricalOwnWeeklyPlan) {
  return {
    sessionCount: plan.sessionIds.length,
    periodCount: plan.periods.length,
    periods: plan.periods.map((period) => ({
      periodId: period.periodId,
      action: period.action,
      candidateSessionIds: period.entries,
      scoreRaw: period.desiredBest?.scoreRaw ?? null,
    })),
    expectedWrites: {
      periodStateFences: plan.periods.filter((period) => period.action !== "covered_by_existing").length,
      bestsInserted: plan.periods.filter((period) => period.action === "insert").length,
      bestsReplaced: plan.periods.filter((period) => period.action === "replace").length,
    },
    untouched: [
      "game_economy_sessions",
      "treasure_hunt_economy_runs",
      "competition_credit_reservations",
      "cukie_pool_assignments",
      "game_owned_cukie_assignments",
      "reward_weekly_game_sources",
      "reward_period_seals",
      "weekly_ranking_manifests",
      "weekly_ranking_runs",
      "weekly_ranking_period_states",
      "weekly_ranking_audit_events",
      "game_weekly_rankings",
      "reward_weekly_prize_accounting",
      "reward_source_manifests",
      "reward_allocations",
      "reward_pool_accruals",
    ],
  } as const;
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[mongo-uri-redacted]");
}

async function applyPlan(client: MongoClient, db: Db, plan: HistoricalOwnWeeklyPlan) {
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        await assertEconomySchema(db, HISTORICAL_OWN_WEEKLY_DATABASE, session);
        return applyHistoricalOwnWeeklyReprojection(db, session, plan);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: ReadPreference.primary,
      },
    );
  } finally {
    await session.endSession();
  }
}

export async function main(argv = process.argv.slice(2), environment: Environment = process.env) {
  const args = parseHistoricalOwnWeeklyReprojectionArgs(argv);
  const guard = validateHistoricalOwnWeeklyEnvironment(environment);
  const walletNormalized = args.walletNormalized;
  const sessionIds = [...args.sessionIds].sort();
  const client = new MongoClient(guard.mongoUrl);
  try {
    await client.connect();
    const db = client.db(guard.databaseName);
    if (args.mode === "plan") {
      const plan = await readPlanInSnapshot(client, db, {
        walletNormalized,
        sessionIds,
        now: args.plannedAt ?? new Date(),
      });
      const artifact: PlanArtifact = {
        event: "historical_own_weekly_reprojection",
        mode: "plan",
        plan,
        summary: planSummary(plan),
      };
      process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
      return artifact;
    }

    const plan = await readPlanFile(args.planFile!);
    if (args.planHash !== plan.planHash) throw new Error("--plan-hash no coincide con el artefacto.");
    if (plan.walletNormalized !== walletNormalized) throw new Error("La wallet del plan no coincide con --wallet.");
    if (JSON.stringify([...plan.sessionIds].sort()) !== JSON.stringify(sessionIds)) {
      throw new Error("Las sesiones del plan no coinciden con los cinco --session-id explicitos.");
    }
    if (args.plannedAt && args.plannedAt.getTime() !== plan.plannedAt.getTime()) {
      throw new Error("--planned-at no coincide con el plannedAt revisado.");
    }
    if (historicalOwnWeeklyReprojectionPlanHash(plan) !== plan.planHash) {
      throw new Error("El payload del plan no corresponde a su hash revisado.");
    }
    const result = await applyPlan(client, db, plan);
    const artifact = {
      event: "historical_own_weekly_reprojection",
      mode: "apply" as const,
      planHash: plan.planHash,
      scope: { walletNormalized, sessionIds },
      result,
      untouched: planSummary(plan).untouched,
    };
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return artifact;
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${safeMessage(error)}\n`);
    process.exitCode = 1;
  });
}
