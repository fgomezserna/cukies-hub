import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import type { NftAssetLockDocument } from '@/lib/nft-inventory/lock-types';

import { DomainValidationError, SchemaNotReadyError } from '../errors';
import { normalizePoolWallet } from './rules';
import {
  assertCukiePoolPositionIntegrity,
  lockMatchesOpenPoolPosition,
} from './service';
import type { CukiePoolPosition } from './types';
import {
  assertCukiePoolVaultIndexerReady,
  CUKIE_POOL_NFT_VAULT_POSITIONS,
  getCukiePoolVaultMode,
  listAvailableCukiePoolVaultAssets,
  requireCukiePoolVaultConfig,
} from './vault-source';

const BSC_ADDRESS = /^0x[0-9a-f]{40}$/;
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_DATE_SECONDS = BigInt('8640000000000');

export type PublicCukiePoolVaultStatus =
  | 'pending'
  | 'active'
  | 'exit_requested'
  | 'withdrawable'
  | 'withdrawn';

type CukiePoolNftVaultPositionDocument = {
  _id: string;
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
  withdrawnAt?: unknown;
  lastEventId?: unknown;
  lastBlockNumber?: unknown;
  lastLogIndex?: unknown;
};

function invalidVaultProjection(message: string): never {
  throw new SchemaNotReadyError(`Proyeccion custodial de Cukie Pool invalida: ${message}`);
}

function requiredProjectionText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    return invalidVaultProjection(`${field} no es texto no vacio.`);
  }
  return value;
}

function projectionDecimal(value: unknown, field: string, positive = false) {
  const text = requiredProjectionText(value, field);
  if (!CANONICAL_DECIMAL.test(text) || (positive && text === '0')) {
    return invalidVaultProjection(`${field} no es un decimal canonico${positive ? ' positivo' : ''}.`);
  }
  return text;
}

function optionalProjectionDecimal(value: unknown, field: string, positive = false) {
  return value === undefined || value === null
    ? null
    : projectionDecimal(value, field, positive);
}

function projectionDate(value: unknown, field: string) {
  const raw = projectionDecimal(value, field);
  const seconds = BigInt(raw);
  if (seconds > MAX_DATE_SECONDS) {
    return invalidVaultProjection(`${field} queda fuera del rango de fecha soportado.`);
  }
  const date = new Date(Number(seconds * BigInt(1_000)));
  if (Number.isNaN(date.getTime())) {
    return invalidVaultProjection(`${field} no se puede representar como fecha.`);
  }
  return { raw, seconds, date };
}

function optionalProjectionDate(value: unknown, field: string) {
  return value === undefined || value === null ? null : projectionDate(value, field);
}

function projectionSafeInteger(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalidVaultProjection(`${field} no es un entero seguro no negativo.`);
  }
  return value;
}

function projectionAddress(value: unknown, field: string) {
  const address = requiredProjectionText(value, field);
  if (!BSC_ADDRESS.test(address) || /^0x0{40}$/.test(address)) {
    return invalidVaultProjection(`${field} no es una direccion BSC normalizada.`);
  }
  return address;
}

