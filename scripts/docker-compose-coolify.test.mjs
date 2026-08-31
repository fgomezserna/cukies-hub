import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
];

const resourceScopedDappAlias = 'dapp-${COOLIFY_RESOURCE_UUID:?Coolify must expose the resource UUID}';
const internalResourceDappUrl = 'http://dapp-${COOLIFY_RESOURCE_UUID}:3000';

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

for (const serviceName of guardedWorkers.filter((name) => name.endsWith('-scheduler'))) {
  test(`${serviceName} only calls its resource-scoped dapp alias`, () => {
    const definition = serviceDefinition(serviceName);

    assert.ok(definition.includes(internalResourceDappUrl));
    assert.doesNotMatch(definition, /http:\/\/dapp:3000/);
    assert.match(definition, /b\?\.coolify\?\.resourceUuid===process\.env\.COOLIFY_RESOURCE_UUID/);
  });
}
