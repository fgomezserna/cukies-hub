import 'server-only';

import type { Db, Filter } from 'mongodb';

import { ukiNftVaults, type UkiNftVaultMode } from '@/lib/contracts/uki-nft-vaults';
import {
  normalizeCukiesInventoryDocument,
  type CukiesInventoryDocument,
  type NftAssetLockDocument,
} from '@/lib/nft-inventory';

import { SchemaNotReadyError } from '../errors';
import { gamesQuota, poolPriority } from './rules';
import type { CukiePoolGeneration, CukiePoolRarity } from './types';

export const CUKIE_POOL_NFT_VAULT_POSITIONS = 'cukie_pool_nft_vault_positions';
export const CUKIE_POOL_CALENDAR_VERSIONS = 'cukie_pool_calendar_versions';
export const CUKIE_POOL_VAULT_ASSET_LEASES = 'cukie_pool_vault_asset_leases';
export const CUKIE_POOL_VAULT_PERIOD_USAGE = 'cukie_pool_vault_period_usage';

const NFT_VAULT_COLLECTIONS = 'nft_vault_collections';
const CUKIE_MASTER_NFT_POSITIONS = 'cukie_master_nft_positions';
const PERIOD_SECONDS = BigInt(86_400);
const BSC_ADDRESS = /^0x[0-9a-f]{40}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_VAULT_ROWS = 1_000;
const MAX_AVAILABLE_ASSETS = 200;
const DEFAULT_INDEXER_FRESHNESS_MS = 15 * 60_000;
const REQUIRED_POOL_CURSOR_EVENTS = [
  'CukiePoolCollectionAllowedUpdated',
  'CukiePoolCalendarVersionScheduled',
  'CukiePoolDeposited',
  'CukiePoolExitRequested',
  'CukiePoolWithdrawableAtAdvanced',
  'CukiePoolWithdrawn',
  'CukiePoolUntrackedERC721Recovered',
] as const;

export type CukiePoolVaultConfig = {
  chainId: 56 | 97;
  vaultAddressNormalized: string;
  collectionAddresses: string[];
};

export type CukiePoolVaultPeriod = {
  periodId: string;
  startsAt: Date;
  endsAt: Date;
  calendarVersion: string;
};

export type CukiePoolVaultCandidate = {
  positionId: string;
  assetId: string;
  chainId: 56 | 97;
  collectionAddressNormalized: string;
  tokenId: string;
  vaultAddressNormalized: string;
  ownerNormalized: string;
  depositEpoch: string;
  depositedAt: Date;
  activationAt: Date;
  withdrawableAt: Date | null;
  ownerRewardEligible: boolean;
  generation: CukiePoolGeneration;
  rarity: CukiePoolRarity;
  gamesQuota: number;
  poolPriority: 0 | 1;
};

export type PublicCukiePoolAvailableAsset = {
  assetId: string;
  chain: 'BSC';
  chainId: 56 | 97;
  collectionAddress: string;
  tokenId: string;
  generation: CukiePoolGeneration;
  rarity: CukiePoolRarity;
  custody: 'wallet';
  status: 'available';
  canDeposit: true;
};

type CalendarDocument = {
  _id?: unknown;
  chain?: unknown;
  chainId?: unknown;
  vaultAddressNormalized?: unknown;
  calendarVersion?: unknown;
  effectiveAt?: unknown;
  firstCutoffAt?: unknown;
  firstPeriodId?: unknown;
  periodAnchorSeconds?: unknown;
  evidence?: unknown;
};

type VaultPositionDocument = {
  _id?: unknown;
  positionId?: unknown;
  chain?: unknown;
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
  tokenId?: unknown;
  assetId?: unknown;
  vaultAlias?: unknown;
  vaultAddressNormalized?: unknown;
  beneficiaryNormalized?: unknown;
  depositEpoch?: unknown;
  depositedAt?: unknown;
  depositPeriodId?: unknown;
  activationAt?: unknown;
  activationPeriodId?: unknown;
  depositCalendarVersion?: unknown;
  lifecycle?: unknown;
  lifecycleOpen?: unknown;
  custody?: unknown;
  ownerRewardEligible?: unknown;
  exitRequestedAt?: unknown;
  exitPeriodId?: unknown;
  withdrawableAt?: unknown;
  exitCalendarVersion?: unknown;
};

