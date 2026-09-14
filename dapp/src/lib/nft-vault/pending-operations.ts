export type NftVaultPendingAction = 'approval' | 'deposit' | 'request_exit' | 'withdraw';

export type NftVaultPendingPhase =
  | 'awaiting_receipt'
  | 'approval_confirmed'
  | 'syncing_projection';

export type NftVaultPendingContext = {
  chainId: number;
  walletAddress: string;
  vaultAddress: string;
};

export type NftVaultPendingOperation = NftVaultPendingContext & {
  version: 1;
  assetId: string;
  collectionAddress: string;
  tokenId: string;
  /**
   * Deposit epoch emitted by the vault. It is optional for operations saved
   * before the receipt was decoded, but once known it prevents a stale
   * operation for an older deposit from clearing a newer position.
   */
  depositEpoch?: string;
  /** Block containing the successful transaction receipt, when known. */
  receiptBlockNumber?: string;
  action: NftVaultPendingAction;
  phase: NftVaultPendingPhase;
  txHash: `0x${string}`;
  createdAt: number;
  updatedAt: number;
};

export type NftVaultStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const unavailableStorage: NftVaultStorageLike = {
  getItem: () => null,
  setItem: () => { throw new DOMException('Storage unavailable', 'SecurityError'); },
  removeItem: () => undefined,
};

const STORAGE_PREFIX = 'cukies:nft-vault:pending:v1';
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function normalizeTokenId(tokenId: string) {
  if (!/^\d+$/.test(tokenId)) return null;
  try {
    return BigInt(tokenId).toString();
  } catch {
    return null;
  }
}

/**
 * Returns the only asset identity accepted by the custodial vault API. Older
 * browser entries used ad-hoc labels, so callers use this value to reconcile
 * them without trusting the persisted label itself.
 */
export function canonicalNftVaultAssetId(input: {
  chainId: number;
  collectionAddress: string;
  tokenId: string;
}) {
  const tokenId = normalizeTokenId(input.tokenId);
  if (!Number.isSafeInteger(input.chainId) || !ADDRESS_PATTERN.test(input.collectionAddress) || tokenId === null) {
    return null;
  }
  return `${input.chainId}:${normalizeAddress(input.collectionAddress)}:${tokenId}`;
}

/**
 * Key used by the UI map. It canonicalizes the collection/token identity while
 * retaining the original assetId in storage for auditability and migration.
 */
export function pendingNftVaultOperationAssetKey(operation: Pick<NftVaultPendingOperation, 'assetId' | 'chainId' | 'collectionAddress' | 'tokenId'>) {
  return canonicalNftVaultAssetId(operation) ?? operation.assetId;
}

/**
 * Compares a persisted operation with the snapshot that produced a read.
 * The asset key alone is insufficient because a later transaction may replace
 * the pending operation for the same collection/token.
 */
export function pendingNftVaultOperationMatches(
  operation: NftVaultPendingOperation | undefined,
  expected: Pick<
    NftVaultPendingOperation,
    'chainId'
    | 'walletAddress'
    | 'vaultAddress'
    | 'assetId'
    | 'collectionAddress'
    | 'tokenId'
    | 'action'
    | 'phase'
    | 'txHash'
    | 'depositEpoch'
  >,
) {
  if (!operation) return false;
  return operation.chainId === expected.chainId
    && normalizeAddress(operation.walletAddress) === normalizeAddress(expected.walletAddress)
    && normalizeAddress(operation.vaultAddress) === normalizeAddress(expected.vaultAddress)
    && pendingNftVaultOperationAssetKey(operation) === pendingNftVaultOperationAssetKey(expected)
    && operation.action === expected.action
    && operation.phase === expected.phase
    && operation.txHash.toLowerCase() === expected.txHash.toLowerCase()
    && (expected.depositEpoch === undefined || operation.depositEpoch === expected.depositEpoch);
}

