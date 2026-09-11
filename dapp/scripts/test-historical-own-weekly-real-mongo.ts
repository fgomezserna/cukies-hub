#!/usr/bin/env tsx

/**
 * Smoke/integration test for the isolated ownWeeklyQA replica.
 *
 * The document fixture is deliberately shared with the Jest tests.  The
 * import is delayed and Jest globals are stubbed because this script is run
 * by tsx, while the test file also contains the unit assertions.
 */
import { MongoClient, type Db, type Document } from "mongodb";

import {
  applyHistoricalOwnWeeklyReprojection,
  HISTORICAL_OWN_WEEKLY_DATABASE,
  readHistoricalOwnWeeklyReprojectionPlan,
} from "../src/lib/uki-economy/game-economy/historical-own-weekly-reprojection";
import type { RewardPeriodState } from "../src/lib/uki-economy/rewards/types";

type FixtureBundle = {
  input: {
    walletNormalized: string;
    sessionIds: readonly string[];
    now: Date;
  };
  snapshot: { records: ReadonlyArray<{ run: { weeklyPeriodId: string } }> };
  docs: Record<string, Document[]>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function transactionOptions() {
  return {
    readConcern: { level: "snapshot" as const },
    writeConcern: { w: "majority" as const },
    readPreference: "primary" as const,
  };
}

function stubJestGlobals() {
  const noop = () => undefined;
  (noop as { skip?: typeof noop }).skip = noop;
  (globalThis as Record<string, unknown>).describe = noop;
  (globalThis as Record<string, unknown>).it = noop;
  (globalThis as Record<string, unknown>).test = noop;
  (globalThis as Record<string, unknown>).expect = noop;
  (globalThis as Record<string, unknown>).jest = {
    mock: noop,
    fn: noop,
    setTimeout: noop,
  };
}

async function loadFixtureBundle() {
  stubJestGlobals();
  const fixtureModule = await import("../__tests__/lib/historical-own-weekly-reprojection.test");
  return fixtureModule.fixtureBundle() as unknown as FixtureBundle;
}

async function clearCollections(db: Db, names: readonly string[]) {
  for (const name of names) await db.collection(name).deleteMany({});
}

async function seed(db: Db, docs: Record<string, Document[]>) {
  for (const [name, rows] of Object.entries(docs)) {
    if (rows.length > 0) await db.collection(name).insertMany(rows);
  }
}

function failingBestCollection(db: Db, calls: { value: number }) {
  const source = db.collection("treasure_hunt_weekly_bests");
  return {
    find: (filter: object, options?: object) => source.find(filter, options),
    findOne: (filter: object, options?: object) => source.findOne(filter, options),
    insertOne: async (document: Document, options?: object) => {
      calls.value += 1;
      if (calls.value === 2) throw new Error("forced-seal-race");
      return source.insertOne(document, options);
    },
    replaceOne: (filter: object, replacement: Document, options?: object) => source.replaceOne(filter, replacement, options),
  };
}

function dbWithFailure(db: Db, calls: { value: number }) {
  const bests = failingBestCollection(db, calls);
  return {
    databaseName: db.databaseName,
    collection<T extends Document>(name: string) {
      if (name === "treasure_hunt_weekly_bests") return bests;
      return db.collection<T>(name);
    },
  } as unknown as Db;
}

export async function main() {
  const uri = process.env.HISTORICAL_OWN_WEEKLY_MONGO_URI;
  assert(typeof uri === "string" && uri.length > 0, "Falta HISTORICAL_OWN_WEEKLY_MONGO_URI explícita.");
  assert(/^mongodb:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/[^?#]+(?:\?[^#]*)?$/.test(uri), "La prueba solo admite una URI Mongo local.");
  const parsedUri = new URL(uri);
  assert(parsedUri.pathname === `/${HISTORICAL_OWN_WEEKLY_DATABASE}`, `Base URI inesperada: ${parsedUri.pathname}`);
  assert(parsedUri.searchParams.get("replicaSet") === "ownWeeklyQA", "La URI debe usar replicaSet=ownWeeklyQA.");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  let cleanupAllowed = false;
  let names: string[] = [];
  try {
    assert(db.databaseName === HISTORICAL_OWN_WEEKLY_DATABASE, `Base inesperada: ${db.databaseName}`);
    const hello = await db.admin().command({ hello: 1 });
    assert((hello as { setName?: string }).setName === "ownWeeklyQA", "La replica Mongo no es ownWeeklyQA.");
    const bundle = await loadFixtureBundle();
    names = Object.keys(bundle.docs);
    cleanupAllowed = true;
    await clearCollections(db, names);

    await seed(db, bundle.docs);
    const sourceBefore = await db.collection("reward_weekly_game_sources").find({}).toArray();
    const plan = await readHistoricalOwnWeeklyReprojectionPlan(db, bundle.input);
    const applySession = client.startSession();
    let applied: Awaited<ReturnType<typeof applyHistoricalOwnWeeklyReprojection>>;
    try {
      applied = await applySession.withTransaction(
        async () => applyHistoricalOwnWeeklyReprojection(db, applySession, plan),
        transactionOptions(),
      );
    } finally {
      await applySession.endSession();
    }
    assert(applied.status === "applied" && applied.periodsFenced === 2 && applied.bestsInserted === 2, "El apply real no insertó los dos mejores.");
    const sourceAfterApply = await db.collection("reward_weekly_game_sources").find({}).toArray();
    assert(JSON.stringify(sourceAfterApply) === JSON.stringify(sourceBefore), "El apply alteró sources históricos.");

    const bestCountAfterApply = await db.collection("treasure_hunt_weekly_bests").countDocuments({});
    const stateAfterApply = await db.collection<RewardPeriodState>("reward_period_states").find({}).toArray();
    const replaySession = client.startSession();
    let replayed: Awaited<ReturnType<typeof applyHistoricalOwnWeeklyReprojection>>;
    try {
      replayed = await replaySession.withTransaction(
        async () => applyHistoricalOwnWeeklyReprojection(db, replaySession, plan),
        transactionOptions(),
      );
    } finally {
      await replaySession.endSession();
    }
    assert(replayed.status === "replayed" && replayed.periodsFenced === 0 && replayed.bestsInserted === 0 && replayed.bestsReplaced === 0, "El replay real no fue idempotente.");
    assert(await db.collection("treasure_hunt_weekly_bests").countDocuments({}) === bestCountAfterApply, "El replay real escribió un best adicional.");
    assert(JSON.stringify(await db.collection<RewardPeriodState>("reward_period_states").find({}).toArray()) === JSON.stringify(stateAfterApply), "El replay real cambió period states.");
    assert(JSON.stringify(await db.collection("reward_weekly_game_sources").find({}).toArray()) === JSON.stringify(sourceBefore), "El replay real cambió sources.");

    await clearCollections(db, names);
    await seed(db, bundle.docs);
    const racePlan = await readHistoricalOwnWeeklyReprojectionPlan(db, bundle.input);
    const racedPeriodId = bundle.snapshot.records[0].run.weeklyPeriodId;
    await db.collection<RewardPeriodState>("reward_period_states").updateOne(
      { _id: racedPeriodId },
      { $set: { status: "sealed", sealId: "race-seal" }, $inc: { revision: 1 } },
    );
    const raceSession = client.startSession();
    let raceRejected = false;
    try {
      await raceSession.withTransaction(
        async () => applyHistoricalOwnWeeklyReprojection(db, raceSession, racePlan),
        transactionOptions(),
      );
    } catch (error) {
      raceRejected = /abierto|incoherente|periodo|revisado|hash/i.test(String(error));
    } finally {
      await raceSession.endSession();
    }
    assert(raceRejected, "La carrera con seal no fue rechazada.");
    assert(await db.collection("treasure_hunt_weekly_bests").countDocuments({}) === 0, "La carrera con seal dejó bests parciales.");

    await clearCollections(db, names);
    await seed(db, bundle.docs);
    const rollbackPlan = await readHistoricalOwnWeeklyReprojectionPlan(db, bundle.input);
    const calls = { value: 0 };
    const rollbackDb = dbWithFailure(db, calls);
    const rollbackSession = client.startSession();
    let rollbackRejected = false;
    try {
      await rollbackSession.withTransaction(
        async () => applyHistoricalOwnWeeklyReprojection(rollbackDb, rollbackSession, rollbackPlan),
        transactionOptions(),
      );
    } catch (error) {
      rollbackRejected = String(error).includes("forced-seal-race");
    } finally {
      await rollbackSession.endSession();
    }
    assert(rollbackRejected, "El fallo inducido de rollback no se propagó.");
    assert(await db.collection("treasure_hunt_weekly_bests").countDocuments({}) === 0, "La transacción dejó un best parcial tras rollback.");
    const rollbackStates = await db.collection<RewardPeriodState>("reward_period_states").find({}).toArray();
    assert(rollbackStates.every((state) => state.status === "open" && state.revision === 0), "La transacción dejó un fence de periodo tras rollback.");

    return {
      databaseName: db.databaseName,
      sessions: bundle.input.sessionIds.length,
      applied,
      replayed,
      sourceUnchanged: true,
      raceRejected,
      rollbackRejected,
      noPartialWrites: true,
    };
  } finally {
    if (cleanupAllowed) await clearCollections(db, names);
    await client.close();
  }
}

if (process.argv[1]?.endsWith("test-historical-own-weekly-real-mongo.ts")) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
