import type { Address, Hash, Hex } from 'viem';

export type BridgeMetadata = Readonly<{
  typeId: bigint;
  generation: bigint;
  skills: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  energy: bigint;
  health: bigint;
}>;

export type ConfirmedBridgeRequest = Readonly<{
  transferId: Hash;
  tokenId: string;
  sourceNetwork: 0;
  destinationNetwork: 1;
  sourceOwner: string;
  destinationOwner: Address;
  nonce: string;
  metadataHash: Hash;
  sourceTxHash: string;
  sourceBlockNumber: number;
  sourceTimestampMs: number;
  sourceEventIndex: number;
}>;

export type BridgeJobStatus =
  | 'pending'
  | 'processing'
  | 'retry'
  | 'submitted'
  | 'completed'
  | 'dead_letter';

export type BridgeRelayerJob = {
  _id: string;
  request: ConfirmedBridgeRequest;
  status: BridgeJobStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedBy?: string;
  lockedUntil?: Date;
  destinationTxHash?: Hash;
  submittedAt?: Date;
  completedAt?: Date;
  lastError?: string;
  completionEvidence?: {
    sourceCustodied: true;
    destinationOwner: Address;
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
      state: 'confirmed';
      processed: boolean;
      destinationOwner: Address | null;
      blockNumber: number;
    };

export type BridgeReconciliation = {
  processed: boolean;
  destinationOwner: Address | null;
  blockNumber: number;
};

export interface BridgeRelayerStore {
  upsertRequests(requests: readonly ConfirmedBridgeRequest[], now: Date): Promise<number>;
  claimNext(workerId: string, now: Date, leaseMs: number): Promise<BridgeRelayerJob | null>;
  markSubmitted(job: BridgeRelayerJob, txHash: Hash, now: Date): Promise<void>;
  keepSubmitted(job: BridgeRelayerJob, now: Date): Promise<void>;
  markRetry(job: BridgeRelayerJob, error: string, nextAttemptAt: Date, now: Date): Promise<void>;
  markCompleted(
    job: BridgeRelayerJob,
    evidence: NonNullable<BridgeRelayerJob['completionEvidence']>,
    now: Date,
  ): Promise<void>;
  markDeadLetter(job: BridgeRelayerJob, error: string, now: Date): Promise<void>;
}

export interface BridgeEvidenceProvider {
  getMetadata(request: ConfirmedBridgeRequest): Promise<BridgeMetadata>;
  sourceIsCustodied(request: ConfirmedBridgeRequest): Promise<boolean>;
}

export interface BscBridgeDestination {
  assertTestnet(): Promise<void>;
  isProcessed(transferId: Hash): Promise<boolean>;
  submit(request: ConfirmedBridgeRequest, metadata: BridgeMetadata): Promise<Hash>;
  inspect(txHash: Hash, request: ConfirmedBridgeRequest): Promise<SubmissionInspection>;
  reconcile(request: ConfirmedBridgeRequest): Promise<BridgeReconciliation>;
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

export interface TronBridgeRequestSource {
  poll(cursor: TronPollCursor): Promise<TronPollResult>;
}

export type BridgeEndpointMetadataTuple = readonly [
  bigint,
  bigint,
  readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  bigint,
  bigint,
];

export type BridgeBytes20 = Hex;
