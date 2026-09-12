#!/usr/bin/env node

/**
 * Replica controlada de la información funcional legacy de producción a
 * staging.
 *
 * Este script no es un refresh de Mongo. Nunca hace drop/replace/delete y el
 * modo por defecto es dry-run. La exportación lee producción dentro de una
 * transacción snapshot; la carga y la proyección escriben únicamente en las
 * bases staging indicadas por la allowlist y requieren --apply más una
 * confirmación exacta.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPLICA_SCHEMA = 'cukies.legacy-staging-replica.v1';
export const RECORD_SCHEMA = 'cukies.legacy-staging-replica-record.v1';
export const RUN_COLLECTION = '__legacy_replica_runs';
export const CONFLICT_COLLECTION = '__legacy_replica_conflicts';
export const CONFIRMATION = 'APPLY_LEGACY_STAGING_REPLICA';
export const DEFAULT_BUNDLE_DIR = '/tmp/cukies-legacy-staging-replica';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromIndexer = createRequire(path.join(repoRoot, 'packages/chain-indexer/package.json'));

export const TARGETS = Object.freeze({
  source: Object.freeze({ environment: 'production', databaseName: 'cukies' }),
  legacy: Object.freeze({ environment: 'staging', databaseName: 'cukies-legacy-staging' }),
  indexer: Object.freeze({ environment: 'staging', databaseName: 'cukieshub-new-staging' }),
});

/**
 * Addresses are public contract identities, not credentials. They are copied
 * from the canonical legacy manifest and are used only to reject a wrong
 * network/collection pair.
 */
export const LEGACY_CONTRACTS = Object.freeze({
  BSC: Object.freeze({
    chainId: 56,
    TOKEN: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    POINTS: '0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2',
    STAKING_POINTS: '0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F',
    BREEDING_POINTS: '0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A',
    MARKETPLACE: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
    BRIDGE: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
  }),
  TRON: Object.freeze({
    network: 'mainnet',
    TOKEN: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
    MINT: 'TUrjiyFSa1pq8TGZJnsTAHcgyxnnRmZjN7',
    REFERRALS: 'TZ4QM9RF1pxfoxnPY8UGAQEEwq5SDoZXk4',
    POINTS: 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA',
    STAKING_POINTS: 'TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY',
    BREEDING_POINTS: 'TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S',
    MARKETPLACE: 'TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB',
    BRIDGE: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
  }),
});

const SKILLS = Object.freeze({
  miner: true,
  engineer: true,
  farmer: true,
  gatherer: true,
  scout: true,
  breeder: true,
  life: true,
  energy: true,
  generation: true,
});

const RELATION = Object.freeze({
  _id: true,
  tokenId: true,
  cukiNumber: true,
  network: true,
  birthNetwork: true,
  state: true,
  img: true,
  type: true,
  skills: SKILLS,
});

const DESCRIPTION = Object.freeze({
  cuki: true,
  tokenId: true,
});

const EVENT_DATA = Object.freeze({
  tokenId: true,
  parent1: true,
  parent2: true,
  user: true,
  from: true,
  to: true,
  newOwner: true,
  destOwner: true,
  originOwner: true,
  points: true,
  price: true,
  result: true,
  fee: true,
  createdAt: true,
  boughtAt: true,
  newPrice: true,
  newFee: true,
  date: true,
});

const COMMON_EVENT_FIELDS = Object.freeze({
  _id: true,
  network: true,
  chain: true,
  chainId: true,
  contractAddress: true,
  eventName: true,
  transactionId: true,
  txid: true,
  txHash: true,
  timeStamp: true,
  timestampMs: true,
  date: true,
  blockNumber: true,
  logIndex: true,
  type: true,
  nftType: true,
  from: true,
  to: true,
  owner: true,
  newOwner: true,
  address: true,
  addressNormalized: true,
  points: true,
  price: true,
  priceOriginal: true,
  priceRaw: true,
  txID: true,
  txId: true,
  tokenId: true,
  data: EVENT_DATA,
  description: DESCRIPTION,
  createdAt: true,
  updatedAt: true,
});

/**
 * Functional public fields only. `users`, `wallets`, `referrals`, auth and
 * runtime config are deliberately not in this map; see the document next to
 * this script for their exclusion rationale.
 */
