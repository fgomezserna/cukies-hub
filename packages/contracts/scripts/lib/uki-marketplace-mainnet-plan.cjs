const { ZeroAddress, getAddress } = require('ethers');

const BSC_MAINNET_CHAIN_ID = 56;
const MAINNET_UKI_TOKEN = '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA';
const MAINNET_ASM_TOKEN = '0x707F0f4a39a4a26239F7D00463B15AB5656861f9';
const MAINNET_USDT_TOKEN = '0x55d398326f99059fF775485246999027B3197955';
const MAINNET_USDC_TOKEN = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const PANCAKE_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const MAINNET_WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const MAINNET_CUKIES_COLLECTION = '0x0dbDeBCC62f11005BF434ABFad74564E896aC861';
const MAX_FEE_BPS = 1_000;

const DEFAULT_PATHS = Object.freeze({
  bnb: [MAINNET_WBNB, MAINNET_USDT_TOKEN, MAINNET_ASM_TOKEN, MAINNET_UKI_TOKEN],
  asm: [MAINNET_ASM_TOKEN, MAINNET_UKI_TOKEN],
  usdt: [MAINNET_USDT_TOKEN, MAINNET_ASM_TOKEN, MAINNET_UKI_TOKEN],
  usdc: [MAINNET_USDC_TOKEN, MAINNET_USDT_TOKEN, MAINNET_ASM_TOKEN, MAINNET_UKI_TOKEN],
});

