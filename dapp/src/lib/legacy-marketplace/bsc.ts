import { createPublicClient, http } from 'viem';
import { bsc as bscChain } from 'viem/chains';

import { legacyMarketplaceBscAbis } from './abis';
import {
  legacyMarketplaceContracts,
  type LegacyBscContractName,
} from './config';

export const legacyBscPublicClient = createPublicClient({
  chain: bscChain,
  transport: http(legacyMarketplaceContracts.bsc.rpcUrl),
});

export function getLegacyBscContractConfig(contractName: LegacyBscContractName) {
  return {
    address: legacyMarketplaceContracts.bsc.contracts[contractName],
    abi: legacyMarketplaceBscAbis[contractName],
  };
}

export async function readLegacyBscContract<TValue = unknown>(
  contractName: LegacyBscContractName,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const contractConfig = getLegacyBscContractConfig(contractName);

  return legacyBscPublicClient.readContract({
    ...contractConfig,
    functionName,
    args,
  }) as Promise<TValue>;
}

export async function readLegacyBscMarketplaceSnapshot() {
  const [paused, feeCancelPrice, feeChangePrice, marketFeePercentage] =
    await Promise.all([
      readLegacyBscContract<boolean>('marketplace', 'paused'),
      readLegacyBscContract<bigint>('marketplace', 'feeCancelPrice'),
      readLegacyBscContract<bigint>('marketplace', 'feeChangePrice'),
      readLegacyBscContract<bigint>('marketplace', 'marketFeePercentage'),
    ]);

  return {
    paused,
    feeCancelPrice,
    feeChangePrice,
    marketFeePercentage,
  };
}

export async function readLegacyBscTokenBasics() {
  const [name, symbol, totalSupply] = await Promise.all([
    readLegacyBscContract<string>('token', 'name'),
    readLegacyBscContract<string>('token', 'symbol'),
    readLegacyBscContract<bigint>('token', 'totalSupply'),
  ]);

  return {
    name,
    symbol,
    totalSupply,
  };
}

export function createLegacyBscWriteContractRequest(
  contractName: LegacyBscContractName,
  functionName: string,
  args: readonly unknown[] = [],
) {
  return {
    ...getLegacyBscContractConfig(contractName),
    functionName,
    args,
  };
}
