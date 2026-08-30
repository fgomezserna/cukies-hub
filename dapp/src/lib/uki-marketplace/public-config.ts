import { isAddress, type Address } from 'viem';

export type UkiMarketplacePublicConfig = {
  ready: boolean;
  chainId: 56 | 97 | null;
  marketplaceAddress: Address | null;
  collectionAddresses: Address[];
  explorerBaseUrl: string | null;
  issues: string[];
};

type PublicConfigInput = {
  appEnvironment?: string;
  chainId?: string;
  marketplaceAddress?: string;
  collectionAddress?: string;
  collectionAddresses?: string;
  explorerBaseUrl?: string;
};

function configuredAddress(value: string | undefined): Address | null {
  const candidate = value?.trim();
  return candidate && isAddress(candidate, { strict: false }) && !/^0x0{40}$/i.test(candidate)
    ? candidate as Address
    : null;
}

function configuredCollections(primary: string | undefined, multiple: string | undefined) {
  const raw = [
    ...(multiple?.trim() ? multiple.split(',') : []),
    ...(primary?.trim() ? [primary] : []),
  ].map((candidate) => candidate.trim()).filter(Boolean);
  const resolved = raw.map(configuredAddress);
  return {
    invalid: resolved.some((candidate) => candidate === null),
    addresses: [...new Map(
      resolved
        .filter((candidate): candidate is Address => candidate !== null)
        .map((candidate) => [candidate.toLowerCase(), candidate]),
    ).values()],
  };
}

export function resolveUkiMarketplacePublicConfig(
  input: PublicConfigInput,
): UkiMarketplacePublicConfig {
  const issues: string[] = [];
  const parsedChainId = Number(input.chainId);
  const chainId = parsedChainId === 56 || parsedChainId === 97 ? parsedChainId : null;
  const marketplaceAddress = configuredAddress(input.marketplaceAddress);
  const collections = configuredCollections(input.collectionAddress, input.collectionAddresses);
  const appEnvironment = input.appEnvironment?.trim();

  if (appEnvironment === 'staging' && chainId !== 97) {
    issues.push('Stage requiere BSC Testnet chainId 97.');
  } else if (appEnvironment === 'production' && chainId !== 56) {
    issues.push('Production requiere BSC chainId 56.');
  } else if (appEnvironment !== 'staging' && appEnvironment !== 'production') {
    issues.push('El entorno público del marketplace UKI no está identificado.');
  }
  if (!chainId) issues.push('La chain pública del marketplace UKI no es válida.');
  if (!marketplaceAddress) issues.push('La address pública del marketplace UKI no es válida.');
  if (collections.invalid || collections.addresses.length === 0) {
    issues.push('La lista pública de colecciones UKI no es válida.');
  }

  const explorerBaseUrl = input.explorerBaseUrl?.trim().replace(/\/$/, '')
    || (chainId === 97
      ? 'https://testnet.bscscan.com'
      : chainId === 56
        ? 'https://bscscan.com'
        : null);

  return {
    ready: issues.length === 0,
    chainId,
    marketplaceAddress,
    collectionAddresses: collections.addresses,
    explorerBaseUrl,
    issues,
  };
}

export const ukiMarketplacePublicConfig = resolveUkiMarketplacePublicConfig({
  appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
  chainId: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
  marketplaceAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS,
  collectionAddress: process.env.NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS,
  collectionAddresses: process.env.NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESSES,
  explorerBaseUrl: process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL,
});
