export type CukiSkills = {
  miner?: number | string;
  engineer?: number | string;
  farmer?: number | string;
  gatherer?: number | string;
  scout?: number | string;
  breeder?: number | string;
  life?: number | string;
  energy?: number | string;
  generation?: number | string;
};

export type CukiDocument = {
  _id: string;
  tokenId?: string;
  network?: string;
  chain?: string;
  chainId?: number;
  collectionAddressNormalized?: string;
  img?: string | null;
  type?: number | string | null;
  rarity?: number | string | null;
  generation?: number | string | null;
  skills?: CukiSkills | null;
  needsImage?: boolean;
  cardImageStatus?: 'pending' | 'processing' | 'generated' | 'failed';
  cardImageAttempts?: number;
  cardImageLockedAt?: Date;
  cardImageLockId?: string;
  cardImageLeaseVersion?: number;
  cardImageLeaseSourceRevision?: Date | null;
  cardImageLastError?: string | null;
  cardImageUrl?: string | null;
  cardGeneratedAt?: Date;
  timeStamp?: number;
  updatedAt?: Date;
};

export type AssetIdentityContext = {
  network: string;
  chainId: number;
  collectionAddressNormalized: string;
};

export type CardImageLease = {
  lockId: string;
  leaseVersion: number;
  claimedAt: Date;
  sourceRevision: Date | null;
};

export type ClaimedCuki = CukiDocument & { lease: CardImageLease };

export type BackfillCensusCategory =
  | 'renderable'
  | 'missing_identity'
  | 'missing_metadata'
  | 'unsupported_metadata'
  | 'missing'
  | 'locked_or_exhausted'
  | 'already_valid'
  | 'generated'
  | 'failed'
  | 'interrupted';

export type CardWorkerConfig = {
  mongoUrl: string;
  dbName: string;
  assetsDir: string;
  outputDir: string;
  pollIntervalMs: number;
  maxAttempts: number;
  staleLockMs: number;
  upload: boolean;
  publicBaseUrl: string | null;
  publicKeyPrefix: string | null;
  s3Bucket: string | null;
  s3Region: string | null;
  s3Prefix: string;
  s3Endpoint: string | null;
  s3ForcePathStyle: boolean;
  s3Acl: string | null;
  verifyPublic: boolean;
  backfillConcurrency: number;
  backfillManifestPath: string | null;
};

export type RenderResult = {
  tokenId: string;
  documentId?: string;
  assetIdentity?: string;
  outputPath: string;
  width: number;
  height: number;
};

export type GenerationResult = RenderResult & {
  imageUrl: string | null;
  s3Key: string | null;
  publicVerification?: PublicCardVerification;
};

export type PublicCardVerification = {
  status: number;
  contentType: string | null;
  contentLength: number | null;
  cacheControl: string | null;
  etag: string | null;
};
