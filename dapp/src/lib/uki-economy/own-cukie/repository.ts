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
import {
  CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT,
  CANONICAL_OWNERSHIP_HISTORY_GLOBAL_LIMIT,
  canonicalOwnershipHistoryQueryWindow,
  isCanonicalOwnershipHistoryWindowComplete,
  resolveCanonicalOwnershipHistory,
  type CanonicalOwnershipHistoryRow,
  type CanonicalOwnershipIdentity,
} from "./ownership";
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
  /**
   * Period ledgers live in their own collection so the legacy ownership-epoch
   * unique index cannot reject a later period for the same asset/event.
   * Adapters used by legacy tests may omit these methods; the service falls
   * back to the original epoch methods for those in-memory repositories.
   */
  findPeriodEpoch?(epochId: string): Promise<OwnCukieEpoch | null>;
  insertPeriodEpoch?(epoch: OwnCukieEpoch): Promise<void>;
  compareAndSetPeriodEpoch?(
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

const OWNERSHIP_HISTORY_EVENT_LIMIT = CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT;
const OWNERSHIP_HISTORY_GLOBAL_LIMIT = CANONICAL_OWNERSHIP_HISTORY_GLOBAL_LIMIT;

function canonicalDocumentIdentity(document: CanonicalCukieDocument): CanonicalOwnershipIdentity | null {
  if (
    document.network !== undefined
    && document.network !== null
    && String(document.network).toLowerCase() !== "bsc"
  ) return null;
  const chainId = Number(document.chainId);
  const collectionAddressNormalized = typeof document.collectionAddressNormalized === "string"
    ? document.collectionAddressNormalized.trim().toLowerCase()
    : "";
  const tokenId = typeof document.tokenId === "string"
    ? document.tokenId.trim()
    : typeof document.tokenId === "number" && Number.isSafeInteger(document.tokenId)
      ? String(document.tokenId)
      : "";
  if (
    (chainId !== 56 && chainId !== 97)
    || !/^0x[0-9a-f]{40}$/.test(collectionAddressNormalized)
    || !tokenId
  ) return null;
  return {
    chainId,
    collectionAddressNormalized,
    tokenId,
  };
}

function canonicalDocumentOwner(document: CanonicalCukieDocument) {
  const candidate = typeof document.ownerNormalized === "string"
    ? document.ownerNormalized.trim().toLowerCase()
    : typeof document.owner === "string"
      ? document.owner.trim().toLowerCase()
      : typeof document.user === "string"
        ? document.user.trim().toLowerCase()
        : "";
  return /^0x[0-9a-f]{40}$/.test(candidate) && !/^0x0{40}$/.test(candidate)
    ? candidate
    : null;
}

function ownershipKey(identity: CanonicalOwnershipIdentity) {
  return `${identity.chainId}:${identity.collectionAddressNormalized}:${identity.tokenId}`;
}

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveMissingOwnershipEventIds(
  documents: CanonicalCukieDocument[],
  chainEvents: ReturnType<Db["collection"]>,
  session: ClientSession,
) {
  const unresolved = documents
    .filter((document) => !ownershipEventId(document))
    .map((document) => {
      const identity = canonicalDocumentIdentity(document);
      const ownerNormalized = canonicalDocumentOwner(document);
      return identity && ownerNormalized
        ? { document, identity, ownerNormalized, assetId: buildCukiesAssetId(document) }
        : null;
    })
    .filter((item): item is {
      document: CanonicalCukieDocument;
      identity: CanonicalOwnershipIdentity;
      ownerNormalized: string;
      assetId: string;
    } => item !== null);
  const resolved = new Map<string, string>();
  if (unresolved.length === 0) return resolved;

  const filters = unresolved.map(({ identity }) => ({
    chain: "BSC",
    chainId: { $in: [identity.chainId, String(identity.chainId)] },
    contractAlias: { $in: ["TOKEN", "TOKEN_V2"] },
    contractAddress: {
      $regex: `^${escapedRegex(identity.collectionAddressNormalized)}$`,
      $options: "i",
    },
    eventName: "Transfer",
    status: "projected",
    "normalized.tokenId": identity.tokenId,
  }));
  const queryWindow = canonicalOwnershipHistoryQueryWindow(unresolved.length);
  const rows = await chainEvents.find({ $or: filters }, { session })
    .sort({ blockNumber: 1, logIndex: 1 })
    // Read one sentinel row per NFT and one extra row for the shared query
    // boundary. A full page must be distinguishable from an actually complete
    // history; otherwise a late transfer can make an old owner appear current.
    .limit(queryWindow.queryLimit)
    .toArray() as CanonicalOwnershipHistoryRow[];
  const globalTruncated = rows.length > queryWindow.sentinelBoundary
    || rows.length > OWNERSHIP_HISTORY_GLOBAL_LIMIT;
  const byIdentity = new Map<string, CanonicalOwnershipHistoryRow[]>();
  for (const row of rows) {
    const chainId = Number(row.chainId);
    const collectionAddressNormalized = typeof row.contractAddress === "string"
      ? row.contractAddress.toLowerCase()
      : "";
    const tokenId = typeof row.normalized?.tokenId === "string"
      ? row.normalized.tokenId
      : "";
    if ((chainId !== 56 && chainId !== 97) || !collectionAddressNormalized || !tokenId) continue;
    const key = `${chainId}:${collectionAddressNormalized}:${tokenId}`;
    const list = byIdentity.get(key) ?? [];
    // Keep the per-identity sentinel so this NFT is blocked closed when the
    // query returned more history than the resolver can prove complete.
    if (list.length <= OWNERSHIP_HISTORY_EVENT_LIMIT) list.push(row);
    byIdentity.set(key, list);
  }
  const truncatedIdentities = new Set<string>();
  for (const [key, list] of byIdentity) {
    if (list.length > OWNERSHIP_HISTORY_EVENT_LIMIT) truncatedIdentities.add(key);
  }
  for (const item of unresolved) {
    const key = ownershipKey(item.identity);
    const history = byIdentity.get(key) ?? [];
    if (
      globalTruncated
      || truncatedIdentities.has(key)
      || !isCanonicalOwnershipHistoryWindowComplete(history)
    ) continue;
    const result = resolveCanonicalOwnershipHistory(
      history,
      { ...item.identity, expectedOwnerNormalized: item.ownerNormalized },
    );
    if (result.status === "resolved") resolved.set(item.assetId, result.ownershipEventId);
  }
  return resolved;
}

async function hydrateAssets(
  documents: CanonicalCukieDocument[],
  locks: ReturnType<Db["collection"]>,
  chainEvents: ReturnType<Db["collection"]>,
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
  const compatibleOwnershipIds = await resolveMissingOwnershipEventIds(
    documents,
    chainEvents,
    session,
  );
  return documents.flatMap((document) => {
    const assetId = buildCukiesAssetId(document);
    const eventId = ownershipEventId(document) ?? compatibleOwnershipIds.get(assetId) ?? null;
    // Keep an inventory row whose ownership history is incomplete in the
    // snapshot. The availability reader can then surface it as `unknown`
    // instead of silently turning an unresolved Cukie into zero capacity;
    // reservation eligibility still rejects the empty event id.
    return [{
      ...normalizeCukiesInventoryDocument(document, byAsset.get(assetId) ?? [], now),
      ownershipEventId: eventId ?? "",
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
  const chainEvents = db.collection("chain_events");
  const epochs = db.collection<OwnCukieEpoch>("game_owned_cukie_epochs");
  const periodEpochs = db.collection<OwnCukieEpoch>("game_owned_cukie_period_epochs");
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
      return (await hydrateAssets(documents, locks, chainEvents, now, session))
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
      return (await hydrateAssets([document], locks, chainEvents, now, session))[0] ?? null;
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
    findPeriodEpoch: (epochId) => periodEpochs.findOne({ _id: epochId }, options),
    insertPeriodEpoch: async (epoch) => { await periodEpochs.insertOne(epoch, options); },
    async compareAndSetPeriodEpoch(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return periodEpochs.findOneAndReplace({
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
