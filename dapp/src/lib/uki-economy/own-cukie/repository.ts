import "server-only";

import type { ClientSession, Db, Filter, OptionalUnlessRequiredId } from "mongodb";

import {
  buildCukiesAssetId,
  normalizeCukiesInventoryDocument,
  walletLookupCandidates,
  type CukiesInventoryDocument,
  type NftAssetLockDocument as InventoryLockDocument,
} from "@/lib/nft-inventory";
import {
  createMongoNftAssetLockRepository,
  type NftAssetLockRepository,
} from "@/lib/nft-inventory/lock-repository";
import { createNftAssetLockService } from "@/lib/nft-inventory/locks";

import { DomainConflictError } from "../errors";
import { OWN_CUKIE_MAX_WALLET_ASSETS } from "./rules";
import type {
  OwnCukieAssignment,
  OwnCukieAssetSnapshot,
  OwnCukieEpoch,
  OwnCukieEvent,
} from "./types";

type CanonicalCukieDocument = CukiesInventoryDocument & {
  _id: unknown;
};

export type OwnCukieLockService = ReturnType<typeof createNftAssetLockService>;

export interface OwnCukieRepository {
  listWalletAssets(ownerNormalized: string, now: Date): Promise<OwnCukieAssetSnapshot[]>;
  findAsset(assetId: string, now: Date): Promise<OwnCukieAssetSnapshot | null>;
  findEpoch(epochId: string): Promise<OwnCukieEpoch | null>;
  insertEpoch(epoch: OwnCukieEpoch): Promise<void>;
  compareAndSetEpoch(
    current: OwnCukieEpoch,
    replacement: OwnCukieEpoch,
  ): Promise<OwnCukieEpoch | null>;
  findAssignmentById(assignmentId: string): Promise<OwnCukieAssignment | null>;
  findAssignmentBySessionId(sessionId: string): Promise<OwnCukieAssignment | null>;
  findAssignmentByIdempotencyKey(idempotencyKey: string): Promise<OwnCukieAssignment | null>;
  insertAssignment(assignment: OwnCukieAssignment): Promise<void>;
  compareAndSetAssignment(
    current: OwnCukieAssignment,
    replacement: OwnCukieAssignment,
  ): Promise<OwnCukieAssignment | null>;
  findEventByIdempotencyKey(idempotencyKey: string): Promise<OwnCukieEvent | null>;
  insertEvent(event: OwnCukieEvent): Promise<void>;
}

export type OwnCukieTransactionContext = {
  repository: OwnCukieRepository;
  lockService: OwnCukieLockService;
  lockRepository: NftAssetLockRepository;
};

export type OwnCukieTransactionRunner = <T>(
  work: (context: OwnCukieTransactionContext) => Promise<T>,
) => Promise<T>;

function rawDocumentIds(assetId: string) {
  if (!assetId.startsWith("cukies:") || assetId.length <= "cukies:".length) return [];
  const raw = assetId.slice("cukies:".length);
  const numeric = /^(0|[1-9][0-9]*)$/.test(raw) && Number.isSafeInteger(Number(raw))
    ? Number(raw)
    : null;
  return numeric === null ? [raw] : [raw, numeric];
}

function ownershipEventId(document: CanonicalCukieDocument) {
  return typeof document.ownershipEventId === "string"
    && document.ownershipEventId.trim().length > 0
    ? document.ownershipEventId.trim()
    : null;
}

async function hydrateAssets(
  documents: CanonicalCukieDocument[],
  locks: ReturnType<Db["collection"]>,
  now: Date,
  session: ClientSession,
) {
  const ids = documents.map(buildCukiesAssetId);
  const lockRows = ids.length > 0
    ? await locks.find({ assetId: { $in: ids }, status: "active" }, { session }).toArray()
    : [];
  const byAsset = new Map<string, InventoryLockDocument[]>();
  for (const lock of lockRows as InventoryLockDocument[]) {
    if (typeof lock.assetId !== "string") continue;
    const list = byAsset.get(lock.assetId) ?? [];
    list.push(lock);
    byAsset.set(lock.assetId, list);
  }
  return documents.flatMap((document) => {
    const eventId = ownershipEventId(document);
    if (!eventId) return [];
    const assetId = buildCukiesAssetId(document);
    return [{
      ...normalizeCukiesInventoryDocument(document, byAsset.get(assetId) ?? [], now),
      ownershipEventId: eventId,
    } satisfies OwnCukieAssetSnapshot];
  });
}