type CukiesVaultInventoryDocument = CukiesInventoryDocument & {
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
};

type IndexerCheckpointDocument = {
  _id: string;
  checkedAt?: unknown;
  safeBlockNumber?: unknown;
  safeBlockHash?: unknown;
};

type ParsedCalendar = {
  version: bigint;
  effectiveAt: bigint;
  firstCutoffAt: bigint;
  firstPeriodId: bigint;
};

function sourceError(message: string): never {
  throw new SchemaNotReadyError(`Fuente custodial de Cukie Pool invalida: ${message}`);
}

function decimal(value: unknown, field: string, positive = false) {
  if (
    typeof value !== 'string'
    || !DECIMAL.test(value)
    || (positive && value === '0')
  ) return sourceError(`${field} no es un decimal canonico${positive ? ' positivo' : ''}.`);
  return value;
}

function address(value: unknown, field: string) {
  if (
    typeof value !== 'string'
    || !BSC_ADDRESS.test(value)
    || /^0x0{40}$/.test(value)
  ) return sourceError(`${field} no es una direccion BSC normalizada.`);
  return value;
}

function dateFromSeconds(value: unknown, field: string) {
  const raw = decimal(value, field);
  const millis = BigInt(raw) * BigInt(1_000);
  if (millis > BigInt(8_640_000_000_000_000)) {
    return sourceError(`${field} queda fuera del rango de fecha soportado.`);
  }
  return new Date(Number(millis));
}

function validGeneration(value: string): value is CukiePoolGeneration {
  return value === 'original' || value === 'second_generation';
}

function validRarity(value: string): value is CukiePoolRarity {
  return ['common', 'uncommon', 'rare', 'epic', 'legendary', 'goat'].includes(value);
}

export function getCukiePoolVaultMode(): UkiNftVaultMode {
  return ukiNftVaults.mode.cukiePool;
}

export function requireCukiePoolVaultConfig(): CukiePoolVaultConfig {
  if (getCukiePoolVaultMode() !== 'custodial') {
    return sourceError('el modo activo no es custodial.');
  }
  const chainId = ukiNftVaults.chainId;
  const vaultAddress = ukiNftVaults.cukiePoolNftVaultAddress?.toLowerCase() ?? null;
  const collectionAddresses = ukiNftVaults.collectionAddresses
    .map((value) => value.toLowerCase());
  if (
    (chainId !== 56 && chainId !== 97)
    || !vaultAddress
    || !BSC_ADDRESS.test(vaultAddress)
    || collectionAddresses.length === 0
    || collectionAddresses.some((value) => !BSC_ADDRESS.test(value))
    || new Set(collectionAddresses).size !== collectionAddresses.length
  ) return sourceError('la configuracion de red, vault o colecciones no es canonica.');
  return { chainId, vaultAddressNormalized: vaultAddress, collectionAddresses };
}

function parseCalendar(document: CalendarDocument, config: CukiePoolVaultConfig) {
  if (
    document.chain !== 'BSC'
    || document.chainId !== config.chainId
    || document.vaultAddressNormalized !== config.vaultAddressNormalized
  ) return sourceError('una version de calendario no coincide con chain/vault configurados.');
  const version = BigInt(decimal(document.calendarVersion, 'calendarVersion', true));
  const effectiveAt = BigInt(decimal(document.effectiveAt, 'effectiveAt'));
  const firstCutoffAt = BigInt(decimal(document.firstCutoffAt, 'firstCutoffAt'));
  const firstPeriodId = BigInt(decimal(document.firstPeriodId, 'firstPeriodId'));
  const periodAnchorSeconds = BigInt(decimal(
    document.periodAnchorSeconds,
    'periodAnchorSeconds',
  ));
  if (
    firstCutoffAt <= effectiveAt
    || firstCutoffAt > effectiveAt + PERIOD_SECONDS
    || periodAnchorSeconds !== firstCutoffAt % PERIOD_SECONDS
  ) return sourceError(`la version ${version} contiene limites de periodo incoherentes.`);
  return { version, effectiveAt, firstCutoffAt, firstPeriodId } satisfies ParsedCalendar;
}

