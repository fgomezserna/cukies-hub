import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compose = await readFile(
  new URL('../docker-compose.coolify.yml', import.meta.url),
  'utf8',
);

const guardedWorkers = [
  'chain-indexer',
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

test('dapp keeps Ambassadors hidden unless Coolify enables it at build time', () => {
  const definition = serviceDefinition('dapp');

  assert.match(
    definition,
    /        NEXT_PUBLIC_AMBASSADORS_VISIBLE: \$\{NEXT_PUBLIC_AMBASSADORS_VISIBLE:-false\}/,
  );
  assert.match(
    definition,
    /      NEXT_PUBLIC_AMBASSADORS_VISIBLE: \$\{NEXT_PUBLIC_AMBASSADORS_VISIBLE:-false\}/,
  );
});

test('bridge relayer is opt-in, mainnet-only and fail-closed when incomplete', () => {
  const definition = serviceDefinition('cukies-bridge-relayer');

  assert.match(definition, /    profiles:\n      - bridge-relayer\n/);
  assert.match(definition, /      CUKIES_SERVICE: cukies-bridge-relayer/);
  assert.match(definition, /      CUKIES_BRIDGE_RELAYER_ENABLED: \$\{CUKIES_BRIDGE_RELAYER_ENABLED:-false\}/);
  assert.match(definition, /      CUKIES_BRIDGE_RELAYER_TRON_NETWORK: \$\{CUKIES_BRIDGE_RELAYER_TRON_NETWORK:-mainnet\}/);
  assert.match(definition, /      CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: \$\{CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID:-56\}/);
  assert.match(definition, /      CUKIES_BRIDGE_RELAYER_BSC_CONFIRMATIONS: \$\{CUKIES_BRIDGE_RELAYER_BSC_CONFIRMATIONS:-12\}/);
  assert.match(definition, /      CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY: \$\{CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY:-\}/);
  assert.match(definition, /      CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: \$\{CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM:-\}/);
});

for (const serviceName of guardedWorkers.filter((name) => name.endsWith('-scheduler'))) {
  test(`${serviceName} only calls its resource-scoped dapp alias`, () => {
    const definition = serviceDefinition(serviceName);

    assert.ok(definition.includes(internalResourceDappUrl));
    assert.doesNotMatch(definition, /http:\/\/dapp:3000/);
    assert.match(definition, /b\?\.coolify\?\.resourceUuid===process\.env\.COOLIFY_RESOURCE_UUID/);
  });
}
