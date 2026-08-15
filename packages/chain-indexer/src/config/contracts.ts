import { isAddress } from 'viem';

import type { ChainName, ContractAlias, ContractEventConfig } from '../types.js';

const bscContracts = {
  TOKEN: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  POINTS: '0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2',
  STAKING_POINTS: '0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F',
  BREEDING_POINTS: '0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A',
  MARKETPLACE: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
  BRIDGE: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
} as const satisfies Record<Exclude<
  ContractAlias,
  | 'TOKEN_V2'
  | 'PRESALE'
  | 'UKI_STAKING'
  | 'VESTING_VAULT'
  | 'REWARDS_DISTRIBUTOR'
  | 'CUKIE_MASTER_NFT_VAULT'
  | 'CUKIE_POOL_NFT_VAULT'
>, string>;

const tronContracts = {
  TOKEN: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
  POINTS: 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA',
  STAKING_POINTS: 'TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY',
  BREEDING_POINTS: 'TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S',
  MARKETPLACE: 'TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB',
  BRIDGE: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
} as const satisfies Record<Exclude<
  ContractAlias,
  | 'TOKEN_V2'
  | 'PRESALE'
  | 'UKI_STAKING'
  | 'VESTING_VAULT'
  | 'REWARDS_DISTRIBUTOR'
  | 'CUKIE_MASTER_NFT_VAULT'
  | 'CUKIE_POOL_NFT_VAULT'
>, string>;

const eventsByContract = {
  TOKEN: ['Transfer', 'CukieMetadataConfigured'],
  TOKEN_V2: ['Transfer', 'CukieMetadataConfigured'],
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
  UKI_STAKING: ['Staked', 'Unstaked'],
  VESTING_VAULT: ['VestingCreated', 'TokensReleased'],
  REWARDS_DISTRIBUTOR: ['BatchPublished', 'RewardClaimed', 'BatchClosed'],
  CUKIE_MASTER_NFT_VAULT: [
    'CukieMasterCollectionAllowedUpdated',
    'CukieMasterDeposited',
    'CukieMasterWithdrawn',
    'CukieMasterUntrackedERC721Recovered',
  ],
  CUKIE_POOL_NFT_VAULT: [
    'CukiePoolCollectionAllowedUpdated',
    'CukiePoolCalendarVersionScheduled',
    'CukiePoolDeposited',
    'CukiePoolExitRequested',
    'CukiePoolWithdrawableAtAdvanced',
    'CukiePoolWithdrawn',
    'CukiePoolUntrackedERC721Recovered',
  ],
} as const;

type BscContractAddressOptions = {
  tokenAddress?: string;
  tokenV2Address?: string;
  marketplaceAddress?: string;
  bridgeAddress?: string;
  presaleAddress?: string;
  ukiStakingAddress?: string;
  vestingVaultAddress?: string;
  rewardsDistributorAddress?: string;
  cukieMasterNftVaultAddress?: string;
  cukiePoolNftVaultAddress?: string;
};

export function getMonitoredContractAddresses(options: BscContractAddressOptions = {}) {
  return {
    BSC: {
      ...bscContracts,
      ...(options.tokenAddress ? { TOKEN: options.tokenAddress } : {}),
      ...(options.tokenV2Address ? { TOKEN_V2: options.tokenV2Address } : {}),
      ...(options.marketplaceAddress ? { MARKETPLACE: options.marketplaceAddress } : {}),
      ...(options.bridgeAddress ? { BRIDGE: options.bridgeAddress } : {}),
      ...(options.presaleAddress ? { PRESALE: options.presaleAddress } : {}),
      ...(options.ukiStakingAddress ? { UKI_STAKING: options.ukiStakingAddress } : {}),
      ...(options.vestingVaultAddress ? { VESTING_VAULT: options.vestingVaultAddress } : {}),
      ...(options.rewardsDistributorAddress
        ? { REWARDS_DISTRIBUTOR: options.rewardsDistributorAddress }
        : {}),
      ...(options.cukieMasterNftVaultAddress
        ? { CUKIE_MASTER_NFT_VAULT: options.cukieMasterNftVaultAddress }
        : {}),
      ...(options.cukiePoolNftVaultAddress
        ? { CUKIE_POOL_NFT_VAULT: options.cukiePoolNftVaultAddress }
        : {}),
    },
    TRON: tronContracts,
  } as const;
}

export const monitoredContractAddresses = getMonitoredContractAddresses();

