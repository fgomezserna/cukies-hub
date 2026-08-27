export type ChainName = 'BSC' | 'TRON';

export type ContractAlias =
  | 'TOKEN'
  | 'TOKEN_V2'
  | 'POINTS'
  | 'STAKING_POINTS'
  | 'BREEDING_POINTS'
  | 'MARKETPLACE'
  | 'BRIDGE'
  | 'PRESALE'
  | 'UKI_STAKING'
  | 'VESTING_VAULT'
  | 'REWARDS_DISTRIBUTOR'
  | 'CUKIE_MASTER_NFT_VAULT'
  | 'CUKIE_POOL_NFT_VAULT';

export type EventName =
  | 'Transfer'
  | 'CukieMetadataConfigured'
  | 'Mint'
  | 'Burn'
  | 'Stake'
  | 'Unstake'
  | 'BreedStart'
  | 'BreedFinish'
  | 'TokenOnSale'
  | 'TokenBought'
  | 'MarketTokenSaleCancelled'
  | 'MarketTokenPriceChanged'
  | 'JumpInBridge'
  | 'JumpOutBridge'
  | 'Purchased'
  | 'Staked'
  | 'Unstaked'
  | 'VestingCreated'
  | 'TokensReleased'
  | 'BatchPublished'
  | 'RewardClaimed'
  | 'BatchClosed'
  | 'CukieMasterCollectionAllowedUpdated'
  | 'CukieMasterDeposited'
  | 'CukieMasterWithdrawn'
  | 'CukieMasterUntrackedERC721Recovered'
  | 'CukiePoolCollectionAllowedUpdated'
  | 'CukiePoolCalendarVersionScheduled'
  | 'CukiePoolDeposited'
  | 'CukiePoolExitRequested'
  | 'CukiePoolWithdrawableAtAdvanced'
  | 'CukiePoolWithdrawn'
  | 'CukiePoolUntrackedERC721Recovered';

export type ChainEventStatus =
  | 'ingested'
  | 'projecting'
  | 'projected'
  | 'failed'
  | 'ignored';

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export type ContractEventConfig = {
  chain: ChainName;
  contractAlias: ContractAlias;
  contractAddress: string;
  eventName: EventName;
};

export type ChainCursor = {
  _id: string;
  chain: ChainName;
  contractAlias: ContractAlias;
  contractAddress: string;
  eventName: EventName;
  nextBlock?: number;
  processedFromBlock?: number;
  processedFromTimestampMs?: number;
  processedThroughBlock?: number;
  processedThroughTimestampMs?: number;
  nextTimestampMs?: number;
  fingerprint?: string | null;
  safeBlock?: number;
  bootstrapStatus?: 'verified';
  bootstrapStartBlock?: number;
  bootstrapVerifiedAt?: Date;
  verifiedChainId?: 56 | 97;
  contractCodeHash?: string;
  contractDeploymentBlock?: number;
  contractDeploymentTxHash?: string;
  contractConfigHash?: string;
  updatedAt: Date;
};

export type VerifiedBscContractAlias =
  | 'TOKEN'
  | 'TOKEN_V2'
  | 'MARKETPLACE'
  | 'BRIDGE'
  | 'UKI_STAKING'
  | 'VESTING_VAULT'
  | 'CUKIE_MASTER_NFT_VAULT'
  | 'CUKIE_POOL_NFT_VAULT';

export type VerifiedBscContractIdentity = {
  alias: VerifiedBscContractAlias;
  chainId: 56 | 97;
  address: string;
  startBlock: number;
  deploymentBlock: number;
  deploymentTxHash: string;
  runtimeCodeHash: string;
  configHash: string;
};

export type ChainEvent = {
  _id: string;
  chain: ChainName;
  chainId?: number;
  contractAlias: ContractAlias;
  contractAddress: string;
  eventName: EventName;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash?: string;
  timestampMs: number;
  args: JsonRecord;
  normalized: JsonRecord;
  raw: JsonRecord;
  status: ChainEventStatus;
  attempts: number;
  lockedAt?: Date;
  projectedAt?: Date;
  lastError?: string;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
};

export type IndexerConfig = {
  mongoUrl: string;
  dbName: string;
  chains: ChainName[];
  bscRpcUrl: string;
  bscRpcUrls: string[];
  bscExpectedChainId: 56 | 97;
  tronApiBaseUrl: string;
  tronApiKey?: string;
  bscStartBlock: number;
  tronStartTimestampMs: number;
  bscConfirmations: number;
  maxBlockRange: number;
  tronPageLimit: number;
  tronRequestDelayMs: number;
  pollIntervalMs: number;
  projectBatchSize: number;
  presaleAddress?: string;
  tokenAddress?: string;
  tokenV2Address?: string;
  marketplaceAddress?: string;
  bridgeAddress?: string;
  ukiStakingAddress?: string;
  rewardsDistributorAddress?: string;
  vestingVaultAddress?: string;
  cukieMasterNftVaultAddress?: string;
  cukiePoolNftVaultAddress?: string;
  ukiStakingStartBlock?: number;
  tokenStartBlock?: number;
  tokenV2StartBlock?: number;
  marketplaceStartBlock?: number;
  bridgeStartBlock?: number;
  rewardsDistributorStartBlock?: number;
  vestingVaultStartBlock?: number;
  cukieMasterNftVaultStartBlock?: number;
  cukiePoolNftVaultStartBlock?: number;
  verifiedBscContracts: Partial<
    Record<VerifiedBscContractAlias, VerifiedBscContractIdentity>
  >;
  contractAliases?: ContractAlias[];
};

export type LegacyImportConfig = {
  legacyMongoUrl: string;
  legacyDbName: string;
  limit: number;
  networks?: ChainName[];
};
