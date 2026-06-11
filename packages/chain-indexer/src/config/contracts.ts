import type { ChainName, ContractAlias, ContractEventConfig } from '../types.js';

const bscContracts = {
  TOKEN: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  POINTS: '0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2',
  STAKING_POINTS: '0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F',
  BREEDING_POINTS: '0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A',
  MARKETPLACE: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
  BRIDGE: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
} as const satisfies Record<Exclude<ContractAlias, 'PRESALE'>, string>;

const tronContracts = {
  TOKEN: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
  POINTS: 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA',
  STAKING_POINTS: 'TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY',
  BREEDING_POINTS: 'TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S',
  MARKETPLACE: 'TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB',
  BRIDGE: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
} as const satisfies Record<Exclude<ContractAlias, 'PRESALE'>, string>;

const eventsByContract = {
  TOKEN: ['Transfer'],
  POINTS: ['Mint', 'Burn'],
  STAKING_POINTS: ['Stake', 'Unstake'],
  BREEDING_POINTS: ['BreedStart', 'BreedFinish'],
  MARKETPLACE: [
    'TokenOnSale',
    'TokenBought',
    'MarketTokenSaleCancelled',
    'MarketTokenPriceChanged',
  ],
  BRIDGE: ['JumpInBridge', 'JumpOutBridge'],
  PRESALE: ['Purchased'],
} as const;

export function getMonitoredContractAddresses(presaleAddress?: string) {
  return {
    BSC: {
      ...bscContracts,
      ...(presaleAddress ? { PRESALE: presaleAddress } : {}),
    },
    TRON: tronContracts,
  } as const;
}

export const monitoredContractAddresses = getMonitoredContractAddresses();

export function getContractAliasByAddress(chain: ChainName, address: string) {
  const addresses = monitoredContractAddresses[chain];
  const normalizedAddress = address.toLowerCase();

  for (const [alias, contractAddress] of Object.entries(addresses)) {
    if (contractAddress.toLowerCase() === normalizedAddress) {
      return alias as ContractAlias;
    }
  }

  return null;
}

export function getContractEventConfigs(
  chains: ChainName[],
  options: { presaleAddress?: string; contractAliases?: ContractAlias[] } = {},
) {
  const configs: ContractEventConfig[] = [];
  const allowedAliases = options.contractAliases ? new Set(options.contractAliases) : null;

  for (const chain of chains) {
    const addresses: Partial<Record<ContractAlias, string>> = chain === 'BSC'
      ? {
          ...bscContracts,
          ...(options.presaleAddress ? { PRESALE: options.presaleAddress } : {}),
        }
      : tronContracts;

    for (const [contractAlias, eventNames] of Object.entries(eventsByContract)) {
      if (allowedAliases && !allowedAliases.has(contractAlias as ContractAlias)) continue;
      if (!(contractAlias in addresses)) continue;

      for (const eventName of eventNames) {
        configs.push({
          chain,
          contractAlias: contractAlias as ContractAlias,
          contractAddress: addresses[contractAlias as ContractAlias]!,
          eventName,
        });
      }
    }
  }

  return configs;
}