export const COLLECTION_MANIFEST = Object.freeze([
  Object.freeze({
    id: 'nft-inventory',
    source: 'cukies',
    target: 'cukies',
    identity: 'network + canonical TOKEN collection + tokenId (_id fallback)',
    activityFields: Object.freeze(['timeStamp', 'updatedAt']),
    projection: 'nft-metadata-state',
    projectionTarget: 'cukies',
    fields: Object.freeze({
      _id: true,
      img: true,
      type: true,
      tokenId: true,
      cukiNumber: true,
      skills: SKILLS,
      children: [RELATION],
      parents: [RELATION],
      history: [true],
      numChildren: true,
      numChildrenTron: true,
      numChildrenBsc: true,
      origin: true,
      birthNetwork: true,
      user: true,
      owner: true,
      ownerNormalized: true,
      network: true,
      chain: true,
      chainId: true,
      collectionAddress: true,
      collectionAddressNormalized: true,
      state: true,
      price: true,
      priceOriginal: true,
      priceRaw: true,
      marketplaceListingStatus: true,
      marketplaceListingChain: true,
      marketplaceListingOwnerNormalized: true,
      marketplaceListingEventId: true,
      timeStamp: true,
      timestampMs: true,
      updatedAt: true,
    }),
  }),
  Object.freeze({
    id: 'nft-original-catalog',
    source: 'originals',
    target: 'originals',
    identity: '_id',
    activityFields: Object.freeze([]),
    projection: 'nft-original-catalog',
    projectionTarget: null,
    fields: Object.freeze({ _id: true, type: true, cukiNumber: true, skills: SKILLS }),
  }),
  Object.freeze({
    id: 'nft-history',
    source: 'tx_nfts',
    target: 'tx_nfts',
    identity: 'network + transactionId/txid + tokenId + event/log identity',
    activityFields: Object.freeze(['date', 'timeStamp', 'updatedAt']),
    projection: 'nft-history',
    projectionTarget: 'tx_nfts',
    fields: COMMON_EVENT_FIELDS,
  }),
  Object.freeze({
    id: 'legacy-points-ledger',
    source: 'points',
    target: 'points',
    identity: 'network + points contract + wallet + txID/txId + _id fallback',
    activityFields: Object.freeze(['date', 'timeStamp', 'updatedAt']),
    projection: 'legacy-points',
    projectionTarget: 'point_transactions',
    fields: Object.freeze({
      _id: true,
      address: true,
      addressNormalized: true,
      points: true,
      type: true,
      date: true,
      description: DESCRIPTION,
      txID: true,
      txId: true,
      network: true,
      chain: true,
      chainId: true,
      timeStamp: true,
      timestampMs: true,
      createdAt: true,
      updatedAt: true,
    }),
  }),
  Object.freeze({
    id: 'legacy-points-ledger-compat',
    source: 'tx_points',
    target: 'tx_points',
    identity: 'network + points contract + wallet + txID/txId + _id fallback',
    activityFields: Object.freeze(['date', 'timeStamp', 'updatedAt']),
    projection: null,
    projectionTarget: null,
    fields: Object.freeze({
      _id: true,
      address: true,
      addressNormalized: true,
      points: true,
      type: true,
      date: true,
      txID: true,
      txId: true,
      network: true,
      chain: true,
      chainId: true,
      timeStamp: true,
      timestampMs: true,
      createdAt: true,
      updatedAt: true,
    }),
  }),
  Object.freeze({
    id: 'legacy-marketplace-history',
    source: 'txMarketplace',
    target: 'txMarketplace',
    identity: 'network + transactionId/txid + tokenId + type + _id fallback',
    activityFields: Object.freeze(['date', 'timeStamp', 'updatedAt']),
    projection: null,
    projectionTarget: null,
    fields: COMMON_EVENT_FIELDS,
  }),
  Object.freeze({
    id: 'legacy-lottery-history',
    source: 'txLottery',
    target: 'txLottery',
    identity: 'network + transaction/event id + _id fallback',
    activityFields: Object.freeze(['date', 'timeStamp', 'updatedAt']),
    projection: null,
    projectionTarget: null,
    fields: COMMON_EVENT_FIELDS,
  }),
  Object.freeze({
    id: 'legacy-processed-events-snapshot',
    source: 'processedEvents',
    target: 'processedEvents',
    identity: 'network + contract + transactionId + blockNumber + logIndex/event _id',
    activityFields: Object.freeze(['timeStamp', 'date', 'updatedAt']),
    projection: 'legacy-snapshot-events',
    projectionTarget: 'legacy_snapshot_events',
    verifiedOnChain: false,
    fields: Object.freeze({
      _id: true,
      contractAddress: true,
      eventName: true,
      network: true,
      transactionId: true,
      timeStamp: true,
      date: true,
      blockNumber: true,
      logIndex: true,
      data: EVENT_DATA,
      createdAt: true,
      updatedAt: true,
    }),
  }),
  Object.freeze({
    id: 'legacy-completed-events-snapshot',
    source: 'completedEvents',
    target: 'completedEvents',
    identity: 'eventId + _id',
    activityFields: Object.freeze(['timeStamp', 'updatedAt']),
    projection: null,
    projectionTarget: null,
    verifiedOnChain: false,
    fields: Object.freeze({ _id: true, eventId: true, timeStamp: true, createdAt: true, updatedAt: true }),
  }),
  Object.freeze({
    id: 'legacy-block-timestamps',
    source: 'blockTimestamps',
    target: 'blockTimestamps',
    identity: 'network + blockNumber + _id fallback',
    activityFields: Object.freeze(['timestamp', 'timeStamp', 'updatedAt']),
    projection: null,
    projectionTarget: null,
    fields: Object.freeze({
      _id: true,
      blockNumber: true,
      network: true,
      chain: true,
      chainId: true,
      timestamp: true,
      timeStamp: true,
      date: true,
      createdAt: true,
      updatedAt: true,
    }),
  }),
]);

export const EXCLUDED_COLLECTIONS = Object.freeze([
  Object.freeze({
    source: 'users',
    reason: 'auth, nombres, email, password, role y datos personales innecesarios para QA funcional',
  }),
  Object.freeze({
    source: 'wallets',
    reason: 'identidad/auth; solo se reconciliaría una wallet con prueba fresca y colisión resuelta',
  }),
  Object.freeze({
    source: 'referrals',
    reason: 'identidad/atribución; no crear relaciones ni recompensas históricas automáticamente',
  }),
  Object.freeze({
    source: 'blacklistedtokens',
    reason: 'tokens de sesión/auth; no copiar',
  }),
  Object.freeze({
    source: 'config/settings',
    reason: 'configuración runtime potencialmente sensible; seleccionar claves públicas en un lote separado',
  }),
]);

const SENSITIVE_KEY = /^(?:password|passwd|secret|privatekey|private_key|apikey|api_key|access_token|refresh_token|id_token|jwt|authorization|cookie|session|role|email|phone|blacklist|blacklistedtoken)$/i;
const MAX_ARRAY_ITEMS = 10_000;
const MAX_OBJECT_DEPTH = 10;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function scalarValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return { $date: value.toISOString() };
  if (typeof value === 'bigint') return { $numberLong: value.toString() };
  if (Buffer.isBuffer(value)) return undefined;
  if (typeof value === 'object' && value._bsontype === 'ObjectId' && typeof value.toHexString === 'function') {
    return { $oid: value.toHexString() };
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

function decodeBundleValue(value) {
  if (!isPlainObject(value)) {
    if (Array.isArray(value)) return value.map(decodeBundleValue);
    return value;
  }
  const keys = Object.keys(value);
  if (keys.length === 1 && typeof value.$date === 'string') return new Date(value.$date);
  if (keys.length === 1 && typeof value.$oid === 'string') return value.$oid;
  if (keys.length === 1 && typeof value.$numberLong === 'string') return value.$numberLong;
  return Object.fromEntries(keys.map((key) => [key, decodeBundleValue(value[key])]));
}

function projectWithSpec(value, spec, depth = 0) {
  if (depth > MAX_OBJECT_DEPTH) return undefined;
  if (spec === true) return scalarValue(value);
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) return undefined;
    const output = [];
    for (const item of value.slice(0, MAX_ARRAY_ITEMS)) {
      const projected = projectWithSpec(item, spec[0], depth + 1);
      if (projected !== undefined) output.push(projected);
    }
    return output;
  }
  if (!isPlainObject(spec) || !isPlainObject(value)) return undefined;
  const output = {};
  for (const [key, childSpec] of Object.entries(spec)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const projected = projectWithSpec(value[key], childSpec, depth + 1);
    if (projected !== undefined) output[key] = projected;
  }
  return output;
}

export function sanitizeDocument(collection, document) {
  const entry = COLLECTION_MANIFEST.find((candidate) => candidate.source === collection);
  if (!entry) throw new Error(`Colección no incluida en la allowlist: ${collection}`);
  const result = projectWithSpec(document, entry.fields);
  if (!isPlainObject(result) || result._id === undefined || result._id === null) {
    throw new Error(`${collection} sin _id funcional después de sanitizar.`);
  }
  assertNoSensitiveKeys(result);
  return result;
}

export function assertNoSensitiveKeys(value, pathName = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${pathName}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`Campo sensible en exportación: ${pathName}.${key}`);
    assertNoSensitiveKeys(child, `${pathName}.${key}`);
  }
}

function text(value) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function upperNetwork(value) {
  const normalized = text(value)?.toUpperCase();
  return normalized === 'BSC' || normalized === 'TRON' ? normalized : null;
}

function normalizeAddress(network, value) {
  const address = text(value);
  if (!address) return null;
  return network === 'BSC' ? address.toLowerCase() : address;
}

function normalizeWallet(network, value) {
  const address = text(value);
  if (!address) return null;
  return network === 'BSC' ? address.toLowerCase() : address.toUpperCase();
}

