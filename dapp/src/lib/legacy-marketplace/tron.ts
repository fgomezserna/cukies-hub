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

export type LegacyTronWebLike = {
  ready?: boolean;
  defaultAddress?: {
    base58?: string;
  };
  contract: (
    abi: unknown,
    address: string,
  ) => LegacyTronContractInstance | Promise<LegacyTronContractInstance>;
};

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

  return tronWeb.contract(abi, address);
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

  return call.send(options);
}

export function isLegacyTronWalletReady(tronWeb?: LegacyTronWebLike | null) {
  return Boolean(tronWeb?.ready && tronWeb.defaultAddress?.base58);
}
