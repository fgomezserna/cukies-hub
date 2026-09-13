import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COLLECTION_MANIFEST,
  LEGACY_CONTRACTS,
  REPLICA_SCHEMA,
  TARGETS,
  assertDatabaseTarget,
  assertNoSensitiveKeys,
  deriveIdentity,
  functionalFingerprint,
  readChainCutoffs,
  run,
  sanitizeDocument,
} from './legacy-staging-replica.mjs';

test('la allowlist incluye los dominios legacy funcionales y excluye auth', () => {
  const sources = new Set(COLLECTION_MANIFEST.map((entry) => entry.source));
  for (const source of [
    'cukies',
    'originals',
    'tx_nfts',
    'points',
    'tx_points',
    'txMarketplace',
    'txLottery',
    'processedEvents',
    'completedEvents',
    'blockTimestamps',
  ]) assert.equal(sources.has(source), true, source);
  for (const source of ['users', 'wallets', 'referrals', 'blacklistedtokens']) {
    assert.equal(sources.has(source), false, source);
  }
});

test('sanitiza Cukie conservando metadata, estado, ownership y relaciones', () => {
  const document = sanitizeDocument('cukies', {
    _id: '100000000001',
    network: 'BSC',
    collectionAddress: LEGACY_CONTRACTS.BSC.TOKEN,
    user: '0xAbC',
    owner: '0xAbC',
    state: 'onSale',
    price: 1,
    priceOriginal: '1000000000000000000',
    skills: { generation: 1, miner: 2, secret: 'drop-me' },
    parents: [{ _id: '1', network: 'BSC', owner: '0x1', password: 'drop-me' }],
    children: ['2'],
    history: ['tx-1'],
    password: 'drop-me',
    email: 'drop-me@example.test',
  });

  assert.deepEqual(document.skills, { generation: 1, miner: 2 });
  assert.deepEqual(document.parents, [{ _id: '1', network: 'BSC' }]);
  assert.equal(document.password, undefined);
  assert.equal(document.email, undefined);
  assertNoSensitiveKeys(document);
});

test('sanitiza processedEvents como snapshot y no como log verificado', () => {
  const entry = COLLECTION_MANIFEST.find((candidate) => candidate.source === 'processedEvents');
  const document = sanitizeDocument('processedEvents', {
    _id: '0xtx_1',
    contractAddress: LEGACY_CONTRACTS.BSC.MARKETPLACE,
    eventName: 'TokenOnSale',
    network: 'BSC',
    transactionId: '0xtx',
    blockNumber: 123,
    data: {
      tokenId: '7',
      owner: '0xabc',
      price: '100',
      apiKey: 'drop-me',
    },
    authorization: 'drop-me',
  });
  const identity = deriveIdentity(entry, document);
  assert.equal(identity.valid, true);
  assert.equal(document.data.apiKey, undefined);
  assert.equal(document.authorization, undefined);
  assert.equal(entry.verifiedOnChain, false);
  assert.equal(entry.projection, 'legacy-snapshot-events');
});

test('la identidad NFT incluye red, colección canónica y tokenId', () => {
  const entry = COLLECTION_MANIFEST.find((candidate) => candidate.source === 'cukies');
  const bsc = deriveIdentity(entry, {
    _id: '42',
    network: 'BSC',
    collectionAddress: LEGACY_CONTRACTS.BSC.TOKEN,
  });
  const tron = deriveIdentity(entry, {
    _id: '42',
    network: 'TRON',
    collectionAddress: LEGACY_CONTRACTS.TRON.TOKEN,
  });
  const wrong = deriveIdentity(entry, {
    _id: '42',
    network: 'BSC',
    collectionAddress: LEGACY_CONTRACTS.BSC.MARKETPLACE,
  });

  assert.equal(bsc.key, `BSC:56:${LEGACY_CONTRACTS.BSC.TOKEN.toLowerCase()}:42`);
  assert.equal(tron.key, `TRON:mainnet:${LEGACY_CONTRACTS.TRON.TOKEN}:42`);
  assert.equal(bsc.valid, true);
  assert.equal(tron.valid, true);
  assert.equal(wrong.valid, false);
});