function sourceId(document) {
  return text(document._id) ?? JSON.stringify(document._id);
}

function canonicalTokenAddress(network) {
  return network ? LEGACY_CONTRACTS[network].TOKEN : null;
}

function canonicalContractAddress(network, address) {
  const candidate = normalizeAddress(network, address);
  if (!candidate || !network) return null;
  const contracts = LEGACY_CONTRACTS[network];
  return Object.values(contracts).some((value) => normalizeAddress(network, value) === candidate)
    ? candidate
    : null;
}

function networkIdentityPart(network) {
  return network === 'BSC' ? 'BSC:56' : network === 'TRON' ? 'TRON:mainnet' : 'UNKNOWN';
}

export function deriveIdentity(entry, document) {
  const id = sourceId(document);
  const network = upperNetwork(document.network ?? document.chain);
  if (entry.source === 'cukies') {
    const tokenId = text(document.tokenId) ?? id;
    const collection = normalizeAddress(network, document.collectionAddress ?? document.collectionAddressNormalized)
      ?? normalizeAddress(network, canonicalTokenAddress(network));
    if (!network || !collection || collection !== normalizeAddress(network, canonicalTokenAddress(network))) {
      return { key: `${networkIdentityPart(network)}:TOKEN:${tokenId}`, valid: false, reason: 'network/collection TOKEN no canónica', network, tokenId, collection };
    }
    return {
      key: `${networkIdentityPart(network)}:${collection}:${tokenId}`,
      valid: true,
      network,
      chainId: network === 'BSC' ? 56 : undefined,
      collectionAddress: canonicalTokenAddress(network),
      collectionAddressNormalized: collection,
      tokenId,
    };
  }

  if (entry.source === 'processedEvents') {
    const contract = canonicalContractAddress(network, document.contractAddress);
    const tx = text(document.transactionId) ?? id;
    const block = text(document.blockNumber) ?? '';
    const log = text(document.logIndex) ?? '';
    return {
      key: `${networkIdentityPart(network)}:${contract ?? 'UNKNOWN_CONTRACT'}:${tx}:${block}:${log}:${id}`,
      valid: Boolean(network && contract),
      reason: network && contract ? undefined : 'evento sin network/contrato legacy canónico',
      network,
      contractAddress: contract,
      transactionId: tx,
      blockNumber: document.blockNumber,
      logIndex: document.logIndex,
    };
  }

  if (entry.source === 'originals') {
    return { key: id, valid: true, reason: undefined, network: null };
  }

  if (entry.source === 'completedEvents') {
    const eventId = text(document.eventId) ?? id;
    return {
      key: `COMPLETED:${eventId}:${id}`,
      valid: true,
      reason: undefined,
      network: null,
      eventId,
    };
  }

  if (entry.source === 'blockTimestamps') {
    const blockNumber = text(document.blockNumber) ?? id;
    return {
      key: `${networkIdentityPart(network)}:${blockNumber}:${id}`,
      valid: Boolean(network),
      reason: network ? undefined : 'block timestamp sin red legacy',
      network,
      blockNumber,
    };
  }

  if (entry.source === 'points' || entry.source === 'tx_points') {
    const tx = text(document.txID ?? document.txId ?? document.transactionId ?? document.txid ?? document.txHash);
    const address = text(document.address ?? document.owner ?? document.from ?? document.to);
    const addressNormalized = normalizeWallet(network, address);
    const kind = text(document.type) ?? '';
    const pointsContract = normalizeAddress(network, LEGACY_CONTRACTS[network]?.POINTS);
    const key = [
      networkIdentityPart(network),
      pointsContract ?? 'UNKNOWN_POINTS_CONTRACT',
      addressNormalized ?? 'UNKNOWN_WALLET',
      tx ?? id,
      kind,
      id,
    ].join(':');
    return {
      key,
      valid: Boolean(network),
      reason: network ? undefined : 'registro de puntos sin red legacy',
      network,
      transactionId: tx,
      address,
      contractAddress: pointsContract,
    };
  }

  const tx = text(document.transactionId ?? document.txid ?? document.txHash ?? document.txID ?? document.txId);
  const tokenId = text(document.tokenId);
  const address = text(document.address ?? document.owner ?? document.from ?? document.to);
  const kind = text(document.eventName ?? document.type) ?? '';
  const contract = canonicalContractAddress(network, document.contractAddress);
  const contractOrDomain = contract ?? (entry.source.includes('points') ? normalizeAddress(network, LEGACY_CONTRACTS[network]?.POINTS) : 'NO_CONTRACT');
  const block = text(document.blockNumber) ?? '';
  const log = text(document.logIndex) ?? '';
  const key = [networkIdentityPart(network), contractOrDomain ?? 'UNKNOWN', tx ?? id, tokenId ?? '', kind, block, log, id].join(':');
  return {
    key,
    valid: Boolean(network || entry.source === 'originals' || entry.source === 'completedEvents'),
    reason: network || entry.source === 'originals' || entry.source === 'completedEvents' ? undefined : 'registro sin red legacy',
    network,
    transactionId: tx,
    tokenId,
    address,
    contractAddress: contract,
  };
}

function decodeDateLike(value) {
  if (value && typeof value === 'object' && typeof value.$date === 'string') return Date.parse(value.$date);
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function getPath(value, pathName) {
  return pathName.split('.').reduce((current, key) => (
    current && typeof current === 'object' ? current[key] : undefined
  ), value);
}

export function activityTimestamp(entry, document) {
  const values = entry.activityFields.map((field) => decodeDateLike(getPath(document, field))).filter((item) => item !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

export function functionalFingerprint(document) {
  const withoutProvenance = Object.fromEntries(Object.entries(document).filter(([key]) => !['replicaProvenance', '_replica'].includes(key)));
  return crypto.createHash('sha256').update(JSON.stringify(canonicalJson(withoutProvenance))).digest('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseMongoDatabaseName(uri, label) {
  if (typeof uri !== 'string' || uri.trim() === '') throw new Error(`${label} es obligatorio.`);
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`${label} no es una URL MongoDB válida.`);
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) throw new Error(`${label} debe usar mongodb:// o mongodb+srv://.`);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (!databaseName) throw new Error(`${label} debe incluir una base explícita.`);
  return databaseName;
}

export function assertDatabaseTarget(uri, label, expected) {
  const databaseName = parseMongoDatabaseName(uri, label);
  if (databaseName !== expected) throw new Error(`${label} debe apuntar a ${expected}, no a ${databaseName}.`);
  return databaseName;
}

function assertDifferentDatabase(sourceUri, sourceLabel, targetUri, targetLabel) {
  const source = parseMongoDatabaseName(sourceUri, sourceLabel);
  const target = parseMongoDatabaseName(targetUri, targetLabel);
  if (source === target) throw new Error(`${sourceLabel} y ${targetLabel} comparten la base ${source}; operación rechazada.`);
}

function safeUriSummary(uri, label) {
  const parsed = new URL(uri);
  const queryKeys = [...new Set([...parsed.searchParams.keys()])].sort().join(',');
  return { label, scheme: parsed.protocol, database: parseMongoDatabaseName(uri, label), queryKeys };
}

function parseNonNegativeInteger(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label} es obligatorio y debe ser entero no negativo.`);
    return null;
  }
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} debe ser entero no negativo.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} excede el rango seguro.`);
  return parsed;
}

