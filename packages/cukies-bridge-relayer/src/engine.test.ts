import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Address, Hash } from 'viem';

import { BridgeRelayerEngine } from './engine.js';
import { hashBridgeMetadata } from './metadata.js';
import type {
  BridgeEvidenceProvider,
  BridgeMetadata,
  BridgeRelayerJob,
  BridgeRelayerStore,
  BscBridgeDestination,
  ConfirmedBridgeRequest,
  SubmissionInspection,
} from './types.js';

const destinationOwner = '0x2222222222222222222222222222222222222222' as Address;
const txHash = `0x${'33'.repeat(32)}` as Hash;
const metadata: BridgeMetadata = {
  typeId: 5n,
  generation: 1n,
  skills: [12n, 23n, 34n, 45n, 56n, 67n],
  energy: 88n,
  health: 99n,
};

function request(overrides: Partial<ConfirmedBridgeRequest> = {}): ConfirmedBridgeRequest {
  return {
    transferId: `0x${'11'.repeat(32)}`,
    tokenId: '1000000002279',
    sourceNetwork: 0,
    destinationNetwork: 1,
    sourceOwner: 'TSource1111111111111111111111111111',
    destinationOwner,
    nonce: '4',
    metadataHash: hashBridgeMetadata(metadata),
    sourceTxHash: 'tron-source-tx',
    sourceBlockNumber: 123,
    sourceTimestampMs: 1_788_000_000_000,
    sourceEventIndex: 0,
    ...overrides,
  };
}

class MemoryStore implements BridgeRelayerStore {
  readonly jobs = new Map<string, BridgeRelayerJob>();

