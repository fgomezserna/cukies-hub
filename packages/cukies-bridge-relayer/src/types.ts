import type { Address, Hash } from 'viem';

/**
 * The wallet provider accepted/broadcast a write but did not return a hash.
 * Retrying this request could mint the same legacy token twice, so callers
 * must send it to manual review instead of the normal retry queue.
 */
export class AmbiguousBridgeSubmissionError extends Error {
  readonly ambiguousBroadcast = true;
}

export type BridgeMetadata = Readonly<{
  typeId: bigint;
  generation: bigint;
  skills: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  energy: bigint;
  health: bigint;
}>;

/**
 * Normalized legacy `JumpInBridge` request.  Legacy contracts do not expose a
 * transfer id or metadata hash; the source transaction plus event index is the
 * durable identity and a synthetic hash is kept only for internal APIs.
 */
export type ConfirmedBridgeRequest = Readonly<{
  transferId: Hash;
  tokenId: string;
  /** Destination network encoded by the legacy event; `1` is BSC mainnet. */
  network: 1;
  /** Compatibility alias used by older callers. */
  destinationNetwork: 1;
  /** Compatibility marker: source is TRON. */
  sourceNetwork: 0;
  sourceOwner: string;
  destinationOwner: Address;
  sourceTxHash: string;
  sourceBlockNumber: number;
  sourceTimestampMs: number;
  sourceEventIndex: number;
  /** Legacy compatibility fields retained only when importing older fixtures. */
  nonce?: string;
  metadataHash?: Hash;
}>;

export type BridgeJobStatus =
  | 'pending'
  | 'processing'
  | 'retry'
  | 'submitted'
  | 'completed'
  | 'dead_letter'
  | 'manual_review';

export type BridgeRelayerJob = {
  _id: string;
  /** Explicit duplicate key, equal to `${sourceTxHash}:${sourceEventIndex}`. */
  sourceKey: string;
  sourceTxHash: string;
  sourceEventIndex: number;
  request: ConfirmedBridgeRequest;
  status: BridgeJobStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedBy?: string;
  lockedUntil?: Date;
  leaseToken?: string;
  metadataSnapshot?: BridgeMetadata;
  metadataSnapshotAt?: Date;
  destinationTxHash?: Hash;
  submittedAt?: Date;
  completedAt?: Date;
  manualReviewAt?: Date;
  lastError?: string;
  completionEvidence?: {
    sourceCustodied: true;
    destinationOwner: Address;
    jumpOutObserved?: true;
    circulatingRepresentations: 1;
    destinationBlockNumber: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type SubmissionInspection =
  | { state: 'pending' }
  | { state: 'reverted'; blockNumber: number }
  | {
      state: 'ambiguous';
      blockNumber: number;
      reason: string;
    }
  | {
      state: 'confirmed';
      jumpOutObserved?: true;
      processed?: boolean;
      destinationOwner: Address;
      blockNumber: number;
    };

export type BridgeReconciliation = {
  /** Compatibility alias; true is equivalent to ownerOf matching destOwner. */
  processed?: boolean;
  destinationOwner: Address | null;
  jumpOutObserved?: boolean;
  blockNumber: number;
};

export interface BridgeRelayerStore {
  upsertRequests(requests: readonly ConfirmedBridgeRequest[], now: Date): Promise<number>;
  claimNext(workerId: string, now: Date, leaseMs: number): Promise<BridgeRelayerJob | null>;
  saveMetadataSnapshot?(job: BridgeRelayerJob, metadata: BridgeMetadata, now: Date): Promise<void>;
  markSubmitted(
    job: BridgeRelayerJob,
    txHash: Hash,
    now: Date,
    metadata?: BridgeMetadata,
  ): Promise<void>;
  keepSubmitted(job: BridgeRelayerJob, now: Date): Promise<void>;
  markRetry(job: BridgeRelayerJob, error: string, nextAttemptAt: Date, now: Date): Promise<void>;
  markCompleted(
    job: BridgeRelayerJob,
    evidence: NonNullable<BridgeRelayerJob['completionEvidence']>,
    now: Date,
  ): Promise<void>;
  markDeadLetter(job: BridgeRelayerJob, error: string, now: Date): Promise<void>;
  markManualReview(job: BridgeRelayerJob, error: string, now: Date): Promise<void>;
}

export interface BridgeEvidenceProvider {
  /** Reads and validates the current on-chain legacy `getCukie` tuple. */
  getMetadata(request: ConfirmedBridgeRequest): Promise<BridgeMetadata>;
  sourceIsCustodied(request: ConfirmedBridgeRequest): Promise<boolean>;
}

export interface BscBridgeDestination {
  assertMainnet(): Promise<void>;
  /**
   * Returns whether the requested token id already exists on the destination.
   * Implementations must reject when the RPC result is indeterminate; a
   * transport error must never be interpreted as an absent token.
   */
  tokenExists(request: ConfirmedBridgeRequest): Promise<boolean>;
  submit(request: ConfirmedBridgeRequest, metadata: BridgeMetadata): Promise<Hash>;
  inspect(txHash: Hash, request: ConfirmedBridgeRequest): Promise<SubmissionInspection>;
  reconcile(request: ConfirmedBridgeRequest): Promise<BridgeReconciliation>;
}

export interface TronBridgeRequestSource {
  poll(cursor: TronPollCursor): Promise<TronPollResult>;
}

export type TronPollCursor = {
  nextTimestampMs: number;
  fingerprint: string | null;
};

export type TronPollResult = {
  requests: ConfirmedBridgeRequest[];
  invalidEvents: Array<{
    sourceTxHash: string;
    sourceEventIndex: number;
    error: string;
  }>;
  nextCursor: TronPollCursor;
};

/** Legacy tuple shape retained for consumers that import the old type. */
export type BridgeEndpointMetadataTuple = readonly [
  bigint,
  bigint,
  readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  bigint,
  bigint,
];

export type BridgeBytes20 = `0x${string}`;
