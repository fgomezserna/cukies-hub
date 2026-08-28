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
  action: NftVaultPendingAction;
  phase: NftVaultPendingPhase;
  txHash: `0x${string}`;
  createdAt: number;
  updatedAt: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const unavailableStorage: StorageLike = {
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

export function getNftVaultBrowserStorage(): StorageLike {
  if (typeof window === 'undefined') return unavailableStorage;
  try {
    return window.localStorage;
  } catch {
    return unavailableStorage;
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
  storage: StorageLike,
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
  storage: StorageLike,
  operation: NftVaultPendingOperation,
) {
  try {
    const context: NftVaultPendingContext = operation;
    const current = loadPendingNftVaultOperations(storage, context);
    const next = [
      ...current.filter((item) => item.assetId !== operation.assetId),
      operation,
    ];
    storage.setItem(pendingNftVaultStorageKey(context), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingNftVaultOperation(
  storage: StorageLike,
  context: NftVaultPendingContext,
  assetId: string,
) {
  try {
    const next = loadPendingNftVaultOperations(storage, context)
      .filter((item) => item.assetId !== assetId);
    const key = pendingNftVaultStorageKey(context);
    if (next.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function projectionMatchesPendingOperation(
  operation: NftVaultPendingOperation,
  asset: { assetId: string; custody: string } | undefined,
) {
  if (!asset || asset.assetId !== operation.assetId || operation.phase !== 'syncing_projection') return false;
  if (operation.action === 'deposit') return asset.custody === 'cukie_master_nft_vault';
  if (operation.action === 'withdraw') return asset.custody === 'wallet';
  return false;
}
