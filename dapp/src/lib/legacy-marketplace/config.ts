import type { Address } from 'viem';

export const legacyMarketplaceSource = {
  url: 'https://marketplace.cukies.world/',
  extractedAt: '2026-05-12',
  securityIssueUrl: 'https://github.com/fgomezserna/cukies-hub/issues/160',
} as const;

export const legacyMarketplaceEndpoints = {
  graphQl: 'https://api.cukies.world/data-graphql/graphql',
  authRestBase: 'https://api.cukies.world/auth',
  nftImageBase:
    'https://cukies.s3.eu-west-3.amazonaws.com/png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
} as const;

export const legacyMarketplaceContracts = {
  bsc: {
    chainId: 56,
    chainName: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockExplorerBaseUrl: 'https://bscscan.com',
    contracts: {
      token: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
      points: '0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2',
      stakingPoints: '0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F',
      breedingPoints: '0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A',
      marketplace: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
      bridge: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
    } satisfies Record<string, Address>,
  },
  tron: {
    chainName: 'TRON mainnet',
    rpcUrl: 'https://api.trongrid.io',
    contracts: {
      mint: 'TUrjiyFSa1pq8TGZJnsTAHcgyxnnRmZjN7',
      token: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
      referrals: 'TZ4QM9RF1pxfoxnPY8UGAQEEwq5SDoZXk4',
      points: 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA',
      stakingPoints: 'TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY',
      breedingPoints: 'TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S',
      marketplace: 'TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB',
      bridge: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
    },
  },
} as const;

export type LegacyMarketplaceNetwork = keyof typeof legacyMarketplaceContracts;
export type LegacyBscContractName =
  keyof typeof legacyMarketplaceContracts.bsc.contracts;
export type LegacyTronContractName =
  keyof typeof legacyMarketplaceContracts.tron.contracts;

export const legacyMarketplaceRoutes = [
  { path: '/home', label: 'Home', status: 'active' },
  { path: '/ecommerce/marketplace', label: 'NFT marketplace', status: 'active' },
  {
    path: '/ecommerce/product-page/:cukiID',
    label: 'NFT detail',
    status: 'active',
  },
  { path: '/ecommerce/gems', label: 'Gems marketplace', status: 'coming-soon' },
  { path: '/ecommerce/lands', label: 'Lands marketplace', status: 'coming-soon' },
  {
    path: '/ecommerce/resources',
    label: 'Resources marketplace',
    status: 'coming-soon',
  },
  { path: '/farming/cukies', label: 'Cukies farming', status: 'active' },
  { path: '/farming/gems', label: 'Gems farming', status: 'coming-soon' },
  { path: '/farming/lands', label: 'Lands farming', status: 'coming-soon' },
  { path: '/breeding/breed', label: 'Start breeding', status: 'active' },
  {
    path: '/breeding/active-breeds',
    label: 'Active breeds',
    status: 'active',
  },
  {
    path: '/breeding/completed-breeds',
    label: 'Completed breeds',
    status: 'active',
  },
  { path: '/bridges/cukies', label: 'Cukies bridge', status: 'active' },
  { path: '/bridges/gems', label: 'Gems bridge', status: 'coming-soon' },
  {
    path: '/bridges/resources',
    label: 'Resources bridge',
    status: 'coming-soon',
  },
  { path: '/users/profile', label: 'Profile', status: 'active' },
  { path: '/users/cukies', label: 'Owned Cukies', status: 'active' },
  { path: '/users/rewards', label: 'Rewards', status: 'coming-soon' },
  { path: '/users/points', label: 'Points', status: 'active' },
  { path: '/user/uki', label: 'UKI', status: 'coming-soon' },
  { path: '/user/gemd', label: 'GEMD', status: 'coming-soon' },
] as const;

export const legacyMarketplaceOperations = {
  marketplace: [
    'buyToken(tokenId)',
    'putTokenOnSale(tokenId, price)',
    'cancelTokenSale(tokenId)',
    'changeMarketTokenPrice(tokenId, price)',
    'feeCancelPrice()',
    'marketFeePercentage()',
  ],
  token: [
    'ownerOf(tokenId)',
    'tokenURI(tokenId)',
    'getCukie(tokenId)',
    'getType(tokenId)',
    'isApprovedForAll(owner, operator)',
    'setApprovalForAll(operator, approved)',
    'transferFrom(from, to, tokenId)',
  ],
  farming: [
    'stake(tokenId)',
    'unstake(tokenId)',
    'getTokensOwner(owner)',
    'calcPoints(tokenId)',
    'pointsToType(typeId)',
  ],
  breeding: [
    'start(parent1, parent2)',
    'breed(breedId)',
    'getAllBreedsOwner(owner)',
    'getActiveBreedsOwner(owner)',
    'getCostPoints(parent1, parent2)',
    'getMaxBreedsByCukie()',
  ],
  bridge: [
    'jumpInBridge(tokenId, owner, destinationNetwork)',
    'jumpOutBridge(...)',
    'bridgePrice()',
  ],
} as const;

export function getLegacyMarketplaceNftImageUrl(tokenId: string | number) {
  return `${legacyMarketplaceEndpoints.nftImageBase}/${tokenId}.png`;
}

export function getLegacyBscExplorerAddressUrl(address: Address) {
  return `${legacyMarketplaceContracts.bsc.blockExplorerBaseUrl}/address/${address}`;
}