function periodFromCalendar(calendar: ParsedCalendar, timestamp: bigint) {
  if (timestamp < calendar.effectiveAt) {
    return sourceError(`timestamp anterior al calendario ${calendar.version}.`);
  }
  if (timestamp < calendar.firstCutoffAt) {
    return {
      periodId: calendar.firstPeriodId,
      startsAt: calendar.effectiveAt,
      endsAt: calendar.firstCutoffAt,
    };
  }
  const completed = (timestamp - calendar.firstCutoffAt) / PERIOD_SECONDS;
  const startsAt = calendar.firstCutoffAt + completed * PERIOD_SECONDS;
  return {
    periodId: calendar.firstPeriodId + completed + BigInt(1),
    startsAt,
    endsAt: startsAt + PERIOD_SECONDS,
  };
}

export function resolveCukiePoolVaultPeriod(
  documents: CalendarDocument[],
  config: CukiePoolVaultConfig,
  now: Date,
): CukiePoolVaultPeriod {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return sourceError('now no es una fecha valida.');
  }
  if (documents.length === 0 || documents.length > MAX_VAULT_ROWS) {
    return sourceError('no hay un calendario acotado disponible.');
  }
  const calendars = documents.map((item) => parseCalendar(item, config))
    .sort((left, right) => left.version < right.version ? -1 : 1);
  for (let index = 0; index < calendars.length; index += 1) {
    const current = calendars[index];
    if (current.version !== BigInt(index + 1)) {
      return sourceError('las versiones de calendario no son continuas desde 1.');
    }
    const previous = calendars[index - 1];
    if (previous) {
      const boundary = periodFromCalendar(previous, current.effectiveAt);
      if (
        current.effectiveAt <= previous.effectiveAt
        || boundary.startsAt !== current.effectiveAt
        || boundary.periodId !== current.firstPeriodId
      ) return sourceError(`la transicion a calendario ${current.version} no es continua.`);
    }
  }
  const timestamp = BigInt(Math.floor(now.getTime() / 1_000));
  const active = calendars.filter((item) => item.effectiveAt <= timestamp).at(-1);
  if (!active) return sourceError('ninguna version de calendario esta activa.');
  const period = periodFromCalendar(active, timestamp);
  return {
    periodId: period.periodId.toString(),
    startsAt: dateFromSeconds(period.startsAt.toString(), 'period.startsAt'),
    endsAt: dateFromSeconds(period.endsAt.toString(), 'period.endsAt'),
    calendarVersion: active.version.toString(),
  };
}

async function assertVaultCollectionsReady(
  db: Db,
  input: {
    chainId: 56 | 97;
    vaultAlias: 'CUKIE_POOL_NFT_VAULT' | 'CUKIE_MASTER_NFT_VAULT';
    vaultAddressNormalized: string;
    collectionAddresses: string[];
  },
) {
  const allowlistRows = await db.collection<Record<string, unknown>>(NFT_VAULT_COLLECTIONS)
    .find({
      chainId: input.chainId,
      vaultAlias: input.vaultAlias,
      vaultAddressNormalized: input.vaultAddressNormalized,
      collectionAddressNormalized: { $in: input.collectionAddresses },
    })
    .limit(input.collectionAddresses.length + 1)
    .toArray();
  const allowed = new Set<string>();
  for (const row of allowlistRows) {
    const collection = address(row.collectionAddressNormalized, 'collectionAddressNormalized');
    if (
      row.chainId !== input.chainId
      || row.vaultAlias !== input.vaultAlias
      || row.vaultAddressNormalized !== input.vaultAddressNormalized
      || row.allowed !== true
      || allowed.has(collection)
    ) return sourceError(`la allowlist proyectada de ${input.vaultAlias} no esta lista.`);
    allowed.add(collection);
  }
  if (
    allowed.size !== input.collectionAddresses.length
    || input.collectionAddresses.some((collection) => !allowed.has(collection))
  ) return sourceError(`faltan colecciones permitidas en ${input.vaultAlias}.`);
}