function exactOptionalText(field: string, value?: string) {
  return value ? { [field]: value } : { [field]: { $exists: false } };
}

function exactOptionalDate(field: string, value?: Date) {
  return value ? { [field]: value } : { [field]: { $exists: false } };
}

export function createMongoOwnCukieRepository(
  db: Db,
  session: ClientSession,
): OwnCukieRepository {
  const cukies = db.collection<CanonicalCukieDocument>("cukies");
  const locks = db.collection<InventoryLockDocument>("nft_asset_locks");
  const epochs = db.collection<OwnCukieEpoch>("game_owned_cukie_epochs");
  const assignments = db.collection<OwnCukieAssignment>("game_owned_cukie_assignments");
  const events = db.collection<OwnCukieEvent>("game_owned_cukie_events");
  const options = { session };

  return {
    async listWalletAssets(ownerNormalized, now) {
      const documents = await cukies.find({
        ownerNormalized: { $in: walletLookupCandidates(ownerNormalized) },
      } as Filter<CanonicalCukieDocument>, options)
        .limit(OWN_CUKIE_MAX_WALLET_ASSETS + 1)
        .toArray();
      if (documents.length > OWN_CUKIE_MAX_WALLET_ASSETS) {
        throw new DomainConflictError(
          `La wallet supera ${OWN_CUKIE_MAX_WALLET_ASSETS} Cukies; seleccion automatica bloqueada.`,
        );
      }
      return (await hydrateAssets(documents, locks, now, session))
        .sort((left, right) => left.assetId.localeCompare(right.assetId));
    },
    async findAsset(assetId, now) {
      const ids = rawDocumentIds(assetId);
      if (ids.length === 0) return null;
      const document = await cukies.findOne(
        { _id: { $in: ids } } as unknown as Filter<CanonicalCukieDocument>,
        options,
      );
      if (!document || buildCukiesAssetId(document) !== assetId) return null;
      return (await hydrateAssets([document], locks, now, session))[0] ?? null;
    },
    findEpoch: (epochId) => epochs.findOne({ _id: epochId }, options),
    insertEpoch: async (epoch) => { await epochs.insertOne(epoch, options); },
    async compareAndSetEpoch(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return epochs.findOneAndReplace({
        _id: current._id,
        revision: current.revision,
        status: current.status,
        gamesRemaining: current.gamesRemaining,
        ...exactOptionalText("assignmentSessionId", current.assignmentSessionId),
        ...exactOptionalDate("assignmentExpiresAt", current.assignmentExpiresAt),
      }, withoutId as OptionalUnlessRequiredId<OwnCukieEpoch>, {
        ...options,
        returnDocument: "after",
      });
    },
    findAssignmentById: (assignmentId) => assignments.findOne({ _id: assignmentId }, options),
    findAssignmentBySessionId: (sessionId) => assignments.findOne({ sessionId }, options),
    findAssignmentByIdempotencyKey: (idempotencyKey) => assignments.findOne({ idempotencyKey }, options),
    insertAssignment: async (assignment) => { await assignments.insertOne(assignment, options); },
    async compareAndSetAssignment(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return assignments.findOneAndReplace({
        _id: current._id,
        revision: current.revision,
        status: current.status,
        lockFencingToken: current.lockFencingToken,
      }, withoutId as OptionalUnlessRequiredId<OwnCukieAssignment>, {
        ...options,
        returnDocument: "after",
      });
    },
    findEventByIdempotencyKey: (idempotencyKey) => events.findOne({ idempotencyKey }, options),
    insertEvent: async (event) => { await events.insertOne(event, options); },
  };
}

export function createOwnCukieTransactionContext(
  db: Db,
  session: ClientSession,
): OwnCukieTransactionContext {
  const lockRepository = createMongoNftAssetLockRepository(db, session);
  return {
    repository: createMongoOwnCukieRepository(db, session),
    lockRepository,
    lockService: createNftAssetLockService((work) => work(lockRepository)),
  };
}

export const mongoOwnCukieTransactionRunner: OwnCukieTransactionRunner = async (work) => {
  const { withEconomyTransaction } = await import("@/lib/indexer-db/mongodb");
  return withEconomyTransaction((db, session) => work(createOwnCukieTransactionContext(db, session)));
};