export function pendingNftVaultOperationMatchesAsset(
  operation: Pick<NftVaultPendingOperation, 'chainId' | 'collectionAddress' | 'tokenId' | 'assetId'>,
  asset: { chainId: number; collectionAddress: string; tokenId: string; assetId: string },
) {
  const operationAssetId = canonicalNftVaultAssetId(operation);
  const assetAssetId = canonicalNftVaultAssetId(asset);
  return Boolean(
    operationAssetId
    && assetAssetId
    && operationAssetId === assetAssetId
    && operationAssetId === asset.assetId,
  );
}

export function pendingNftVaultOperationMatchesPosition(
  operation: Pick<NftVaultPendingOperation, 'chainId' | 'walletAddress' | 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'assetId' | 'depositEpoch'>,
  position: {
    chainId: number;
    vaultAddress: string;
    beneficiaryNormalized: string;
    collectionAddress: string;
    tokenId: string;
    assetId: string;
    depositEpoch: string;
  },
) {
  if (!pendingNftVaultOperationMatchesAsset(operation, position)) return false;
  const operationEpoch = operation.depositEpoch ? normalizeTokenId(operation.depositEpoch) : null;
  const positionEpoch = normalizeTokenId(position.depositEpoch);
  return Boolean(
    operation.chainId === position.chainId
    && normalizeAddress(operation.walletAddress) === normalizeAddress(position.beneficiaryNormalized)
    && normalizeAddress(operation.vaultAddress) === normalizeAddress(position.vaultAddress)
    && operationEpoch !== null
    && positionEpoch !== null
    && operationEpoch === positionEpoch,
  );
}

export function getNftVaultBrowserStorage(): NftVaultStorageLike {
  if (typeof window === 'undefined') return unavailableStorage;
  try {
    return window.localStorage;
  } catch {
    return unavailableStorage;
  }
}

export function getNftVaultStorageSnapshot(
  storage: NftVaultStorageLike,
  context: NftVaultPendingContext,
) {
  if (storage === unavailableStorage) return { readable: false, raw: null as string | null };
  try {
    return {
      readable: true,
      raw: storage.getItem(pendingNftVaultStorageKey(context)),
    };
  } catch {
    return { readable: false, raw: null as string | null };
  }
}

export function pendingNftVaultStorageKey(context: NftVaultPendingContext) {
  return [
    STORAGE_PREFIX,
    context.chainId,
    normalizeAddress(context.walletAddress),
    normalizeAddress(context.vaultAddress),
  ].join(':');
}

function isPendingOperation(value: unknown, context: NftVaultPendingContext): value is NftVaultPendingOperation {
  if (!value || typeof value !== 'object') return false;
  const operation = value as Partial<NftVaultPendingOperation>;
  return operation.version === 1
    && operation.chainId === context.chainId
    && typeof operation.walletAddress === 'string'
    && normalizeAddress(operation.walletAddress) === normalizeAddress(context.walletAddress)
    && typeof operation.vaultAddress === 'string'
    && normalizeAddress(operation.vaultAddress) === normalizeAddress(context.vaultAddress)
    && ADDRESS_PATTERN.test(operation.walletAddress)
    && ADDRESS_PATTERN.test(operation.vaultAddress)
    && typeof operation.assetId === 'string'
    && operation.assetId.length > 0
    && typeof operation.collectionAddress === 'string'
    && ADDRESS_PATTERN.test(operation.collectionAddress)
    && typeof operation.tokenId === 'string'
    && /^\d+$/.test(operation.tokenId)
    && (operation.depositEpoch === undefined
      || (operation.action !== 'approval'
        && typeof operation.depositEpoch === 'string'
        && /^\d+$/.test(operation.depositEpoch)))
    && (operation.receiptBlockNumber === undefined
      || (typeof operation.receiptBlockNumber === 'string'
        && /^[0-9]+$/.test(operation.receiptBlockNumber)))
    && (
      operation.action === 'approval'
      || operation.action === 'deposit'
      || operation.action === 'request_exit'
      || operation.action === 'withdraw'
    )
    && (
      operation.phase === 'awaiting_receipt'
      || operation.phase === 'approval_confirmed'
      || operation.phase === 'syncing_projection'
    )
    && typeof operation.txHash === 'string'
    && HASH_PATTERN.test(operation.txHash)
    && typeof operation.createdAt === 'number'
    && Number.isFinite(operation.createdAt)
    && typeof operation.updatedAt === 'number'
    && Number.isFinite(operation.updatedAt)
    && (operation.phase !== 'approval_confirmed' || operation.action === 'approval')
    && (operation.phase !== 'syncing_projection' || operation.action !== 'approval');
}

