import 'server-only';

import type { ClientSession, Db } from 'mongodb';

import { ukiNftVaults, type UkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';
import {
  normalizeCukiesInventoryDocument,
  summarizeCukieMasterNftRoute,
  type CukiesInventoryDocument,
  type CukieMasterNftRouteSummary,
  type NormalizedNftAsset,
} from '@/lib/nft-inventory';
import { normalizeWalletAddress } from '@/lib/wallet-address';

import { SchemaNotReadyError } from '../errors';

const MAX_OPEN_POSITIONS_PER_WALLET = 1_000;

export type CukieMasterNftVaultPositionDocument = {
  _id?: unknown;
  positionId?: unknown;
  assetId?: unknown;
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
  tokenId?: unknown;
  vaultAlias?: unknown;
  vaultAddressNormalized?: unknown;
  beneficiaryNormalized?: unknown;
  depositEpoch?: unknown;
  depositedAt?: unknown;
  lifecycle?: unknown;
  lifecycleOpen?: unknown;
  custody?: unknown;
  rewardEligible?: unknown;
  depositEvidence?: unknown;
  lastEventId?: unknown;
  updatedAt?: unknown;
};

export type CanonicalCukieMasterNftPosition = {
  positionId: string;
  assetId: string;
  chainId: 56 | 97;
  collectionAddress: `0x${string}`;
  tokenId: string;
  beneficiaryNormalized: string;
  depositEpoch: string;
  depositedAt: string;
  depositEventId: string;
  depositTxHash: string;
  depositBlockNumber: number;
  observedAt: string | null;
  asset: NormalizedNftAsset;
};

type DepositEvidence = {
  eventId?: unknown;
  txHash?: unknown;
  blockNumber?: unknown;
  observedAt?: unknown;
};

type CukiesVaultInventoryDocument = CukiesInventoryDocument & {
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function decimal(value: unknown) {
  const resolved = text(value);
  return resolved && /^\d+$/.test(resolved) ? resolved : null;
}

function dateIso(value: unknown) {
  const date = value instanceof Date
    ? value
    : typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function metadataTokenId(document: CukiesInventoryDocument) {
  const fromToken = typeof document.tokenId === 'string' || typeof document.tokenId === 'number'
    || typeof document.tokenId === 'bigint'
    ? String(document.tokenId)
    : null;
  if (fromToken && /^\d+$/.test(fromToken)) return fromToken;
  const fromId = typeof document._id === 'string' || typeof document._id === 'number'
    || typeof document._id === 'bigint'
    ? String(document._id)
    : null;
  return fromId && /^\d+$/.test(fromId) ? fromId : null;
}

function assertCustodialConfig(config: UkiNftVaultPublicConfig) {
  if (config.mode.cukieMaster !== 'custodial') {
    throw new SchemaNotReadyError(
      config.mode.cukieMaster === 'invalid'
        ? 'La configuracion del vault NFT de Cukie Master es incompleta o invalida.'
        : 'El vault NFT de Cukie Master no esta configurado.',
    );
  }
  if (
    !config.chainId
    || !config.cukieMasterNftVaultAddress
    || config.collectionAddresses.length === 0
  ) {
    throw new SchemaNotReadyError('La configuracion custodial NFT no esta completa.');
  }
  return {
    chainId: config.chainId,
    vaultAddress: config.cukieMasterNftVaultAddress.toLowerCase(),
    collectionAddresses: config.collectionAddresses.map((address) => address.toLowerCase()),
  };
}

export function normalizeCanonicalCukieMasterNftPosition(input: {
  document: CukieMasterNftVaultPositionDocument;
  metadata: CukiesVaultInventoryDocument | null;
  walletAddress: string;
  config?: UkiNftVaultPublicConfig;
  now?: Date;
}): CanonicalCukieMasterNftPosition {
  const config = assertCustodialConfig(input.config ?? ukiNftVaults);
  const walletNormalized = normalizeWalletAddress(input.walletAddress);
  if (!walletNormalized) throw new SchemaNotReadyError('La wallet de la posicion NFT no es BSC valida.');

  const positionId = text(input.document.positionId ?? input.document._id);
  const assetId = text(input.document.assetId);
  const collectionAddress = text(input.document.collectionAddressNormalized)?.toLowerCase();
  const tokenId = decimal(input.document.tokenId);
  const depositEpoch = decimal(input.document.depositEpoch);
  const depositedAt = decimal(input.document.depositedAt);
  const beneficiary = text(input.document.beneficiaryNormalized)?.toLowerCase();
  const vaultAddress = text(input.document.vaultAddressNormalized)?.toLowerCase();
  const evidence = record(input.document.depositEvidence) as DepositEvidence | null;
  const eventId = text(evidence?.eventId);
  const txHash = text(evidence?.txHash)?.toLowerCase();
  const blockNumber = typeof evidence?.blockNumber === 'number'
    && Number.isSafeInteger(evidence.blockNumber)
    && evidence.blockNumber >= 0
    ? evidence.blockNumber
    : null;
  const expectedAssetId = collectionAddress && tokenId
    ? `${config.chainId}:${collectionAddress}:${tokenId}`
    : null;
  const expectedPositionId = expectedAssetId && depositEpoch
    ? `${expectedAssetId}:epoch:${depositEpoch}`
    : null;

  if (
    input.document.chainId !== config.chainId
    || !positionId
    || !assetId
    || !collectionAddress
    || !/^0x[0-9a-f]{40}$/.test(collectionAddress)
    || !config.collectionAddresses.includes(collectionAddress)
    || !tokenId
    || !depositEpoch
    || depositEpoch === '0'
    || !depositedAt
    || beneficiary !== walletNormalized.toLowerCase()
    || vaultAddress !== config.vaultAddress
    || input.document.vaultAlias !== 'CUKIE_MASTER_NFT_VAULT'
    || input.document.lifecycle !== 'custodied'
    || input.document.lifecycleOpen !== true
    || input.document.custody !== 'cukie_master_nft_vault'
    || input.document.rewardEligible !== true
    || assetId !== expectedAssetId
    || positionId !== expectedPositionId
    || !eventId
    || !txHash
    || !/^0x[0-9a-f]{64}$/.test(txHash)
    || blockNumber === null
    || input.document.lastEventId !== eventId
  ) {
    throw new SchemaNotReadyError('cukie_master_nft_positions contiene una posicion abierta inconsistente.');
  }

  if (input.metadata) {
    const metadataCollection = text(input.metadata.collectionAddressNormalized)?.toLowerCase();
    if (
      input.metadata.chainId !== config.chainId
      || metadataCollection !== collectionAddress
      || metadataTokenId(input.metadata) !== tokenId
    ) {
      throw new SchemaNotReadyError('cukies contiene metadata con una identidad NFT inconsistente.');
    }
  }

  const metadataDocument = input.metadata ?? {
    _id: `missing:${assetId}`,
    tokenId,
    network: 'BSC',
    state: 'available',
    owner: input.walletAddress,
    ownerNormalized: walletNormalized,
  };
  const normalizedMetadata = normalizeCukiesInventoryDocument(metadataDocument, [], input.now);
  const metadataBlockers = normalizedMetadata.blockers.filter((blocker) => (
    blocker === 'missing_rarity' || blocker === 'missing_generation'
  ));
  const asset: NormalizedNftAsset = {
    ...normalizedMetadata,
    assetId,
    tokenId,
    network: 'bsc',
    ownerWallet: input.walletAddress,
    ownerNormalized: walletNormalized,
    canonicalState: 'available',
    blockers: metadataBlockers,
    activeLocks: [],
    sourceRefs: [
      ...normalizedMetadata.sourceRefs,
      {
        source: 'cukie_master_nft_positions',
        collection: 'cukie_master_nft_positions',
        documentId: positionId,
        tokenId,
        observedAt: dateIso(evidence?.observedAt ?? input.document.updatedAt),
        eventId,
      },
    ],
  };

  return {
    positionId,
    assetId,
    chainId: config.chainId,
    collectionAddress: collectionAddress as `0x${string}`,
    tokenId,
    beneficiaryNormalized: beneficiary,
    depositEpoch,
    depositedAt,
    depositEventId: eventId,
    depositTxHash: txHash,
    depositBlockNumber: blockNumber,
    observedAt: dateIso(evidence?.observedAt ?? input.document.updatedAt),
    asset,
  };
}

function metadataIdentityKey(input: {
  chainId: number;
  collectionAddressNormalized: string;
  tokenId: string;
}) {
  return `${input.chainId}:${input.collectionAddressNormalized.toLowerCase()}:${input.tokenId}`;
}

async function loadMetadataByAssetIdentity(input: {
  db: Db;
  positions: Array<{
    chainId: number;
    collectionAddressNormalized: string;
    tokenId: string;
  }>;
  session?: ClientSession;
}) {
  const positions = [...new Map(input.positions.map((position) => [
    metadataIdentityKey(position),
    position,
  ])).values()];
  if (positions.length === 0) return new Map<string, CukiesVaultInventoryDocument | null>();
  const documents = await input.db.collection<CukiesVaultInventoryDocument>('cukies').find({
    $or: positions.map((position) => {
      const numericTokenId = Number(position.tokenId);
      const candidates: unknown[] = Number.isSafeInteger(numericTokenId)
        && String(numericTokenId) === position.tokenId
        ? [position.tokenId, numericTokenId]
        : [position.tokenId];
      return {
        chainId: position.chainId,
        collectionAddressNormalized: position.collectionAddressNormalized,
        $or: [
          { tokenId: { $in: candidates } },
          { _id: { $in: candidates as never[] } },
        ],
      };
    }),
  }, { session: input.session }).limit(positions.length * 2 + 1).toArray();
  const grouped = new Map<string, CukiesVaultInventoryDocument[]>();
  for (const document of documents) {
    const tokenId = metadataTokenId(document);
    const collectionAddressNormalized = text(document.collectionAddressNormalized)?.toLowerCase();
    if (
      !tokenId
      || typeof document.chainId !== 'number'
      || !collectionAddressNormalized
    ) continue;
    const key = metadataIdentityKey({
      chainId: document.chainId,
      collectionAddressNormalized,
      tokenId,
    });
    const current = grouped.get(key) ?? [];
    current.push(document);
    grouped.set(key, current);
  }
  return new Map(positions.map((position) => [
    metadataIdentityKey(position),
    grouped.get(metadataIdentityKey(position))?.length === 1
      ? grouped.get(metadataIdentityKey(position))![0]
      : null,
  ]));
}

export async function listCanonicalCukieMasterNftPositions(input: {
  db: Db;
  walletAddress: string;
  now?: Date;
  session?: ClientSession;
  config?: UkiNftVaultPublicConfig;
}) {
  const publicConfig = input.config ?? ukiNftVaults;
  const config = assertCustodialConfig(publicConfig);
  const walletNormalized = normalizeWalletAddress(input.walletAddress);
  if (!walletNormalized) throw new SchemaNotReadyError('La wallet NFT no es BSC valida.');

  const documents = await input.db
    .collection<CukieMasterNftVaultPositionDocument>('cukie_master_nft_positions')
    .find({
      chainId: config.chainId,
      vaultAddressNormalized: config.vaultAddress,
      collectionAddressNormalized: { $in: config.collectionAddresses },
      beneficiaryNormalized: walletNormalized.toLowerCase(),
      lifecycleOpen: true,
    }, { session: input.session })
    .sort({ assetId: 1, depositEpoch: 1 })
    .limit(MAX_OPEN_POSITIONS_PER_WALLET + 1)
    .toArray();
  if (documents.length > MAX_OPEN_POSITIONS_PER_WALLET) {
    throw new SchemaNotReadyError('La wallet supera el limite seguro de posiciones NFT abiertas.');
  }
  const metadataPositions = documents.flatMap((document) => {
    const collectionAddressNormalized = text(document.collectionAddressNormalized)?.toLowerCase();
    const tokenId = decimal(document.tokenId);
    return collectionAddressNormalized && tokenId
      ? [{ chainId: config.chainId, collectionAddressNormalized, tokenId }]
      : [];
  });
  const metadata = await loadMetadataByAssetIdentity({
    db: input.db,
    positions: metadataPositions,
    session: input.session,
  });
  return documents.map((document) => {
    const collectionAddressNormalized = text(document.collectionAddressNormalized)?.toLowerCase();
    const tokenId = decimal(document.tokenId);
    const key = collectionAddressNormalized && tokenId
      ? metadataIdentityKey({
          chainId: config.chainId,
          collectionAddressNormalized,
          tokenId,
        })
      : '';
    return normalizeCanonicalCukieMasterNftPosition({
      document,
      metadata: metadata.get(key) ?? null,
      walletAddress: input.walletAddress,
      config: publicConfig,
      now: input.now,
    });
  });
}

export async function getCukieMasterNftVaultEntitlementFromDb(input: {
  db: Db;
  walletAddress: string;
  eligibleUki?: number;
  now?: Date;
  session?: ClientSession;
  config?: UkiNftVaultPublicConfig;
}): Promise<CukieMasterNftRouteSummary> {
  const positions = await listCanonicalCukieMasterNftPositions(input);
  return summarizeCukieMasterNftRoute({
    walletAddress: input.walletAddress,
    eligibleUki: input.eligibleUki,
    assets: positions.map((position) => position.asset),
  });
}
