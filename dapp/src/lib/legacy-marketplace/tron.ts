import { TronWeb } from 'tronweb';

import { legacyMarketplaceTronAbis } from './abis';
import {
  legacyMarketplaceContracts,
  type LegacyTronContractName,
} from './config';
import {
  isTronWebWalletSignerReady,
  resolveTronWeb,
} from '@/lib/tronlink-provider';

type LegacyTronContractCall = {
  call: () => Promise<unknown>;
  send?: (options?: Record<string, unknown>) => Promise<unknown>;
};

type LegacyTronContractInstance = Record<
  string,
  (...args: readonly unknown[]) => LegacyTronContractCall
>;

type LegacyTronReadWeb = LegacyTronWebLike & {
  setAddress?: (address: string) => unknown;
};

export const LEGACY_TRON_MAINNET_RPC_URL = 'https://api.trongrid.io';

function rpcOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getLegacyTronWeb(): LegacyTronWebLike | null {
  return resolveTronWeb() as LegacyTronWebLike | null;
}

export function getLegacyTronWalletRpcOrigin(
  tronWeb?: LegacyTronWebLike | null,
) {
  return rpcOrigin(tronWeb?.fullNode?.host);
}

export function isLegacyTronWalletOnRpc(
  tronWeb: LegacyTronWebLike | null | undefined,
  expectedRpcUrl: string,
) {
  return Boolean(
    getLegacyTronWalletRpcOrigin(tronWeb)
    && getLegacyTronWalletRpcOrigin(tronWeb) === rpcOrigin(expectedRpcUrl),
  );
}

export type LegacyTronWebLike = {
  ready?: boolean;
  fullNode?: { host?: string };
  address?: {
    toHex?: (address: string) => string;
  };
  defaultAddress?: {
    base58?: string;
    hex?: string;
  };
  setAddress?: (address: string) => unknown;
  trx?: {
    sign?: (message: unknown) => Promise<unknown>;
    getTransactionInfo?: (transactionId: string) => Promise<unknown>;
  };
  contract?: (...args: readonly unknown[]) => unknown;
};

export type LegacyTronReceipt = Readonly<{
  transactionId: string;
  info: Record<string, unknown>;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

/** Extract the tx id returned by the different TronWeb versions/providers. */
export function getLegacyTronTransactionId(value: unknown): string | null {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.trim())) {
    return value.trim();
  }

  const root = record(value);
  if (!root) return null;

  for (const key of ['txid', 'txID', 'transactionId', 'id']) {
    const candidate = root[key];
    if (typeof candidate === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  for (const key of ['transaction', 'result']) {
    const nested = getLegacyTronTransactionId(root[key]);
    if (nested) return nested;
  }

  return null;
}

function receiptResult(info: Record<string, unknown>) {
  const receipt = record(info.receipt);
  const result = receipt?.result ?? info.result;
  return typeof result === 'string' ? result.trim().toUpperCase() : null;
}

const TRON_RECEIPT_FAILURE_PREFIX = 'TRON receipt failure:';

function isReceiptReady(info: Record<string, unknown>) {
  const result = receiptResult(info);
  if (result) return true;

  return (
    typeof info.blockNumber === 'number'
    || typeof info.blockNumber === 'string'
    || typeof info.blockTimeStamp === 'number'
    || typeof info.block_timestamp === 'number'
  );
}

function receiptFailure(info: Record<string, unknown>) {
  const result = receiptResult(info);
  if (!result || ['SUCCESS', 'OK', 'DEFAULT'].includes(result)) return null;

  const receipt = record(info.receipt);
  const message = receipt?.resMessage ?? receipt?.message ?? info.resMessage;
  return typeof message === 'string' && message.trim()
    ? `${TRON_RECEIPT_FAILURE_PREFIX} ${message.trim()}`
    : `${TRON_RECEIPT_FAILURE_PREFIX} ${result}`;
}

/**
 * Wait for a confirmed TRON receipt. `send(..., shouldPollResponse:false)`
 * returns before inclusion; callers must use this helper before presenting a
 * bridge as confirmed or clearing the selected NFT.
 */
export async function waitForLegacyTronReceipt(
  tronWeb: LegacyTronWebLike,
  transactionId: string,
  options: Readonly<{
    timeoutMs?: number;
    pollIntervalMs?: number;
  }> = {},
): Promise<LegacyTronReceipt> {
  const getTransactionInfo = tronWeb.trx?.getTransactionInfo;
  if (typeof getTransactionInfo !== 'function') {
    throw new Error('TronLink no permite consultar el receipt TRON.');
  }

  const timeoutMs = Math.max(options.timeoutMs ?? 120_000, 1_000);
  const pollIntervalMs = Math.max(options.pollIntervalMs ?? 3_000, 250);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() <= deadline) {
    try {
      const value = await getTransactionInfo(transactionId);
      const info = record(value);
      if (info && isReceiptReady(info)) {
        const failure = receiptFailure(info);
        if (failure) throw new Error(failure);
        return { transactionId, info };
      }
    } catch (error) {
      // A transient TronGrid/provider error should not turn a submitted bridge
      // into a false failure while the receipt can still be queried later.
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith(TRON_RECEIPT_FAILURE_PREFIX)) throw error;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }

  if (lastError instanceof Error && lastError.message) {
    throw new Error(`No se pudo confirmar la transaccion TRON: ${lastError.message}`);
  }
  throw new Error('No se pudo confirmar la transaccion TRON dentro del tiempo esperado.');
}

