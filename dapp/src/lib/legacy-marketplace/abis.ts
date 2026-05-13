import type { Abi } from 'viem';

import bscBreedingPointsAbi from './abis/bsc/breedingPoints.abi.json';
import bscBridgeAbi from './abis/bsc/bridge.abi.json';
import bscMarketplaceAbi from './abis/bsc/marketplace.abi.json';
import bscPointsAbi from './abis/bsc/points.abi.json';
import bscStakingPointsAbi from './abis/bsc/stakingPoints.abi.json';
import bscTokenAbi from './abis/bsc/token.abi.json';

import tronBreedingPointsAbi from './abis/tron/breedingPoints.abi.json';
import tronBridgeAbi from './abis/tron/bridge.abi.json';
import tronMarketplaceAbi from './abis/tron/marketplace.abi.json';
import tronMintAbi from './abis/tron/mint.abi.json';
import tronPointsAbi from './abis/tron/points.abi.json';
import tronReferralsAbi from './abis/tron/referrals.abi.json';
import tronStakingPointsAbi from './abis/tron/stakingPoints.abi.json';
import tronTokenAbi from './abis/tron/token.abi.json';

export const legacyMarketplaceBscAbis = {
  token: bscTokenAbi as unknown as Abi,
  points: bscPointsAbi as unknown as Abi,
  stakingPoints: bscStakingPointsAbi as unknown as Abi,
  breedingPoints: bscBreedingPointsAbi as unknown as Abi,
  marketplace: bscMarketplaceAbi as unknown as Abi,
  bridge: bscBridgeAbi as unknown as Abi,
} as const;

export const legacyMarketplaceTronAbis = {
  mint: tronMintAbi,
  token: tronTokenAbi,
  referrals: tronReferralsAbi,
  points: tronPointsAbi,
  stakingPoints: tronStakingPointsAbi,
  breedingPoints: tronBreedingPointsAbi,
  marketplace: tronMarketplaceAbi,
  bridge: tronBridgeAbi,
} as const;

export const legacyMarketplaceAbis = {
  bsc: legacyMarketplaceBscAbis,
  tron: legacyMarketplaceTronAbis,
} as const;
