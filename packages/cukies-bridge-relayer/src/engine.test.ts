import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Address, Hash } from 'viem';

import { BridgeRelayerEngine } from './engine.js';
import { hashBridgeMetadata } from './metadata.js';
import { AmbiguousBridgeSubmissionError } from './types.js';
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
    network: 1,
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

  async markManualReview(job: BridgeRelayerJob, error: string, now: Date) {
    Object.assign(this.current(job), {
      status: 'manual_review',
      manualReviewAt: now,
      lastError: error,
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
  chainId = 56;
  tokenExistsState = false;
  tokenExistsError: Error | null = null;
  owner: Address | null = null;
  blockNumber = 0;
  inspection: SubmissionInspection = { state: 'pending' };
  inspectionError: Error | null = null;
  submitCount = 0;
  submitFailures = 0;
  ambiguousSubmit = false;

  async assertMainnet() {
    if (this.chainId !== 56) throw new Error('wrong chain');
  }

  async tokenExists() {
    if (this.tokenExistsError) throw this.tokenExistsError;
    return this.tokenExistsState;
  }

  async submit() {
    this.submitCount += 1;
    if (this.ambiguousSubmit) {
      throw new AmbiguousBridgeSubmissionError('broadcast response lost');
    }
    if (this.submitFailures > 0) {
      this.submitFailures -= 1;
      throw new Error('temporary RPC failure');
    }
    return txHash;
  }

  async inspect() {
    if (this.inspectionError) throw this.inspectionError;
    return this.inspection;
  }

  async reconcile() {
    return {
      processed: this.tokenExistsState,
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

    destination.tokenExistsState = true;
    destination.owner = destinationOwner;
    destination.blockNumber = 456;
    destination.inspection = {
      state: 'confirmed',
      jumpOutObserved: true,
      destinationOwner,
      blockNumber: 456,
    };
    const completed = await engine.processNext(new Date(now.getTime() + 3_000));

    assert.equal(completed?.outcome, 'completed');
    assert.equal(destination.submitCount, 1);
    assert.deepEqual(store.jobs.get(request().transferId)?.completionEvidence, {
      sourceCustodied: true,
      destinationOwner,
      jumpOutObserved: true,
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
      'manual_review',
    );
    assert.equal(destination.submitCount, 1);
    assert.match(store.jobs.get(request().transferId)?.lastError ?? '', /ambigua/);
  });

  it('pasa un error RPC al inspeccionar un submitted a revision manual sin reintentar', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    await store.upsertRequests([request()], now);
    assert.equal((await engine.processNext(now))?.outcome, 'submitted');
    assert.equal(destination.submitCount, 1);

    // The destination may already have mined the mint when receipt lookup
    // fails; resubmitting would risk a duplicate legacy jumpOutBridge call.
    destination.tokenExistsState = true;
    destination.inspectionError = new Error('receipt RPC transport failure');

    assert.equal(
      (await engine.processNext(new Date(now.getTime() + 1_000)))?.outcome,
      'manual_review',
    );
    assert.equal(destination.submitCount, 1);
    assert.equal(store.jobs.get(request().transferId)?.status, 'manual_review');
    assert.match(
      store.jobs.get(request().transferId)?.lastError ?? '',
      /inspeccionar.*revision manual/i,
    );
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

  it('manda a revision manual un broadcast cuyo hash se pierde y nunca reintenta', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    destination.ambiguousSubmit = true;
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'manual_review');
    assert.equal(destination.submitCount, 1);
    assert.equal(store.jobs.get(request().transferId)?.status, 'manual_review');
    assert.equal(
      await engine.processNext(new Date(now.getTime() + 10_000)),
      null,
    );
    assert.equal(destination.submitCount, 1);
  });

  it('manda a revision manual si falla guardar el hash ya emitido', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    store.markSubmitted = async () => {
      throw new Error('Mongo write timeout');
    };
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'manual_review');
    assert.equal(destination.submitCount, 1);
    assert.equal(store.jobs.get(request().transferId)?.status, 'manual_review');
  });

  it('dead-letters metadata drift before any destination transaction', async () => {
    const { store, evidence, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    evidence.metadata = { ...metadata, energy: 256n };
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'dead_letter');
    assert.equal(destination.submitCount, 0);
    assert.match(store.jobs.get(request().transferId)?.lastError ?? '', /uint8/);
  });

  it('does not mint when the token id already exists on BSC', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    destination.tokenExistsState = true;
    destination.owner = destinationOwner;
    destination.blockNumber = 444;
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'manual_review');
    assert.equal(destination.submitCount, 0);
    assert.equal(store.jobs.get(request().transferId)?.status, 'manual_review');
    assert.match(store.jobs.get(request().transferId)?.lastError ?? '', /tokenId BSC ya existe/);
  });

  it('does not mint when the existence check is indeterminate', async () => {
    const { store, destination, engine } = fixture();
    const now = new Date('2026-08-30T12:00:00.000Z');
    destination.tokenExistsError = new Error('temporary RPC failure');
    await store.upsertRequests([request()], now);

    assert.equal((await engine.processNext(now))?.outcome, 'retry');
    assert.equal(destination.submitCount, 0);
    assert.equal(store.jobs.get(request().transferId)?.status, 'retry');
  });
});
