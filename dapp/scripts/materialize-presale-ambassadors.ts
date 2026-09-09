import path from "node:path";

import dotenv from "dotenv";
import { MongoClient } from "mongodb";

import { materializeLockedPresaleAmbassadorAttributions } from "../src/lib/uki-economy/ambassadors/repository";
import { AMBASSADOR_ECONOMY_INDEX_DEFINITIONS } from "../src/lib/uki-economy/ambassadors/index-definitions";
import { assertAmbassadorRuntime } from "../src/lib/uki-economy/ambassadors/rules";

for (const filename of [".env", ".env.local"]) {
  dotenv.config({ path: path.resolve(process.cwd(), filename), override: false });
}

async function main() {
  const confirmation = "MATERIALIZE_LOCKED_PRESALE_AMBASSADORS";
  const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
  if (flags.some((arg) => !["--apply", "--plan"].includes(arg)) || flags.includes("--apply") && flags.includes("--plan")) {
    throw new Error("Usa --plan o --apply, no ambos.");
  }
  const apply = flags.includes("--apply");
  const plan = !apply;
  if (apply && process.env.AMBASSADOR_PRESALE_MIGRATION_CONFIRM !== confirmation) {
    throw new Error(`Falta AMBASSADOR_PRESALE_MIGRATION_CONFIRM=${confirmation}.`);
  }

  const runtime = assertAmbassadorRuntime(process.env);
  const mongoUrl = process.env.CHAIN_INDEXER_MONGO_URL ?? process.env.DATABASE_URL;
  const databaseName = process.env.CHAIN_INDEXER_DB_NAME?.trim();
  if (!mongoUrl || !databaseName) {
    throw new Error("Faltan CHAIN_INDEXER_MONGO_URL/DATABASE_URL o CHAIN_INDEXER_DB_NAME.");
  }

  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const db = client.db(databaseName);
    if (apply) for (const definition of AMBASSADOR_ECONOMY_INDEX_DEFINITIONS) {
      await db.collection(definition.collection).createIndex(
        { ...definition.keys },
        { ...definition.options },
      );
    }
    const session = apply ? client.startSession() : undefined;
    let result: Awaited<ReturnType<typeof materializeLockedPresaleAmbassadorAttributions>> | undefined;
    if (session) {
      try {
        result = await session.withTransaction(async () =>
          materializeLockedPresaleAmbassadorAttributions(db, { session }),
        );
      } finally {
        await session.endSession();
      }
    } else result = await materializeLockedPresaleAmbassadorAttributions(db, { dryRun: true });
    if (!result) throw new Error("La transaccion de migracion no devolvio resultado.");
    console.log(JSON.stringify({
      event: "presale_ambassadors_materialized",
      mode: plan ? "plan" : "apply",
      environment: runtime.environment,
      chainId: runtime.chainId,
      databaseName,
      ...result,
    }));
  } finally {
    await client.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "La migracion de embajadores ha fallado.");
  process.exitCode = 1;
});