test('las identidades de puntos y eventos auxiliares no colisionan entre wallets/bloques', () => {
  const pointsEntry = COLLECTION_MANIFEST.find((candidate) => candidate.source === 'points');
  const pointsA = deriveIdentity(pointsEntry, {
    _id: 'p-1',
    network: 'BSC',
    address: '0xAAA',
    txID: '0xtx',
    type: 'Mint',
  });
  const pointsB = deriveIdentity(pointsEntry, {
    _id: 'p-1',
    network: 'BSC',
    address: '0xBBB',
    txID: '0xtx',
    type: 'Mint',
  });
  assert.equal(pointsA.valid, true);
  assert.notEqual(pointsA.key, pointsB.key);

  const completedEntry = COLLECTION_MANIFEST.find((candidate) => candidate.source === 'completedEvents');
  const completed = deriveIdentity(completedEntry, { _id: 'completion-1', eventId: 'event-1' });
  assert.equal(completed.valid, true);
  assert.match(completed.key, /COMPLETED:event-1:completion-1/);

  const blockEntry = COLLECTION_MANIFEST.find((candidate) => candidate.source === 'blockTimestamps');
  const block = deriveIdentity(blockEntry, { _id: 'block-doc', network: 'TRON', blockNumber: 700 });
  assert.equal(block.valid, true);
  assert.match(block.key, /^TRON:mainnet:700:block-doc$/);
});

test('rechaza destinos no staging y bases compartidas', () => {
  assert.equal(
    assertDatabaseTarget('mongodb://mongo.example.test:27017/cukies-legacy-staging', 'target', TARGETS.legacy.databaseName),
    TARGETS.legacy.databaseName,
  );
  assert.throws(
    () => assertDatabaseTarget('mongodb://mongo.example.test:27017/cukies', 'target', TARGETS.legacy.databaseName),
    /debe apuntar a cukies-legacy-staging/,
  );
});

test('los cortes BSC y TRON se validan por separado y no comparten bloque', () => {
  const cutoffs = readChainCutoffs({
    LEGACY_REPLICA_BSC_SAFE_BLOCK: '120000000',
    LEGACY_REPLICA_BSC_SAFE_BLOCK_HASH: `0x${'1'.repeat(64)}`,
    LEGACY_REPLICA_BSC_CONFIRMATIONS: '12',
    LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK: '70000000',
    LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK_HASH: '2'.repeat(64),
  }, { required: true });
  assert.equal(cutoffs.BSC.chainId, 56);
  assert.equal(cutoffs.BSC.safeBlockNumber, 120000000);
  assert.equal(cutoffs.BSC.confirmations, 12);
  assert.equal(cutoffs.TRON.network, 'mainnet');
  assert.equal(cutoffs.TRON.solidifiedBlockNumber, 70000000);
  assert.notEqual(cutoffs.BSC.safeBlockNumber, cutoffs.TRON.solidifiedBlockNumber);
  assert.throws(
    () => readChainCutoffs({
      LEGACY_REPLICA_BSC_SAFE_BLOCK: '1',
      LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK: '2',
      LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK_HASH: '2'.repeat(64),
    }, { required: true }),
    /BSC_SAFE_BLOCK_HASH/,
  );
});

test('el plan es seco por defecto y devuelve el esquema sin tocar Mongo', async () => {
  const result = await run(['plan'], {});
  assert.equal(result.schema, REPLICA_SCHEMA);
  assert.equal(result.dryRun, true);
  assert.equal(result.noRemoteWrites, true);
  assert.equal(result.destinations.legacy.databaseName, TARGETS.legacy.databaseName);
  assert.equal(result.destinations.indexer.databaseName, TARGETS.indexer.databaseName);
});

test('el fingerprint ignora únicamente procedencia y cambia con datos funcionales', () => {
  const base = { _id: '1', network: 'TRON', state: 'available' };
  const withProvenance = { ...base, replicaProvenance: { snapshotId: 'a' } };
  assert.equal(functionalFingerprint(base), functionalFingerprint(withProvenance));
  assert.notEqual(functionalFingerprint(base), functionalFingerprint({ ...base, state: 'staking' }));
});
