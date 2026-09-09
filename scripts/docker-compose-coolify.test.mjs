import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const compose = await readFile(
  new URL('../docker-compose.coolify.yml', import.meta.url),
  'utf8',
);

const guardedWorkers = [
  'chain-indexer',
  'cukies-bridge-relayer',
  'cukie-master-scheduler',
  'competition-credit-scheduler',
  'game-economy-scheduler',
  'cukie-pool-scheduler',
  'weekly-ranking-scheduler',
  'cuki-card-worker',
  'cuki-card-worker-legacy',
];

const sharedDappRuntimeWorkers = [
  'cukie-master-scheduler',
  'competition-credit-scheduler',
  'game-economy-scheduler',
  'cukie-pool-scheduler',
  'weekly-ranking-scheduler',
  'reward-accounting-scheduler',
  'reward-batch-publisher',
];

const resourceScopedDappAlias = 'dapp-${COOLIFY_RESOURCE_UUID:?Coolify must expose the resource UUID}';
const internalResourceDappUrl = 'http://dapp-${COOLIFY_RESOURCE_UUID}:3000';

const verifiedBscIdentityAliases = [
  'TOKEN',
  'UKI_TOKEN',
  'TOKEN_V2',
  'MARKETPLACE',
  'UKI_MARKETPLACE',
  'BRIDGE',
  'BRIDGE_ENDPOINT',
  'PRESALE',
  'UKI_STAKING',
  'VESTING_VAULT',
  'REWARDS_DISTRIBUTOR',
  'CUKIE_MASTER_NFT_VAULT',
  'CUKIE_POOL_NFT_VAULT',
];

const verifiedBscIdentitySuffixes = [
  'START_BSC_BLOCK',
  'DEPLOYMENT_BSC_BLOCK',
  'DEPLOYMENT_TX_HASH',
  'RUNTIME_CODE_HASH',
];