function indexerFreshnessMs() {
  const raw = process.env.CUKIE_POOL_INDEXER_MAX_LAG_MS?.trim();
  if (!raw) return DEFAULT_INDEXER_FRESHNESS_MS;
  if (!DECIMAL.test(raw)) return sourceError('CUKIE_POOL_INDEXER_MAX_LAG_MS no es entero.');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 10_000 || parsed > 86_400_000) {
    return sourceError('CUKIE_POOL_INDEXER_MAX_LAG_MS esta fuera de rango.');
  }
  return parsed;
}

async function assertCukiePoolVaultOperationalHealth(
  db: Db,
  config: CukiePoolVaultConfig,
  now: Date,
) {
  try {
    const [latestSuccess, latestError, checkpoint, cursors, pending, deadLetter, incident] = await Promise.all([
      db.collection<Record<string, unknown>>('chain_indexer_runs').findOne(
        { type: { $in: ['loop', 'ingest-once'] } },
        { sort: { endedAt: -1 }, projection: { endedAt: 1 } },
      ),
      db.collection<Record<string, unknown>>('chain_indexer_runs').findOne(
        { type: 'loop-error', failedContractAliases: 'CUKIE_POOL_NFT_VAULT' },
        { sort: { endedAt: -1 }, projection: { endedAt: 1 } },
      ),
      db.collection<IndexerCheckpointDocument>('chain_bsc_checkpoints').findOne(
        { _id: 'canonical-safe' },
      ),
      db.collection<Record<string, unknown>>('chain_cursors').find({
        chain: 'BSC',
        contractAlias: 'CUKIE_POOL_NFT_VAULT',
      }).limit(REQUIRED_POOL_CURSOR_EVENTS.length + 1).toArray(),
      db.collection('chain_events').findOne({
        contractAlias: 'CUKIE_POOL_NFT_VAULT',
        status: { $in: ['ingested', 'projecting', 'failed'] },
      }, { projection: { _id: 1 } }),
      db.collection('chain_dead_letters').findOne(
        { contractAlias: 'CUKIE_POOL_NFT_VAULT' },
        { projection: { _id: 1 } },
      ),
      db.collection('chain_integrity_incidents').findOne({
        status: 'open',
        chain: 'BSC',
        $or: [
          { contractAlias: 'CUKIE_POOL_NFT_VAULT' },
          { type: { $in: ['canonical_checkpoint_mismatch', 'canonical_progress_conflict'] } },
        ],
      }, { projection: { _id: 1 } }),
    ]);
    const freshnessCutoff = new Date(now.getTime() - indexerFreshnessMs());
    const successAt = latestSuccess?.endedAt instanceof Date ? latestSuccess.endedAt : null;
    const errorAt = latestError?.endedAt instanceof Date ? latestError.endedAt : null;
    const checkpointAt = checkpoint?.checkedAt instanceof Date ? checkpoint.checkedAt : null;
    const safeBlock = checkpoint?.safeBlockNumber;
    if (
      !successAt
      || successAt < freshnessCutoff
      || (errorAt && errorAt > successAt)
      || !checkpointAt
      || checkpointAt < freshnessCutoff
      || !Number.isSafeInteger(safeBlock)
      || typeof checkpoint?.safeBlockHash !== 'string'
      || !/^0x[0-9a-f]{64}$/i.test(checkpoint.safeBlockHash)
      || pending
      || deadLetter
      || incident
    ) return sourceError('el loop/checkpoint scoped del vault no esta saludable.');

    const healthyEvents = new Set<string>();
    for (const cursor of cursors) {
      if (
        cursor.chain !== 'BSC'
        || cursor.contractAlias !== 'CUKIE_POOL_NFT_VAULT'
        || typeof cursor.contractAddress !== 'string'
        || cursor.contractAddress.toLowerCase() !== config.vaultAddressNormalized
        || cursor.verifiedChainId !== config.chainId
        || cursor.bootstrapStatus !== 'verified'
        || !(cursor.bootstrapVerifiedAt instanceof Date)
        || !(cursor.updatedAt instanceof Date)
        || cursor.updatedAt < freshnessCutoff
        || cursor.safeBlock !== safeBlock
        || !Number.isSafeInteger(cursor.nextBlock)
        || Number(cursor.nextBlock) <= Number(safeBlock)
        || typeof cursor.eventName !== 'string'
      ) return sourceError('un cursor scoped del vault no esta sincronizado o verificado.');
      healthyEvents.add(cursor.eventName);
    }
    if (
      cursors.length !== REQUIRED_POOL_CURSOR_EVENTS.length
      || REQUIRED_POOL_CURSOR_EVENTS.some((eventName) => !healthyEvents.has(eventName))
    ) return sourceError('faltan cursores requeridos de CukiePoolNftVault.');
  } catch (error) {
    if (error instanceof SchemaNotReadyError) throw error;
    return sourceError('no se pudo consultar el health operativo scoped del vault.');
  }
}

