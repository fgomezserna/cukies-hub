import type { Hash } from 'viem';

export type NftTransactionContext = {
  wallet: string;
  chainId: number;
  vault: string;
};

export type NftTransactionReplacementReason = 'cancelled' | 'replaced' | 'repriced';

export type NftTransactionReceipt = {
  status: string;
  transactionHash?: Hash;
  logs?: unknown;
};

export type NftTransactionReplacement = {
  reason: NftTransactionReplacementReason;
  replacedHash: Hash;
  replacementHash: Hash;
  receipt: NftTransactionReceipt;
};

type NftTransactionContextInput = {
  wallet: string | null | undefined;
  chainId: number | null | undefined;
  vault: string | null | undefined;
};

export function nftTransactionContextMatches(
  expected: NftTransactionContext,
  current: NftTransactionContextInput | null,
) {
  const normalizedCurrent = current ? nftTransactionContextFromNullable(current) : null;
  return Boolean(
    normalizedCurrent
    && normalizedCurrent.chainId === expected.chainId
    && normalizedCurrent.wallet.toLowerCase() === expected.wallet.toLowerCase()
    && normalizedCurrent.vault.toLowerCase() === expected.vault.toLowerCase(),
  );
}

export function nftTransactionContextFromNullable(input: NftTransactionContextInput): NftTransactionContext | null {
  if (!input.wallet || input.chainId == null || !input.vault) return null;
  return { wallet: input.wallet, chainId: input.chainId, vault: input.vault };
}

type NftVaultListStatus = {
  sourceHealthy: boolean;
  positions: readonly unknown[];
  availableAssets?: readonly unknown[];
};

export function retainNftVaultLists<T extends NftVaultListStatus>(current: T, previous: T | null) {
  if (current.sourceHealthy || !previous) return current;
  const previousAvailable = previous.availableAssets;
  const currentAvailable = current.availableAssets;
  return {
    ...current,
    positions: current.positions.length > 0 ? current.positions : previous.positions,
    ...(currentAvailable && previousAvailable
      ? { availableAssets: currentAvailable.length > 0 ? currentAvailable : previousAvailable }
      : {}),
  } as T;
}

type NftTransactionGuard = {
  ready: boolean;
  reason: string;
  switchToTarget: () => Promise<unknown>;
};

export type NftTransactionClient = {
  simulateContract?: (request: Record<string, unknown>) => Promise<unknown>;
  waitForTransactionReceipt: (input: {
    hash: Hash;
    onReplaced?: (replacement: {
      reason: NftTransactionReplacementReason;
      replacedTransaction: { hash: Hash };
      transaction: { hash: Hash };
      transactionReceipt: NftTransactionReceipt;
    }) => void;
  }) => Promise<NftTransactionReceipt>;
};

export async function executeNftTransaction<TRequest extends Record<string, unknown>>({
  request,
  client,
  guard,
  expectedContext,
  currentContext,
  isReady,
  write,
  errorPrefix,
  onSubmitted,
  onReverted,
  onConfirmed,
  onReplaced,
}: {
  request: TRequest;
  client: NftTransactionClient;
  guard: NftTransactionGuard;
  expectedContext: NftTransactionContext;
  currentContext: () => NftTransactionContext | null;
  isReady: () => boolean;
  write: (request: TRequest & { account: string }) => Promise<Hash>;
  errorPrefix: string;
  onSubmitted: (hash: Hash, identityCurrent: boolean) => void;
  onReverted: (identityCurrent: boolean) => void;
  onConfirmed: (hash: Hash, identityCurrent: boolean, receipt: NftTransactionReceipt) => void;
  onReplaced?: (replacement: NftTransactionReplacement, identityCurrent: boolean) => void;
}) {
  if (!guard.ready) {
    if (guard.reason === 'wrong_chain') await guard.switchToTarget();
    throw new Error(`${errorPrefix}_${guard.reason.toUpperCase()}`);
  }
  const simulateContract = client.simulateContract;
  if (typeof simulateContract !== 'function') {
    throw new Error(`${errorPrefix}_SIMULATION_UNAVAILABLE`);
  }
  const requestWithAccount = { ...request, account: expectedContext.wallet } as TRequest & { account: string };
  try {
    await simulateContract.call(client, requestWithAccount);
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason ?? '');
    throw new Error(`${errorPrefix}_SIMULATION_REJECTED${detail ? `: ${detail}` : ''}`);
  }
  const context = currentContext();
  if (!isReady() || !nftTransactionContextMatches(expectedContext, context)) {
    throw new Error(`${errorPrefix}_CONTEXT_CHANGED`);
  }
  const hash = await write(requestWithAccount);
  onSubmitted(hash, nftTransactionContextMatches(expectedContext, currentContext()));
  let replacement: NftTransactionReplacement | null = null;
  const receipt = await client.waitForTransactionReceipt({
    hash,
    onReplaced: (input) => {
      replacement = {
        reason: input.reason,
        replacedHash: input.replacedTransaction.hash,
        replacementHash: input.transaction.hash,
        receipt: input.transactionReceipt,
      };
    },
  });
  const identityCurrent = nftTransactionContextMatches(expectedContext, currentContext());
  const replacementResult = replacement as NftTransactionReplacement | null;
  const replacementReason = replacementResult?.reason;
  const actualHash = receipt.transactionHash ?? replacementResult?.replacementHash ?? hash;
  if (replacementReason) {
    onReplaced?.(replacementResult, identityCurrent);
    if (replacementReason !== 'repriced') {
      onReverted(identityCurrent);
      throw new Error(`${errorPrefix}_TRANSACTION_${replacementReason.toUpperCase()}`);
    }
  } else if (actualHash.toLowerCase() !== hash.toLowerCase()) {
    onReverted(identityCurrent);
    throw new Error(`${errorPrefix}_TRANSACTION_REPLACED`);
  }
  if (receipt.status !== 'success') {
    onReverted(identityCurrent);
    throw new Error(`${errorPrefix}_TRANSACTION_REVERTED`);
  }
  onConfirmed(actualHash, identityCurrent, receipt);
  if (!identityCurrent || !isReady()) throw new Error(`${errorPrefix}_CONTEXT_CHANGED_AFTER_RECEIPT`);
  return actualHash;
}