export function getContractAliasByAddress(
  chain: ChainName,
  address: string,
  options: BscContractAddressOptions = {},
) {
  const addresses = getMonitoredContractAddresses(options)[chain];
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
  options: {
    tokenAddress?: string;
    tokenV2Address?: string;
    marketplaceAddress?: string;
    bridgeAddress?: string;
    presaleAddress?: string;
    ukiStakingAddress?: string;
    vestingVaultAddress?: string;
    rewardsDistributorAddress?: string;
    cukieMasterNftVaultAddress?: string;
    cukiePoolNftVaultAddress?: string;
    contractAliases?: ContractAlias[];
  } = {},
) {
  const configs: ContractEventConfig[] = [];
  const allowedAliases = options.contractAliases ? new Set(options.contractAliases) : null;
  const tokenAddress = options.tokenAddress?.trim();
  const tokenV2Address = options.tokenV2Address?.trim();
  const marketplaceAddress = options.marketplaceAddress?.trim();
  const bridgeAddress = options.bridgeAddress?.trim();
  const ukiStakingAddress = options.ukiStakingAddress?.trim();
  const vestingVaultAddress = options.vestingVaultAddress?.trim();
  const rewardsDistributorAddress = options.rewardsDistributorAddress?.trim();
  const cukieMasterNftVaultAddress = options.cukieMasterNftVaultAddress?.trim();
  const cukiePoolNftVaultAddress = options.cukiePoolNftVaultAddress?.trim();

  for (const [alias, address] of [
    ['TOKEN', tokenAddress],
    ['TOKEN_V2', tokenV2Address],
    ['MARKETPLACE', marketplaceAddress],
    ['BRIDGE', bridgeAddress],
    ['UKI_STAKING', ukiStakingAddress],
    ['VESTING_VAULT', vestingVaultAddress],
    ['REWARDS_DISTRIBUTOR', rewardsDistributorAddress],
    ['CUKIE_MASTER_NFT_VAULT', cukieMasterNftVaultAddress],
    ['CUKIE_POOL_NFT_VAULT', cukiePoolNftVaultAddress],
  ] as const) {
    if (address && (!isAddress(address) || /^0x0{40}$/i.test(address))) {
      throw new Error(`${alias} no tiene una address BSC valida.`);
    }
    if (allowedAliases?.has(alias) && !address) {
      throw new Error(`${alias} fue solicitado sin una address BSC configurada.`);
    }
  }

  const nftCustodyAddresses = [
    ['TOKEN', tokenAddress],
    ['TOKEN_V2', tokenV2Address],
    ['CUKIE_MASTER_NFT_VAULT', cukieMasterNftVaultAddress],
    ['CUKIE_POOL_NFT_VAULT', cukiePoolNftVaultAddress],
  ] as const;
  for (let index = 0; index < nftCustodyAddresses.length; index += 1) {
    const [leftAlias, leftAddress] = nftCustodyAddresses[index];
    if (!leftAddress) continue;
    for (let candidate = index + 1; candidate < nftCustodyAddresses.length; candidate += 1) {
      const [rightAlias, rightAddress] = nftCustodyAddresses[candidate];
      if (rightAddress && leftAddress.toLowerCase() === rightAddress.toLowerCase()) {
        throw new Error(`${leftAlias} y ${rightAlias} deben usar addresses BSC distintas.`);
      }
    }
  }

  if (
    allowedAliases
    && [...allowedAliases].some((alias) => (
      alias === 'TOKEN'
      || alias === 'TOKEN_V2'
      || alias === 'MARKETPLACE'
      || alias === 'BRIDGE'
      || alias === 'UKI_STAKING'
      || alias === 'VESTING_VAULT'
      || alias === 'REWARDS_DISTRIBUTOR'
      || alias === 'CUKIE_MASTER_NFT_VAULT'
      || alias === 'CUKIE_POOL_NFT_VAULT'
    ))
    && !chains.includes('BSC')
  ) {
    throw new Error(
      'Los contratos BSC configurables solo se indexan con BSC habilitada.',
    );
  }

  for (const chain of chains) {
    const addresses: Partial<Record<ContractAlias, string>> = chain === 'BSC'
      ? {
          ...bscContracts,
          ...((!allowedAliases || allowedAliases.has('TOKEN')) && tokenAddress
            ? { TOKEN: tokenAddress }
            : {}),
          ...((!allowedAliases || allowedAliases.has('TOKEN_V2')) && tokenV2Address
            ? { TOKEN_V2: tokenV2Address }
            : {}),
          ...((!allowedAliases || allowedAliases.has('MARKETPLACE')) && marketplaceAddress
            ? { MARKETPLACE: marketplaceAddress }
            : {}),
          ...((!allowedAliases || allowedAliases.has('BRIDGE')) && bridgeAddress
            ? { BRIDGE: bridgeAddress }
            : {}),
          ...(options.presaleAddress ? { PRESALE: options.presaleAddress } : {}),
          ...(allowedAliases?.has('UKI_STAKING') && ukiStakingAddress
            ? { UKI_STAKING: ukiStakingAddress }
            : {}),
          ...(allowedAliases?.has('VESTING_VAULT') && vestingVaultAddress
            ? { VESTING_VAULT: vestingVaultAddress }
            : {}),
          ...(allowedAliases?.has('REWARDS_DISTRIBUTOR') && rewardsDistributorAddress
            ? { REWARDS_DISTRIBUTOR: rewardsDistributorAddress }
            : {}),
          ...(allowedAliases?.has('CUKIE_MASTER_NFT_VAULT') && cukieMasterNftVaultAddress
            ? { CUKIE_MASTER_NFT_VAULT: cukieMasterNftVaultAddress }
            : {}),
          ...(allowedAliases?.has('CUKIE_POOL_NFT_VAULT') && cukiePoolNftVaultAddress
            ? { CUKIE_POOL_NFT_VAULT: cukiePoolNftVaultAddress }
            : {}),
        }
      : tronContracts;

    for (const [contractAlias, eventNames] of Object.entries(eventsByContract)) {
      if (allowedAliases && !allowedAliases.has(contractAlias as ContractAlias)) continue;
      if (!(contractAlias in addresses)) continue;

      for (const eventName of eventNames) {
        if (chain === 'TRON' && eventName === 'CukieMetadataConfigured') continue;
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
