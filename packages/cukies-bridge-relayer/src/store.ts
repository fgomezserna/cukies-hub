import { randomUUID } from 'node:crypto';

import {
  MongoClient,
  type Collection,
  type Db,
  type Document,
} from 'mongodb';
import { TronWeb } from 'tronweb';

import { assertBridgeMetadata, PermanentBridgeError } from './metadata.js';
import type {
  BridgeEvidenceProvider,
  BridgeMetadata,
  BridgeRelayerJob,
  BridgeRelayerStore,
  ConfirmedBridgeRequest,
  TronPollCursor,
} from './types.js';
import type { BridgeRelayerConfig } from './config.js';

type CursorDocument = Document & {
  _id: string;
  nextTimestampMs?: number;
  fingerprint?: string | null;
};

const cursorId = 'TRON:MAINNET:LEGACY_BRIDGE:JumpInBridge';
const LEGACY_TOKEN_TYPE_UNIT = 1_000_000_000_000n;
const LEGACY_TOKEN_CHAIN_UNIT = 100_000_000_000_000n;

const tronOwnerAbi = [{
  type: 'function',
  name: 'ownerOf',
  stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  outputs: [{ name: '', type: 'address' }],
}, {
  type: 'function',
  name: 'getCukie',
  stateMutability: 'view',
  inputs: [{ name: 'index', type: 'uint256' }],
  outputs: [
    { name: '', type: 'uint256' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
    { name: '', type: 'uint8' },
  ],
}] as const;

function integer(value: unknown, label: string) {
  let numeric: bigint;
  try {
    numeric = typeof value === 'bigint' ? value : BigInt(String(value ?? ''));
  } catch {
    throw new PermanentBridgeError(`${label} no es un entero valido.`);
  }
  if (numeric < 0n) throw new PermanentBridgeError(`${label} no puede ser negativo.`);
  return numeric;
}

function sourceKey(request: ConfirmedBridgeRequest) {
  return `${request.sourceTxHash}:${request.sourceEventIndex}`;
}

/** Recover the legacy type slot without coercing the uint256 through Number. */
export function deriveLegacyTypeId(tokenId: string) {
  let numericTokenId: bigint;
  try {
    numericTokenId = BigInt(tokenId);
  } catch {
    throw new PermanentBridgeError(`tokenId legacy invalido: ${tokenId}.`);
  }
  const typeId = (numericTokenId % LEGACY_TOKEN_CHAIN_UNIT) / LEGACY_TOKEN_TYPE_UNIT;
  if (typeId < 1n || typeId > 6n) {
    throw new PermanentBridgeError(`typeId legacy no derivable para ${tokenId}.`);
  }
  return typeId;
}

function unsetLease() {
  return { lockedBy: '', lockedUntil: '', leaseToken: '' } as const;
}

export class MongoBridgeRelayerStore
implements BridgeRelayerStore, BridgeEvidenceProvider {
  private readonly client: MongoClient;
  readonly db: Db;
  private readonly tronWeb: TronWeb;

  constructor(private readonly config: BridgeRelayerConfig) {
    this.client = new MongoClient(config.mongoUrl);
    this.db = this.client.db(config.dbName);
    this.tronWeb = new TronWeb({
      fullHost: config.tronRpcUrl,
      headers: config.tronApiKey
        ? { 'TRON-PRO-API-KEY': config.tronApiKey }
        : undefined,
    });
  }

  /** TronGrid triggerconstantcontract requires a valid owner_address even for view calls. */
  private tronCallOptions() {
    return { from: this.config.tronBridgeAddress };
  }

  async connect() {
    await this.client.connect();
    return this;
  }

  async close() {
    await this.client.close();
  }

  jobs(): Collection<BridgeRelayerJob> {
    return this.db.collection<BridgeRelayerJob>('cukies_bridge_relayer_jobs');
  }

  async ensureIndexes() {
    await Promise.all([
      // The source event identity is the only durable idempotency key for the
      // legacy ABI (there is no transferId in JumpInBridge).
      this.jobs().createIndex(
        { sourceTxHash: 1, sourceEventIndex: 1 },
        { unique: true, name: 'legacy_source_event_unique' },
      ),
      this.jobs().createIndex(
        { status: 1, nextAttemptAt: 1, lockedUntil: 1 },
        { name: 'legacy_claim_ready' },
      ),
      this.jobs().createIndex(
        { destinationTxHash: 1 },
        { unique: true, sparse: true, name: 'legacy_destination_tx_unique' },
      ),
      this.db.collection('cukies_bridge_relayer_runs').createIndex({ startedAt: -1 }),
      this.db.collection('cukies_bridge_relayer_dead_letters').createIndex(
        { sourceTxHash: 1, sourceEventIndex: 1 },
        { unique: true },
      ),
      this.db.collection('cukies_bridge_relayer_manual_review').createIndex(
        { sourceTxHash: 1, sourceEventIndex: 1 },
        { unique: true },
      ),
    ]);
  }

  async getSourceCursor(defaultTimestampMs: number): Promise<TronPollCursor> {
    const cursor = await this.db.collection<CursorDocument>(
      'cukies_bridge_relayer_cursors',
    ).findOne({ _id: cursorId });
    return {
      nextTimestampMs: typeof cursor?.nextTimestampMs === 'number'
        ? cursor.nextTimestampMs
        : defaultTimestampMs,
      fingerprint: typeof cursor?.fingerprint === 'string' ? cursor.fingerprint : null,
    };
  }

  async updateSourceCursor(cursor: TronPollCursor, now: Date) {
    await this.db.collection<CursorDocument>('cukies_bridge_relayer_cursors').updateOne(
      { _id: cursorId },
      {
        $set: {
          ...cursor,
          chain: 'TRON',
          network: 'mainnet',
          contractAddress: this.config.tronBridgeAddress,
          eventName: 'JumpInBridge',
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async recordSourceDeadLetters(
    invalidEvents: Array<{ sourceTxHash: string; sourceEventIndex: number; error: string }>,
    now: Date,
  ) {
    if (invalidEvents.length === 0) return;
    await this.db.collection('cukies_bridge_relayer_dead_letters').bulkWrite(
      invalidEvents.map((event) => ({
        updateOne: {
          filter: {
            sourceTxHash: event.sourceTxHash,
            sourceEventIndex: event.sourceEventIndex,
          },
          update: {
            $set: {
              ...event,
              chain: 'TRON',
              network: 'mainnet',
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async upsertRequests(requests: readonly ConfirmedBridgeRequest[], now: Date) {
    if (requests.length === 0) return 0;
    const result = await this.jobs().bulkWrite(requests.map((request) => ({
      updateOne: {
        filter: {
          sourceTxHash: request.sourceTxHash,
          sourceEventIndex: request.sourceEventIndex,
        },
        update: {
          $setOnInsert: {
            _id: sourceKey(request),
            sourceKey: sourceKey(request),
            sourceTxHash: request.sourceTxHash,
            sourceEventIndex: request.sourceEventIndex,
            request,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: now,
            createdAt: now,
            updatedAt: now,
          },
          $set: { lastSeenAt: now },
        },
        upsert: true,
      },
    })), { ordered: false });
    return result.upsertedCount;
  }

  /**
   * Atomically claims one ready job and gives every lease a unique token.  A
   * stale worker therefore cannot update a job that another worker reclaimed.
   */
  async claimNext(workerId: string, now: Date, leaseMs: number) {
    return this.jobs().findOneAndUpdate(
      {
        status: { $in: ['pending', 'retry', 'submitted'] },
        nextAttemptAt: { $lte: now },
        $or: [
          { lockedUntil: { $exists: false } },
          { lockedUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          lockedBy: workerId,
          leaseToken: randomUUID(),
          lockedUntil: new Date(now.getTime() + leaseMs),
          updatedAt: now,
        },
      },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
  }

  async saveMetadataSnapshot(job: BridgeRelayerJob, metadata: BridgeMetadata, now: Date) {
    assertBridgeMetadata(metadata);
    await this.updateClaimed(job, {
      $set: {
        metadataSnapshot: metadata,
        metadataSnapshotAt: now,
        updatedAt: now,
      },
    });
  }

  async markSubmitted(
    job: BridgeRelayerJob,
    txHash: `0x${string}`,
    now: Date,
    metadata?: BridgeMetadata,
  ) {
    await this.updateClaimed(job, {
      $set: {
        status: 'submitted',
        attempts: job.attempts + 1,
        destinationTxHash: txHash,
        ...(metadata ? { metadataSnapshot: metadata, metadataSnapshotAt: now } : {}),
        submittedAt: now,
        nextAttemptAt: now,
        updatedAt: now,
      },
      $unset: unsetLease(),
    });
  }

  async keepSubmitted(job: BridgeRelayerJob, now: Date) {
    await this.updateClaimed(job, {
      $set: { status: 'submitted', nextAttemptAt: now, updatedAt: now },
      $unset: unsetLease(),
    });
  }

  async markRetry(job: BridgeRelayerJob, error: string, nextAttemptAt: Date, now: Date) {
    await this.updateClaimed(job, {
      $set: {
        status: 'retry',
        attempts: job.status === 'submitted' ? job.attempts : job.attempts + 1,
        lastError: error,
        nextAttemptAt,
        updatedAt: now,
      },
      $unset: unsetLease(),
    });
  }

  async markCompleted(
    job: BridgeRelayerJob,
    evidence: NonNullable<BridgeRelayerJob['completionEvidence']>,
    now: Date,
  ) {
    await this.updateClaimed(job, {
      $set: {
        status: 'completed',
        completionEvidence: evidence,
        completedAt: now,
        updatedAt: now,
      },
      $unset: unsetLease(),
    });
  }

  async markDeadLetter(job: BridgeRelayerJob, error: string, now: Date) {
    await this.updateClaimed(job, {
      $set: {
        status: 'dead_letter',
        attempts: job.status === 'submitted' ? job.attempts : job.attempts + 1,
        lastError: error,
        updatedAt: now,
      },
      $unset: unsetLease(),
    });
  }

  async markManualReview(job: BridgeRelayerJob, error: string, now: Date) {
    await this.updateClaimed(job, {
      $set: {
        status: 'manual_review',
        manualReviewAt: now,
        lastError: error,
        updatedAt: now,
      },
      $unset: unsetLease(),
    });
    await this.db.collection('cukies_bridge_relayer_manual_review').updateOne(
      { sourceTxHash: job.sourceTxHash, sourceEventIndex: job.sourceEventIndex },
      {
        $set: {
          sourceTxHash: job.sourceTxHash,
          sourceEventIndex: job.sourceEventIndex,
          sourceKey: job.sourceKey,
          jobId: job._id,
          error,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  /** Reads a fresh legacy tuple from TRON; Mongo metadata is never trusted for minting. */
  async getMetadata(request: ConfirmedBridgeRequest): Promise<BridgeMetadata> {
    const contract = this.tronWeb.contract(
      tronOwnerAbi as never,
      this.config.tronCollectionAddress,
    ) as any;
    const raw = await contract.getCukie(request.tokenId).call(this.tronCallOptions());
    const values = Array.isArray(raw)
      ? raw
      : Array.from({ length: 9 }, (_, index) => raw?.[index]);
    if (values.length < 9 || values.some((value) => value === undefined || value === null)) {
      throw new PermanentBridgeError(`getCukie incompleto para ${request.tokenId}.`);
    }
    // CukieToken's legacy ABI returns generation, six skills, energy and
    // health (nine values).  The type is encoded in the 10^12 slot of the
    // token id (after the optional 10^14 chain-prefix slot); it is not
    // returned by getCukie and is therefore derived without consulting Mongo.
    const typeId = deriveLegacyTypeId(request.tokenId);
    const metadata: BridgeMetadata = {
      typeId,
      generation: integer(values[0], 'generation'),
      skills: [
        integer(values[1], 'miner'),
        integer(values[2], 'engineer'),
        integer(values[3], 'farmer'),
        integer(values[4], 'gatherer'),
        integer(values[5], 'scout'),
        integer(values[6], 'breeder'),
      ],
      energy: integer(values[7], 'energy'),
      health: integer(values[8], 'health'),
    };
    assertBridgeMetadata(metadata);
    return metadata;
  }

  async sourceIsCustodied(request: ConfirmedBridgeRequest) {
    const contract = this.tronWeb.contract(
      tronOwnerAbi as never,
      this.config.tronCollectionAddress,
    ) as any;
    const owner = String(await contract.ownerOf(request.tokenId).call(this.tronCallOptions()));
    const ownerHex = owner.startsWith('T') ? TronWeb.address.toHex(owner) : owner;
    const bridgeHex = TronWeb.address.toHex(this.config.tronBridgeAddress);
    return ownerHex.replace(/^0x/i, '').toLowerCase()
      === bridgeHex.replace(/^0x/i, '').toLowerCase();
  }

  private async updateClaimed(job: BridgeRelayerJob, update: Document) {
    const filter: Document = {
      _id: job._id,
      lockedBy: job.lockedBy,
      leaseToken: job.leaseToken,
      status: { $in: ['pending', 'retry', 'submitted'] },
    };
    const result = await this.jobs().updateOne(filter, update);
    if (result.matchedCount !== 1) {
      throw new Error(`Lease perdida para el bridge job ${job._id}.`);
    }
  }
}
