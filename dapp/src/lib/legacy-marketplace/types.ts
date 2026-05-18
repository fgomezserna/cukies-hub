export const legacyCukiStates = [
  'available',
  'onSale',
  'staking',
  'breeding',
  'inBridge',
] as const;

export const legacyCukiNetworks = ['TRON', 'BSC'] as const;

export type LegacyCukiState = (typeof legacyCukiStates)[number];
export type LegacyCukiNetwork = (typeof legacyCukiNetworks)[number];

export type LegacyCukiSkills = {
  miner?: number;
  engineer?: number;
  farmer?: number;
  gatherer?: number;
  scout?: number;
  breeder?: number;
  life?: number;
  energy?: number;
  generation?: number;
};

export type LegacyMarketplaceCukiReference = {
  id: string;
  tokenId: string;
  cukiNumber: number | null;
  network: LegacyCukiNetwork | string | null;
  birthNetwork: string | null;
  state: LegacyCukiState | string | null;
  imageUrl: string | null;
  generation: number | null;
};

export type LegacyMarketplaceCukiHistoryEntry = {
  id: string;
  transactionId: string | null;
  type: string;
  from: string | null;
  to: string | null;
  date: number | null;
  price: number | null;
  network: LegacyCukiNetwork | string | null;
};

export type LegacyMarketplaceCukiItem = {
  id: string;
  tokenId: string;
  cukiNumber: number | null;
  owner: string | null;
  network: LegacyCukiNetwork | string;
  origin: string | null;
  birthNetwork: string | null;
  imageUrl: string | null;
  type: number | string | null;
  state: LegacyCukiState | string;
  price: number | null;
  priceOriginal: string | null;
  skills: LegacyCukiSkills;
  childrenCount: number | null;
  childrenCountTron: number | null;
  childrenCountBsc: number | null;
  parents: LegacyMarketplaceCukiReference[];
  children: LegacyMarketplaceCukiReference[];
  history: LegacyMarketplaceCukiHistoryEntry[];
  timestamp: number | null;
};

export type LegacyMarketplaceFacet = {
  value: string;
  count: number;
};

export type LegacyMarketplaceListResponse = {
  source: 'mongo' | 'graphql' | 'empty';
  items: LegacyMarketplaceCukiItem[];
  total: number;
  offset: number;
  limit: number;
  facets: {
    states: LegacyMarketplaceFacet[];
    networks: LegacyMarketplaceFacet[];
    types: LegacyMarketplaceFacet[];
    generations: LegacyMarketplaceFacet[];
  };
  error?: string;
};

export type LegacyMarketplaceListParams = {
  limit?: number;
  offset?: number;
  search?: string;
  network?: string;
  state?: string;
  type?: string;
  generation?: string;
  owner?: string;
  sort?: string;
};

export type LegacyBreedingCandidatesParams = {
  owner?: string;
  network?: string;
  maxBreeds?: number;
  limit?: number;
};

export type LegacyBreedingCandidatesResponse = {
  source: 'mongo' | 'empty';
  items: LegacyMarketplaceCukiItem[];
  total: number;
  maxBreeds: number | null;
  error?: string;
};

export type LegacyCompletedBreedsParams = {
  wallets?: string[];
  network?: string;
  limit?: number;
  offset?: number;
};

export type LegacyCompletedBreedsResponse = {
  source: 'mongo' | 'empty';
  items: LegacyMarketplaceCukiItem[];
  total: number;
  offset: number;
  limit: number;
  error?: string;
};

export type LegacyCukiePointsParams = {
  wallets?: string[];
  network?: string;
  type?: string;
  limit?: number;
  offset?: number;
};

export type LegacyCukiePointsTransaction = {
  id: string;
  address: string | null;
  points: number | null;
  type: string;
  date: number | null;
  txId: string | null;
  network: LegacyCukiNetwork | string | null;
  description: string | null;
  explorerUrl: string | null;
};

export type LegacyCukiePointsSummary = {
  totalPoints: number;
  totalTransactions: number;
  facets: {
    networks: LegacyMarketplaceFacet[];
    types: LegacyMarketplaceFacet[];
  };
};

export type LegacyCukiePointsResponse = {
  source: 'mongo' | 'empty';
  items: LegacyCukiePointsTransaction[];
  total: number;
  offset: number;
  limit: number;
  summary: LegacyCukiePointsSummary;
  error?: string;
};