export async function assertCukiePoolVaultIndexerReady(
  db: Db,
  config: CukiePoolVaultConfig,
  now: Date,
) {
  await assertCukiePoolVaultOperationalHealth(db, config, now);
  await assertVaultCollectionsReady(db, {
    chainId: config.chainId,
    vaultAlias: 'CUKIE_POOL_NFT_VAULT',
    vaultAddressNormalized: config.vaultAddressNormalized,
    collectionAddresses: config.collectionAddresses,
  });

  const calendarRows = await db.collection<CalendarDocument>(CUKIE_POOL_CALENDAR_VERSIONS)
    .find({
      chainId: config.chainId,
      vaultAddressNormalized: config.vaultAddressNormalized,
    })
    .sort({ calendarVersion: 1 })
    .limit(MAX_VAULT_ROWS + 1)
    .toArray();
  return resolveCukiePoolVaultPeriod(calendarRows, config, now);
}

function validateVaultPosition(
  document: VaultPositionDocument,
  config: CukiePoolVaultConfig,
  now: Date,
) {
  if (
    (document.chain !== undefined && document.chain !== 'BSC')
    || document.chainId !== config.chainId
    || document.vaultAlias !== 'CUKIE_POOL_NFT_VAULT'
    || document.vaultAddressNormalized !== config.vaultAddressNormalized
    || document.lifecycleOpen !== true
    || document.custody !== 'cukie_pool_nft_vault'
  ) return sourceError('una posicion abierta no coincide con la custodia configurada.');
  const collection = address(document.collectionAddressNormalized, 'collectionAddressNormalized');
  if (!config.collectionAddresses.includes(collection)) {
    return sourceError(`la posicion usa una coleccion no configurada (${collection}).`);
  }
  const tokenId = decimal(document.tokenId, 'tokenId');
  const depositEpoch = decimal(document.depositEpoch, 'depositEpoch', true);
  const assetId = `${config.chainId}:${collection}:${tokenId}`;
  const positionId = `${assetId}:epoch:${depositEpoch}`;
  if (
    document.assetId !== assetId
    || document.positionId !== positionId
    || document._id !== positionId
  ) return sourceError(`la identidad canonica de ${positionId} no coincide.`);
  const ownerNormalized = address(document.beneficiaryNormalized, 'beneficiaryNormalized');
  const depositedAt = dateFromSeconds(document.depositedAt, 'depositedAt');
  const activationAt = dateFromSeconds(document.activationAt, 'activationAt');
  const depositPeriodId = BigInt(decimal(document.depositPeriodId, 'depositPeriodId'));
  const activationPeriodId = BigInt(decimal(document.activationPeriodId, 'activationPeriodId'));
  decimal(document.depositCalendarVersion, 'depositCalendarVersion', true);
  if (activationAt <= depositedAt || activationPeriodId !== depositPeriodId + BigInt(1)) {
    return sourceError(`los periodos de activacion de ${positionId} son incoherentes.`);
  }
  const hasExit = document.exitRequestedAt !== undefined && document.exitRequestedAt !== null;
  const withdrawableAt = hasExit
    ? dateFromSeconds(document.withdrawableAt, 'withdrawableAt')
    : null;
  if (hasExit) {
    dateFromSeconds(document.exitRequestedAt, 'exitRequestedAt');
    decimal(document.exitPeriodId, 'exitPeriodId');
    decimal(document.exitCalendarVersion, 'exitCalendarVersion', true);
    if (
      document.ownerRewardEligible !== false
      || !['exit_requested', 'withdrawable'].includes(String(document.lifecycle))
    ) return sourceError(`la salida de ${positionId} no esta proyectada de forma coherente.`);
  } else if (
    document.ownerRewardEligible !== true
    || !['pending_activation', 'active'].includes(String(document.lifecycle))
  ) return sourceError(`la activacion de ${positionId} no esta proyectada de forma coherente.`);
  return {
    positionId,
    assetId,
    chainId: config.chainId,
    collectionAddressNormalized: collection,
    tokenId,
    vaultAddressNormalized: config.vaultAddressNormalized,
    ownerNormalized,
    depositEpoch,
    depositedAt,
    activationAt,
    withdrawableAt,
    ownerRewardEligible: !hasExit,
    lendable: now >= activationAt && (!withdrawableAt || now < withdrawableAt),
  };
}