function envValue(environment, name) {
  const value = environment[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function normalizeAddress(value, label) {
  try {
    const normalized = getAddress(value);
    if (normalized === ZeroAddress) throw new Error('zero address');
    return normalized;
  } catch (_error) {
    throw new Error(`${label} debe ser una address EVM no nula. Recibido: ${value}`);
  }
}

function requireAddress(environment, name) {
  const value = envValue(environment, name);
  if (!value) throw new Error(`${name} es obligatorio para marketplace V2 en producción.`);
  return normalizeAddress(value, name);
}

function optionalAddress(environment, name, fallback) {
  const value = envValue(environment, name);
  return normalizeAddress(value ?? fallback, name);
}

function requireFeeBps(environment) {
  const raw = envValue(environment, 'UKI_MARKETPLACE_FEE_BPS');
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(`UKI_MARKETPLACE_FEE_BPS debe ser un entero de 0 a ${MAX_FEE_BPS}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FEE_BPS) {
    throw new Error(`UKI_MARKETPLACE_FEE_BPS debe ser un entero de 0 a ${MAX_FEE_BPS}.`);
  }
  return value;
}

function parsePath(environment, envName, fallback, expectedInput) {
  const raw = envValue(environment, envName);
  const values = raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : fallback;
  if (values.length < 2 || values.length > 5) {
    throw new Error(`${envName} debe tener entre 2 y 5 addresses.`);
  }
  const path = values.map((value, index) => normalizeAddress(value, `${envName}[${index}]`));
  if (path[0].toLowerCase() !== expectedInput.toLowerCase()) {
    throw new Error(`${envName} debe comenzar en ${expectedInput}.`);
  }
  if (path[path.length - 1].toLowerCase() !== MAINNET_UKI_TOKEN.toLowerCase()) {
    throw new Error(`${envName} debe terminar en UKI ${MAINNET_UKI_TOKEN}.`);
  }
  return path;
}

function assertDistinct(addresses, label) {
  const normalized = addresses.map((address) => address.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contiene addresses repetidas.`);
}

function buildCommonPlan(environment = process.env) {
  const feeBps = requireFeeBps(environment);
  const deployer = optionalAddress(
    environment,
    'UKI_MARKETPLACE_DEPLOYER_ADDRESS',
    envValue(environment, 'DEPLOYER_ADDRESS'),
  );
  const owner = optionalAddress(
    environment,
    'UKI_MARKETPLACE_OWNER',
    envValue(environment, 'SALE_OWNER_ADDRESS') ?? deployer,
  );
  const feeRecipient = optionalAddress(
    environment,
    'UKI_MARKETPLACE_FEE_RECIPIENT',
    envValue(environment, 'SALE_TREASURY_ADDRESS') ?? deployer,
  );
  const collection = optionalAddress(
    environment,
    'UKI_MARKETPLACE_COLLECTION_ADDRESS',
    MAINNET_CUKIES_COLLECTION,
  );
  const ukiToken = normalizeAddress(MAINNET_UKI_TOKEN, 'MAINNET_UKI_TOKEN');
  const asmToken = normalizeAddress(MAINNET_ASM_TOKEN, 'MAINNET_ASM_TOKEN');
  const usdtToken = normalizeAddress(MAINNET_USDT_TOKEN, 'MAINNET_USDT_TOKEN');
  const usdcToken = normalizeAddress(MAINNET_USDC_TOKEN, 'MAINNET_USDC_TOKEN');
  const router = normalizeAddress(PANCAKE_V2_ROUTER, 'PANCAKE_V2_ROUTER');
  const wrappedNative = normalizeAddress(MAINNET_WBNB, 'MAINNET_WBNB');
  const paths = {
    bnb: parsePath(environment, 'UKI_MARKETPLACE_BNB_PATH', DEFAULT_PATHS.bnb, wrappedNative),
    asm: parsePath(environment, 'UKI_MARKETPLACE_ASM_PATH', DEFAULT_PATHS.asm, asmToken),
    usdt: parsePath(environment, 'UKI_MARKETPLACE_USDT_PATH', DEFAULT_PATHS.usdt, usdtToken),
    usdc: parsePath(environment, 'UKI_MARKETPLACE_USDC_PATH', DEFAULT_PATHS.usdc, usdcToken),
  };

  if (!deployer || !owner || !feeRecipient) {
    throw new Error('Faltan UKI_MARKETPLACE_DEPLOYER_ADDRESS, UKI_MARKETPLACE_OWNER o UKI_MARKETPLACE_FEE_RECIPIENT.');
  }
  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error('El owner inicial debe ser el deployer para configurar allowlists en la misma operación. Hacer handover después.');
  }
  assertDistinct([collection, ukiToken, asmToken, usdtToken, usdcToken, router, wrappedNative], 'Configuración principal');

  return Object.freeze({
    chainId: BSC_MAINNET_CHAIN_ID,
    collection,
    deployer,
    feeBps,
    feeRecipient,
    owner,
    ukiToken,
    asmToken,
    usdtToken,
    usdcToken,
    router,
    wrappedNative,
    paths,
  });
}

function buildUkiMarketplaceMainnetDeployPlan(environment = process.env) {
  const plan = buildCommonPlan(environment);
  const expectedConfirmation = `BSC_MAINNET_56_MARKETPLACE_FEE_${plan.feeBps}_COLLECTION_${plan.collection.toLowerCase()}`;
  const confirmation = envValue(environment, 'UKI_MARKETPLACE_DEPLOYMENT_CONFIRM');
  if (confirmation !== expectedConfirmation) {
    throw new Error(`UKI_MARKETPLACE_DEPLOYMENT_CONFIRM debe ser exactamente ${expectedConfirmation}.`);
  }
  const existing = [
    'UKI_MARKETPLACE_ADDRESS',
    'NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS',
    'CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS',
  ].filter((name) => envValue(environment, name));
  if (existing.length > 0) throw new Error(`No se permite un deploy fresco con addresses ya configuradas: ${existing.join(', ')}.`);
  return Object.freeze({ ...plan, confirmation });
}

function buildUkiMarketplaceMainnetConfigPlan(environment = process.env) {
  const plan = buildCommonPlan(environment);
  const marketplace = optionalAddress(
    environment,
    'UKI_MARKETPLACE_ADDRESS',
    envValue(environment, 'NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS'),
  );
  if (!marketplace) throw new Error('UKI_MARKETPLACE_ADDRESS o NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS es obligatorio para configurar.');
  const expectedConfirmation = `BSC_MAINNET_56_MARKETPLACE_CONFIG_${marketplace.toLowerCase()}`;
  const confirmation = envValue(environment, 'UKI_MARKETPLACE_CONFIG_CONFIRM');
  if (confirmation !== expectedConfirmation) {
    throw new Error(`UKI_MARKETPLACE_CONFIG_CONFIRM debe ser exactamente ${expectedConfirmation}.`);
  }
  return Object.freeze({ ...plan, marketplace, confirmation });
}

module.exports = {
  BSC_MAINNET_CHAIN_ID,
  DEFAULT_PATHS,
  MAINNET_ASM_TOKEN,
  MAINNET_CUKIES_COLLECTION,
  MAINNET_USDC_TOKEN,
  MAINNET_USDT_TOKEN,
  MAINNET_UKI_TOKEN,
  MAINNET_WBNB,
  MAX_FEE_BPS,
  PANCAKE_V2_ROUTER,
  buildUkiMarketplaceMainnetConfigPlan,
  buildUkiMarketplaceMainnetDeployPlan,
  normalizeAddress,
};