let legacyTronReadWeb: LegacyTronReadWeb | null = null;
let legacyTronReadRpcUrl: string | null = null;

/**
 * Returns a browser-safe TronWeb instance backed by the configured read RPC.
 *
 * This provider is intentionally separate from the wallet's `window.tronWeb`:
 * callers may set its read address, while wallet context and all write guards
 * remain the caller's job.
 */
export function getLegacyTronReadWeb(address?: string | null) {
  const readRpcUrl = legacyMarketplaceContracts.tron.readRpcUrl;
  if (!readRpcUrl) return null;

  if (!legacyTronReadWeb || legacyTronReadRpcUrl !== readRpcUrl) {
    try {
      legacyTronReadWeb = new TronWeb({ fullHost: readRpcUrl }) as unknown as LegacyTronReadWeb;
      legacyTronReadRpcUrl = readRpcUrl;
    } catch {
      legacyTronReadWeb = null;
      legacyTronReadRpcUrl = null;
      return null;
    }
  }

  if (address && typeof legacyTronReadWeb.setAddress === 'function') {
    try {
      legacyTronReadWeb.setAddress(address);
    } catch {
      return null;
    }
  }

  return legacyTronReadWeb;
}

export async function getTronContractAt(
  tronWeb: LegacyTronWebLike,
  abi: unknown,
  address: string,
) {
  if (typeof tronWeb.contract !== 'function') {
    throw new Error('TronLink no ha expuesto el cliente de contratos TRON.');
  }
  return tronWeb.contract(abi, address) as
    | LegacyTronContractInstance
    | Promise<LegacyTronContractInstance>;
}

export async function readTronContractAt<TValue = unknown>(
  tronWeb: LegacyTronWebLike,
  abi: unknown,
  address: string,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const contract = await getTronContractAt(tronWeb, abi, address);
  const method = contract[functionName];

  if (typeof method !== 'function') {
    throw new Error(`TRON contract ${address} has no method ${functionName}`);
  }

  const call = method(...args);
  if (typeof call.call !== 'function') {
    throw new Error(`TRON contract ${address}.${functionName} is not readable`);
  }

  return call.call() as Promise<TValue>;
}

export async function sendTronContractAt(
  tronWeb: LegacyTronWebLike,
  abi: unknown,
  address: string,
  functionName: string,
  args: readonly unknown[] = [],
  options?: Record<string, unknown>,
) {
  const contract = await getTronContractAt(tronWeb, abi, address);
  const method = contract[functionName];

  if (typeof method !== 'function') {
    throw new Error(`TRON contract ${address} has no method ${functionName}`);
  }

  const call = method(...args);
  if (typeof call.send !== 'function') {
    throw new Error(`TRON contract ${address}.${functionName} is not writable`);
  }

  return call.send(options);
}

export function getLegacyTronContractDescriptor(
  contractName: LegacyTronContractName,
) {
  return {
    address: legacyMarketplaceContracts.tron.contracts[contractName],
    abi: legacyMarketplaceTronAbis[contractName],
  };
}

export async function getLegacyTronContract(
  tronWeb: LegacyTronWebLike,
  contractName: LegacyTronContractName,
) {
  const { address, abi } = getLegacyTronContractDescriptor(contractName);

  return getTronContractAt(tronWeb, abi, address);
}

export async function readLegacyTronContract<TValue = unknown>(
  tronWeb: LegacyTronWebLike,
  contractName: LegacyTronContractName,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const contract = await getLegacyTronContract(tronWeb, contractName);
  const method = contract[functionName];

  if (typeof method !== 'function') {
    throw new Error(
      `TRON contract ${contractName} has no method ${functionName}`,
    );
  }

  const call = method(...args);

  if (typeof call.call !== 'function') {
    throw new Error(
      `TRON contract ${contractName}.${functionName} is not readable`,
    );
  }

  return call.call() as Promise<TValue>;
}

export async function sendLegacyTronContract(
  tronWeb: LegacyTronWebLike,
  contractName: LegacyTronContractName,
  functionName: string,
  args: readonly unknown[] = [],
  options?: Record<string, unknown>,
  beforeSend?: () => void,
) {
  const contract = await getLegacyTronContract(tronWeb, contractName);
  const method = contract[functionName];

  if (typeof method !== 'function') {
    throw new Error(
      `TRON contract ${contractName} has no method ${functionName}`,
    );
  }

  const call = method(...args);

  if (typeof call.send !== 'function') {
    throw new Error(
      `TRON contract ${contractName}.${functionName} is not writable`,
    );
  }

  beforeSend?.();
  if (!isLegacyTronWalletSignerReady(tronWeb)) {
    throw new Error('TRON_SIGNER_UNAVAILABLE');
  }
  return call.send(options);
}

export function isLegacyTronWalletReady(tronWeb?: LegacyTronWebLike | null) {
  return Boolean(tronWeb?.ready && tronWeb.defaultAddress?.base58);
}

export function isLegacyTronWalletSignerReady(tronWeb?: LegacyTronWebLike | null) {
  return isTronWebWalletSignerReady(tronWeb as Parameters<typeof isTronWebWalletSignerReady>[0]);
}
