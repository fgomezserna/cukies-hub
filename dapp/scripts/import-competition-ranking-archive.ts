#!/usr/bin/env tsx

import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MongoClient } from 'mongodb';

import { prepareCompetitionRankingArchiveImport } from '../src/lib/treasure-hunt-competition/archive';
import { MongoCompetitionRankingArchiveRepository } from '../src/lib/treasure-hunt-competition/server/archive-repository';

const STAGING_DATABASE = 'cukieshub-new-staging';
const APPLY_CONFIRMATION = 'IMPORT_COMPETITION_RANKING_ARCHIVE_STAGING';

function argumentValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArguments(argv: readonly string[]) {
  const file = argumentValue(argv, '--file');
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run');
  if (!file) throw new Error('--file is required');
  if (apply === dryRun) throw new Error('Use exactly one of --dry-run or --apply');
  if (apply && argumentValue(argv, '--confirm') !== APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm ${APPLY_CONFIRMATION}`);
  }
  return { file: resolve(file), apply };
}

function requireStagingEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment.APP_ENV !== 'staging' || environment.STAGING_ONLY_GUARD !== 'true') {
    throw new Error('Apply is staging-only and requires APP_ENV=staging and STAGING_ONLY_GUARD=true');
  }
  if (environment.CHAIN_INDEXER_DB_NAME !== STAGING_DATABASE) {
    throw new Error(`CHAIN_INDEXER_DB_NAME must equal ${STAGING_DATABASE}`);
  }
  const mongoUrl = environment.CHAIN_INDEXER_MONGO_URL?.trim();
  if (!mongoUrl) throw new Error('CHAIN_INDEXER_MONGO_URL is required for apply');
  const parsed = new URL(mongoUrl);
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('CHAIN_INDEXER_MONGO_URL must be a MongoDB URL');
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (urlDatabase !== STAGING_DATABASE) {
    throw new Error(`CHAIN_INDEXER_MONGO_URL must explicitly target ${STAGING_DATABASE}`);
  }
  return mongoUrl;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const rawFile = await readFile(options.file, 'utf8');
  let input: unknown;
  try {
    input = JSON.parse(rawFile);
  } catch {
    throw new Error('Archive file is not valid JSON');
  }
  const archive = prepareCompetitionRankingArchiveImport(input, {
    requireDeclaredHashes: options.apply,
  });

  if (!options.apply) {
    console.log(JSON.stringify({
      valid: true,
      campaignId: archive.manifest.campaignId,
      rulesVersion: archive.manifest.rulesVersion,
      stage: archive.manifest.stage,
      totalRankedEntries: archive.manifest.totalRankedEntries,
      inputHash: archive.manifest.inputHash,
      outputHash: archive.manifest.outputHash,
    }, null, 2));
    return;
  }

  const mongoUrl = requireStagingEnvironment(process.env);
  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    const db = client.db(STAGING_DATABASE);
    const repository = new MongoCompetitionRankingArchiveRepository(async () => db);
    const result = await repository.writeSnapshot(archive);
    console.log(JSON.stringify({
      success: true,
      created: result.created,
      campaignId: result.manifest.campaignId,
      rulesVersion: result.manifest.rulesVersion,
      stage: result.manifest.stage,
      publicationStatus: result.manifest.publicationStatus,
      totalRankedEntries: result.manifest.totalRankedEntries,
      outputHash: result.manifest.outputHash,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const message = (error instanceof Error ? error.message : 'Unknown archive import error')
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[REDACTED_MONGODB_URL]');
  console.error(`Competition ranking archive import failed: ${message}`);
  process.exitCode = 1;
});
