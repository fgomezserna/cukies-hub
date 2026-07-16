export type ChainName = 'BSC' | 'TRON';

export type ContractAlias =
  | 'TOKEN'
  | 'POINTS'
  | 'STAKING_POINTS'
  | 'BREEDING_POINTS'
  | 'MARKETPLACE'
  | 'BRIDGE'
  | 'PRESALE';

export type EventName =
  | 'Transfer'
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
  | 'Purchased';

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
  updatedAt: Date;
};

export type ChainEvent = {
  _id: string;
  chain: ChainName;
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
  contractAliases?: ContractAlias[];
};

export type LegacyImportConfig = {
  legacyMongoUrl: string;
  limit: number;
  networks?: ChainName[];
};
