import {
  MongoClient,
  type Collection,
  type Db,
  type Document,
} from 'mongodb';
import { TronWeb } from 'tronweb';
import type { Hash } from 'viem';

import { PermanentBridgeError } from './metadata.js';
import type {
  BridgeEvidenceProvider,
  BridgeMetadata,
  BridgeRelayerJob,
  BridgeRelayerStore,
  ConfirmedBridgeRequest,
  TronPollCursor,
} from './types.js';
import type { BridgeRelayerConfig } from './config.js';

type CukieDocument = Document & {
  tokenId?: string | number;
  network?: string;
  type?: string | number;
  skills?: Record<string, unknown>;
};

type CursorDocument = Document & {
  _id: string;
  nextTimestampMs?: number;
  fingerprint?: string | null;
};

const cursorId = 'TRON:NILE:BRIDGE:BridgeRequested';
const tronOwnerAbi = [{
  type: 'function',
  name: 'ownerOf',
  stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  outputs: [{ name: '', type: 'address' }],
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

function unsetLock() {
  return { lockedBy: '', lockedUntil: '' } as const;
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
      this.jobs().createIndex({ 'request.transferId': 1 }, { unique: true }),
      this.jobs().createIndex({ status: 1, nextAttemptAt: 1, lockedUntil: 1 }),
      this.jobs().createIndex({ destinationTxHash: 1 }, { unique: true, sparse: true }),
      this.db.collection('cukies_bridge_relayer_runs').createIndex({ startedAt: -1 }),
      this.db.collection('cukies_bridge_relayer_dead_letters').createIndex(
        { sourceTxHash: 1, sourceEventIndex: 1 },
        { unique: true },
      ),
    ]);
  }

  async getSourceCursor(defaultTimestampMs: number): Promise<TronPollCursor> {
    const cursor = await this.db.collection<CursorDocument>(
      'cukies_bridge_relayer_cursors',
    ).findOne({
      _id: cursorId,
    });
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
          network: 'TRON_NILE',
          eventName: 'BridgeRequested',
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
            $set: { ...event, chain: 'TRON_NILE', updatedAt: now },
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
        filter: { _id: request.transferId },
        update: {
          $setOnInsert: {
            _id: request.transferId,
            request,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: now,
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    })), { ordered: false });
    return result.upsertedCount;
  }

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
          lockedUntil: new Date(now.getTime() + leaseMs),
          updatedAt: now,
        },
      },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
  }

  async markSubmitted(job: BridgeRelayerJob, txHash: Hash, now: Date) {
    await this.updateClaimed(job, {
      $set: {
        status: 'submitted',
        attempts: job.attempts + 1,
        destinationTxHash: txHash,
        submittedAt: now,
        nextAttemptAt: now,
        updatedAt: now,
      },
      $unset: unsetLock(),
    });
  }

  async keepSubmitted(job: BridgeRelayerJob, now: Date) {
    await this.updateClaimed(job, {
      $set: { status: 'submitted', nextAttemptAt: now, updatedAt: now },
      $unset: unsetLock(),
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
      $unset: unsetLock(),
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
      $unset: unsetLock(),
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
      $unset: unsetLock(),
    });
  }

  async getMetadata(request: ConfirmedBridgeRequest): Promise<BridgeMetadata> {
    const numericTokenId = Number(request.tokenId);
    const tokenCandidates: Array<string | number> = [request.tokenId];
    if (Number.isSafeInteger(numericTokenId)) tokenCandidates.push(numericTokenId);
    const cuki = await this.db.collection<CukieDocument>('cukies').findOne({
      tokenId: { $in: tokenCandidates },
      network: 'TRON',
    });
    if (!cuki) {
      throw new Error(`Metadata TRON aun no disponible para ${request.tokenId}.`);
    }
    const skills = cuki.skills ?? {};
    return {
      typeId: integer(cuki.type, 'typeId'),
      generation: integer(skills.generation, 'generation'),
      skills: [
        integer(skills.miner, 'miner'),
        integer(skills.engineer, 'engineer'),
        integer(skills.farmer, 'farmer'),
        integer(skills.gatherer, 'gatherer'),
        integer(skills.scout, 'scout'),
        integer(skills.breeder, 'breeder'),
      ],
      energy: integer(skills.energy, 'energy'),
      health: integer(skills.life, 'life'),
    };
  }

  async sourceIsCustodied(request: ConfirmedBridgeRequest) {
    const contract = this.tronWeb.contract(
      tronOwnerAbi as never,
      this.config.tronCollectionAddress,
    ) as any;
    const owner = String(await contract.ownerOf(request.tokenId).call());
    const ownerHex = owner.startsWith('T') ? TronWeb.address.toHex(owner) : owner;
    const endpointHex = TronWeb.address.toHex(this.config.tronEndpointAddress);
    return ownerHex.replace(/^0x/i, '').toLowerCase()
      === endpointHex.replace(/^0x/i, '').toLowerCase();
  }

  private async updateClaimed(job: BridgeRelayerJob, update: Document) {
    const result = await this.jobs().updateOne(
      { _id: job._id, lockedBy: job.lockedBy },
      update,
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Lease perdida para el bridge job ${job._id}.`);
    }
  }
}
