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
  img?: string | null;
  type?: number | string | null;
  skills?: CukiSkills | null;
  needsImage?: boolean;
  cardImageStatus?: 'pending' | 'processing' | 'generated' | 'failed';
  cardImageAttempts?: number;
  cardImageLockedAt?: Date;
  cardImageLastError?: string | null;
  cardImageUrl?: string | null;
  cardGeneratedAt?: Date;
  timeStamp?: number;
};

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
  s3Bucket: string | null;
  s3Region: string | null;
  s3Prefix: string;
  s3Endpoint: string | null;
  s3ForcePathStyle: boolean;
  s3Acl: string | null;
};

export type RenderResult = {
  tokenId: string;
  outputPath: string;
  width: number;
  height: number;
};

export type GenerationResult = RenderResult & {
  imageUrl: string | null;
  s3Key: string | null;
};
