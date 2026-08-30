import type { Address } from 'viem';

import { assertMetadataHash, PermanentBridgeError } from './metadata.js';
import type {
  BridgeEvidenceProvider,
  BridgeReconciliation,
  BridgeRelayerJob,
  BridgeRelayerStore,
  BscBridgeDestination,
} from './types.js';

export type BridgeRelayerEngineConfig = Readonly<{
  workerId: string;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  maxAttempts: number;
  submittedTimeoutMs: number;
}>;

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

function retryDelay(attempts: number, config: BridgeRelayerEngineConfig) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(config.retryMaxMs, config.retryBaseMs * (2 ** exponent));
}

function sameAddress(left: Address | null, right: Address) {
  return left?.toLowerCase() === right.toLowerCase();
}

export class BridgeRelayerEngine {
  constructor(
    private readonly store: BridgeRelayerStore,
    private readonly evidence: BridgeEvidenceProvider,
    private readonly destination: BscBridgeDestination,
    private readonly config: BridgeRelayerEngineConfig,
  ) {}

  async processNext(now = new Date()) {
    await this.destination.assertTestnet();
    const job = await this.store.claimNext(
      this.config.workerId,
      now,
      this.config.leaseMs,
    );
    if (!job) return null;

    try {
      if (job.request.sourceNetwork !== 0 || job.request.destinationNetwork !== 1) {
        throw new PermanentBridgeError('El relayer Stage solo permite TRON Nile -> BSC Testnet.');
      }
      if (job.status === 'submitted') {
        return await this.inspectSubmitted(job, now);
      }
      return await this.submitPending(job, now);
    } catch (error) {
      await this.handleFailure(job, error, now);
      return { jobId: job._id, outcome: isPermanent(error) ? 'dead_letter' : 'retry' } as const;
    }
  }

  private async submitPending(job: BridgeRelayerJob, now: Date) {
    if (await this.destination.isProcessed(job.request.transferId)) {
      return this.completeFromChain(job, now, null);
    }

    const [metadata, sourceCustodied] = await Promise.all([
      this.evidence.getMetadata(job.request),
      this.evidence.sourceIsCustodied(job.request),
    ]);
    if (!sourceCustodied) {
      throw new PermanentBridgeError('El NFT origen no esta custodiado por el endpoint TRON.');
    }
    assertMetadataHash(job.request.metadataHash, metadata);

    const txHash = await this.destination.submit(job.request, metadata);
    await this.store.markSubmitted(job, txHash, now);
    return { jobId: job._id, outcome: 'submitted', txHash } as const;
  }

  private async inspectSubmitted(job: BridgeRelayerJob, now: Date) {
    if (!job.destinationTxHash || !job.submittedAt) {
      throw new PermanentBridgeError('Job submitted sin txHash o submittedAt.');
    }

    const inspection = await this.destination.inspect(
      job.destinationTxHash,
      job.request,
    );
    if (inspection.state === 'pending') {
      if (now.getTime() - job.submittedAt.getTime() >= this.config.submittedTimeoutMs) {
        throw new PermanentBridgeError(
          'La transaccion BSC sigue ambigua tras el timeout; requiere revision manual y no se reenvia.',
        );
      }
      await this.store.keepSubmitted(job, now);
      return { jobId: job._id, outcome: 'pending_receipt' } as const;
    }
    if (inspection.state === 'reverted') {
      throw new Error(`La transaccion BSC revirtio en el bloque ${inspection.blockNumber}.`);
    }
    if (!inspection.processed || !sameAddress(
      inspection.destinationOwner,
      job.request.destinationOwner,
    )) {
      throw new PermanentBridgeError(
        'Receipt confirmado sin processedTransfers/ownerOf coherentes.',
      );
    }
    return this.completeFromChain(job, now, inspection);
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
      !reconciliation.processed
      || !sameAddress(reconciliation.destinationOwner, job.request.destinationOwner)
    ) {
      throw new PermanentBridgeError('Reconciliacion invalida: owner BSC inesperado.');
    }
    await this.store.markCompleted(job, {
      sourceCustodied: true,
      destinationOwner: job.request.destinationOwner,
      circulatingRepresentations: 1,
      destinationBlockNumber: reconciliation.blockNumber,
    }, now);
    return { jobId: job._id, outcome: 'completed' } as const;
  }

  private async handleFailure(job: BridgeRelayerJob, error: unknown, now: Date) {
    const errorText = message(error).slice(0, 1_000);
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