function projectVaultPosition(
  document: CukiePoolNftVaultPositionDocument,
  expected: {
    walletNormalized: string;
    chainId: 56 | 97;
    vaultAddressNormalized: string;
    collectionAddresses: Set<string>;
    nowSeconds: bigint;
  },
) {
  if (
    (document.chain !== undefined && document.chain !== 'BSC')
    || document.chainId !== expected.chainId
  ) {
    return invalidVaultProjection('la identidad de red no coincide con la configuracion activa.');
  }
  const collectionAddress = projectionAddress(
    document.collectionAddressNormalized,
    'collectionAddressNormalized',
  );
  if (!expected.collectionAddresses.has(collectionAddress)) {
    return invalidVaultProjection(`la coleccion ${collectionAddress} no esta configurada.`);
  }
  const vaultAddress = projectionAddress(document.vaultAddressNormalized, 'vaultAddressNormalized');
  if (document.vaultAlias !== 'CUKIE_POOL_NFT_VAULT' || vaultAddress !== expected.vaultAddressNormalized) {
    return invalidVaultProjection('la identidad del vault no coincide con la configuracion activa.');
  }
  const beneficiaryNormalized = projectionAddress(
    document.beneficiaryNormalized,
    'beneficiaryNormalized',
  );
  if (beneficiaryNormalized !== expected.walletNormalized) {
    return invalidVaultProjection('la posicion no pertenece a la wallet autenticada.');
  }

  const tokenId = projectionDecimal(document.tokenId, 'tokenId');
  const assetId = `${expected.chainId}:${collectionAddress}:${tokenId}`;
  if (document.assetId !== assetId) {
    return invalidVaultProjection(`assetId no coincide con chain+collection+token (${assetId}).`);
  }
  const depositEpoch = projectionDecimal(document.depositEpoch, 'depositEpoch', true);
  const positionId = `${assetId}:epoch:${depositEpoch}`;
  if (document._id !== positionId || document.positionId !== positionId) {
    return invalidVaultProjection(`positionId no coincide con la identidad y epoch (${positionId}).`);
  }

  const depositedAt = projectionDate(document.depositedAt, 'depositedAt');
  const activationAt = projectionDate(document.activationAt, 'activationAt');
  if (activationAt.seconds <= depositedAt.seconds) {
    return invalidVaultProjection('activationAt debe ser posterior a depositedAt.');
  }
  const depositPeriodId = projectionDecimal(document.depositPeriodId, 'depositPeriodId');
  const activationPeriodId = projectionDecimal(document.activationPeriodId, 'activationPeriodId');
  if (BigInt(activationPeriodId) !== BigInt(depositPeriodId) + BigInt(1)) {
    return invalidVaultProjection('activationPeriodId no sigue al periodo de deposito.');
  }
  const depositCalendarVersion = projectionDecimal(
    document.depositCalendarVersion,
    'depositCalendarVersion',
    true,
  );
  const exitRequestedAt = optionalProjectionDate(document.exitRequestedAt, 'exitRequestedAt');
  const withdrawableAt = optionalProjectionDate(document.withdrawableAt, 'withdrawableAt');
  const withdrawnAt = optionalProjectionDate(document.withdrawnAt, 'withdrawnAt');
  const exitPeriodId = optionalProjectionDecimal(document.exitPeriodId, 'exitPeriodId');
  const exitCalendarVersion = optionalProjectionDecimal(
    document.exitCalendarVersion,
    'exitCalendarVersion',
    true,
  );
  if (exitRequestedAt && exitRequestedAt.seconds < depositedAt.seconds) {
    return invalidVaultProjection('exitRequestedAt es anterior al deposito.');
  }

  if (typeof document.lifecycleOpen !== 'boolean') {
    return invalidVaultProjection('lifecycleOpen no es booleano.');
  }
  if (typeof document.ownerRewardEligible !== 'boolean') {
    return invalidVaultProjection('ownerRewardEligible no es booleano.');
  }
  if (
    typeof document.lifecycle !== 'string'
    || !['pending_activation', 'active', 'exit_requested', 'withdrawable', 'withdrawn']
      .includes(document.lifecycle)
  ) {
    return invalidVaultProjection('lifecycle no es reconocido.');
  }
  requiredProjectionText(document.lastEventId, 'lastEventId');
  projectionSafeInteger(document.lastBlockNumber, 'lastBlockNumber');
  projectionSafeInteger(document.lastLogIndex, 'lastLogIndex');

  let status: PublicCukiePoolVaultStatus;
  if (!document.lifecycleOpen) {
    if (
      document.lifecycle !== 'withdrawn'
      || document.custody !== 'wallet'
      || document.ownerRewardEligible
      || !exitRequestedAt
      || !withdrawableAt
      || !withdrawnAt
      || exitPeriodId === null
      || exitCalendarVersion === null
      || withdrawnAt.seconds < withdrawableAt.seconds
    ) {
      return invalidVaultProjection('la posicion retirada tiene un estado terminal incoherente.');
    }
    status = 'withdrawn';
  } else if (exitRequestedAt || withdrawableAt) {
    if (
      !exitRequestedAt
      || !withdrawableAt
      || withdrawnAt
      || exitPeriodId === null
      || exitCalendarVersion === null
      || document.custody !== 'cukie_pool_nft_vault'
      || document.ownerRewardEligible
      || !['exit_requested', 'withdrawable'].includes(document.lifecycle)
    ) {
      return invalidVaultProjection('la solicitud de salida tiene campos incoherentes.');
    }
    status = expected.nowSeconds >= withdrawableAt.seconds ? 'withdrawable' : 'exit_requested';
  } else {
    if (
      withdrawnAt
      || exitPeriodId !== null
      || exitCalendarVersion !== null
      || document.custody !== 'cukie_pool_nft_vault'
      || !document.ownerRewardEligible
      || !['pending_activation', 'active'].includes(document.lifecycle)
    ) {
      return invalidVaultProjection('la posicion depositada tiene campos incoherentes.');
    }
    status = expected.nowSeconds >= activationAt.seconds ? 'active' : 'pending';
  }

  return {
    source: 'custodial_vault' as const,
    positionId,
    assetId,
    chain: 'BSC' as const,
    chainId: expected.chainId,
    collectionAddress,
    tokenId,
    vaultAddress,
    beneficiaryNormalized,
    depositEpoch,
    status,
    lifecycleOpen: document.lifecycleOpen,
    custody: document.custody as 'cukie_pool_nft_vault' | 'wallet',
    ownerRewardEligible: document.ownerRewardEligible,
    depositedAt: depositedAt.date,
    activationAt: activationAt.date,
    exitRequestedAt: exitRequestedAt?.date ?? null,
    withdrawableAt: withdrawableAt?.date ?? null,
    withdrawnAt: withdrawnAt?.date ?? null,
    depositPeriodId,
    activationPeriodId,
    depositCalendarVersion,
    exitPeriodId,
    exitCalendarVersion,
  };
}

