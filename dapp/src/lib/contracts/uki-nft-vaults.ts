import { isAddress, type Abi, type Address } from 'viem';

import cukieMasterNftVaultAbiJson from './abis/CukieMasterNftVault.json';
import cukiePoolNftVaultAbiJson from './abis/CukiePoolNftVault.json';

export type UkiNftVaultChainId = 56 | 97;
export type UkiNftVaultMode = 'legacy' | 'custodial' | 'invalid';

export type UkiNftVaultPublicConfig = {
  chainId: UkiNftVaultChainId | null;
  cukieMasterNftVaultAddress: Address | null;
  cukiePoolNftVaultAddress: Address | null;
  collectionAddresses: Address[];
  collectionConfigInvalid: boolean;
  recoveryCollectionAddresses: Address[];
  recoveryCollectionConfigInvalid: boolean;
  explorerBaseUrl: string | null;
  ready: {
    cukieMaster: boolean;
    cukiePool: boolean;
  };
  mode: {
    cukieMaster: UkiNftVaultMode;
    cukiePool: UkiNftVaultMode;
  };
};

export const cukieMasterNftVaultAbi = cukieMasterNftVaultAbiJson as Abi;
export const cukiePoolNftVaultAbi = cukiePoolNftVaultAbiJson as Abi;

function configuredAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed) && !/^0x0{40}$/i.test(trimmed)
    ? trimmed as Address
    : null;
}

function configuredChainId(value: string | undefined): UkiNftVaultChainId | null {
  const parsed = Number(value);
  return parsed === 56 || parsed === 97 ? parsed : null;
}

function configuredCollections(primary: string | undefined, multiple: string | undefined) {
  const primaryValue = primary?.trim();
  const multipleValue = multiple?.trim();
  const rawCandidates = [
    ...(multipleValue ? multipleValue.split(',') : []),
    ...(primaryValue ? [primaryValue] : []),
  ];
  const resolved = rawCandidates.map((item) => configuredAddress(item));
  const invalid = resolved.some((item) => item === null);
  const addresses = resolved.filter((item): item is Address => Boolean(item));
  return {
    addresses: [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()],
    invalid,
  };
}

export function parseUkiNftVaultPublicConfig(input: {
  chainId?: string;
  cukieMasterNftVaultAddress?: string;
  cukiePoolNftVaultAddress?: string;
  collectionAddress?: string;
  collectionAddresses?: string;
  recoveryCollectionAddresses?: string;
  explorerBaseUrl?: string;
}): UkiNftVaultPublicConfig {
  const chainId = configuredChainId(input.chainId);
  const cukieMasterNftVaultAddress = configuredAddress(input.cukieMasterNftVaultAddress);
  const cukiePoolNftVaultAddress = configuredAddress(input.cukiePoolNftVaultAddress);
  const collections = configuredCollections(
    input.collectionAddress,
    input.collectionAddresses,
  );
  const collectionAddresses = collections.addresses;
  const recoveryCollections = configuredCollections(
    undefined,
    input.recoveryCollectionAddresses,
  );
  const recoveryCollectionAddresses = [
    ...new Map(
      [...collectionAddresses, ...recoveryCollections.addresses]
        .map((address) => [address.toLowerCase(), address]),
    ).values(),
  ];
  const explorerBaseUrl = input.explorerBaseUrl?.trim().replace(/\/$/, '')
    || (chainId === 97
      ? 'https://testnet.bscscan.com'
      : chainId === 56
        ? 'https://bscscan.com'
        : null);
  const hasNetworkAndCollection = chainId !== null
    && collectionAddresses.length > 0
    && !collections.invalid;
  const cukieMasterAddressWasProvided = Boolean(input.cukieMasterNftVaultAddress?.trim());
  const cukiePoolAddressWasProvided = Boolean(input.cukiePoolNftVaultAddress?.trim());
  const cukieMasterReady = Boolean(hasNetworkAndCollection && cukieMasterNftVaultAddress);
  const cukiePoolReady = Boolean(hasNetworkAndCollection && cukiePoolNftVaultAddress);

  return {
    chainId,
    cukieMasterNftVaultAddress,
    cukiePoolNftVaultAddress,
    collectionAddresses,
    collectionConfigInvalid: collections.invalid,
    recoveryCollectionAddresses,
    recoveryCollectionConfigInvalid: recoveryCollections.invalid,
    explorerBaseUrl,
    ready: {
      cukieMaster: cukieMasterReady,
      cukiePool: cukiePoolReady,
    },
    mode: {
      cukieMaster: !cukieMasterAddressWasProvided
        ? 'legacy'
        : cukieMasterReady
          ? 'custodial'
          : 'invalid',
      cukiePool: !cukiePoolAddressWasProvided
        ? 'legacy'
        : cukiePoolReady
          ? 'custodial'
          : 'invalid',
    },
  };
}

export const ukiNftVaults = parseUkiNftVaultPublicConfig({
  chainId: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
  cukieMasterNftVaultAddress: process.env.NEXT_PUBLIC_CUKIE_MASTER_NFT_VAULT_ADDRESS,
  cukiePoolNftVaultAddress: process.env.NEXT_PUBLIC_CUKIE_POOL_NFT_VAULT_ADDRESS,
  collectionAddress: process.env.NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS,
  collectionAddresses: process.env.NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESSES,
  recoveryCollectionAddresses: process.env.NEXT_PUBLIC_CUKIES_NFT_RECOVERY_COLLECTION_ADDRESSES,
  explorerBaseUrl: process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL,
});

export function getNftVaultExplorerTxUrl(hash: string) {
  return ukiNftVaults.explorerBaseUrl ? `${ukiNftVaults.explorerBaseUrl}/tx/${hash}` : null;
}
