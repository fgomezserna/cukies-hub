import 'server-only';

import type {
  ClientSession,
  Db,
  Filter,
  OptionalUnlessRequiredId,
} from 'mongodb';

import {
  normalizeCukiesInventoryDocument,
  walletLookupCandidates,
  type CukiesInventoryDocument,
  type NftAssetLockDocument as InventoryLockDocument,
} from '@/lib/nft-inventory';
import {
  createMongoNftAssetLockRepository,
  type NftAssetLockRepository,
} from '@/lib/nft-inventory/lock-repository';
import {
  createNftAssetLockService,
} from '@/lib/nft-inventory/locks';

import type {
  CukiePoolAssignment,
  CukiePoolAssignmentCursor,
  CukiePoolAssetSnapshot,
  CukiePoolEvent,
  CukiePoolGameSessionLifecycle,
  CukiePoolPosition,
} from './types';
import type { GameEconomySession } from '../game-economy/types';

export type CukiePoolLockService = ReturnType<typeof createNftAssetLockService>;

export interface CukiePoolRepository {
  findWalletAsset(
    ownerNormalized: string,
    assetId: string,
    now: Date,
  ): Promise<CukiePoolAssetSnapshot | null>;
  findEventByIdempotencyKey(idempotencyKey: string): Promise<CukiePoolEvent | null>;
  insertEvent(event: CukiePoolEvent): Promise<void>;
  findPosition(positionId: string): Promise<CukiePoolPosition | null>;
  findOpenPositionByAssetId(assetId: string): Promise<CukiePoolPosition | null>;
  findPositionByIdempotencyKey(idempotencyKey: string): Promise<CukiePoolPosition | null>;
  insertPosition(position: CukiePoolPosition): Promise<void>;
  compareAndSetPosition(
    current: CukiePoolPosition,
    replacement: CukiePoolPosition,
  ): Promise<CukiePoolPosition | null>;
  listOpenPositions(limit: number, afterPositionId?: string): Promise<CukiePoolPosition[]>;
  listAssignablePositions(
    limit: number,
    after?: CukiePoolAssignmentCursor,
  ): Promise<CukiePoolPosition[]>;
  findAssignmentBySessionId(sessionId: string): Promise<CukiePoolAssignment | null>;
  findAssignmentByIdempotencyKey(idempotencyKey: string): Promise<CukiePoolAssignment | null>;
  insertAssignment(assignment: CukiePoolAssignment): Promise<void>;
  compareAndSetAssignment(
    current: CukiePoolAssignment,
    replacement: CukiePoolAssignment,
  ): Promise<CukiePoolAssignment | null>;
  listExpiredAssignments(now: Date, limit: number): Promise<CukiePoolAssignment[]>;
  findGameSessionLifecycle(sessionId: string): Promise<CukiePoolGameSessionLifecycle | null>;
}

export type CukiePoolTransactionContext = {
  repository: CukiePoolRepository;
  lockService: CukiePoolLockService;
  lockRepository: NftAssetLockRepository;
};

export type CukiePoolTransactionRunner = <T>(
  work: (context: CukiePoolTransactionContext) => Promise<T>,
) => Promise<T>;

function cursorFilter(after?: CukiePoolAssignmentCursor): Filter<CukiePoolPosition> {
  if (!after) return {};
  return {
    $or: [
      { poolPriority: { $gt: after.poolPriority } },
      {
        poolPriority: after.poolPriority,
        eligibleAt: { $gt: after.eligibleAt },
      },
      {
        poolPriority: after.poolPriority,
        eligibleAt: after.eligibleAt,
        stakedAt: { $gt: after.stakedAt },
      },
      {
        poolPriority: after.poolPriority,
        eligibleAt: after.eligibleAt,
        stakedAt: after.stakedAt,
        _id: { $gt: after.documentId },
      },
    ],
  };
}

function exactOptionalDate(field: string, value?: Date) {
  return value ? { [field]: value } : { [field]: { $exists: false } };
}

function exactOptionalText(field: string, value?: string) {
  return value ? { [field]: value } : { [field]: { $exists: false } };
}

