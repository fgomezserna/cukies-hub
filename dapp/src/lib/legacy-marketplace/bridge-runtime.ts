import { isAddress, type Address } from 'viem';

export type CukiesBridgeMode = 'disabled' | 'testnet';
export type CukiesBridgeEnvironment = Partial<Record<
  | 'APP_ENV'
  | 'NEXT_PUBLIC_APP_ENV'
  | 'NEXT_PUBLIC_UKI_CHAIN_ID'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_MODE'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS'
  | 'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS',
  string | undefined
>>;

export type CukiesBridgeRuntimeConfig = Readonly<{
  appEnv: 'staging' | 'production' | 'unknown';
  mode: CukiesBridgeMode;
  enabled: boolean;
  bsc: Readonly<{
    chainId: 56 | 97 | null;
    networkLabel: string;
    collectionAddress: Address | null;
    endpointAddress: Address | null;
    explorerBaseUrl: string | null;
  }>;
  tron: Readonly<{
    network: 'nile' | 'mainnet' | null;
    networkLabel: string;
    rpcUrl: string | null;
    collectionAddress: string | null;
    endpointAddress: string | null;
  }>;
  issues: readonly string[];
}>;

const BSC_MAINNET_COLLECTION = '0x0dbdebcc62f11005bf434abfad74564e896ac861';
const BSC_MAINNET_ENDPOINT = '0xb775ec58411f0460716cc7fa6fbbe2c38afd2a6e';
const BSC_TESTNET_EVENT_FIXTURE = '0x6e29448282bcc1c568ec9450bef50a01d67845c2';
const TRON_MAINNET_COLLECTION = 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe';
const TRON_MAINNET_ENDPOINT = 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ';
const TRON_ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

function value(environment: CukiesBridgeEnvironment, key: keyof CukiesBridgeEnvironment) {
  return environment[key]?.trim() || null;
}

function evmAddress(
  environment: CukiesBridgeEnvironment,
  key: keyof CukiesBridgeEnvironment,
  issues: string[],
) {
  const configured = value(environment, key);
  if (!configured) return null;
  if (!isAddress(configured) || /^0x0{40}$/i.test(configured)) {
    issues.push(`${key} no es una address EVM valida`);
    return null;
  }
  return configured as Address;
}

function tronAddress(
  environment: CukiesBridgeEnvironment,
  key: keyof CukiesBridgeEnvironment,
  issues: string[],
) {
  const configured = value(environment, key);
  if (!configured) return null;
  if (!TRON_ADDRESS_PATTERN.test(configured)) {
    issues.push(`${key} no es una address TRON base58 valida`);
    return null;
  }
  return configured;
}