export function loadPendingNftVaultOperations(
  storage: NftVaultStorageLike,
  context: NftVaultPendingContext,
) {
  const key = pendingNftVaultStorageKey(context);
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      storage.removeItem(key);
      return [];
    }
    const valid = parsed.filter((item) => isPendingOperation(item, context));
    if (valid.length !== parsed.length) {
      if (valid.length === 0) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(valid));
    }
    return valid;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable (privacy mode / denied access). Reading stays fail-closed.
    }
    return [];
  }
}

export function savePendingNftVaultOperation(
  storage: NftVaultStorageLike,
  operation: NftVaultPendingOperation,
) {
  try {
    const context: NftVaultPendingContext = operation;
    const current = loadPendingNftVaultOperations(storage, context);
    const operationKey = pendingNftVaultOperationAssetKey(operation);
    const next = [
      ...current.filter((item) => pendingNftVaultOperationAssetKey(item) !== operationKey),
      operation,
    ];
    storage.setItem(pendingNftVaultStorageKey(context), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingNftVaultOperation(
  storage: NftVaultStorageLike,
  context: NftVaultPendingContext,
  assetId: string,
  expected?: Pick<
    NftVaultPendingOperation,
    'chainId'
    | 'walletAddress'
    | 'vaultAddress'
    | 'assetId'
    | 'collectionAddress'
    | 'tokenId'
    | 'action'
    | 'phase'
    | 'txHash'
    | 'depositEpoch'
  >,
) {
  try {
    const expectedAssetKey = expected ? pendingNftVaultOperationAssetKey(expected) : null;
    const next = loadPendingNftVaultOperations(storage, context)
      .filter((item) => {
        const itemAssetKey = pendingNftVaultOperationAssetKey(item);
        const sameAsset = item.assetId === assetId
          || itemAssetKey === assetId
          || (expectedAssetKey !== null && itemAssetKey === expectedAssetKey);
        return !(sameAsset && (!expected || pendingNftVaultOperationMatches(item, expected)));
      });
    const key = pendingNftVaultStorageKey(context);
    if (next.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function projectionMatchesPendingOperation(
  operation: Pick<
    NftVaultPendingOperation,
    'chainId' | 'collectionAddress' | 'tokenId' | 'depositEpoch' | 'action' | 'phase'
  >,
  asset: {
    assetId: string;
    custody: string;
    chainId?: number;
    collectionAddress?: string;
    tokenId?: string;
    depositEpoch?: string | null;
  } | undefined,
) {
  if (!asset || operation.phase !== 'syncing_projection') return false;
  const expectedAssetId = canonicalNftVaultAssetId({
    chainId: operation.chainId,
    collectionAddress: operation.collectionAddress,
    tokenId: operation.tokenId,
  });
  const actualAssetId = asset.chainId !== undefined
    && asset.collectionAddress !== undefined
    && asset.tokenId !== undefined
    ? canonicalNftVaultAssetId({
      chainId: asset.chainId,
      collectionAddress: asset.collectionAddress,
      tokenId: asset.tokenId,
    })
    : asset.assetId;
  if (
    !expectedAssetId
    || !actualAssetId
    || expectedAssetId !== actualAssetId
    || asset.assetId !== actualAssetId
  ) return false;
  if (operation.depositEpoch !== undefined) {
    const assetEpoch = asset.depositEpoch === null || asset.depositEpoch === undefined
      ? null
      : normalizeTokenId(asset.depositEpoch);
    if (assetEpoch === null || assetEpoch !== normalizeTokenId(operation.depositEpoch)) return false;
  }
  if (operation.action === 'deposit') return asset.custody === 'cukie_master_nft_vault';
  if (operation.action === 'withdraw') return asset.custody === 'wallet';
  return false;
}
