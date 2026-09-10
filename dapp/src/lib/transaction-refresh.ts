export type TransactionRefreshHash = `0x${string}`;

export type TransactionReplacementReason = 'cancelled' | 'replaced' | 'repriced';

export type TransactionRefreshReceipt = {
  status: unknown;
  transactionHash?: string;
};

export type TransactionReplacement = {
  reason: TransactionReplacementReason;
  replacedHash: string;
  replacementHash: string;
};

export class TransactionReplacementError extends Error {
  readonly reason: TransactionReplacementReason;
  readonly replacedHash: string;
  readonly replacementHash: string;

  constructor(replacement: TransactionReplacement, cause?: unknown) {
    super(`TRANSACTION_${replacement.reason.toUpperCase()}`);
    this.name = 'TransactionReplacementError';
    this.reason = replacement.reason;
    this.replacedHash = replacement.replacedHash;
    this.replacementHash = replacement.replacementHash;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * A repriced transaction has a new hash but may still be waiting for a
 * receipt.  Keep it pending instead of treating a timeout after repricing as
 * a cancellation/replacement failure.
 */
export class TransactionReplacementPendingError extends Error {
  readonly replacement: TransactionReplacement;
  readonly hash: TransactionRefreshHash;

  constructor(replacement: TransactionReplacement, cause?: unknown) {
    super('TRANSACTION_PENDING');
    this.name = 'TransactionReplacementPendingError';
    this.replacement = replacement;
    this.hash = replacement.replacementHash as TransactionRefreshHash;
    if (cause !== undefined) this.cause = cause;
  }
}

function hashValue(value: unknown): string | null {
  return typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value)
    ? value
    : null;
}

function replacementReason(value: unknown): TransactionReplacementReason | null {
  if (value === 'cancelled' || value === 'replaced' || value === 'repriced') return value;
  return null;
}

function replacementFromUnknown(value: unknown, fallbackHash?: string): TransactionReplacement | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const reason = replacementReason(record.reason)
    ?? replacementReason(record.replacementReason)
    ?? replacementReason(record.code);
  if (!reason) return null;
  const replacedTransaction = record.replacedTransaction && typeof record.replacedTransaction === 'object'
    ? record.replacedTransaction as Record<string, unknown>
    : null;
  const transaction = record.transaction && typeof record.transaction === 'object'
    ? record.transaction as Record<string, unknown>
    : null;
  const replacement = record.replacement && typeof record.replacement === 'object'
    ? record.replacement as Record<string, unknown>
    : null;
  const replacedHash = hashValue(record.replacedHash)
    ?? hashValue(replacedTransaction?.hash)
    ?? hashValue(record.hash)
    ?? hashValue(fallbackHash);
  const replacementHash = hashValue(record.replacementHash)
    ?? hashValue(transaction?.hash)
    ?? hashValue(replacement?.hash)
    ?? hashValue(record.transactionHash);
  if (!replacedHash || !replacementHash) return null;
  return { reason, replacedHash, replacementHash };
}

type EvmWaitInput = {
  hash: TransactionRefreshHash;
  onReplaced?: (response: unknown) => void;
};

type EvmWaitClient<TReceipt extends TransactionRefreshReceipt> = {
  waitForTransactionReceipt: (...args: never[]) => Promise<TReceipt>;
};

/**
 * Waits for an EVM receipt while retaining the hash that was actually mined.
 * Viem resolves replacements through `onReplaced`; callers receive the receipt
 * hash that was actually mined, so repriced submissions remain traceable while
 * cancelled/replaced submissions never look like a confirmed operation.
 */
export async function waitForConfirmedEvmTransaction<TReceipt extends TransactionRefreshReceipt>(
  client: EvmWaitClient<TReceipt>,
  hash: TransactionRefreshHash,
) {
  const replacementState: { current: TransactionReplacement | null } = { current: null };
  const input: EvmWaitInput = {
    hash,
    onReplaced: (response: unknown) => {
      replacementState.current = replacementFromUnknown(response, hash);
    },
  };

  let receipt: TReceipt;
  try {
    const waitForTransactionReceipt = client.waitForTransactionReceipt as unknown as (
      request: EvmWaitInput,
    ) => Promise<TReceipt>;
    receipt = await waitForTransactionReceipt(input);
  } catch (reason) {
    const detected = replacementState.current ?? replacementFromUnknown(reason, hash);
    if (detected) {
      if (detected.reason === 'repriced') {
        throw new TransactionReplacementPendingError(detected, reason);
      }
      throw new TransactionReplacementError(detected, reason);
    }
    throw reason;
  }

  const replacement = replacementState.current;
  const actualHash = hashValue(receipt.transactionHash)
    ?? replacement?.replacementHash
    ?? hash;
  if (replacement && replacement.reason !== 'repriced') {
    throw new TransactionReplacementError({
      ...replacement,
      replacementHash: actualHash,
    });
  }
  if (actualHash.toLowerCase() !== hash.toLowerCase() && !replacement) {
    throw new TransactionReplacementError({
      reason: 'replaced',
      replacedHash: hash,
      replacementHash: actualHash,
    });
  }

  return { receipt, hash: actualHash as TransactionRefreshHash, replacement };
}

export const TRANSACTION_REFRESH_RETRY_DELAYS_MS = [
  0,
  500,
  1_000,
  2_000,
  4_000,
  8_000,
  12_000,
  15_000,
  20_000,
] as const;

export type RetryOptions = {
  signal?: AbortSignal;
  delays?: readonly number[];
};

function abortError(signal?: AbortSignal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('TRANSACTION_REFRESH_ABORTED');
  error.name = 'AbortError';
  return error;
}

export function throwIfTransactionRefreshAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal);
}

export function isTransactionRefreshAborted(reason: unknown) {
  return reason instanceof Error
    && (reason.name === 'AbortError' || reason.message === 'TRANSACTION_REFRESH_ABORTED');
}

export function waitForTransactionRefresh(
  delayMs: number,
  signal?: AbortSignal,
) {
  throwIfTransactionRefreshAborted(signal);
  if (delayMs <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/**
 * Runs a post-receipt refresh until the caller observes the expected state or
 * the bounded retry window expires. The callback owns transient error
 * handling; context changes should be thrown so they cannot be swallowed.
 */
export async function retryTransactionRefresh(
  attempt: () => Promise<boolean>,
  options: RetryOptions = {},
) {
  const delays = options.delays ?? TRANSACTION_REFRESH_RETRY_DELAYS_MS;
  for (const delay of delays) {
    await waitForTransactionRefresh(delay, options.signal);
    throwIfTransactionRefreshAborted(options.signal);
    if (await attempt()) {
      throwIfTransactionRefreshAborted(options.signal);
      return true;
    }
    throwIfTransactionRefreshAborted(options.signal);
  }
  return false;
}
