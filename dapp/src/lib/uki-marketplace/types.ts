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

/**
 * Identidad canónica de un NFT que puede aparecer en un anuncio UKI.
 *
 * El tokenId se conserva como decimal sin ceros a la izquierda y la
 * colección siempre está normalizada en minúsculas.  La clave incluye la
 * cadena porque un mismo tokenId puede existir en varias redes/colecciones.
 */
export type UkiMarketplaceAssetIdentity = {
  chainId: 56 | 97;
  collectionAddress: `0x${string}`;
  tokenId: string;
};

export type UkiMarketplaceAssetMetadata = UkiMarketplaceAssetIdentity & {
  imageUrl: string | null;
  rarity: string | null;
  generation: string | null;
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
  /** Metadata derivada del inventario; nunca se guarda en la orden indexada. */
  imageUrl?: string | null;
  rarity?: string | null;
  generation?: string | null;
  catalogCursor?: string;
};

export type UkiMarketplaceOrdersResponse =
  | {
      status: 'ok';
      data: { orders: UkiMarketplaceOrderView[] };
    }
  | {
      status: 'error';
      code: string;
    };

export type UkiMarketplaceInventoryBlocker =
  | 'asset_not_available'
  | 'conflicting_activity';

export type UkiMarketplaceInventoryItem = {
  assetId: string;
  collectionAddress: `0x${string}`;
  tokenId: string;
  imageUrl: string | null;
  rarity: string;
  state: string;
  listingEligible: boolean;
  listingBlockers: UkiMarketplaceInventoryBlocker[];
};

export type UkiMarketplaceInventoryResponse =
  | {
      status: 'ok';
      data: { items: UkiMarketplaceInventoryItem[] };
    }
  | {
      status: 'error';
      code: string;
    };

export type UkiMarketplaceRuntime = {
  ready: boolean;
  chainId: 56 | 97 | null;
  marketplaceAddress: `0x${string}` | null;
  rpcUrls: string[];
  issues: string[];
};
