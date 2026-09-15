import { isAddress } from 'viem';

import { assertBridgeMetadata, PermanentBridgeError } from './metadata.js';
import type {
  BridgeEvidenceProvider,
  BridgeRelayerJob,
  BridgeRelayerStore,
  BscBridgeDestination,
  BridgeReconciliation,
  SubmissionInspection,
} from './types.js';

export type BridgeRelayerEngineConfig = Readonly<{
  workerId: string;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  maxAttempts: number;
  submittedTimeoutMs: number;
}>;

/** An RPC result that cannot prove whether a mint happened. */
export class ManualReviewBridgeError extends Error {
  readonly manualReview = true;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPermanent(error: unknown): error is PermanentBridgeError {
  return error instanceof PermanentBridgeError || (
    typeof error === 'object'
    && error !== null
    && 'permanent' in error
    && error.permanent === true
  );
}

function isManualReview(error: unknown): error is ManualReviewBridgeError {
  return typeof error === 'object'
    && error !== null
    && 'manualReview' in error
    && error.manualReview === true;
}

function retryDelay(attempts: number, config: BridgeRelayerEngineConfig) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(config.retryMaxMs, config.retryBaseMs * (2 ** exponent));
}

function sameAddress(left: string | null, right: string) {
  return left?.toLowerCase() === right.toLowerCase();
}

function validateRequest(job: BridgeRelayerJob) {
  const request = job.request;
  if (request.sourceNetwork !== 0 || request.destinationNetwork !== 1 || request.network !== 1) {
    throw new PermanentBridgeError('El relayer solo permite TRON mainnet -> BSC mainnet (network=1).');
  }
  if (!/^\d+$/.test(request.tokenId) || BigInt(request.tokenId) <= 0n) {
    throw new PermanentBridgeError('tokenId legacy invalido.');
  }
  if (!isAddress(request.destinationOwner) || /^0x0{40}$/i.test(request.destinationOwner)) {
    throw new PermanentBridgeError('destOwner legacy invalido.');
  }
}

export class BridgeRelayerEngine {
  constructor(
    private readonly store: BridgeRelayerStore,
    private readonly evidence: BridgeEvidenceProvider,
    private readonly destination: BscBridgeDestination,
    private readonly config: BridgeRelayerEngineConfig,
  ) {}

  async processNext(now = new Date()) {
    await this.destination.assertMainnet();
    const job = await this.store.claimNext(
      this.config.workerId,
      now,
      this.config.leaseMs,
    );
    if (!job) return null;

    try {
      validateRequest(job);
      if (job.status === 'submitted') {
        return await this.inspectSubmitted(job, now);
      }
      return await this.submitPending(job, now);
    } catch (error) {
      await this.handleFailure(job, error, now);
      return {
        jobId: job._id,
        outcome: isManualReview(error)
          ? 'manual_review'
          : isPermanent(error) ? 'dead_letter' : 'retry',
      } as const;
    }
  }

  private async submitPending(job: BridgeRelayerJob, now: Date) {
    // Legacy bridge has no processedTransfers mapping.  The token id itself is
    // the replay guard: if it already exists on BSC, never call mint again,
    // regardless of its current owner.  A matching receipt can be reconciled
    // separately; without one this remains a manual-review case.
    if (await this.destination.tokenExists(job.request)) {
      throw new ManualReviewBridgeError(
        'El tokenId BSC ya existe; no se vuelve a ejecutar jumpOutBridge.',
      );
    }

    const [metadata, sourceCustodied] = await Promise.all([
      this.evidence.getMetadata(job.request),
      this.evidence.sourceIsCustodied(job.request),
    ]);
    if (!sourceCustodied) {
      throw new PermanentBridgeError('El NFT origen no esta custodiado por el bridge TRON.');
    }
    assertBridgeMetadata(metadata);
    if (this.store.saveMetadataSnapshot) {
      await this.store.saveMetadataSnapshot(job, metadata, now);
    }

    // The only write in this worker is the legacy onlyOwner jumpOutBridge;
    // submit() always simulates the exact calldata first.
    const txHash = await this.destination.submit(job.request, metadata);
    await this.store.markSubmitted(job, txHash, now, metadata);
    return { jobId: job._id, outcome: 'submitted', txHash } as const;
  }