async function loadCandidateMetadata(
  db: Db,
  positions: ReturnType<typeof validateVaultPosition>[],
  now: Date,
) {
  if (positions.length === 0) return new Map<string, {
    generation: CukiePoolGeneration;
    rarity: CukiePoolRarity;
  }>();
  const tokenCandidates = [...new Set(positions.flatMap((position) => {
    const numeric = Number(position.tokenId);
    return Number.isSafeInteger(numeric) && String(numeric) === position.tokenId
      ? [position.tokenId, numeric]
      : [position.tokenId];
  }))];
  const documents = await db.collection<CukiesVaultInventoryDocument>('cukies').find({
    tokenId: { $in: tokenCandidates },
    chainId: positions[0].chainId,
    collectionAddressNormalized: {
      $in: [...new Set(positions.map((position) => position.collectionAddressNormalized))],
    },
  } as Filter<CukiesVaultInventoryDocument>)
    .limit(positions.length + 1)
    .toArray();
  if (documents.length > positions.length) {
    return sourceError('el inventario contiene metadata duplicada para posiciones abiertas.');
  }
  const byIdentity = new Map<string, CukiesVaultInventoryDocument[]>();
  const initialByIdentity = new Map<string, ReturnType<typeof normalizeCukiesInventoryDocument>>();
  for (const document of documents) {
    const collection = address(
      document.collectionAddressNormalized,
      'cukies.collectionAddressNormalized',
    );
    if (document.chainId !== positions[0].chainId) {
      return sourceError('el inventario contiene metadata de otra red.');
    }
    const initial = normalizeCukiesInventoryDocument(document, [], now);
    if (!initial.tokenId) return sourceError('el inventario contiene metadata sin tokenId.');
    const identity = `${collection}:${initial.tokenId}`;
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), document]);
    initialByIdentity.set(identity, initial);
  }

  const legacyAssetIds = [...new Set([...initialByIdentity.values()].map((item) => item.assetId))];
  const legacyLocks = await db.collection<NftAssetLockDocument>('nft_asset_locks').find({
    assetId: { $in: legacyAssetIds },
    status: 'active',
  }).limit(Math.max(legacyAssetIds.length * 2, 1)).toArray();
  const locksByAssetId = new Map<string, NftAssetLockDocument[]>();
  for (const lock of legacyLocks) {
    const assetId = typeof lock.assetId === 'string' ? lock.assetId : '';
    if (!legacyAssetIds.includes(assetId)) {
      return sourceError('la consulta de locks devolvio una identidad no solicitada.');
    }
    locksByAssetId.set(assetId, [...(locksByAssetId.get(assetId) ?? []), lock]);
  }

  const result = new Map<string, {
    generation: CukiePoolGeneration;
    rarity: CukiePoolRarity;
  }>();
  for (const position of positions) {
    const identity = `${position.collectionAddressNormalized}:${position.tokenId}`;
    const matching = byIdentity.get(identity) ?? [];
    if (matching.length !== 1) {
      return sourceError(`metadata ausente o ambigua para ${position.assetId}.`);
    }
    const initial = initialByIdentity.get(identity)!;
    const locks = locksByAssetId.get(initial.assetId) ?? [];
    if (locks.length > 1) {
      return sourceError(`hay multiples locks legacy activos para ${position.assetId}.`);
    }
    const normalized = normalizeCukiesInventoryDocument(matching[0], locks, now);
    if (
      normalized.network !== 'bsc'
      || normalized.tokenId !== position.tokenId
      || normalized.ownerNormalized !== position.ownerNormalized
      || normalized.canonicalState !== 'available'
      || normalized.activeLocks.length !== 0
      || !validGeneration(normalized.generation)
      || !validRarity(normalized.rarity)
    ) return sourceError(`metadata no elegible para ${position.assetId}.`);
    result.set(position.positionId, {
      generation: normalized.generation,
      rarity: normalized.rarity,
    });
  }
  return result;
}

