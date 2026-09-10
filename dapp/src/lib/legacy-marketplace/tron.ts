import { TronWeb } from 'tronweb';

import { legacyMarketplaceTronAbis } from './abis';
import {
  legacyMarketplaceContracts,
  type LegacyTronContractName,
} from './config';

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
  if (typeof window === 'undefined') return null;
  const browserWindow = window as Window & {
    tron?: { tronWeb?: LegacyTronWebLike };
    tronLink?: { tronWeb?: LegacyTronWebLike };
    tronWeb?: LegacyTronWebLike;
  };
  return browserWindow.tronWeb
    ?? browserWindow.tronLink?.tronWeb
    ?? browserWindow.tron?.tronWeb
    ?? null;
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
  contract: (
    abi: unknown,
    address: string,
  ) => LegacyTronContractInstance | Promise<LegacyTronContractInstance>;
};

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
  return tronWeb.contract(abi, address);
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
  return call.send(options);
}

export function isLegacyTronWalletReady(tronWeb?: LegacyTronWebLike | null) {
  return Boolean(tronWeb?.ready && tronWeb.defaultAddress?.base58);
}