  private async inspectSubmitted(job: BridgeRelayerJob, now: Date) {
    if (!job.destinationTxHash || !job.submittedAt) {
      throw new ManualReviewBridgeError('Job submitted sin txHash o submittedAt.');
    }

    let inspection: SubmissionInspection;
    try {
      inspection = await this.destination.inspect(
        job.destinationTxHash,
        job.request,
      );
    } catch (error) {
      // A receipt/RPC failure cannot prove whether the destination mint was
      // mined. Never turn an ambiguous submitted job into retry, because the
      // retry path would call jumpOutBridge again.
      throw new ManualReviewBridgeError(
        `No se pudo inspeccionar la transaccion BSC; requiere revision manual: ${message(error)}`,
      );
    }
    if (inspection.state === 'pending') {
      if (now.getTime() - job.submittedAt.getTime() >= this.config.submittedTimeoutMs) {
        throw new ManualReviewBridgeError(
          'La transaccion BSC sigue ambigua tras el timeout; requiere revision manual y no se reenvia.',
        );
      }
      await this.store.keepSubmitted(job, now);
      return { jobId: job._id, outcome: 'pending_receipt' } as const;
    }
    if (inspection.state === 'reverted') {
      throw new Error(`La transaccion BSC revirtio en el bloque ${inspection.blockNumber}.`);
    }
    if (inspection.state === 'ambiguous') {
      throw new ManualReviewBridgeError(inspection.reason);
    }
    if (
      !inspection.jumpOutObserved
      || !sameAddress(inspection.destinationOwner, job.request.destinationOwner)
    ) {
      throw new ManualReviewBridgeError(
        'Receipt confirmado sin JumpOutBridge/ownerOf legacy coherentes.',
      );
    }
    return this.completeFromChain(job, now, {
      destinationOwner: inspection.destinationOwner,
      jumpOutObserved: true,
      blockNumber: inspection.blockNumber,
    });
  }

  private async completeFromChain(
    job: BridgeRelayerJob,
    now: Date,
    knownReconciliation: BridgeReconciliation | null = null,
  ) {
    const [sourceCustodied, reconciliation] = await Promise.all([
      this.evidence.sourceIsCustodied(job.request),
      knownReconciliation
        ? Promise.resolve(knownReconciliation)
        : this.destination.reconcile(job.request),
    ]);
    if (!sourceCustodied) {
      throw new PermanentBridgeError(
        'Reconciliacion invalida: el original TRON ya no esta en custodia.',
      );
    }
    if (
      !reconciliation.jumpOutObserved
      || !sameAddress(reconciliation.destinationOwner, job.request.destinationOwner)
    ) {
      throw new ManualReviewBridgeError(
        'Reconciliacion sin JumpOutBridge y ownerOf BSC esperados.',
      );
    }
    await this.store.markCompleted(job, {
      sourceCustodied: true,
      destinationOwner: job.request.destinationOwner,
      jumpOutObserved: true,
      circulatingRepresentations: 1,
      destinationBlockNumber: reconciliation.blockNumber,
    }, now);
    return { jobId: job._id, outcome: 'completed' } as const;
  }

  private async handleFailure(job: BridgeRelayerJob, error: unknown, now: Date) {
    const errorText = message(error).slice(0, 1_000);
    if (isManualReview(error)) {
      await this.store.markManualReview(job, errorText, now);
      return;
    }
    const failureAttempts = job.status === 'submitted'
      ? job.attempts
      : job.attempts + 1;
    if (isPermanent(error) || failureAttempts >= this.config.maxAttempts) {
      await this.store.markDeadLetter(job, errorText, now);
      return;
    }
    const nextAttemptAt = new Date(
      now.getTime() + retryDelay(failureAttempts, this.config),
    );
    await this.store.markRetry(job, errorText, nextAttemptAt, now);
  }
}
