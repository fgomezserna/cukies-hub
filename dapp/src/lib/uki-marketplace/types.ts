export type IndexedUkiMarketplaceStatus =
  | 'active'
  | 'sold'
  | 'cancelled'
  | 'expired'
  | 'invalid';

export type UkiMarketplaceDisplayStatus =
  | IndexedUkiMarketplaceStatus
  | 'requires_attention';

export type IndexedUkiMarketplaceOrder = {
  _id: string;
  orderId: `0x${string}`;
  chain: 'BSC';
  chainId: 56 | 97;
  marketplaceAddressNormalized: `0x${string}`;
  collectionAddress: `0x${string}`;
  collectionAddressNormalized: `0x${string}`;
  tokenId: string;
  seller: `0x${string}`;
  sellerNormalized: `0x${string}`;
  ukiPriceRaw: string;
  expiresAtRaw: string;
  expiresAt: Date;
  nonceRaw: string;
  feeBps: number;
  status: IndexedUkiMarketplaceStatus;
  listedAt: Date;
  buyer?: `0x${string}`;
  buyerNormalized?: `0x${string}`;
  paymentToken?: `0x${string}`;
  paymentTokenNormalized?: `0x${string}`;
  paymentAmountRaw?: string;
  feeAmountRaw?: string;
  soldAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
  invalidatedAt?: Date;
  invalidReason?: `0x${string}`;
};

export type UkiMarketplaceLiveInspection = {
  contractState: 0 | 1 | 2 | 3 | 4 | 5 | null;
  ownerNormalized: `0x${string}` | null;
  marketplaceApproved: boolean | null;
};

export type UkiMarketplaceOrderView = {
  orderId: `0x${string}`;
  chainId: 56 | 97;
  marketplaceAddress: `0x${string}`;
  collectionAddress: `0x${string}`;
  tokenId: string;
  seller: `0x${string}`;
  ukiPriceRaw: string;
  expiresAt: string;
  nonceRaw: string;
  feeBps: number;
  status: UkiMarketplaceDisplayStatus;
  attentionReason: 'approval_required' | 'verification_unavailable' | null;
  buyer: `0x${string}` | null;
  paymentToken: `0x${string}` | null;
  paymentAmountRaw: string | null;
  feeAmountRaw: string | null;
  listedAt: string;
  soldAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  invalidatedAt: string | null;
};

export type UkiMarketplaceRuntime = {
  ready: boolean;
  chainId: 56 | 97 | null;
  marketplaceAddress: `0x${string}` | null;
  rpcUrl: string | null;
  issues: string[];
};
