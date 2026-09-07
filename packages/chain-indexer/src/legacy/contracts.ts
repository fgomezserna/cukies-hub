import type { ChainName, ContractAlias } from '../types.js';

export const LEGACY_CONTRACT_ALIASES = Object.freeze([
  'TOKEN',
  'MINT',
  'REFERRALS',
  'POINTS',
  'STAKING_POINTS',
  'BREEDING_POINTS',
  'MARKETPLACE',
  'BRIDGE',
] as const satisfies readonly ContractAlias[]);

export type LegacyContractAlias = (typeof LEGACY_CONTRACT_ALIASES)[number];

/** Aliases with deployed BSC mainnet contracts in the legacy perimeter. */
export const LEGACY_BSC_CONTRACT_ALIASES = Object.freeze([
  'TOKEN',
  'POINTS',
  'STAKING_POINTS',
  'BREEDING_POINTS',
  'MARKETPLACE',
  'BRIDGE',
] as const satisfies readonly LegacyContractAlias[]);

/** All eight deployed TRON mainnet contracts in the legacy perimeter. */
export const LEGACY_TRON_CONTRACT_ALIASES = Object.freeze([
  'MINT',
  'TOKEN',
  'REFERRALS',
  'POINTS',
  'STAKING_POINTS',
  'BREEDING_POINTS',
  'MARKETPLACE',
  'BRIDGE',
] as const satisfies readonly LegacyContractAlias[]);

export const LEGACY_CONTRACTS: Readonly<Record<ChainName, Readonly<Record<LegacyContractAlias, string>>>> = Object.freeze({
  BSC: Object.freeze({
    TOKEN: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    MINT: '',
    REFERRALS: '',
    POINTS: '0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2',
    STAKING_POINTS: '0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F',
    BREEDING_POINTS: '0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A',
    MARKETPLACE: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
    BRIDGE: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
  }),
  TRON: Object.freeze({
    TOKEN: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
    MINT: 'TUrjiyFSa1pq8TGZJnsTAHcgyxnnRmZjN7',
    REFERRALS: 'TZ4QM9RF1pxfoxnPY8UGAQEEwq5SDoZXk4',
    POINTS: 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA',
    STAKING_POINTS: 'TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY',
    BREEDING_POINTS: 'TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S',
    MARKETPLACE: 'TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB',
    BRIDGE: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
  }),
});

export type LegacyContractProof = {
  chain: ChainName;
  alias: LegacyContractAlias;
  address: string;
  runtimeHash: string;
  checkedAtBlock?: number;
  evidence: 'docs/legacy-marketplace/evidence/2026-09-07-contracts.json';
};

const bscRuntimeHashes: Record<LegacyContractAlias, string> = {
  TOKEN: '0x078fce406c0ca0dacda5bb0a64f131ecd79585458696b4be1e14676049213663',
  MINT: '',
  REFERRALS: '',
  POINTS: '0xf7fc590ae1241936be68eb088e3fb00d743958fc32d2792079434fa6e235aaae',
  STAKING_POINTS: '0xabba51642a3eb3bf11fea2d4c182070f6aea7a744d354b7646417e145c53da06',
  BREEDING_POINTS: '0xf1ba7ea8248d21ccf78514eaabdafcac2ce99d4da207afcb18651cdb20bac4d8',
  MARKETPLACE: '0x91cd01cc755910034d20756b87e8ee9c808232695ac9d30cb149dd7eb0db05b6',
  BRIDGE: '0xf2e2b86b841c558a3ce7145d0dbb5b1802109646c1db6a36a3e95b07f8e4ef25',
};

const tronCodeHashes: Record<LegacyContractAlias, string> = {
  TOKEN: '26247c8fd0642bd4fdd62ab6f2c304719118f2c440148498d6e937e683354875',
  MINT: '0c9bd88f3b0db1e3cd1099aaea1f5ba4cd6c4e14af2f87ae429547a15d2db2f6',
  REFERRALS: '84a6b7f88653939dac15dd7a7271ed501d9ef3d90d2efbd8f1adcae20006b36f',
  POINTS: '6519fa699d8d307a4e782e96ca72d4dcd03366c28943272cb2f5c875ed507058',
  STAKING_POINTS: 'b2f188e8db9ed0f537c8f2ea7fd0769e428e6a87484078638be2b09bd1ecb3c1',
  BREEDING_POINTS: 'ffa0f2cf52d8419817b8cf493c7abe370fb245b22a6219aee18e2d0c7714e826',
  MARKETPLACE: 'f6b0a972f6aad1db7268f12e2b0bd8ae25ebff255f28413271f30b0cd2dd0341',
  BRIDGE: 'afeccd1602e6c6d83ec82f50db1f426548a79ae6d0b018762cee39c2862c64cc',
};

export function legacyContractProof(chain: ChainName, alias: LegacyContractAlias): LegacyContractProof {
  const address = LEGACY_CONTRACTS[chain][alias];
  if (!address) throw new Error(`${alias} no existe en la red legacy ${chain}.`);
  return {
    chain,
    alias,
    address,
    runtimeHash: chain === 'BSC' ? bscRuntimeHashes[alias] : tronCodeHashes[alias],
    ...(chain === 'BSC' ? { checkedAtBlock: 120535004 } : {}),
    evidence: 'docs/legacy-marketplace/evidence/2026-09-07-contracts.json',
  };
}

export function legacyContractAddress(chain: ChainName, alias: ContractAlias) {
  if (!LEGACY_CONTRACT_ALIASES.includes(alias as LegacyContractAlias)) return null;
  return LEGACY_CONTRACTS[chain][alias as LegacyContractAlias] || null;
}