export function createMongoCukiePoolRepository(
  db: Db,
  session: ClientSession,
): CukiePoolRepository {
  const positions = db.collection<CukiePoolPosition>('cukie_pool_positions');
  const assignments = db.collection<CukiePoolAssignment>('cukie_pool_assignments');
  const events = db.collection<CukiePoolEvent>('cukie_pool_events');
  const cukies = db.collection<CukiesInventoryDocument & { _id: unknown }>('cukies');
  const locks = db.collection<InventoryLockDocument>('nft_asset_locks');
  const gameSessions = db.collection<GameEconomySession>('game_economy_sessions');
  const options = { session };

  return {
    async findWalletAsset(ownerNormalized, assetId, now) {
      const candidates = walletLookupCandidates(ownerNormalized);
      if (!assetId.startsWith('cukies:') || assetId.length <= 'cukies:'.length) return null;
      const rawDocumentId = assetId.slice('cukies:'.length);
      const numericDocumentId = /^(0|[1-9][0-9]*)$/.test(rawDocumentId)
        && Number.isSafeInteger(Number(rawDocumentId))
        ? Number(rawDocumentId)
        : null;
      const documentIds: unknown[] = numericDocumentId === null
        ? [rawDocumentId]
        : [rawDocumentId, numericDocumentId];
      // La economia nueva exige ownerNormalized materializado. No hacemos un
      // scan por campos owner/wallet/user legacy dentro de una transaccion.
      const document = await cukies.findOne({
        _id: { $in: documentIds },
        ownerNormalized: { $in: candidates },
      } as unknown as Filter<CukiesInventoryDocument & { _id: unknown }>, options);
      if (!document) return null;
      const initial = normalizeCukiesInventoryDocument(document, [], now);
      if (initial.assetId !== assetId) return null;

      const activeLocks = await locks.find(
        { assetId, status: 'active' },
        options,
      ).toArray();
      return normalizeCukiesInventoryDocument(document, activeLocks, now);
    },
    findEventByIdempotencyKey: (idempotencyKey) => (
      events.findOne({ idempotencyKey }, options)
    ),
    insertEvent: async (event) => {
      await events.insertOne(event, options);
    },
    findPosition: (positionId) => positions.findOne({ _id: positionId }, options),
    findOpenPositionByAssetId: (assetId) => positions.findOne(
      { assetId, lifecycleOpen: true },
      options,
    ),
    findPositionByIdempotencyKey: (idempotencyKey) => positions.findOne(
      { idempotencyKey },
      options,
    ),
    insertPosition: async (position) => {
      await positions.insertOne(position, options);
    },
    async compareAndSetPosition(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return positions.findOneAndReplace(
        {
          _id: current._id,
          revision: current.revision,
          status: current.status,
          lifecycleOpen: current.lifecycleOpen,
          gamesRemaining: current.gamesRemaining,
          lockId: current.lockId,
          lockFencingToken: current.lockFencingToken,
          ...exactOptionalText('assignmentSessionId', current.assignmentSessionId),
          ...exactOptionalDate('assignmentExpiresAt', current.assignmentExpiresAt),
          ...exactOptionalDate('withdrawalRequestedAt', current.withdrawalRequestedAt),
        },
        withoutId as OptionalUnlessRequiredId<CukiePoolPosition>,
        { ...options, returnDocument: 'after' },
      );
    },
    listOpenPositions: (limit, afterPositionId) => positions.find(
      {
        lifecycleOpen: true,
        ...(afterPositionId ? { _id: { $gt: afterPositionId } } : {}),
      },
      options,
    ).sort({ _id: 1 }).limit(limit).toArray(),
    listAssignablePositions: (limit, after) => positions.find(
      {
        status: 'active',
        lifecycleOpen: true,
        gamesRemaining: { $gt: 0 },
        withdrawalRequestedAt: { $exists: false },
        ...cursorFilter(after),
      },
      options,
    ).sort({ poolPriority: 1, eligibleAt: 1, stakedAt: 1, _id: 1 }).limit(limit).toArray(),
    findAssignmentBySessionId: (sessionId) => assignments.findOne({ sessionId }, options),
    findAssignmentByIdempotencyKey: (idempotencyKey) => assignments.findOne(
      { idempotencyKey },
      options,
    ),
    insertAssignment: async (assignment) => {
      await assignments.insertOne(assignment, options);
    },
    async compareAndSetAssignment(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return assignments.findOneAndReplace(
        {
          _id: current._id,
          revision: current.revision,
          status: current.status,
          expiresAt: current.expiresAt,
        },
        withoutId as OptionalUnlessRequiredId<CukiePoolAssignment>,
        { ...options, returnDocument: 'after' },
      );
    },
    listExpiredAssignments: (now, limit) => assignments
      .find({
        status: 'active',
        expiresAt: { $lte: now },
        custodyMode: { $ne: 'custodial' },
      }, options)
      .sort({ expiresAt: 1, _id: 1 })
      .limit(limit)
      .toArray(),
    async findGameSessionLifecycle(sessionId) {
      const session = await gameSessions.findOne(
        { _id: sessionId },
        {
          ...options,
          projection: {
            _id: 1,
            sessionId: 1,
            status: 1,
            revision: 1,
            settlementIntent: 1,
            terminalIntent: 1,
            terminal: 1,
          },
        },
      );
      if (!session) return null;
      return {
        sessionId: session.sessionId,
        status: session.status,
        revision: session.revision,
        hasSettlementIntent: Boolean(session.settlementIntent),
        terminalIntentStatus: session.terminalIntent?.status ?? null,
        terminalStatus: session.terminal ? session.status : null,
      };
    },
  };
}

export function createCukiePoolTransactionContext(
  db: Db,
  session: ClientSession,
): CukiePoolTransactionContext {
  const lockRepository = createMongoNftAssetLockRepository(db, session);
  const lockRunner = <T>(work: (repository: NftAssetLockRepository) => Promise<T>) => (
    work(lockRepository)
  );
  return {
    repository: createMongoCukiePoolRepository(db, session),
    lockService: createNftAssetLockService(lockRunner),
    lockRepository,
  };
}

export const mongoCukiePoolTransactionRunner: CukiePoolTransactionRunner = async (work) => {
  const { withEconomyTransaction } = await import('@/lib/indexer-db/mongodb');
  return withEconomyTransaction((db, session) => (
    work(createCukiePoolTransactionContext(db, session))
  ));
};

export function isCukiePoolDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}