  async upsertRequests(requests: readonly ConfirmedBridgeRequest[], now: Date) {
    let inserted = 0;
    for (const item of requests) {
      if (this.jobs.has(item.transferId)) continue;
      this.jobs.set(item.transferId, {
        _id: item.transferId,
        request: item,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
    return inserted;
  }

  async claimNext(workerId: string, now: Date, leaseMs: number) {
    const job = [...this.jobs.values()].find((candidate) => (
      ['pending', 'retry', 'submitted'].includes(candidate.status)
      && candidate.nextAttemptAt <= now
      && (!candidate.lockedUntil || candidate.lockedUntil <= now)
    ));
    if (!job) return null;
    job.lockedBy = workerId;
    job.lockedUntil = new Date(now.getTime() + leaseMs);
    job.updatedAt = now;
    return { ...job };
  }

  async markSubmitted(job: BridgeRelayerJob, destinationTxHash: Hash, now: Date) {
    Object.assign(this.current(job), {
      status: 'submitted',
      attempts: job.attempts + 1,
      destinationTxHash,
      submittedAt: now,
      nextAttemptAt: now,
      lockedBy: undefined,
      lockedUntil: undefined,
      updatedAt: now,
    });
  }

  async keepSubmitted(job: BridgeRelayerJob, now: Date) {
    Object.assign(this.current(job), {
      status: 'submitted',
      nextAttemptAt: now,
      lockedBy: undefined,
      lockedUntil: undefined,
      updatedAt: now,
    });
  }

  async markRetry(job: BridgeRelayerJob, error: string, nextAttemptAt: Date, now: Date) {
    Object.assign(this.current(job), {
      status: 'retry',
      attempts: job.status === 'submitted' ? job.attempts : job.attempts + 1,
      lastError: error,
      nextAttemptAt,
      lockedBy: undefined,
      lockedUntil: undefined,
      updatedAt: now,
    });
  }

  async markCompleted(
    job: BridgeRelayerJob,
    completionEvidence: NonNullable<BridgeRelayerJob['completionEvidence']>,
    now: Date,
  ) {
    Object.assign(this.current(job), {
      status: 'completed',
      completionEvidence,
      completedAt: now,
      lockedBy: undefined,
      lockedUntil: undefined,
      updatedAt: now,
    });
  }

  async markDeadLetter(job: BridgeRelayerJob, error: string, now: Date) {
    Object.assign(this.current(job), {
      status: 'dead_letter',
      lastError: error,
      attempts: job.status === 'submitted' ? job.attempts : job.attempts + 1,
      lockedBy: undefined,
      lockedUntil: undefined,
      updatedAt: now,
    });
  }

  private current(job: BridgeRelayerJob) {
    const current = this.jobs.get(job._id);
    if (!current) throw new Error('missing job');
    return current;
  }
}

class FakeEvidence implements BridgeEvidenceProvider {
  metadata = metadata;
  custodied = true;

  async getMetadata() {
    return this.metadata;
  }

  async sourceIsCustodied() {
    return this.custodied;
  }
}

class FakeDestination implements BscBridgeDestination {
  chainId = 97;
  processed = false;
  owner: Address | null = null;
  blockNumber = 0;
  inspection: SubmissionInspection = { state: 'pending' };
  submitCount = 0;
  submitFailures = 0;

  async assertTestnet() {
    if (this.chainId !== 97) throw new Error('wrong chain');
  }

  async isProcessed() {
    return this.processed;
  }

  async submit() {
    this.submitCount += 1;
    if (this.submitFailures > 0) {
      this.submitFailures -= 1;
      throw new Error('temporary RPC failure');
    }
    return txHash;
  }

  async inspect() {
    return this.inspection;
  }

  async reconcile() {
    return {
      processed: this.processed,
      destinationOwner: this.owner,
      blockNumber: this.blockNumber,
    };
  }
}

function fixture() {
  const store = new MemoryStore();
  const evidence = new FakeEvidence();
  const destination = new FakeDestination();
  const engine = new BridgeRelayerEngine(store, evidence, destination, {
    workerId: 'worker-test',
    leaseMs: 30_000,
    retryBaseMs: 1_000,
    retryMaxMs: 60_000,
    maxAttempts: 3,
    submittedTimeoutMs: 10_000,
  });
  return { store, evidence, destination, engine };
}

describe('BridgeRelayerEngine', () => {
  it('submits once, waits for a confirmed receipt and records the 1-circulating invariant', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    assert.equal(await store.upsertRequests([request(), request()], now), 1);

    const submitted = await engine.processNext(now);
    assert.equal(submitted?.outcome, 'submitted');
    assert.equal(destination.submitCount, 1);
    assert.equal(store.jobs.get(request().transferId)?.attempts, 1);

    destination.processed = true;
    destination.owner = destinationOwner;
    destination.blockNumber = 456;
    destination.inspection = {
      state: 'confirmed',
      processed: true,
      destinationOwner,
      blockNumber: 456,
    };
    const completed = await engine.processNext(new Date(now.getTime() + 3_000));

    assert.equal(completed?.outcome, 'completed');
    assert.equal(destination.submitCount, 1);
    assert.deepEqual(store.jobs.get(request().transferId)?.completionEvidence, {
      sourceCustodied: true,
      destinationOwner,
      circulatingRepresentations: 1,
      destinationBlockNumber: 456,
    });
  });

  it('never resubmits an ambiguous pending transaction and sends it to DLQ at timeout', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    await store.upsertRequests([request()], now);
    await engine.processNext(now);

    assert.equal(
      (await engine.processNext(new Date(now.getTime() + 5_000)))?.outcome,
      'pending_receipt',
    );
    assert.equal(destination.submitCount, 1);
    assert.equal(
      (await engine.processNext(new Date(now.getTime() + 11_000)))?.outcome,
      'dead_letter',
    );
    assert.equal(destination.submitCount, 1);
    assert.match(store.jobs.get(request().transferId)?.lastError ?? '', /ambigua/);
  });

  it('retries definite transient failures with backoff and respects maxAttempts', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    destination.submitFailures = 3;
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'retry');
    assert.equal(await engine.processNext(new Date(now.getTime() + 500)), null);
    assert.equal(
      (await engine.processNext(new Date(now.getTime() + 1_000)))?.outcome,
      'retry',
    );
    assert.equal(
      (await engine.processNext(new Date(now.getTime() + 3_000)))?.outcome,
      'retry',
    );
    assert.equal(store.jobs.get(request().transferId)?.status, 'dead_letter');
    assert.equal(destination.submitCount, 3);
  });

  it('dead-letters metadata drift before any destination transaction', async () => {
    const { store, evidence, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    evidence.metadata = { ...metadata, energy: 89n };
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'dead_letter');
    assert.equal(destination.submitCount, 0);
    assert.match(store.jobs.get(request().transferId)?.lastError ?? '', /metadataHash/);
  });

  it('recovers idempotently when destination was already processed', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    destination.processed = true;
    destination.owner = destinationOwner;
    destination.blockNumber = 444;
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'completed');
    assert.equal(destination.submitCount, 0);
    assert.equal(store.jobs.get(request().transferId)?.status, 'completed');
  });
});