export function readChainCutoffs(env = process.env, { required = false } = {}) {
  const bscBlock = parseNonNegativeInteger(env.LEGACY_REPLICA_BSC_SAFE_BLOCK, 'LEGACY_REPLICA_BSC_SAFE_BLOCK', { required });
  const tronBlock = parseNonNegativeInteger(env.LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK, 'LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK', { required });
  const bscHash = env.LEGACY_REPLICA_BSC_SAFE_BLOCK_HASH?.trim() || null;
  const tronHash = env.LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK_HASH?.trim() || null;
  if (required && (!bscHash || !/^0x[0-9a-f]{64}$/i.test(bscHash))) {
    throw new Error('LEGACY_REPLICA_BSC_SAFE_BLOCK_HASH debe ser un hash BSC de 32 bytes.');
  }
  if (required && (!tronHash || !/^[0-9a-f]{64}$/i.test(tronHash))) {
    throw new Error('LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK_HASH debe ser un hash TRON de 32 bytes.');
  }
  const confirmations = parseNonNegativeInteger(env.LEGACY_REPLICA_BSC_CONFIRMATIONS, 'LEGACY_REPLICA_BSC_CONFIRMATIONS');
  return {
    BSC: {
      chainId: 56,
      safeBlockNumber: bscBlock,
      confirmations,
      finality: 'safe block with configured confirmations; hash captured from BSC RPC',
      blockHash: bscHash,
    },
    TRON: {
      network: 'mainnet',
      solidifiedBlockNumber: tronBlock,
      finality: 'TRON solidified/confirmed block; hash captured from TRON API',
      blockHash: tronHash,
    },
  };
}

