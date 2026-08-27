import { getAddress, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const STAGING_RESOURCE_UUID = 'u4s804o4wwcckowgk0woo4wg';
const STAGING_DATABASE = 'cukieshub-new-staging';

function explicit(value) {
  return value === 'true';
}

function required(value, label) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} es obligatorio.`);
  return normalized;
}

function positiveInteger(value, fallback, label, minimum, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} debe estar entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function address(value, label) {
  const normalized = required(value, label);
  if (!isAddress(normalized) || /^0x0{40}$/i.test(normalized)) {
    throw new Error(`${label} no es una direccion EVM valida.`);
  }
  return getAddress(normalized);
}

function databaseName(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') return null;
    return decodeURIComponent(url.pathname.replace(/^\//, '')).trim() || null;
  } catch {
    return null;
  }
}

export function loadRewardBatchPublisherConfig(environment = process.env, host = 'publisher') {
  const enabled = explicit(environment.REWARD_BATCH_PUBLISHER_ENABLED);
  const schedulerId = (environment.REWARD_BATCH_PUBLISHER_ID ?? host).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(schedulerId)) {
    throw new Error('REWARD_BATCH_PUBLISHER_ID no es valido.');
  }
  const intervalMs = positiveInteger(
    environment.REWARD_BATCH_PUBLISHER_INTERVAL_MS,
    '60000',
    'REWARD_BATCH_PUBLISHER_INTERVAL_MS',
    10_000,
    3_600_000,
  );
  if (!enabled) return { enabled, schedulerId, intervalMs };

  if (environment.APP_ENV !== 'staging') throw new Error('APP_ENV debe ser staging.');
  if (environment.STAGING_ONLY_GUARD !== 'true') {
    throw new Error('STAGING_ONLY_GUARD debe ser true.');
  }
  if (environment.COOLIFY_BRANCH?.replace(/^(['"])(.*)\1$/, '$2') !== 'staging') {
    throw new Error('COOLIFY_BRANCH debe ser staging.');
  }
  if (environment.COOLIFY_RESOURCE_UUID !== STAGING_RESOURCE_UUID) {
    throw new Error(`COOLIFY_RESOURCE_UUID debe ser ${STAGING_RESOURCE_UUID}.`);
  }
  if (environment.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID !== '97') {
    throw new Error('CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID debe ser 97.');
  }
  if (environment.NEXT_PUBLIC_UKI_CHAIN_ID !== '97') {
    throw new Error('NEXT_PUBLIC_UKI_CHAIN_ID debe ser 97.');
  }
  if (environment.CHAIN_INDEXER_DB_NAME !== STAGING_DATABASE) {
    throw new Error(`CHAIN_INDEXER_DB_NAME debe ser ${STAGING_DATABASE}.`);
  }
  const mongoUrl = required(
    environment.CHAIN_INDEXER_MONGO_URL ?? environment.DATABASE_URL,
    'CHAIN_INDEXER_MONGO_URL',
  );
  if (databaseName(mongoUrl) !== STAGING_DATABASE) {
    throw new Error(`CHAIN_INDEXER_MONGO_URL debe apuntar a ${STAGING_DATABASE}.`);
  }
  const rpcUrl = required(
    environment.CHAIN_INDEXER_BSC_RPC_URL ?? environment.BSC_RPC_URL,
    'CHAIN_INDEXER_BSC_RPC_URL',
  );
  let parsedRpc;
  try {
    parsedRpc = new URL(rpcUrl);
  } catch {
    throw new Error('CHAIN_INDEXER_BSC_RPC_URL no es una URL valida.');
  }
  if (parsedRpc.protocol !== 'https:' && parsedRpc.protocol !== 'http:') {
    throw new Error('CHAIN_INDEXER_BSC_RPC_URL debe usar HTTP(S).');
  }
  const tokenAddress = address(
    environment.NEXT_PUBLIC_UKI_TOKEN_ADDRESS,
    'NEXT_PUBLIC_UKI_TOKEN_ADDRESS',
  );
  const distributorAddress = address(
    environment.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS
      ?? environment.NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS,
    'CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS',
  );
  if (tokenAddress === distributorAddress) {
    throw new Error('UKI y RewardsDistributor no pueden compartir direccion.');
  }
  const privateKey = required(
    environment.REWARD_BATCH_PUBLISHER_PRIVATE_KEY,
    'REWARD_BATCH_PUBLISHER_PRIVATE_KEY',
  );
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('REWARD_BATCH_PUBLISHER_PRIVATE_KEY no es una clave EVM valida.');
  }
  const signerAddress = privateKeyToAccount(privateKey).address;
  const expectedSignerAddress = address(
    environment.REWARD_BATCH_PUBLISHER_EXPECTED_SIGNER_ADDRESS,
    'REWARD_BATCH_PUBLISHER_EXPECTED_SIGNER_ADDRESS',
  );
  if (signerAddress !== expectedSignerAddress) {
    throw new Error('La clave del publicador no coincide con la wallet esperada.');
  }
  return {
    enabled,
    schedulerId,
    intervalMs,
    mongoUrl,
    databaseName: STAGING_DATABASE,
    rpcUrl,
    chainId: 97,
    tokenAddress,
    distributorAddress,
    privateKey,
    signerAddress,
    confirmations: positiveInteger(
      environment.REWARD_BATCH_PUBLISHER_CONFIRMATIONS,
      '12',
      'REWARD_BATCH_PUBLISHER_CONFIRMATIONS',
      1,
      100,
    ),
    claimWindowSeconds: positiveInteger(
      environment.REWARD_BATCH_CLAIM_WINDOW_SECONDS,
      String(90 * 86_400),
      'REWARD_BATCH_CLAIM_WINDOW_SECONDS',
      86_400,
      365 * 86_400,
    ),
    leaseMs: positiveInteger(
      environment.REWARD_BATCH_PUBLISHER_LEASE_MS,
      '300000',
      'REWARD_BATCH_PUBLISHER_LEASE_MS',
      30_000,
      3_600_000,
    ),
    runOnce: explicit(environment.REWARD_BATCH_PUBLISHER_RUN_ONCE),
  };
}

export function publicRewardBatchPublisherConfig(config) {
  return {
    enabled: config.enabled,
    schedulerId: config.schedulerId,
    intervalMs: config.intervalMs,
    ...(config.enabled ? {
      chainId: config.chainId,
      databaseName: config.databaseName,
      tokenAddress: config.tokenAddress,
      distributorAddress: config.distributorAddress,
      signerAddress: config.signerAddress,
      confirmations: config.confirmations,
      claimWindowSeconds: config.claimWindowSeconds,
      leaseMs: config.leaseMs,
      runOnce: config.runOnce,
    } : {}),
  };
}