function exactHttpsOrigin(configured: string | null, expectedOrigin: string) {
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== 'https:'
      || url.origin !== expectedOrigin
      || (url.pathname !== '/' && url.pathname !== '')
      || url.search
      || url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function buildCukiesBridgeRuntimeConfig(
  environment: CukiesBridgeEnvironment,
): CukiesBridgeRuntimeConfig {
  const issues: string[] = [];
  const rawAppEnv = value(environment, 'NEXT_PUBLIC_APP_ENV') ?? value(environment, 'APP_ENV');
  const appEnv = rawAppEnv === 'staging' || rawAppEnv === 'production'
    ? rawAppEnv
    : 'unknown';
  const rawMode = value(environment, 'NEXT_PUBLIC_CUKIES_BRIDGE_MODE') ?? 'disabled';
  const mode: CukiesBridgeMode = rawMode === 'testnet' ? rawMode : 'disabled';
  if (!['disabled', 'testnet'].includes(rawMode)) {
    issues.push('NEXT_PUBLIC_CUKIES_BRIDGE_MODE debe ser disabled o testnet');
  }

  const rawChainId = value(environment, 'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID')
    ?? value(environment, 'NEXT_PUBLIC_UKI_CHAIN_ID');
  const parsedChainId = rawChainId && /^\d+$/.test(rawChainId) ? Number(rawChainId) : null;
  const chainId = parsedChainId === 56 || parsedChainId === 97 ? parsedChainId : null;
  const rawTronNetwork = value(environment, 'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK');
  const tronNetwork = rawTronNetwork === 'nile' || rawTronNetwork === 'mainnet'
    ? rawTronNetwork
    : null;

  const collectionAddress = evmAddress(
    environment,
    'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS',
    issues,
  );
  const endpointAddress = evmAddress(
    environment,
    'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS',
    issues,
  );
  const tronCollectionAddress = tronAddress(
    environment,
    'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS',
    issues,
  );
  const tronEndpointAddress = tronAddress(
    environment,
    'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS',
    issues,
  );

  const expectedTestnet = mode === 'testnet';
  const expectedTronOrigin = expectedTestnet ? 'https://nile.trongrid.io' : null;
  const configuredTronRpc = value(environment, 'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL');
  const tronRpcUrl = expectedTronOrigin
    ? exactHttpsOrigin(configuredTronRpc, expectedTronOrigin)
    : null;

  if (mode !== 'disabled') {
    const expectedAppEnv = 'staging';
    const expectedChainId = 97;
    const expectedTronNetwork = 'nile';

    if (appEnv !== expectedAppEnv) {
      issues.push(`${mode} requiere APP_ENV=${expectedAppEnv}`);
    }
    if (chainId !== expectedChainId) {
      issues.push(`${mode} requiere BSC chain ${expectedChainId}`);
    }
    if (tronNetwork !== expectedTronNetwork) {
      issues.push(`${mode} requiere TRON ${expectedTronNetwork}`);
    }
    if (!tronRpcUrl) {
      issues.push(
        `NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL debe ser ${expectedTronOrigin}`,
      );
    }
    if (!collectionAddress) {
      issues.push('Falta NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS');
    }
    if (!endpointAddress) {
      issues.push('Falta NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS');
    }
    if (!tronCollectionAddress) {
      issues.push('Falta NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS');
    }
    if (!tronEndpointAddress) {
      issues.push('Falta NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS');
    }
  }

  if (
    collectionAddress
    && endpointAddress
    && collectionAddress.toLowerCase() === endpointAddress.toLowerCase()
  ) {
    issues.push('La coleccion y el endpoint BSC deben usar contratos distintos');
  }
  if (tronCollectionAddress && tronEndpointAddress && tronCollectionAddress === tronEndpointAddress) {
    issues.push('La coleccion y el endpoint TRON deben usar contratos distintos');
  }

  if (expectedTestnet) {
    const normalizedBscCollection = collectionAddress?.toLowerCase();
    const normalizedBscEndpoint = endpointAddress?.toLowerCase();
    if (normalizedBscCollection === BSC_MAINNET_COLLECTION) {
      issues.push('Stage no puede usar la coleccion Cukies de BSC mainnet');
    }
    if (normalizedBscEndpoint === BSC_MAINNET_ENDPOINT) {
      issues.push('Stage no puede usar el bridge Cukies de BSC mainnet');
    }
    if (normalizedBscEndpoint === BSC_TESTNET_EVENT_FIXTURE) {
      issues.push('La fixture de eventos BSC Testnet no custodia NFTs y no es un endpoint bridge');
    }
    if (tronCollectionAddress === TRON_MAINNET_COLLECTION) {
      issues.push('Stage no puede usar la coleccion Cukies de TRON mainnet');
    }
    if (tronEndpointAddress === TRON_MAINNET_ENDPOINT) {
      issues.push('Stage no puede usar el bridge Cukies de TRON mainnet');
    }
  }

  const enabled = mode !== 'disabled' && issues.length === 0;

  return Object.freeze({
    appEnv,
    mode,
    enabled,
    bsc: Object.freeze({
      chainId,
      networkLabel: chainId === 97
        ? 'BSC Testnet'
        : chainId === 56
          ? 'BNB Smart Chain'
          : 'BSC sin configurar',
      collectionAddress,
      endpointAddress,
      explorerBaseUrl: chainId === 97
        ? 'https://testnet.bscscan.com'
        : chainId === 56
          ? 'https://bscscan.com'
          : null,
    }),
    tron: Object.freeze({
      network: tronNetwork,
      networkLabel: tronNetwork === 'nile'
        ? 'TRON Nile Testnet'
        : tronNetwork === 'mainnet'
          ? 'TRON Mainnet'
          : 'TRON sin configurar',
      rpcUrl: tronRpcUrl,
      collectionAddress: tronCollectionAddress,
      endpointAddress: tronEndpointAddress,
    }),
    issues: Object.freeze(issues),
  });
}

export const cukiesBridgeRuntimeConfig = buildCukiesBridgeRuntimeConfig({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_UKI_CHAIN_ID: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
  NEXT_PUBLIC_CUKIES_BRIDGE_MODE: process.env.NEXT_PUBLIC_CUKIES_BRIDGE_MODE,
  NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID,
  NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS,
  NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS,
  NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK,
  NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL,
  NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS,
  NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS:
    process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS,
});
