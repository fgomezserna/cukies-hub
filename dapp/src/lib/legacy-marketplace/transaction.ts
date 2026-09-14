import {
  isTransactionRefreshAborted,
  waitForTransactionRefresh,
  throwIfTransactionRefreshAborted,
} from '@/lib/transaction-refresh';

import { getLegacyTronWeb } from './tron';

type TronReceiptWeb = NonNullable<ReturnType<typeof getLegacyTronWeb>> & {
  trx?: {
    getTransactionInfo?: (hash: string) => Promise<unknown>;
  };
};

export function tronTransactionId(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const candidate of [record.txid, record.txID, record.transactionHash, record.hash, record.id]) {
    if (typeof candidate === 'string' && /^[0-9a-f]{64}$/i.test(candidate)) return candidate;
  }
  if (record.transaction && typeof record.transaction === 'object') {
    return tronTransactionId(record.transaction);
  }
  return null;
}

export function assertTronSendResult(result: unknown) {
  if (typeof result === 'string' && /failed|revert|error/i.test(result)) {
    throw new Error('TRANSACTION_REVERTED');
  }
  if (!result || typeof result !== 'object') return;
  const record = result as Record<string, unknown>;
  const values = [record.result, record.code, record.contractRet, record.status]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  if (values.some((value) => ['failed', 'revert', 'error', 'unsuccess', 'out_of_energy', 'out_of_time']
    .some((token) => value.includes(token)))) {
    throw new Error('TRANSACTION_REVERTED');
  }
  if (record.receipt && typeof record.receipt === 'object') {
    assertTronSendResult(record.receipt);
  }
}

function tronReceiptResult(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const receipt = record.receipt && typeof record.receipt === 'object'
    ? record.receipt as Record<string, unknown>
    : null;
  const result = receipt?.result ?? record.contractRet ?? record.result;
  return typeof result === 'string' ? result.toLowerCase() : null;
}

/**
 * TronLink may acknowledge a broadcast before TRON has produced a receipt.
 * Only a successful contract result is considered confirmed; the txid alone
 * remains pending and must never update the operation as completed.
 */
export async function waitForLegacyTronReceipt(
  value: unknown,
  options: { signal?: AbortSignal; attempts?: number; delayMs?: number } = {},
) {
  const txId = tronTransactionId(value);
  if (!txId) throw new Error('TRANSACTION_ID_UNAVAILABLE');
  const tronWeb = getLegacyTronWeb() as TronReceiptWeb;
  const getInfo = tronWeb?.trx?.getTransactionInfo;
  if (!tronWeb?.trx || typeof getInfo !== 'function') {
    throw new Error('TRANSACTION_PENDING');
  }

  const attempts = Math.max(1, options.attempts ?? 6);
  const delayMs = Math.max(0, options.delayMs ?? 700);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfTransactionRefreshAborted(options.signal);
    try {
      const info = await getInfo.call(tronWeb.trx, txId);
      throwIfTransactionRefreshAborted(options.signal);
      const infoTxId = tronTransactionId(info);
      // A shared/indexed RPC can briefly return a different transaction. Ignore
      // that record before interpreting its failure/success fields; otherwise a
      // foreign REVERT would incorrectly terminate the requested transaction.
      if (!infoTxId || infoTxId.toLowerCase() === txId.toLowerCase()) {
        assertTronSendResult(info);
        const result = tronReceiptResult(info);
        if (result === 'success') return txId;
      }
    } catch (error) {
      if (isTransactionRefreshAborted(error)) throw error;
      if (error instanceof Error && error.message === 'TRANSACTION_REVERTED') throw error;
    }
    if (attempt < attempts - 1) {
      await waitForTransactionRefresh(delayMs, options.signal);
    }
  }
  throw new Error('TRANSACTION_PENDING');
}
