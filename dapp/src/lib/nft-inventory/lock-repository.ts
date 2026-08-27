import 'server-only';

import type { ClientSession, Db, OptionalUnlessRequiredId } from 'mongodb';

import { DomainConflictError, UkiEconomyError } from '@/lib/uki-economy/errors';

import type {
  NftAssetLockDocument,
  NftAssetLockEventDocument,
} from './lock-types';

export type ActiveLockCasOptions = {
  expiresAtLte?: Date;
  notExpiredAt?: Date;
};

export interface NftAssetLockRepository {
  findLockById(lockId: string): Promise<NftAssetLockDocument | null>;
  findLockByIdempotencyKey(idempotencyKey: string): Promise<NftAssetLockDocument | null>;
  findEventByIdempotencyKey(idempotencyKey: string): Promise<NftAssetLockEventDocument | null>;
  findActiveLockByAssetId(assetId: string): Promise<NftAssetLockDocument | null>;
  findExpiredActiveLocks(
    now: Date,
    limit: number,
    excludeReasons?: NftAssetLockDocument['reason'][],
  ): Promise<NftAssetLockDocument[]>;
  insertLock(lock: NftAssetLockDocument): Promise<void>;
  compareAndSetActiveLock(
    lockId: string,
    expectedFencingToken: number,
    replacement: NftAssetLockDocument,
    options?: ActiveLockCasOptions,
  ): Promise<NftAssetLockDocument | null>;
  insertEvent(event: NftAssetLockEventDocument): Promise<void>;
  enqueueRecalculation(input: {
    idempotencyKey: string;
    walletNormalized: string;
    sourceEventId: string;
    reason: string;
    availableAt: Date;
  }): Promise<void>;
}

export type NftAssetLockTransactionRunner = <T>(
  work: (repository: NftAssetLockRepository) => Promise<T>,
) => Promise<T>;

export function isMongoDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

export function mapNftAssetLockPersistenceError(
  error: unknown,
  message = 'Conflicto al persistir el lock NFT.',
) {
  if (error instanceof UkiEconomyError) return error;
  if (isMongoDuplicateKeyError(error)) {
    return new DomainConflictError(message, {
      persistenceFailure: 'DUPLICATE_KEY',
      mongoCode: 11000,
    });
  }
  return error;
}

export function isDuplicatePersistenceConflict(error: unknown) {
  return error instanceof DomainConflictError
    && error.details?.persistenceFailure === 'DUPLICATE_KEY';
}

export function createMongoNftAssetLockRepository(
  db: Db,
  session: ClientSession,
): NftAssetLockRepository {
  const locks = db.collection<NftAssetLockDocument>('nft_asset_locks');
  const events = db.collection<NftAssetLockEventDocument>('nft_asset_lock_events');
  const recalculations = db.collection<{ _id: string } & Record<string, unknown>>(
    'cukie_master_recalculation_jobs',
  );

  return {
    findLockById: (lockId) => locks.findOne({ _id: lockId }, { session }),
    findLockByIdempotencyKey: (idempotencyKey) => locks.findOne({ idempotencyKey }, { session }),
    findEventByIdempotencyKey: (idempotencyKey) => events.findOne({ idempotencyKey }, { session }),
    findActiveLockByAssetId: (assetId) => locks.findOne({ assetId, status: 'active' }, { session }),
    findExpiredActiveLocks: (now, limit, excludeReasons = []) => locks
      .find({
        status: 'active',
        expiresAt: { $lte: now },
        ...(excludeReasons.length > 0 ? { reason: { $nin: excludeReasons } } : {}),
      }, { session })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(limit)
      .toArray(),
    insertLock: async (lock) => {
      await locks.insertOne(lock, { session });
    },
    compareAndSetActiveLock: async (
      lockId,
      expectedFencingToken,
      replacement,
      options,
    ) => {
      const { _id: _ignoredId, ...withoutId } = replacement;
      return locks.findOneAndReplace(
        {
          _id: lockId,
          status: 'active',
          fencingToken: expectedFencingToken,
          ...(options?.expiresAtLte ? { expiresAt: { $lte: options.expiresAtLte } } : {}),
          ...(options?.notExpiredAt ? {
            $or: [
              { expiresAt: { $exists: false } },
              { expiresAt: { $gt: options.notExpiredAt } },
            ],
          } : {}),
        },
        withoutId as OptionalUnlessRequiredId<NftAssetLockDocument>,
        { session, returnDocument: 'after' },
      );
    },
    insertEvent: async (event) => {
      await events.insertOne(event, { session });
    },
    enqueueRecalculation: async (input) => {
      const id = `nft-lock:${input.idempotencyKey}:${input.walletNormalized}`;
      await recalculations.updateOne(
        { _id: id },
        {
          $setOnInsert: {
            _id: id,
            walletNormalized: input.walletNormalized,
            route: 'nft',
            status: 'pending',
            sourceType: 'nft_lock_event',
            sourceEventId: input.sourceEventId,
            reason: input.reason,
            availableAt: input.availableAt,
            attempts: 0,
            fenceToken: 0,
            createdAt: input.availableAt,
            updatedAt: input.availableAt,
          },
        },
        { upsert: true, session },
      );
    },
  };
}

export const mongoNftAssetLockTransactionRunner: NftAssetLockTransactionRunner = async (work) => {
  const { withEconomyTransaction } = await import('@/lib/indexer-db/mongodb');

  return withEconomyTransaction((db, session) => (
    work(createMongoNftAssetLockRepository(db, session))
  ));
};
