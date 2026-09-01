import path from "node:path";

import dotenv from "dotenv";
import { MongoClient } from "mongodb";

import { materializeLockedPresaleAmbassadorAttributions } from "../src/lib/uki-economy/ambassadors/repository";
import { assertAmbassadorRuntime } from "../src/lib/uki-economy/ambassadors/rules";

for (const filename of [".env", ".env.local"]) {
  dotenv.config({ path: path.resolve(process.cwd(), filename), override: false });
}

const confirmation = "MATERIALIZE_LOCKED_PRESALE_AMBASSADORS";
if (process.env.AMBASSADOR_PRESALE_MIGRATION_CONFIRM !== confirmation) {
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
  const result = await materializeLockedPresaleAmbassadorAttributions(
    client.db(databaseName),
  );
  console.log(JSON.stringify({
    event: "presale_ambassadors_materialized",
    environment: runtime.environment,
    chainId: runtime.chainId,
    databaseName,
    ...result,
  }));
} finally {
  await client.close();
}
