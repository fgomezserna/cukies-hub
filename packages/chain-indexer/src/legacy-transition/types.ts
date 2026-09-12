export type LegacyChain = 'BSC' | 'TRON';
export type LegacyEnvironment = 'production' | 'staging' | 'test' | 'development';

export type WalletDiscoveryRecord = {
  network: LegacyChain;
  wallet: string;
  userId?: string | null;
  source: string;
};

export type LegacySnapshotObservation = {
  network: LegacyChain;
  wallet: string;
  /** Stable identifier for the queried contract/source at the cutoff. */
  snapshotId: string;
  claimedSourceId?: string;
  pendingSourceId?: string;
  claimedSourceBalanceId?: string;
  pendingSourceBalanceId?: string;
  claimedSourceRowSha256?: string;
  pendingSourceRowSha256?: string;
  claimedRaw?: string;
  pendingRaw?: string;
  tokenIds?: string[];
  error?: {
    code: string;
    message: string;
  };
};

export type LegacyNetworkError = {
  network: LegacyChain;
  code: string;
  message: string;
  wallet?: string;
};

export type LegacyCoverageSource = {
  sourceId: string;
  cutoffRef: string;
  querySha256: string;
  sourceSha256: string;
  complete: boolean;
  recordCount: number;
};

export type LegacyBalanceCoverageSource = LegacyCoverageSource & {
  aggregateRaw: string;
};

export type LegacyNetworkCoverage = {
  network: LegacyChain;
  cutoffRef: string;
  wallets: LegacyCoverageSource;
  claimed: LegacyBalanceCoverageSource;
  pending: LegacyBalanceCoverageSource;
};

export type LegacySnapshotInput = {
  coverage: LegacyNetworkCoverage[];
  discoveries: WalletDiscoveryRecord[];
  observations: LegacySnapshotObservation[];
  errors?: LegacyNetworkError[];
};

export type LegacySnapshotIssueCode =
  | 'INVALID_WALLET'
  | 'INVALID_RAW_AMOUNT'
  | 'INVALID_TOKEN_ID'
  | 'MISSING_NETWORK_COVERAGE'
  | 'DUPLICATE_NETWORK_COVERAGE'
  | 'INCOMPLETE_NETWORK_COVERAGE'
  | 'INVALID_COVERAGE_SOURCE'
  | 'COVERAGE_MISMATCH'
  | 'INPUT_LIMIT_EXCEEDED'
  | 'WALLET_WITHOUT_USER'
  | 'MISSING_OBSERVATION'
  | 'CONFLICTING_USER'
  | 'CONFLICTING_OBSERVATION'
  | 'DUPLICATE_TOKEN'
  | 'DUPLICATE_SOURCE_BALANCE'
  | 'INVALID_SOURCE_BINDING'
  | 'SNAPSHOT_ERROR'
  | 'NETWORK_ERROR';

export type LegacySnapshotIssue = {
  code: LegacySnapshotIssueCode;
  severity: 'error';
  network: LegacyChain;
  wallet?: string;
  tokenId?: string;
  source?: string;
  message: string;
};

export type LegacyWalletSnapshot = {
  network: LegacyChain;
  wallet: string;
  userId: string | null;
  claimedRaw: string;
  pendingRaw: string;
  totalRaw: string;
  tokenIds: string[];
  snapshotIds: string[];
  claimedSourceId: string | null;
  pendingSourceId: string | null;
  claimedSourceBalanceId: string | null;
  pendingSourceBalanceId: string | null;
  claimedSourceRowSha256: string | null;
  pendingSourceRowSha256: string | null;
};

export type LegacyChainTotals = {
  wallets: number;
  claimedRaw: string;
  pendingRaw: string;
  totalRaw: string;
  tokens: number;
};

export type LegacySnapshotResult = {
  previewOnly: true;
  cutoverAuthorized: false;
  complete: boolean;
  coverage: LegacyNetworkCoverage[];
  wallets: LegacyWalletSnapshot[];
  totals: Record<LegacyChain, LegacyChainTotals>;
  issues: LegacySnapshotIssue[];
  integritySha256: string;
};

export type LegacyCutoff = {
  network: LegacyChain;
  ref: string;
  chainId?: 56 | 97;
  tronNetwork?: 'mainnet' | 'nile' | 'shasta';
  blockNumber?: number;
  blockHash?: string;
  timestampMs?: number;
  cursor?: string;
};

export type LegacyContractArtifact = {
  network: LegacyChain;
  alias: string;
  address: string;
  abi: unknown;
  expectedOwner: string;
  expectedBytecodeHash: string;
};

export type LegacyManifestFile = {
  path: string;
  /** Canonical UTF-8 text. Binary containers are intentionally not accepted at public boundaries. */
  contents: string;
};

export type LegacyTransitionManifest = {
  schemaVersion: 1;
  previewOnly: true;
  cutoverAuthorized: false;
  complete: boolean;
  environment: LegacyEnvironment;
  target: {
    databaseName: 'cukieshub-new';
    economySchemaVersion: 2;
    sentinelId: 'uki-economy';
    baselineCollection: 'economy_schema_metadata';
  };
  coverage: LegacyNetworkCoverage[];
  cutoffs: Array<LegacyCutoff>;
  contracts: Array<{
    network: LegacyChain;
    alias: string;
    address: string;
    abiSha256: string;
    expectedOwner: string;
    expectedBytecodeHash: string;
    expectedSelectors: string[];
  }>;
  files: Array<{
    path: string;
    sha256: string;
    bytes: number;
  }>;
  totals: Record<LegacyChain, LegacyChainTotals>;
  issueCount: number;
  manifestSha256: string;
};

export type LegacyTransitionPackage = {
  previewOnly: true;
  cutoverAuthorized: false;
  artifacts: LegacyManifestFile[];
  manifest: LegacyTransitionManifest;
};