export async function loadCukiePoolVaultCandidates(
  db: Db,
  config: CukiePoolVaultConfig,
  now: Date,
): Promise<CukiePoolVaultCandidate[]> {
  const rows = await db.collection<VaultPositionDocument>(CUKIE_POOL_NFT_VAULT_POSITIONS)
    .find({
      chainId: config.chainId,
      vaultAlias: 'CUKIE_POOL_NFT_VAULT',
      vaultAddressNormalized: config.vaultAddressNormalized,
      collectionAddressNormalized: { $in: config.collectionAddresses },
      lifecycleOpen: true,
    })
    .sort({ _id: 1 })
    .limit(MAX_VAULT_ROWS + 1)
    .toArray();
  if (rows.length > MAX_VAULT_ROWS) {
    return sourceError('hay demasiadas posiciones abiertas para seleccionar con seguridad.');
  }
  const lendablePositions: ReturnType<typeof validateVaultPosition>[] = [];
  const seenOpenAssets = new Set<string>();
  for (const row of rows) {
    const position = validateVaultPosition(row, config, now);
    if (seenOpenAssets.has(position.assetId)) {
      return sourceError(`hay mas de una epoch abierta para ${position.assetId}.`);
    }
    seenOpenAssets.add(position.assetId);
    if (!position.lendable) continue;
    lendablePositions.push(position);
  }
  const metadataByPosition = await loadCandidateMetadata(db, lendablePositions, now);
  const candidates: CukiePoolVaultCandidate[] = lendablePositions.map((position) => {
    const metadata = metadataByPosition.get(position.positionId);
    if (!metadata) return sourceError(`falta metadata validada para ${position.positionId}.`);
    return {
      ...position,
      generation: metadata.generation,
      rarity: metadata.rarity,
      gamesQuota: gamesQuota(metadata.generation, metadata.rarity),
      poolPriority: poolPriority(metadata.generation),
    };
  });
  return candidates.sort((left, right) => (
    left.poolPriority - right.poolPriority
    || left.activationAt.getTime() - right.activationAt.getTime()
    || left.depositedAt.getTime() - right.depositedAt.getTime()
    || left.positionId.localeCompare(right.positionId)
  ));
}

function canonicalVaultOpenPosition(
  row: Record<string, unknown>,
  expected: { chainId: number; vaultAlias: string; vaultAddress: string; assetIds: Set<string> },
) {
  return (row.chain === undefined || row.chain === 'BSC')
    && row.chainId === expected.chainId
    && row.vaultAlias === expected.vaultAlias
    && row.vaultAddressNormalized === expected.vaultAddress
    && row.lifecycleOpen === true
    && typeof row.assetId === 'string'
    && expected.assetIds.has(row.assetId);
}