function assertSourceEnvironment(env = process.env, { requireUrls = false } = {}) {
  if (env.LEGACY_REPLICA_SOURCE_ENV && env.LEGACY_REPLICA_SOURCE_ENV !== 'production') {
    throw new Error('LEGACY_REPLICA_SOURCE_ENV debe ser production.');
  }
  if (env.LEGACY_REPLICA_TARGET_ENV && env.LEGACY_REPLICA_TARGET_ENV !== 'staging') {
    throw new Error('LEGACY_REPLICA_TARGET_ENV debe ser staging.');
  }
  if (requireUrls) {
    const sourceUrl = env.LEGACY_REPLICA_SOURCE_MONGO_URL;
    const legacyUrl = env.LEGACY_REPLICA_TARGET_MONGO_URL;
    const indexerUrl = env.LEGACY_REPLICA_NEW_TARGET_MONGO_URL;
    assertDatabaseTarget(sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL', TARGETS.source.databaseName);
    assertDatabaseTarget(legacyUrl, 'LEGACY_REPLICA_TARGET_MONGO_URL', TARGETS.legacy.databaseName);
    assertDatabaseTarget(indexerUrl, 'LEGACY_REPLICA_NEW_TARGET_MONGO_URL', TARGETS.indexer.databaseName);
    assertDifferentDatabase(sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL', legacyUrl, 'LEGACY_REPLICA_TARGET_MONGO_URL');
    assertDifferentDatabase(sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL', indexerUrl, 'LEGACY_REPLICA_NEW_TARGET_MONGO_URL');
    return { sourceUrl, legacyUrl, indexerUrl };
  }
  return {};
}

function manifestSkeleton({ generatedAt = new Date().toISOString(), snapshotId = null, cutoffs = readChainCutoffs() } = {}) {
  return {
    schema: REPLICA_SCHEMA,
    generatedAt,
    snapshot: {
      id: snapshotId,
      mode: 'MongoDB read-only transaction with readConcern=snapshot on the production replica set',
      sourceWrites: false,
      sourceUriEnv: 'LEGACY_REPLICA_SOURCE_MONGO_URL',
    },
    source: {
      environment: TARGETS.source.environment,
      databaseName: TARGETS.source.databaseName,
      uriEnv: 'LEGACY_REPLICA_SOURCE_MONGO_URL',
      access: 'authenticated read-only; URI/host never emitted',
    },
    destinations: {
      legacy: {
        environment: TARGETS.legacy.environment,
        databaseName: TARGETS.legacy.databaseName,
        uriEnv: 'LEGACY_REPLICA_TARGET_MONGO_URL',
        mutationPolicy: 'upsert allowlisted fields only; no drop/replace/delete',
      },
      indexer: {
        environment: TARGETS.indexer.environment,
        databaseName: TARGETS.indexer.databaseName,
        uriEnv: 'LEGACY_REPLICA_NEW_TARGET_MONGO_URL',
        mutationPolicy: 'idempotent legacy-snapshot projections; no economy credits/rewards/positions',
      },
    },
    chainCutoffs: cutoffs,
    collections: COLLECTION_MANIFEST.map((entry) => ({
      id: entry.id,
      source: entry.source,
      target: entry.target,
      identity: entry.identity,
      projection: entry.projection,
      projectionTarget: entry.projectionTarget ?? null,
      verifiedOnChain: entry.verifiedOnChain ?? false,
      activityFields: entry.activityFields,
      fieldsIncluded: flattenSpec(entry.fields),
      fieldsExcluded: ['all non-allowlisted fields', 'credentials/auth/session/role/PII-like keys'],
      count: null,
      uniqueIdentityCount: null,
      duplicateIdentityCount: null,
      orphanCount: null,
      conflictCount: null,
      invalidIdentityCount: null,
      lastActivity: null,
      conflictRule: 'no automatic source-wins; require explicit selection plus identity/cutoff evidence',
      rule: 'allowlisted fields; invalid identities are retained in the bundle but skipped on load/project',
      provenance: 'legacy snapshot; not a verified raw chain_events record',
    })),
    excludedCollections: EXCLUDED_COLLECTIONS,
    limitations: [
      'Mongo snapshot and chain cutoffs are separate evidence; a count or updatedAt does not establish custody.',
      'Legacy processedEvents/completedEvents remain snapshot records and must not be labelled verified chain_events.',
      'Image URLs are references only; no production S3/AWS asset is rewritten and no MinIO upload happens in this script.',
      'Identity/auth, sessions, credentials, roles and automatic historical credits/rewards/positions are excluded.',
    ],
  };
}

function flattenSpec(spec, prefix = '') {
  const result = [];
  for (const [key, value] of Object.entries(spec)) {
    const current = prefix ? `${prefix}.${key}` : key;
    if (value === true || Array.isArray(value)) {
      result.push(current);
    } else if (isPlainObject(value)) {
      result.push(...flattenSpec(value, current));
    }
  }
  return result.sort();
}

function buildMongoProjection(spec) {
  const projection = {};
  for (const field of flattenSpec(spec)) projection[field.replace(/\[\]$/, '')] = 1;
  projection._id = 1;
  return projection;
}

async function loadMongoDriver() {
  try {
    // The root package intentionally does not duplicate the indexer's MongoDB
    // dependency. Resolve it from the workspace package that already owns the
    // driver, with a normal import as a fallback for a hoisted install.
    return requireFromIndexer('mongodb');
  } catch (requireError) {
    try {
      return await import('mongodb');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const requireMessage = requireError instanceof Error ? requireError.message : String(requireError);
      throw new Error(`No se pudo cargar el driver MongoDB; ejecuta el comando desde el workspace con dependencias instaladas (${message}; resolución del paquete indexer: ${requireMessage}).`);
    }
  }
}

async function withSnapshot(sourceUrl, callback) {
  const { MongoClient } = await loadMongoDriver();
  const client = new MongoClient(sourceUrl, { readPreference: 'primary', retryWrites: false });
  await client.connect();
  const databaseName = parseMongoDatabaseName(sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL');
  const db = client.db(databaseName);
  const session = client.startSession();
  const snapshotId = crypto.randomUUID();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      readPreference: 'primary',
      writeConcern: { w: 'majority' },
    });
    const result = await callback({ db, session, snapshotId });
    await session.commitTransaction();
    return { ...result, snapshotId };
  } catch (error) {
    try { await session.abortTransaction(); } catch { /* transaction already ended */ }
    throw error;
  } finally {
    await session.endSession();
    await client.close();
  }
}

async function exportBundle({ sourceUrl, outputDir, execute, limit = null }) {
  assertDatabaseTarget(sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL', TARGETS.source.databaseName);
  if (!execute) {
    return {
      dryRun: true,
      source: safeUriSummary(sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL'),
      outputDir,
      collections: COLLECTION_MANIFEST.map((entry) => ({ id: entry.id, source: entry.source, projection: entry.projection })),
      chainCutoffs: readChainCutoffs(),
    };
  }

  await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const result = await withSnapshot(sourceUrl, async ({ db, session, snapshotId }) => {
    const manifest = manifestSkeleton({ snapshotId, cutoffs: readChainCutoffs(process.env, { required: true }) });
    const stats = new Map();
    for (const entry of COLLECTION_MANIFEST) {
      const fileName = `${entry.source}.jsonl`;
      const filePath = path.join(outputDir, fileName);
      const file = await fsp.open(filePath, 'w', 0o600);
      const seen = new Set();
      let count = 0;
      let duplicateIdentityCount = 0;
      let invalidIdentityCount = 0;
      let lastActivity = null;
      try {
        const cursor = db.collection(entry.source).find({}, {
          session,
          projection: buildMongoProjection(entry.fields),
          sort: { _id: 1 },
          ...(limit === null ? {} : { limit }),
        });
        for await (const rawDocument of cursor) {
          const document = sanitizeDocument(entry.source, rawDocument);
          const identity = deriveIdentity(entry, document);
          const recordActivity = activityTimestamp(entry, document);
          if (recordActivity !== null) lastActivity = Math.max(lastActivity ?? recordActivity, recordActivity);
          if (!identity.valid) invalidIdentityCount += 1;
          if (seen.has(identity.key)) duplicateIdentityCount += 1;
          seen.add(identity.key);
          const record = {
            _replica: {
              schema: RECORD_SCHEMA,
              sourceEnvironment: 'production',
              sourceDatabase: TARGETS.source.databaseName,
              sourceCollection: entry.source,
              sourceId: sourceId(document),
              snapshotId,
              identityKey: identity.key,
              identityValid: identity.valid,
              identityReason: identity.reason ?? null,
              verifiedOnChain: false,
              chainCutoffRef: identity.network ? networkIdentityPart(identity.network) : null,
              functionalFingerprint: functionalFingerprint(document),
            },
            document,
          };
          await file.write(`${JSON.stringify(record)}\n`);
          count += 1;
        }
      } finally {
        await file.close();
      }
      const collectionSummary = manifest.collections.find((item) => item.id === entry.id);
      Object.assign(collectionSummary, {
        count,
        uniqueIdentityCount: seen.size,
        duplicateIdentityCount,
        orphanCount: invalidIdentityCount,
        invalidIdentityCount,
        lastActivity: lastActivity === null ? null : new Date(lastActivity).toISOString(),
        bundleFile: fileName,
      });
      stats.set(entry.id, { count, uniqueIdentityCount: seen.size, duplicateIdentityCount, invalidIdentityCount });
    }
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await fsp.writeFile(path.join(outputDir, 'manifest.json'), manifestText, { mode: 0o600 });
    await fsp.writeFile(path.join(outputDir, 'manifest.sha256'), `${sha256(manifestText)}\n`, { mode: 0o600 });
    return { manifest, stats };
  });
  return { dryRun: false, outputDir, manifest: result.manifest, stats: Object.fromEntries(result.stats) };
}

async function readManifest(bundleDir) {
  const manifestPath = path.join(bundleDir, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  if (manifest.schema !== REPLICA_SCHEMA) throw new Error(`Manifest schema no soportado: ${manifest.schema}`);
  if (manifest.source?.databaseName !== TARGETS.source.databaseName) throw new Error('Manifest source database no es cukies.');
  if (manifest.destinations?.legacy?.databaseName !== TARGETS.legacy.databaseName) throw new Error('Manifest legacy target no es staging canónico.');
  if (manifest.destinations?.indexer?.databaseName !== TARGETS.indexer.databaseName) throw new Error('Manifest indexer target no es staging canónico.');
  const digest = sha256(`${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath, manifestSha256: digest };
}

async function* readBundleRecords(bundleDir, entry, limit = null) {
  const bundleFile = entry.bundleFile ?? `${entry.source}.jsonl`;
  const filePath = path.join(bundleDir, bundleFile);
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  let buffer = '';
  let count = 0;
  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
      count += 1;
      if (limit !== null && count >= limit) return;
    }
  }
  if (buffer.trim() && (limit === null || count < limit)) yield JSON.parse(buffer);
}

function assertBundleRecord(entry, record) {
  if (!record || record._replica?.schema !== RECORD_SCHEMA || !record.document) throw new Error(`${entry.source} contiene un registro sin envelope de procedencia.`);
  if (record._replica.sourceCollection !== entry.source) throw new Error(`${entry.source} contiene sourceCollection inconsistente.`);
  const sanitized = sanitizeDocument(entry.source, decodeBundleValue(record.document));
  const identity = deriveIdentity(entry, sanitized);
  if (identity.key !== record._replica.identityKey) throw new Error(`${entry.source}/${sourceId(sanitized)} cambia su identityKey al revalidar.`);
  if (functionalFingerprint(sanitized) !== record._replica.functionalFingerprint) throw new Error(`${entry.source}/${sourceId(sanitized)} cambia su fingerprint al revalidar.`);
  return { document: sanitized, identity };
}

function targetFilter(entry, document) {
  if (entry.source === 'cukies' || entry.source === 'originals' || entry.source === 'completedEvents' || entry.source === 'blockTimestamps') return { _id: document._id };
  return { _id: document._id };
}

function stripProvenance(document) {
  return Object.fromEntries(Object.entries(document).filter(([key]) => !['_id', '_replica', 'replicaProvenance'].includes(key)));
}

function sourceProvenance(entry, record, identity, manifestSha256) {
  return {
    schema: RECORD_SCHEMA,
    sourceEnvironment: 'production',
    sourceDatabase: TARGETS.source.databaseName,
    sourceCollection: entry.source,
    sourceId: sourceId(record.document),
    snapshotId: record._replica.snapshotId,
    manifestSha256,
    identityKey: identity.key,
    identityValid: identity.valid,
    identityReason: identity.reason ?? null,
    verifiedOnChain: false,
    importedAt: new Date(),
  };
}

function sameFunctionalFields(entry, sourceDocument, targetDocument) {
  const source = functionalFingerprint(stripProvenance(sourceDocument));
  const target = functionalFingerprint(sanitizeDocument(entry.source, targetDocument));
  return source === target;
}

function parseSelection(selection) {
  if (!selection) return new Map();
  const byKey = new Map();
  for (const decision of selection.decisions ?? []) {
    if (!decision || typeof decision.collection !== 'string' || typeof decision.identityKey !== 'string') continue;
    if (!['source', 'keep-target', 'quarantine'].includes(decision.decision)) throw new Error(`Decisión de conflicto no válida: ${decision.decision}`);
    byKey.set(`${decision.collection}:${decision.identityKey}`, decision);
  }
  return byKey;
}

async function readSelection(selectionPath, manifestSha256) {
  if (!selectionPath) return { decisions: [], byKey: new Map() };
  const selection = JSON.parse(await fsp.readFile(selectionPath, 'utf8'));
  if (selection.schema !== 'cukies.legacy-staging-replica-selection.v1') throw new Error('Selection schema no soportado.');
  if (selection.manifestSha256 !== manifestSha256) throw new Error('Selection no corresponde al manifest actual.');
  return { decisions: selection.decisions ?? [], byKey: parseSelection(selection) };
}

async function connectDatabase(uri, label, expected) {
  const { MongoClient } = await loadMongoDriver();
  assertDatabaseTarget(uri, label, expected);
  const client = new MongoClient(uri, { readPreference: 'primary', retryWrites: false });
  await client.connect();
  return { client, db: client.db(expected) };
}

function requireApply(apply) {
  if (apply && process.env[CONFIRMATION] !== '1') throw new Error(`--apply exige ${CONFIRMATION}=1; el modo por defecto es dry-run.`);
}

async function recordConflict(db, payload, apply) {
  if (!apply) return;
  await db.collection(CONFLICT_COLLECTION).updateOne(
    { _id: payload.conflictKey },
    { $set: { ...payload, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

async function loadIntoLegacy({ bundleDir, apply, selectionPath, limit = null }) {
  const { manifest, manifestSha256 } = await readManifest(bundleDir);
  const { legacyUrl } = assertSourceEnvironment(process.env, { requireUrls: true });
  // Keep the source URL assertion above for the complete perimeter, but never
  // connect to it in the load phase.
  void legacyUrl;
  requireApply(apply);
  const { byKey } = await readSelection(selectionPath, manifestSha256);
  const target = await connectDatabase(process.env.LEGACY_REPLICA_TARGET_MONGO_URL, 'LEGACY_REPLICA_TARGET_MONGO_URL', TARGETS.legacy.databaseName);
  const summary = { inserted: 0, unchanged: 0, updated: 0, conflicts: 0, invalid: 0, duplicates: 0 };
  try {
    if (apply) {
      await target.db.collection(RUN_COLLECTION).updateOne(
        { _id: `load:${manifest.snapshot.id}` },
        { $set: { mode: 'legacy-load', manifestSha256, sourceSnapshotId: manifest.snapshot.id, startedAt: new Date(), dryRun: false }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    }
    const seen = new Set();
    for (const entry of COLLECTION_MANIFEST) {
      const manifestEntry = manifest.collections.find((item) => item.id === entry.id);
      for await (const record of readBundleRecords(bundleDir, manifestEntry ?? entry, limit)) {
        const { document, identity } = assertBundleRecord(entry, record);
        if (seen.has(`${entry.source}:${identity.key}`)) {
          summary.duplicates += 1;
          continue;
        }
        seen.add(`${entry.source}:${identity.key}`);
        if (!identity.valid) {
          summary.invalid += 1;
          continue;
        }
        const filter = targetFilter(entry, document);
        const current = await target.db.collection(entry.target).findOne(filter);
        const provenance = sourceProvenance(entry, record, identity, manifestSha256);
        if (!current) {
          summary.inserted += 1;
          if (apply) {
            await target.db.collection(entry.target).insertOne({
              ...stripProvenance(document),
              replicaProvenance: provenance,
            });
          }
          continue;
        }
        if (sameFunctionalFields(entry, document, current)) {
          summary.unchanged += 1;
          continue;
        }
        const decision = byKey.get(`${entry.source}:${identity.key}`);
        if (!decision || decision.decision !== 'source' || !decision.reason) {
          summary.conflicts += 1;
          await recordConflict(target.db, {
            _id: `${entry.source}:${identity.key}`,
            conflictKey: `${entry.source}:${identity.key}`,
            phase: 'legacy-load',
            collection: entry.source,
            identityKey: identity.key,
            sourceId: sourceId(document),
            reason: 'target differs; explicit source decision with evidence required',
            sourceFingerprint: functionalFingerprint(document),
            targetFingerprint: functionalFingerprint(sanitizeDocument(entry.source, current)),
            manifestSha256,
          }, apply);
          continue;
        }
        summary.updated += 1;
        if (apply) {
          await target.db.collection(entry.target).updateOne(
            filter,
            { $set: { ...stripProvenance(document), replicaProvenance: { ...provenance, selectionReason: decision.reason } } },
          );
        }
      }
    }
  } finally {
    await target.client.close();
  }
  return { dryRun: !apply, ...summary, target: TARGETS.legacy.databaseName, manifestSha256 };
}

function newNftProjection(document, identity, provenance) {
  const owner = text(document.owner ?? document.user);
  const ownerNormalized = normalizeWallet(identity.network, owner);
  const relations = (value) => Array.isArray(value) ? value : [];
  return {
    _id: `${identity.network}:${identity.network === 'BSC' ? '56' : 'mainnet'}:${identity.collectionAddressNormalized}:${identity.tokenId}`,
    tokenId: identity.tokenId,
    chain: identity.network,
    network: identity.network,
    chainId: identity.chainId,
    collectionAddress: identity.collectionAddress,
    collectionAddressNormalized: identity.collectionAddressNormalized,
    user: owner,
    owner,
    ownerNormalized,
    origin: document.origin,
    birthNetwork: document.birthNetwork,
    img: document.img,
    type: document.type,
    cukiNumber: document.cukiNumber,
    skills: document.skills,
    parents: relations(document.parents),
    children: relations(document.children),
    numChildren: document.numChildren,
    numChildrenTron: document.numChildrenTron,
    numChildrenBsc: document.numChildrenBsc,
    state: document.state,
    price: document.price,
    priceOriginal: document.priceOriginal,
    priceRaw: document.priceRaw,
    marketplaceListingStatus: document.marketplaceListingStatus,
    marketplaceListingChain: document.marketplaceListingChain,
    marketplaceListingOwnerNormalized: document.marketplaceListingOwnerNormalized,
    marketplaceListingEventId: document.marketplaceListingEventId,
    timeStamp: document.timeStamp,
    timestampMs: document.timestampMs,
    metadataSource: 'legacy.snapshot',
    legacySnapshot: true,
    replicaProvenance: provenance,
  };
}

function newHistoryProjection(document, identity, provenance) {
  const id = `legacy:${identity.key}`;
  return {
    _id: id,
    tokenId: text(document.tokenId),
    network: identity.network,
    chain: identity.network,
    chainId: identity.network === 'BSC' ? 56 : undefined,
    transactionId: text(document.transactionId ?? document.txid ?? document.txHash),
    txHash: text(document.txHash ?? document.transactionId ?? document.txid),
    type: text(document.type ?? document.eventName) ?? 'Transaction',
    from: text(document.from),
    to: text(document.to),
    price: document.price,
    priceOriginal: document.priceOriginal,
    date: document.date ?? document.timeStamp,
    timestampMs: document.timestampMs,
    blockNumber: document.blockNumber,
    logIndex: document.logIndex,
    runtimeScope: 'legacy',
    legacySnapshot: true,
    verifiedOnChain: false,
    replicaProvenance: provenance,
  };
}

function newPointsProjection(document, identity, provenance) {
  const address = text(document.address);
  const addressNormalized = normalizeWallet(identity.network, address);
  const pointsAddress = identity.network ? normalizeAddress(identity.network, LEGACY_CONTRACTS[identity.network].POINTS) : null;
  return {
    _id: `legacy:points:${identity.key}`,
    address,
    addressNormalized,
    walletNormalized: addressNormalized,
    points: document.points,
    type: document.type ?? 'Points',
    date: document.date,
    timestampMs: document.timestampMs ?? decodeDateLike(document.date),
    txId: text(document.txID ?? document.txId),
    network: identity.network,
    chain: identity.network,
    chainId: identity.network === 'BSC' ? 56 : undefined,
    pointsContractAddressNormalized: pointsAddress,
    runtimeScope: 'legacy',
    legacySnapshot: true,
    verifiedOnChain: false,
    replicaProvenance: provenance,
  };
}

function newEventSnapshotProjection(document, identity, provenance) {
  return {
    _id: `legacy-event:${identity.key}`,
    sourceCollection: 'processedEvents',
    sourceId: sourceId(document),
    network: identity.network,
    chain: identity.network,
    chainId: identity.network === 'BSC' ? 56 : undefined,
    contractAddress: identity.contractAddress,
    eventName: document.eventName,
    transactionId: document.transactionId,
    blockNumber: document.blockNumber,
    logIndex: document.logIndex,
    timeStamp: document.timeStamp,
    data: document.data,
    sourceKind: 'legacy-snapshot',
    rawChainEvent: false,
    verifiedOnChain: false,
    replicaProvenance: provenance,
  };
}

function projectionsFor(entry, document, identity, provenance) {
  if (entry.projection === 'nft-metadata-state') return [{ collection: 'cukies', document: newNftProjection(document, identity, provenance) }];
  if (entry.projection === 'nft-history') return [{ collection: 'tx_nfts', document: newHistoryProjection(document, identity, provenance) }];
  if (entry.projection === 'legacy-points') return [{ collection: 'point_transactions', document: newPointsProjection(document, identity, provenance) }];
  if (entry.projection === 'legacy-snapshot-events') return [{ collection: 'legacy_snapshot_events', document: newEventSnapshotProjection(document, identity, provenance) }];
  return [];
}

async function projectIntoIndexer({ bundleDir, apply, selectionPath, limit = null }) {
  const { manifest, manifestSha256 } = await readManifest(bundleDir);
  assertSourceEnvironment(process.env, { requireUrls: true });
  requireApply(apply);
  const { byKey } = await readSelection(selectionPath, manifestSha256);
  const target = await connectDatabase(process.env.LEGACY_REPLICA_NEW_TARGET_MONGO_URL, 'LEGACY_REPLICA_NEW_TARGET_MONGO_URL', TARGETS.indexer.databaseName);
  const summary = { inserted: 0, unchanged: 0, updated: 0, conflicts: 0, skipped: 0 };
  try {
    if (apply) {
      await target.db.collection(RUN_COLLECTION).updateOne(
        { _id: `project:${manifest.snapshot.id}` },
        { $set: { mode: 'indexer-project', manifestSha256, sourceSnapshotId: manifest.snapshot.id, startedAt: new Date(), dryRun: false }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    }
    for (const entry of COLLECTION_MANIFEST) {
      if (!entry.projection) continue;
      const manifestEntry = manifest.collections.find((item) => item.id === entry.id);
      for await (const record of readBundleRecords(bundleDir, manifestEntry ?? entry, limit)) {
        const { document, identity } = assertBundleRecord(entry, record);
        if (!identity.valid) {
          summary.skipped += 1;
          continue;
        }
        const provenance = sourceProvenance(entry, record, identity, manifestSha256);
        for (const projected of projectionsFor(entry, document, identity, provenance)) {
          const collection = target.db.collection(projected.collection);
          const current = await collection.findOne({ _id: projected.document._id });
          if (!current) {
            summary.inserted += 1;
            if (apply) await collection.insertOne(projected.document);
            continue;
          }
          if (functionalFingerprint(current) === functionalFingerprint(projected.document)) {
            summary.unchanged += 1;
            continue;
          }
          const decision = byKey.get(`${entry.source}:${identity.key}`);
          if (!decision || decision.decision !== 'source' || !decision.reason) {
            summary.conflicts += 1;
            await recordConflict(target.db, {
              _id: `project:${projected.collection}:${projected.document._id}`,
              conflictKey: `project:${projected.collection}:${projected.document._id}`,
              phase: 'indexer-project',
              collection: projected.collection,
              sourceCollection: entry.source,
              identityKey: identity.key,
              reason: 'new staging projection differs; explicit decision required',
              sourceFingerprint: functionalFingerprint(projected.document),
              targetFingerprint: functionalFingerprint(current),
              manifestSha256,
            }, apply);
            continue;
          }
          summary.updated += 1;
          if (apply) {
            await collection.updateOne(
              { _id: projected.document._id },
              { $set: { ...stripProvenance(projected.document), replicaProvenance: { ...provenance, selectionReason: decision.reason } } },
            );
          }
        }
      }
    }
  } finally {
    await target.client.close();
  }
  return { dryRun: !apply, ...summary, target: TARGETS.indexer.databaseName, manifestSha256 };
}

function projectionIdentity(entry, record) {
  const { document, identity } = assertBundleRecord(entry, record);
  const projections = projectionsFor(entry, document, identity, record._replica);
  return projections.map((projection) => ({ collection: projection.collection, id: projection.document._id, fingerprint: functionalFingerprint(projection.document) }));
}

async function verifyBundle({ bundleDir, scope = 'both', limit = null }) {
  const { manifest, manifestSha256 } = await readManifest(bundleDir);
  assertSourceEnvironment(process.env, { requireUrls: true });
  const output = { dryRun: true, manifestSha256, legacy: null, indexer: null };
  if (scope === 'legacy' || scope === 'both') {
    const target = await connectDatabase(process.env.LEGACY_REPLICA_TARGET_MONGO_URL, 'LEGACY_REPLICA_TARGET_MONGO_URL', TARGETS.legacy.databaseName);
    try {
      const result = { records: 0, missing: 0, equal: 0, mismatched: 0, invalid: 0 };
      for (const entry of COLLECTION_MANIFEST) {
        const manifestEntry = manifest.collections.find((item) => item.id === entry.id);
        for await (const record of readBundleRecords(bundleDir, manifestEntry ?? entry, limit)) {
          result.records += 1;
          const { document, identity } = assertBundleRecord(entry, record);
          if (!identity.valid) { result.invalid += 1; continue; }
          const current = await target.db.collection(entry.target).findOne(targetFilter(entry, document));
          if (!current) result.missing += 1;
          else if (sameFunctionalFields(entry, document, current)) result.equal += 1;
          else result.mismatched += 1;
        }
      }
      output.legacy = result;
    } finally {
      await target.client.close();
    }
  }
  if (scope === 'new' || scope === 'both') {
    const target = await connectDatabase(process.env.LEGACY_REPLICA_NEW_TARGET_MONGO_URL, 'LEGACY_REPLICA_NEW_TARGET_MONGO_URL', TARGETS.indexer.databaseName);
    try {
      const result = { projections: 0, missing: 0, equal: 0, mismatched: 0 };
      for (const entry of COLLECTION_MANIFEST) {
        if (!entry.projection) continue;
        const manifestEntry = manifest.collections.find((item) => item.id === entry.id);
        for await (const record of readBundleRecords(bundleDir, manifestEntry ?? entry, limit)) {
          for (const projection of projectionIdentity(entry, record)) {
            result.projections += 1;
            const current = await target.db.collection(projection.collection).findOne({ _id: projection.id });
            if (!current) result.missing += 1;
            else if (functionalFingerprint(current) === projection.fingerprint) result.equal += 1;
            else result.mismatched += 1;
          }
        }
      }
      output.indexer = result;
    } finally {
      await target.client.close();
    }
  }
  return output;
}

function parseArgs(argv) {
  const args = { command: 'plan', apply: false, execute: false, bundleDir: DEFAULT_BUNDLE_DIR, outputDir: DEFAULT_BUNDLE_DIR, selectionPath: null, scope: 'both', limit: null };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) { positional.push(token); continue; }
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--execute' || token === '--write') { args.execute = true; continue; }
    const [key, inline] = token.split('=', 2);
    if (['--bundle', '--output', '--selection', '--scope', '--limit'].includes(key)) {
      const value = inline ?? argv[++index];
      if (!value) throw new Error(`${key} necesita un valor.`);
      if (key === '--bundle') args.bundleDir = value;
      if (key === '--output') args.outputDir = value;
      if (key === '--selection') args.selectionPath = value;
      if (key === '--scope') args.scope = value;
      if (key === '--limit') args.limit = parseNonNegativeInteger(value, '--limit');
      continue;
    }
    if (token === '--help' || token === '-h') { args.help = true; continue; }
    throw new Error(`Opción no reconocida: ${token}`);
  }
  if (positional.length > 1) throw new Error(`Comando ambiguo: ${positional.join(' ')}`);
  if (positional[0]) args.command = positional[0];
  if (!['plan', 'export', 'load', 'project', 'verify'].includes(args.command)) throw new Error(`Comando no reconocido: ${args.command}`);
  if (!['legacy', 'new', 'both'].includes(args.scope)) throw new Error(`--scope debe ser legacy, new o both.`);
  return args;
}

function help() {
  return `Uso:
  node scripts/legacy-staging-replica.mjs plan
  node scripts/legacy-staging-replica.mjs export --output /tmp/replica --execute
  node scripts/legacy-staging-replica.mjs load --bundle /tmp/replica [--apply]
  node scripts/legacy-staging-replica.mjs project --bundle /tmp/replica [--apply]
  node scripts/legacy-staging-replica.mjs verify --bundle /tmp/replica [--scope legacy|new|both]

Variables de ejecución:
  LEGACY_REPLICA_SOURCE_MONGO_URL       producción, base cukies, solo lectura
  LEGACY_REPLICA_TARGET_MONGO_URL       staging, base cukies-legacy-staging
  LEGACY_REPLICA_NEW_TARGET_MONGO_URL   staging, base cukieshub-new-staging
  LEGACY_REPLICA_BSC_SAFE_BLOCK         corte/finalidad BSC 56
  LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK  corte/finalidad TRON mainnet
  ${CONFIRMATION}=1                     además de --apply para escribir

La URL/host, secretos y datos no allowlisted nunca se imprimen ni se guardan en
el manifest. --apply no hace drop, replace ciego, borrado ni escritura en origen.
`;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (args.help) return help();
  if (args.command === 'plan') {
    const urls = assertSourceEnvironment(env, { requireUrls: false });
    return {
      schema: REPLICA_SCHEMA,
      dryRun: true,
      source: urls.sourceUrl ? safeUriSummary(urls.sourceUrl, 'LEGACY_REPLICA_SOURCE_MONGO_URL') : { environment: 'production', database: TARGETS.source.databaseName, uriEnv: 'LEGACY_REPLICA_SOURCE_MONGO_URL' },
      destinations: { legacy: TARGETS.legacy, indexer: TARGETS.indexer },
      chainCutoffs: readChainCutoffs(env),
      collections: COLLECTION_MANIFEST.map((entry) => ({ id: entry.id, source: entry.source, target: entry.target, identity: entry.identity, projection: entry.projection, fieldsIncluded: flattenSpec(entry.fields), verifiedOnChain: entry.verifiedOnChain ?? false })),
      excludedCollections: EXCLUDED_COLLECTIONS,
      noRemoteWrites: true,
    };
  }
  if (args.command === 'export') {
    const sourceUrl = env.LEGACY_REPLICA_SOURCE_MONGO_URL;
    if (!sourceUrl) return exportBundle({ sourceUrl: 'mongodb://placeholder/cukies', outputDir: args.outputDir, execute: false, limit: args.limit });
    return exportBundle({ sourceUrl, outputDir: args.outputDir, execute: args.execute, limit: args.limit });
  }
  if (args.command === 'load') return loadIntoLegacy({ bundleDir: args.bundleDir, apply: args.apply, selectionPath: args.selectionPath, limit: args.limit });
  if (args.command === 'project') return projectIntoIndexer({ bundleDir: args.bundleDir, apply: args.apply, selectionPath: args.selectionPath, limit: args.limit });
  return verifyBundle({ bundleDir: args.bundleDir, scope: args.scope, limit: args.limit });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  run().then((result) => {
    if (typeof result === 'string') console.log(result);
    else console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
