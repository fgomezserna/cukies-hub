import 'server-only';

import type { ClientSession, Db } from 'mongodb';

import {
  getCukieMasterNftRouteSummaryFromDb,
  type NftInventoryBlocker,
} from '@/lib/nft-inventory';
import { createMongoNftAssetLockRepository } from '@/lib/nft-inventory/lock-repository';
import { createNftAssetLockService } from '@/lib/nft-inventory/locks';
import type { NftAssetLockDocument } from '@/lib/nft-inventory/lock-types';
import { normalizeWalletAddress } from '@/lib/wallet-address';

import { DomainConflictError, DomainNotFoundError, DomainValidationError } from '../errors';
import { createMongoCukieMasterRepository } from './repository';
import { createCukieMasterService } from './service';

export type CukieMasterNftOperation = 'soft_stake' | 'unstake';

export type CukieMasterNftInventoryItem = {
  assetId: string;
  tokenId: string | null;
  rarity: string;
  rarityPoints: number | null;
  state: string;
  blockers: NftInventoryBlocker[];
  lock: null | { lockId: string; fencingToken: number };
  canSoftStake: boolean;
  canUnstake: boolean;
};

export type CukieMasterNftOperationInput = {
  walletAddress: string;
  operation: CukieMasterNftOperation;
  assetId: string;
  lockId?: string;
  expectedFencingToken?: number;
  idempotencyKey: string;
  now?: Date;
};

function requiredText(value: unknown, label: string, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new DomainValidationError(`${label} no es valido.`);
  }
  return value.trim();
}

function validTimestamp(value = new Date()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError('now debe ser una fecha valida.');
  }
  return new Date(value.getTime());
}

async function inventoryFromDb(
  db: Db,
  walletAddress: string,
  now: Date,
  session?: ClientSession,
): Promise<CukieMasterNftInventoryItem[]> {
  const summary = await getCukieMasterNftRouteSummaryFromDb({
    walletAddress,
    now,
    db,
    session,
    requireSoftStake: false,
  });
  const normalized = [
    ...summary.eligibleAssets.map((asset) => ({
      asset,
      rarityPoints: asset.rarityPoints,
      blockers: [] as NftInventoryBlocker[],
    })),
    ...summary.rejectedAssets.map(({ asset, blockers }) => ({
      asset,
      rarityPoints: null,
      blockers,
    })),
  ];
  const assetIds = normalized.map(({ asset }) => asset.assetId);
  const locks = assetIds.length === 0 ? [] : await db
    .collection<NftAssetLockDocument>('nft_asset_locks')
    .find({ assetId: { $in: assetIds }, status: 'active' }, { session })
    .toArray();
  const activeByAsset = new Map(locks.map((lock) => [lock.assetId, lock]));
  return normalized
    .map(({ asset, rarityPoints, blockers }) => {
      const lock = activeByAsset.get(asset.assetId);
      const compatible = lock?.reason === 'soft_stake'
        && lock.ownerNormalized === summary.walletNormalized;
      return {
        assetId: asset.assetId,
        tokenId: asset.tokenId,
        rarity: asset.rarity,
        rarityPoints,
        state: asset.canonicalState,
        blockers,
        lock: compatible && lock
          ? { lockId: lock.lockId, fencingToken: lock.fencingToken }
          : null,
        canSoftStake: asset.canonicalState === 'available' && blockers.length === 0,
        canUnstake: asset.canonicalState === 'soft_staked' && compatible,
      } satisfies CukieMasterNftInventoryItem;
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export async function getCukieMasterNftInventory(
  walletAddress: string,
  now = new Date(),
) {
  const wallet = requiredText(walletAddress, 'walletAddress', 80);
  const timestamp = validTimestamp(now);
  const { getEconomyDb } = await import('@/lib/indexer-db/mongodb');
  return inventoryFromDb(await getEconomyDb(), wallet, timestamp);
}

export async function mutateCukieMasterNft(input: CukieMasterNftOperationInput) {
  const walletAddress = requiredText(input.walletAddress, 'walletAddress', 80);
  const walletNormalized = normalizeWalletAddress(walletAddress);
  if (!walletNormalized) throw new DomainValidationError('walletAddress no se pudo normalizar.');
  const assetId = requiredText(input.assetId, 'assetId');
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey');
  if (idempotencyKey.startsWith('system:nft-lock:')) {
    throw new DomainValidationError('idempotencyKey usa un namespace reservado.');
  }
  const now = validTimestamp(input.now);
  if (input.operation !== 'soft_stake' && input.operation !== 'unstake') {
    throw new DomainValidationError('operation no es valida.');
  }

  const { withEconomyTransaction } = await import('@/lib/indexer-db/mongodb');
  return withEconomyTransaction(async (db, session) => {
    const inventory = await inventoryFromDb(db, walletAddress, now, session);
    const asset = inventory.find((item) => item.assetId === assetId);
    if (!asset) throw new DomainNotFoundError('El NFT no pertenece al inventario autenticado.');

    const lockRepository = createMongoNftAssetLockRepository(db, session);
    const lockService = createNftAssetLockService(async (work) => work(lockRepository));
    let lock: NftAssetLockDocument;

    if (input.operation === 'soft_stake') {
      const active = await lockRepository.findActiveLockByAssetId(assetId);
      const isReplay = active?.reason === 'soft_stake'
        && active.ownerNormalized === walletNormalized
        && active.idempotencyKey === idempotencyKey;
      if (!asset.canSoftStake && !isReplay) {
        throw new DomainConflictError('El NFT no esta disponible para soft-stake.');
      }
      lock = await lockService.acquireNftAssetLock({
        assetId,
        ownerNormalized: walletNormalized,
        reason: 'soft_stake',
        createdBy: `wallet:${walletNormalized}`,
        idempotencyKey,
        now,
      });
    } else {
      const lockId = requiredText(input.lockId, 'lockId');
      const expectedFencingToken = input.expectedFencingToken;
      if (!Number.isSafeInteger(expectedFencingToken) || (expectedFencingToken ?? 0) < 1) {
        throw new DomainValidationError('expectedFencingToken no es valido.');
      }
      const active = await lockRepository.findLockById(lockId);
      const prior = await lockRepository.findEventByIdempotencyKey(idempotencyKey);
      const isReplay = prior?.operation === 'release'
        && prior.resultingLock.assetId === assetId
        && prior.resultingLock.ownerNormalized === walletNormalized;
      if (!isReplay && (
        !asset.canUnstake
        || !active
        || active.assetId !== assetId
        || active.ownerNormalized !== walletNormalized
        || active.reason !== 'soft_stake'
      )) {
        throw new DomainConflictError('El soft-stake NFT no pertenece a la wallet autenticada.');
      }
      lock = await lockService.releaseNftAssetLock({
        lockId,
        expectedFencingToken: expectedFencingToken!,
        actor: `wallet:${walletNormalized}`,
        releaseReason: 'wallet_soft_unstake',
        idempotencyKey,
        now,
      });
    }

    const masterRepository = createMongoCukieMasterRepository(db, session);
    const masterService = createCukieMasterService(async (work) => work(masterRepository));
    const recalculation = await masterService.recalculateCukieMasterWallet(
      walletAddress,
      now,
      `nft-operation:${idempotencyKey}`,
    );
    return {
      operation: input.operation,
      assetId,
      lock: {
        lockId: lock.lockId,
        status: lock.status,
        fencingToken: lock.fencingToken,
      },
      nftPosition: recalculation.positions.nft,
    };
  });
}
