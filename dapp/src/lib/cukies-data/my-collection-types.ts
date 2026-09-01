import type {
  NftAssetGeneration,
  NftAssetRarity,
  NftCanonicalState,
} from '@/lib/nft-inventory';

export type MyCukieCustody = 'wallet' | 'cukie_pool' | 'cukie_master';

export type MyCukieCollectionItem = {
  assetId: string;
  tokenId: string;
  imageUrl: string | null;
  generation: NftAssetGeneration;
  rarity: NftAssetRarity;
  state: NftCanonicalState | 'cukie_master';
  custody: MyCukieCustody;
  poolStatus: 'pending' | 'active' | 'exit_requested' | 'withdrawable' | null;
};

export type MyCukieCollectionSummary = {
  total: number;
  inWallet: number;
  available: number;
  onSale: number;
  inPool: number;
  inCukieMaster: number;
  otherInUse: number;
};

export type MyCukieCollectionData = {
  walletNormalized: string;
  items: MyCukieCollectionItem[];
  summary: MyCukieCollectionSummary;
};

export type MyCukieCollectionResponse = {
  status: 'ok';
  data: MyCukieCollectionData;
} | {
  status: 'error';
  code: string;
};
