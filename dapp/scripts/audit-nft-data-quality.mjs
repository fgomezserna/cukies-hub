import { MongoClient } from 'mongodb';

const REQUIRED_ENV = 'CUKIES_DATABASE_URL';
const DEFAULT_DB = 'cukies';
const DEFAULT_LIMIT = 200;
const CANDIDATE_COLLECTIONS = ['cukies', 'originals', 'tx_nfts', 'txMarketplace', 'wallets'];

const FIELD_CANDIDATES = {
  network: ['network', 'chain', 'blockchain'],
  contract: ['contract', 'contractAddress', 'address', 'collectionAddress'],
  tokenId: ['tokenId', 'token_id', 'nftId', 'id'],
  owner: ['owner', 'ownerWallet', 'wallet', 'walletAddress', 'address'],
  rarity: ['rarity', 'rank', 'tier'],
  generation: ['generation', 'gen', 'collectionType'],
  metadata: ['metadata', 'attributes', 'traits'],
  listingStatus: ['listingStatus', 'listed', 'isListed', 'status'],
  bridgeStatus: ['bridgeStatus', 'bridge', 'bridging'],
};

function parseArgs(argv) {
  const args = {
    dbName: process.env.CUKIES_DATABASE_NAME || DEFAULT_DB,
    limit: Number(process.env.NFT_AUDIT_LIMIT || DEFAULT_LIMIT),
    collections: CANDIDATE_COLLECTIONS,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      args.help = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--db') {
      args.dbName = argv[index + 1];
      index += 1;
    } else if (arg === '--limit') {
      args.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--collections') {
      args.collections = argv[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    args.limit = DEFAULT_LIMIT;
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  CUKIES_DATABASE_URL=<mongodb-uri> pnpm --dir dapp node scripts/audit-nft-data-quality.mjs [options]

Options:
  --db <name>                  Database name. Defaults to CUKIES_DATABASE_NAME or ${DEFAULT_DB}.
  --limit <number>             Max sampled documents per collection. Defaults to ${DEFAULT_LIMIT}.
  --collections <a,b,c>        Comma-separated collection list.
  --json                       Print machine-readable JSON.

The script prints aggregate field coverage only. It does not print wallets, token metadata, full documents, or connection strings.`);
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, value);
}

function firstPresent(doc, candidates) {
  for (const field of candidates) {
    const direct = readPath(doc, field);
    if (direct !== undefined && direct !== null && direct !== '') {
      return { field, value: direct };
    }
  }

  for (const [key, value] of Object.entries(doc)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const field of candidates) {
        const nested = readPath(value, field);
        if (nested !== undefined && nested !== null && nested !== '') {
          return { field: `${key}.${field}`, value: nested };
        }
      }
    }
  }

  return null;
}

function detectNetwork(doc) {
  const networkCandidate = firstPresent(doc, FIELD_CANDIDATES.network);
  const ownerCandidate = firstPresent(doc, FIELD_CANDIDATES.owner);
  const contractCandidate = firstPresent(doc, FIELD_CANDIDATES.contract);
  const values = [networkCandidate?.value, ownerCandidate?.value, contractCandidate?.value]
    .filter((value) => typeof value === 'string')
    .map((value) => value.toLowerCase());

  if (values.some((value) => value.includes('bsc') || value.includes('bnb') || value.startsWith('0x'))) {
    return 'bsc';
  }
  if (values.some((value) => value.includes('tron') || value.startsWith('t'))) {
    return 'tron';
  }
  return 'unknown';
}

function summarizeCollection(collectionName, docs, totalCount) {
  const summary = {
    collection: collectionName,
    totalCount,
    sampledCount: docs.length,
    networks: { bsc: 0, tron: 0, unknown: 0 },
    fields: {},
    issues: [],
  };

  for (const normalizedField of Object.keys(FIELD_CANDIDATES)) {
    summary.fields[normalizedField] = {
      present: 0,
      missing: 0,
      sourceFields: {},
    };
  }

  for (const doc of docs) {
    const network = detectNetwork(doc);
    summary.networks[network] += 1;

    for (const [normalizedField, candidates] of Object.entries(FIELD_CANDIDATES)) {
      const found = firstPresent(doc, candidates);
      if (found) {
        summary.fields[normalizedField].present += 1;
        summary.fields[normalizedField].sourceFields[found.field] =
          (summary.fields[normalizedField].sourceFields[found.field] || 0) + 1;
      } else {
        summary.fields[normalizedField].missing += 1;
      }
    }
  }

  for (const [field, stats] of Object.entries(summary.fields)) {
    if (docs.length > 0 && stats.present === 0) {
      summary.issues.push(`missing_all:${field}`);
    } else if (docs.length > 0 && stats.missing > 0) {
      summary.issues.push(`missing_partial:${field}:${stats.missing}/${docs.length}`);
    }
  }

  if (summary.networks.unknown > 0) {
    summary.issues.push(`unknown_network:${summary.networks.unknown}/${docs.length}`);
  }

  return summary;
}

function printTextReport(report) {
  console.log(`# NFT data quality audit`);
  console.log(`Database: ${report.dbName}`);
  console.log(`Sample limit: ${report.limit}`);
  console.log(`Generated at: ${report.generatedAt}`);
  console.log('');

  for (const collection of report.collections) {
    console.log(`## ${collection.collection}`);
    console.log(`Total documents: ${collection.totalCount}`);
    console.log(`Sampled documents: ${collection.sampledCount}`);
    console.log(`Networks: BSC ${collection.networks.bsc}, Tron ${collection.networks.tron}, unknown ${collection.networks.unknown}`);
    console.log('');
    console.log('| Field | Present | Missing | Source fields |');
    console.log('| --- | ---: | ---: | --- |');
    for (const [field, stats] of Object.entries(collection.fields)) {
      const sources = Object.entries(stats.sourceFields)
        .map(([name, count]) => `${name} (${count})`)
        .join(', ') || '-';
      console.log(`| ${field} | ${stats.present} | ${stats.missing} | ${sources} |`);
    }
    console.log('');
    console.log(`Issues: ${collection.issues.length ? collection.issues.join(', ') : 'none'}`);
    console.log('');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const url = process.env[REQUIRED_ENV];
  if (!url) {
    throw new Error(`${REQUIRED_ENV} is required. Refusing to use hardcoded database URLs.`);
  }

  const client = new MongoClient(url);
  await client.connect();

  try {
    const db = client.db(args.dbName);
    const collections = [];

    for (const collectionName of args.collections) {
      const collection = db.collection(collectionName);
      const totalCount = await collection.countDocuments();
      const docs = await collection.find({}, { limit: args.limit }).toArray();
      collections.push(summarizeCollection(collectionName, docs, totalCount));
    }

    const report = {
      generatedAt: new Date().toISOString(),
      dbName: args.dbName,
      limit: args.limit,
      collections,
    };

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Audit failed: ${error.message}`);
  process.exitCode = 1;
});
