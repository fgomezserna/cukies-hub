import { isAddress } from 'viem';

import type { UkiMarketplaceRuntime } from './types';

type Environment = Record<string, string | undefined>;

function value(environment: Environment, key: string) {
  const candidate = environment[key]?.trim();
  return candidate ? candidate : null;
}

function parseChainId(environment: Environment) {
  const values = [
    value(environment, 'NEXT_PUBLIC_UKI_CHAIN_ID'),
    value(environment, 'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID'),
  ].filter((candidate): candidate is string => candidate !== null);
  if (values.length === 0 || values.some((candidate) => candidate !== values[0])) return null;
  const parsed = Number(values[0]);
  return parsed === 56 || parsed === 97 ? parsed : null;
}

function parseAddress(environment: Environment) {
  const values = [
    value(environment, 'NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS'),
    value(environment, 'CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS'),
  ];
  if (values.some((candidate) => candidate === null)) return null;
  const configured = values as string[];
  const normalized = configured.map((candidate) => candidate.toLowerCase());
  if (normalized.some((candidate) => candidate !== normalized[0])) return null;
  const address = configured[0];
  if (!isAddress(address, { strict: false }) || /^0x0{40}$/i.test(address)) return null;
  return address.toLowerCase() as `0x${string}`;
}

function parseRpcUrl(environment: Environment, chainId: 56 | 97 | null) {
  const explicit = value(environment, 'CHAIN_INDEXER_BSC_RPC_URLS')
    ?.split(',')
    .map((candidate) => candidate.trim())
    .find(Boolean)
    ?? value(environment, 'CHAIN_INDEXER_BSC_RPC_URL');
  const candidate = explicit ?? (chainId === 56 ? value(environment, 'BSC_RPC_URL') : null);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function resolveUkiMarketplaceRuntime(
  environment: Environment = process.env,
): UkiMarketplaceRuntime {
  const issues: string[] = [];
  const appEnvironment = value(environment, 'APP_ENV');
  const publicEnvironment = value(environment, 'NEXT_PUBLIC_APP_ENV');
  const chainId = parseChainId(environment);
  const marketplaceAddress = parseAddress(environment);
  const rpcUrl = parseRpcUrl(environment, chainId);

  if (!appEnvironment || appEnvironment !== publicEnvironment) {
    issues.push('APP_ENV y NEXT_PUBLIC_APP_ENV deben coincidir.');
  } else if (appEnvironment === 'staging' && chainId !== 97) {
    issues.push('Stage requiere BSC Testnet chainId 97.');
  } else if (appEnvironment === 'production' && chainId !== 56) {
    issues.push('Production requiere BSC chainId 56.');
  } else if (appEnvironment !== 'staging' && appEnvironment !== 'production') {
    issues.push('El marketplace UKI solo se habilita en un entorno identificado.');
  }
  if (!chainId) issues.push('La chain del marketplace UKI no es coherente.');
  if (!marketplaceAddress) issues.push('La address del marketplace UKI no es coherente.');
  if (!rpcUrl) issues.push('Falta un RPC BSC explicito para validar órdenes en vivo.');

  return {
    ready: issues.length === 0,
    chainId,
    marketplaceAddress,
    rpcUrl,
    issues,
  };
}

export const ukiMarketplaceRuntime = resolveUkiMarketplaceRuntime();