function publicPosition(position: CukiePoolPosition) {
  return {
    positionId: position.positionId,
    assetId: position.assetId,
    tokenId: position.tokenId,
    generation: position.generation,
    rarity: position.rarity,
    gamesQuota: position.gamesQuota,
    gamesRemaining: position.gamesRemaining,
    status: position.status,
    stakedAt: position.stakedAt,
    eligibleAt: position.eligibleAt,
    assignmentExpiresAt: position.assignmentExpiresAt ?? null,
    withdrawalRequestedAt: position.withdrawalRequestedAt ?? null,
    revision: position.revision,
  };
}

export async function listCukiePoolWalletPositions(input: {
  walletAddress: string;
  cursor?: string | null;
  limit?: number;
  now?: Date;
}) {
  const walletNormalized = normalizePoolWallet(input.walletAddress);
  const limit = input.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainValidationError('limit debe estar entre 1 y 100.');
  }
  const cursor = input.cursor?.trim() || null;
  if (cursor && (cursor.length > 256 || !/^[A-Za-z0-9:._-]+$/.test(cursor))) {
    throw new DomainValidationError('cursor no es valido.');
  }
  const db = await getEconomyDb();

  const vaultMode = getCukiePoolNftVaultMode();
  if (vaultMode === 'invalid') {
    throw new SchemaNotReadyError('La configuracion de CukiePoolNftVault es invalida.');
  }
  if (vaultMode === 'custodial') {
    const config = requireCukiePoolVaultConfig();
    const { chainId, vaultAddressNormalized, collectionAddresses } = config;
    const now = input.now ?? new Date();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new DomainValidationError('now debe ser una fecha valida.');
    }
    let indexerStatus: 'ready' | 'unavailable' = 'ready';
    try {
      await assertCukiePoolVaultIndexerReady(db, config, now);
    } catch (error) {
      if (!(error instanceof SchemaNotReadyError)) throw error;
      // Las posiciones ya proyectadas siguen siendo la fuente de recuperacion
      // de NFTs. Un fallo de health bloquea nuevos depositos/asignaciones, no
      // debe ocultar requestExit/withdraw de una posicion conocida.
      indexerStatus = 'unavailable';
    }
    const positions = await db
      .collection<CukiePoolNftVaultPositionDocument>(CUKIE_POOL_NFT_VAULT_POSITIONS)
      .find({
        chainId,
        vaultAlias: 'CUKIE_POOL_NFT_VAULT',
        vaultAddressNormalized,
        beneficiaryNormalized: walletNormalized,
        collectionAddressNormalized: { $in: collectionAddresses },
        ...(cursor ? { _id: { $gt: cursor } } : {}),
      })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .toArray();
    const page = positions.slice(0, limit);
    const expected = {
      walletNormalized,
      chainId,
      vaultAddressNormalized,
      collectionAddresses: new Set(collectionAddresses),
      nowSeconds: BigInt(Math.floor(now.getTime() / 1_000)),
    };
    let availableAssets = [] as Awaited<ReturnType<typeof listAvailableCukiePoolVaultAssets>>;
    if (indexerStatus === 'ready') {
      try {
        availableAssets = await listAvailableCukiePoolVaultAssets(
          db,
          walletNormalized,
          config,
          now,
        );
      } catch (error) {
        if (!(error instanceof SchemaNotReadyError)) throw error;
        indexerStatus = 'unavailable';
        availableAssets = [];
      }
    }
    return {
      mode: 'custodial_vault' as const,
      sourceCollection: CUKIE_POOL_NFT_VAULT_POSITIONS,
      walletNormalized,
      nftCustody: {
        mode: 'custodial' as const,
        chainId,
        vaultAddress: vaultAddressNormalized,
        collectionAddresses,
        indexer: { status: indexerStatus },
      },
      positions: page.map((position) => ({
        ...projectVaultPosition(position, expected),
        sourceHealthy: true,
      })),
      availableAssets,
      nextCursor: positions.length > limit ? page.at(-1)?._id ?? null : null,
      sourceHealthy: indexerStatus === 'ready',
    };
  }

  const positions = await db.collection<CukiePoolPosition>('cukie_pool_positions')
    .find({
      ownerNormalized: walletNormalized,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    })
    .sort({ _id: 1 })
    .limit(limit + 1)
    .toArray();
  const page = positions.slice(0, limit);
  page.forEach(assertCukiePoolPositionIntegrity);

  const open = page.filter((position) => position.lifecycleOpen);
  const locks = open.length === 0 ? [] : await db.collection<NftAssetLockDocument>('nft_asset_locks')
    .find({ lockId: { $in: open.map((position) => position.lockId) }, status: 'active' })
    .toArray();
  const locksById = new Map<string, NftAssetLockDocument[]>();
  for (const lock of locks) {
    locksById.set(lock.lockId, [...(locksById.get(lock.lockId) ?? []), lock]);
  }
  const healthByPositionId = new Map(page.map((position) => [
    position.positionId,
    !position.lifecycleOpen || (
      locksById.get(position.lockId)?.length === 1
      && lockMatchesOpenPoolPosition(
        position,
        locksById.get(position.lockId)![0],
      )
    ),
  ]));

  return {
    mode: 'legacy_mongo' as const,
    sourceCollection: 'cukie_pool_positions' as const,
    walletNormalized,
    positions: page.map((position) => ({
      ...publicPosition(position),
      sourceHealthy: healthByPositionId.get(position.positionId) === true,
    })),
    nextCursor: positions.length > limit ? page.at(-1)?._id ?? null : null,
    sourceHealthy: page.every((position) => (
      healthByPositionId.get(position.positionId) === true
    )),
  };
}

export function isCukiePoolNftVaultReady() {
  return getCukiePoolNftVaultMode() === 'custodial';
}

export function getCukiePoolNftVaultMode() {
  return getCukiePoolVaultMode();
}
