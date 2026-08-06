import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import type { NftAssetLockDocument } from '@/lib/nft-inventory/lock-types';

import { DomainValidationError } from '../errors';
import { normalizePoolWallet } from './rules';
import {
  assertCukiePoolPositionIntegrity,
  lockMatchesOpenPoolPosition,
} from './service';
import type { CukiePoolPosition } from './types';

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