function serviceDefinition(serviceName) {
  const startMarker = `  ${serviceName}:\n`;
  const start = compose.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${serviceName} service`);

  const remainder = compose.slice(start + startMarker.length);
  const nextService = remainder.match(/^  [a-z0-9-]+:\n/m);
  const end = nextService?.index === undefined
    ? compose.length
    : start + startMarker.length + nextService.index;

  return compose.slice(start, end);
}

for (const serviceName of guardedWorkers) {
  test(`${serviceName} receives the immutable Coolify staging identity`, () => {
    const definition = serviceDefinition(serviceName);

    assert.match(
      definition,
      /      COOLIFY_BRANCH: \$\{COOLIFY_BRANCH:\?Coolify must expose the staging branch\}/,
    );
    assert.match(
      definition,
      /      COOLIFY_RESOURCE_UUID: \$\{COOLIFY_RESOURCE_UUID:\?Coolify must expose the staging resource UUID\}/,
    );
  });
}

test('legacy card worker is opt-in, staging-only and cannot target indexed fixtures', () => {
  const definition = serviceDefinition('cuki-card-worker-legacy');

  assert.match(definition, /    profiles:\n      - legacy-card-worker/);
  assert.ok(definition.includes('CARD_WORKER_SOURCE_FORMAT: legacy'));
  assert.ok(definition.includes('CARD_WORKER_LEGACY_STAGING_ENABLED: ${CARD_WORKER_LEGACY_STAGING_ENABLED:-false}'));
  assert.ok(definition.includes('CARD_WORKER_DB_NAME: cukies-legacy-staging'));
  assert.ok(definition.includes('CARD_WORKER_MONGO_URL: ${CARD_WORKER_LEGACY_MONGO_URL:-${CUKIES_DATABASE_URL}}'));
  assert.ok(definition.includes('CARD_WORKER_S3_BUCKET: cukies-cards-staging'));
  assert.ok(definition.includes('CARD_WORKER_PUBLIC_BASE_URL: https://assets-staging.cukies.world'));
  assert.ok(definition.includes('AWS_ACCESS_KEY_ID: ${CARD_WORKER_LEGACY_S3_ACCESS_KEY_ID:-}'));
  assert.ok(definition.includes('AWS_SECRET_ACCESS_KEY: ${CARD_WORKER_LEGACY_S3_SECRET_ACCESS_KEY:-}'));
  assert.ok(definition.includes('CARD_WORKER_S3_REGION: ${CARD_WORKER_LEGACY_S3_REGION:-us-east-1}'));
  assert.doesNotMatch(definition, /CARD_WORKER_LEGACY_S3_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION):[^\n]*\?:/);
  assert.doesNotMatch(definition, /AWS_ACCESS_KEY_ID: \$\{AWS_ACCESS_KEY_ID\}/);
  assert.doesNotMatch(definition, /AWS_SECRET_ACCESS_KEY: \$\{AWS_SECRET_ACCESS_KEY\}/);
  assert.ok(definition.includes('assert-staging-only.mjs --scope cuki-card-worker'));
  assert.doesNotMatch(definition, /CARD_WORKER_SOURCE_(?:NETWORK|CHAIN_ID|COLLECTION):/);
});

test('indexed card context is forwarded without mandatory interpolation in disabled profiles', () => {
  const definition = serviceDefinition('cuki-card-worker');
  for (const key of ['CARD_WORKER_SOURCE_NETWORK', 'CARD_WORKER_SOURCE_CHAIN_ID', 'CARD_WORKER_SOURCE_COLLECTION']) {
    assert.ok(definition.includes(`${key}: \${${key}:-}`));
  }
});

test('legacy card Compose command starts the real non-executable entry script through sh', async (t) => {
  const definition = serviceDefinition('cuki-card-worker-legacy');
  const command = definition.match(/    command:\n      - sh\n      - -c\n      - ([^\n]+)/)?.[1];
  assert.ok(command);
  const scratch = await mkdtemp(join(tmpdir(), 'card-legacy-entry-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await mkdir(join(scratch, 'scripts'));
  await mkdir(join(scratch, 'bin'));
  const entry = join(scratch, 'scripts/docker-start.sh');
  await writeFile(entry, await readFile(new URL('./docker-start.sh', import.meta.url)), { mode: 0o644 });
  await chmod(entry, 0o644);
  assert.equal((await stat(entry)).mode & 0o111, 0);
  // Stub only external processes: the actual Compose command and entry script run.
  await writeFile(join(scratch, 'bin/node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(scratch, 'bin/pnpm'), '#!/bin/sh\nprintf "PNPM:%s\\n" "$*"\n', { mode: 0o755 });
  const result = spawnSync('sh', ['-c', command], {
    cwd: scratch,
    env: { PATH: `${join(scratch, 'bin')}:${process.env.PATH}`, APP_ENV: 'staging', STAGING_ONLY_GUARD: 'true', CUKIES_SERVICE: 'cuki-card-worker' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PNPM:--filter @cukies\/cuki-card-worker run setup:prod/);
  assert.match(result.stdout, /PNPM:--filter @cukies\/cuki-card-worker run start/);
});

test('chain-indexer reports health from its staging Mongo connection', () => {
  const definition = serviceDefinition('chain-indexer');

  assert.match(definition, /    healthcheck:\n/);
  assert.match(definition, /serverSelectionTimeoutMS: 5000/);
  assert.match(definition, /command\(\{ ping: 1 \}\)/);
  assert.match(definition, /      start_period: 90s/);
});

test('bridge relayer is opt-in, Nile-to-BSC-Testnet only and has no mainnet defaults', () => {
  const definition = serviceDefinition('cukies-bridge-relayer');

  assert.match(definition, /    profiles:\n      - bridge-relayer/);
  assert.ok(definition.includes('CUKIES_BRIDGE_RELAYER_ENABLED: ${CUKIES_BRIDGE_RELAYER_ENABLED:-false}'));
  assert.ok(definition.includes('CUKIES_BRIDGE_RELAYER_MONGO_URL: ${CUKIES_BRIDGE_RELAYER_MONGO_URL:-}'));
  assert.doesNotMatch(definition, /CUKIES_BRIDGE_RELAYER_MONGO_URL:.*\$\{CHAIN_INDEXER_MONGO_URL/);
  assert.ok(definition.includes('process.env.CUKIES_BRIDGE_RELAYER_MONGO_URL || process.env.CHAIN_INDEXER_MONGO_URL || process.env.DATABASE_URL'));
  assert.ok(definition.includes('CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: ${CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID:-97}'));
  assert.ok(definition.includes('CUKIES_BRIDGE_RELAYER_TRON_NETWORK: ${CUKIES_BRIDGE_RELAYER_TRON_NETWORK:-nile}'));
  assert.ok(definition.includes('CUKIES_BRIDGE_RELAYER_TRON_RPC_URL: ${CUKIES_BRIDGE_RELAYER_TRON_RPC_URL:-https://nile.trongrid.io}'));
  assert.doesNotMatch(
    definition,
    /b775ec58411F0460716CC7FA6FbbE2c38AfD2A6E|TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ|api\.trongrid\.io\/v1/i,
  );
});

test('dapp exposes a Docker alias scoped to its Coolify resource', () => {
  const definition = serviceDefinition('dapp');

  assert.ok(definition.includes(`          - ${resourceScopedDappAlias}`));
});

test('dapp keeps direct ambassador attribution closed unless Coolify enables it', () => {
  const definition = serviceDefinition('dapp');

  assert.match(
    definition,
    /      AMBASSADOR_ATTRIBUTION_WRITES_ENABLED: \$\{AMBASSADOR_ATTRIBUTION_WRITES_ENABLED:-false\}/,
  );
});

test('dapp controls Ambassadors listing through a build-time public flag', () => {
  const definition = serviceDefinition('dapp');

  assert.ok(compose.includes(
    'NEXT_PUBLIC_AMBASSADORS_VISIBLE: ${NEXT_PUBLIC_AMBASSADORS_VISIBLE:-false}',
  ));
  assert.match(
    definition,
    /      NEXT_PUBLIC_AMBASSADORS_VISIBLE: \$\{NEXT_PUBLIC_AMBASSADORS_VISIBLE:-false\}/,
  );
});

test('dapp owns the single shared runtime image build', () => {
  const definition = serviceDefinition('dapp');

  assert.ok(compose.includes('x-dapp-runtime: &dapp-runtime'));
  assert.ok(compose.includes('image: "cukies-hub-dapp-runtime-${COOLIFY_RESOURCE_UUID:-local}:latest"'));
  assert.ok(compose.includes('pull_policy: never'));
  assert.ok(definition.includes('    <<: *dapp-runtime'));
  assert.match(definition, /    build:\n/);
});

for (const serviceName of sharedDappRuntimeWorkers) {
  test(`${serviceName} reuses the dapp runtime without rebuilding Next.js`, () => {
    const definition = serviceDefinition(serviceName);

    assert.ok(definition.includes('    <<: *dapp-runtime'));
    assert.doesNotMatch(definition, /    build:\n/);
    assert.doesNotMatch(definition, /CUKIES_SERVICE: dapp/);
  });
}

test('dapp injects the public environment identity and optional liquidity links', () => {
  const definition = serviceDefinition('dapp');

  assert.ok(definition.includes('        NEXT_PUBLIC_APP_ENV: ${APP_ENV:-production}'));
  assert.ok(definition.includes('      NEXT_PUBLIC_APP_ENV: ${APP_ENV:?Set APP_ENV in Coolify environment variables}'));
  assert.ok(definition.includes('      NEXT_PUBLIC_UKI_CHAIN_ID: ${NEXT_PUBLIC_UKI_CHAIN_ID:-56}'));
  assert.ok(definition.includes('      NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: ${NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS:-}'));
  assert.ok(definition.includes('NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS: ${NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS:-}'));
  assert.ok(definition.includes('NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS: ${NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS:-}'));
  assert.ok(definition.includes('NEXT_PUBLIC_UKI_SWAP_URL: ${NEXT_PUBLIC_UKI_SWAP_URL:-}'));
  assert.ok(definition.includes('CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: ${CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS:-}'));
  assert.doesNotMatch(
    definition,
    /CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS:.*\$\{NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS/,
  );
  assert.ok(definition.includes('CHAIN_INDEXER_BSC_RPC_URLS: ${CHAIN_INDEXER_BSC_RPC_URLS:-}'));
  assert.ok(definition.includes('        NEXT_PUBLIC_CUKIES_BRIDGE_MODE: ${NEXT_PUBLIC_CUKIES_BRIDGE_MODE:-disabled}'));
  assert.ok(definition.includes('      NEXT_PUBLIC_CUKIES_BRIDGE_MODE: ${NEXT_PUBLIC_CUKIES_BRIDGE_MODE:-disabled}'));
  assert.ok(definition.includes('NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID: ${NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID:-}'));
  assert.ok(definition.includes('NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL: ${NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL:-}'));
  assert.doesNotMatch(
    definition,
    /NEXT_PUBLIC_CUKIES_BRIDGE_(?:BSC|TRON)_[A-Z_]+:.*(?:b775ec58411F0460716CC7FA6FbbE2c38AfD2A6E|TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ)/i,
  );
});

for (const serviceName of ['dapp', 'chain-indexer']) {
  test(`${serviceName} carries every verified BSC contract identity field`, () => {
    const definition = serviceDefinition(serviceName);

    for (const alias of verifiedBscIdentityAliases) {
      for (const suffix of verifiedBscIdentitySuffixes) {
        const field = `CHAIN_INDEXER_${alias}_${suffix}`;
        assert.ok(
          definition.includes(`      ${field}: \${${field}:-}`),
          `${serviceName} is missing ${field}`,
        );
      }
    }
  });
}

for (const serviceName of ['dapp', 'chain-indexer']) {
  test(`${serviceName} does not derive UKI_TOKEN identity from the public fallback`, () => {
    const definition = serviceDefinition(serviceName);

    assert.ok(definition.includes(
      'CHAIN_INDEXER_UKI_TOKEN_ADDRESS: ${CHAIN_INDEXER_UKI_TOKEN_ADDRESS:-}',
    ));
    assert.doesNotMatch(
      definition,
      /CHAIN_INDEXER_UKI_TOKEN_ADDRESS:.*\$\{NEXT_PUBLIC_UKI_TOKEN_ADDRESS/,
    );
  });
}

test('chain-indexer receives an isolated verified UKI marketplace identity', () => {
  const definition = serviceDefinition('chain-indexer');

  assert.ok(definition.includes('CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: ${CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS:-}'));
  assert.doesNotMatch(
    definition,
    /CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS:.*\$\{NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS/,
  );
  assert.ok(definition.includes('CHAIN_INDEXER_UKI_MARKETPLACE_START_BSC_BLOCK: ${CHAIN_INDEXER_UKI_MARKETPLACE_START_BSC_BLOCK:-}'));
  assert.ok(definition.includes('CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_BSC_BLOCK: ${CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_BSC_BLOCK:-}'));
  assert.ok(definition.includes('CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_TX_HASH: ${CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_TX_HASH:-}'));
  assert.ok(definition.includes('CHAIN_INDEXER_UKI_MARKETPLACE_RUNTIME_CODE_HASH: ${CHAIN_INDEXER_UKI_MARKETPLACE_RUNTIME_CODE_HASH:-}'));
});

test('legacy chain-indexer builds its own image and never inherits the dapp runtime', () => {
  const definition = serviceDefinition('legacy-chain-indexer');

  assert.doesNotMatch(definition, /<<: \*dapp-runtime/);
  assert.match(definition, /    build:\n/);
  assert.ok(definition.includes('        CUKIES_SERVICE: legacy-chain-indexer'));
  assert.ok(definition.includes('    profiles:\n      - legacy-indexer'));
});

for (const serviceName of guardedWorkers.filter((name) => name.endsWith('-scheduler'))) {
  test(`${serviceName} only calls its resource-scoped dapp alias`, () => {
    const definition = serviceDefinition(serviceName);

    assert.ok(definition.includes(internalResourceDappUrl));
    assert.doesNotMatch(definition, /http:\/\/dapp:3000/);
    assert.match(definition, /b\?\.coolify\?\.resourceUuid===process\.env\.COOLIFY_RESOURCE_UUID/);
  });
}