export async function listAvailableCukiePoolVaultAssets(
  db: Db,
  walletNormalized: string,
  config: CukiePoolVaultConfig,
  now: Date,
): Promise<PublicCukiePoolAvailableAsset[]> {
  if (ukiNftVaults.mode.cukieMaster === 'invalid') {
    return sourceError('la configuracion del vault Cukie Master es invalida.');
  }
  const inventory = await db.collection<CukiesVaultInventoryDocument>('cukies').find({
    ownerNormalized: walletNormalized,
    network: { $in: ['BSC', 'bsc'] },
    state: 'available',
    chainId: config.chainId,
    collectionAddressNormalized: { $in: config.collectionAddresses },
  } as Filter<CukiesVaultInventoryDocument>)
    .sort({ collectionAddressNormalized: 1, tokenId: 1, _id: 1 })
    .limit(MAX_AVAILABLE_ASSETS + 1)
    .toArray();
  if (inventory.length > MAX_AVAILABLE_ASSETS) {
    return sourceError('hay demasiados NFTs disponibles para publicar sin paginacion propia.');
  }

  const preliminary = inventory.map((document) => {
    const normalized = normalizeCukiesInventoryDocument(document, [], now);
    const collection = address(
      document.collectionAddressNormalized,
      'cukies.collectionAddressNormalized',
    );
    if (
      document.chainId !== config.chainId
      || !config.collectionAddresses.includes(collection)
      || normalized.network !== 'bsc'
      || normalized.ownerNormalized !== walletNormalized
      || normalized.canonicalState !== 'available'
      || !normalized.tokenId
      || !validGeneration(normalized.generation)
      || !validRarity(normalized.rarity)
    ) return sourceError('el inventario disponible contiene una identidad no canonica.');
    return {
      document,
      normalized,
      collection,
      assetId: `${config.chainId}:${collection}:${normalized.tokenId}`,
      legacyAssetId: normalized.assetId,
    };
  });
  if (new Set(preliminary.map((item) => item.assetId)).size !== preliminary.length) {
    return sourceError('el inventario disponible contiene identidades duplicadas.');
  }
  if (preliminary.length === 0) return [];

  const legacyLocks = await db.collection<NftAssetLockDocument>('nft_asset_locks').find({
    assetId: { $in: preliminary.map((item) => item.legacyAssetId) },
    status: 'active',
  }).toArray();
  const lockedLegacyAssets = new Set(legacyLocks.map((lock) => String(lock.assetId)));
  const assetIds = new Set(preliminary.map((item) => item.assetId));
  const poolRows = await db.collection<Record<string, unknown>>(CUKIE_POOL_NFT_VAULT_POSITIONS)
    .find({
      chainId: config.chainId,
      vaultAlias: 'CUKIE_POOL_NFT_VAULT',
      vaultAddressNormalized: config.vaultAddressNormalized,
      lifecycleOpen: true,
      assetId: { $in: [...assetIds] },
    }).toArray();
  if (poolRows.some((row) => !canonicalVaultOpenPosition(row, {
    chainId: config.chainId,
    vaultAlias: 'CUKIE_POOL_NFT_VAULT',
    vaultAddress: config.vaultAddressNormalized,
    assetIds,
  }))) return sourceError('la proyeccion abierta del Cukie Pool no es canonica.');

  const masterAddress = ukiNftVaults.mode.cukieMaster === 'custodial'
    ? ukiNftVaults.cukieMasterNftVaultAddress?.toLowerCase() ?? null
    : null;
  if (ukiNftVaults.mode.cukieMaster === 'custodial' && !masterAddress) {
    return sourceError('el vault Cukie Master custodial no tiene direccion canonica.');
  }
  if (masterAddress) {
    await assertVaultCollectionsReady(db, {
      chainId: config.chainId,
      vaultAlias: 'CUKIE_MASTER_NFT_VAULT',
      vaultAddressNormalized: masterAddress,
      collectionAddresses: config.collectionAddresses,
    });
  }
  const masterRows = masterAddress
    ? await db.collection<Record<string, unknown>>(CUKIE_MASTER_NFT_POSITIONS).find({
        chainId: config.chainId,
        vaultAlias: 'CUKIE_MASTER_NFT_VAULT',
        vaultAddressNormalized: masterAddress,
        lifecycleOpen: true,
        assetId: { $in: [...assetIds] },
      }).toArray()
    : [];
  if (masterAddress && masterRows.some((row) => !canonicalVaultOpenPosition(row, {
    chainId: config.chainId,
    vaultAlias: 'CUKIE_MASTER_NFT_VAULT',
    vaultAddress: masterAddress,
    assetIds,
  }))) return sourceError('la proyeccion abierta de Cukie Master no es canonica.');

  const unavailable = new Set([
    ...poolRows.map((row) => String(row.assetId)),
    ...masterRows.map((row) => String(row.assetId)),
  ]);
  return preliminary
    .filter((item) => !unavailable.has(item.assetId) && !lockedLegacyAssets.has(item.legacyAssetId))
    .map((item) => ({
      assetId: item.assetId,
      chain: 'BSC' as const,
      chainId: config.chainId,
      collectionAddress: item.collection,
      tokenId: item.normalized.tokenId!,
      generation: item.normalized.generation as CukiePoolGeneration,
      rarity: item.normalized.rarity as CukiePoolRarity,
      custody: 'wallet' as const,
      status: 'available' as const,
      canDeposit: true as const,
    }));
}
