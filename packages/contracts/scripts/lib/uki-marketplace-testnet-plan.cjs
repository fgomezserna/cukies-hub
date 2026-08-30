const { ZeroAddress, getAddress } = require("ethers");

const BSC_TESTNET_CHAIN_ID = 97;
const TESTNET_UKI_TOKEN = "0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c";
const PANCAKE_V2_TESTNET_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const TESTNET_WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const MAX_FEE_BPS = 1_000;

function envValue(environment, name) {
  const value = environment[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function requireEnv(environment, name) {
  const value = envValue(environment, name);
  if (!value)
    throw new Error(
      `${name} is required for the UKI marketplace testnet deploy.`
    );
  return value;
}

function normalizeAddress(value, label) {
  try {
    const address = getAddress(value);
    if (address === ZeroAddress) throw new Error("zero address");
    return address;
  } catch (_error) {
    throw new Error(
      `${label} must be a valid non-zero address. Received: ${value}`
    );
  }
}

function requireAddress(environment, name) {
  return normalizeAddress(requireEnv(environment, name), name);
}

function requireFeeBps(environment) {
  const raw = requireEnv(environment, "UKI_MARKETPLACE_FEE_BPS");
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `UKI_MARKETPLACE_FEE_BPS must be an integer from 0 to ${MAX_FEE_BPS}.`
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FEE_BPS) {
    throw new Error(
      `UKI_MARKETPLACE_FEE_BPS must be an integer from 0 to ${MAX_FEE_BPS}.`
    );
  }
  return value;
}

function assertFreshDeploy(environment) {
  const existingNames = [
    "UKI_MARKETPLACE_ADDRESS",
    "NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS",
    "CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS",
  ].filter((name) => envValue(environment, name));

  if (existingNames.length > 0) {
    throw new Error(
      `Fresh marketplace deploy refused: existing address env detected (${existingNames.join(
        ", "
      )}).`
    );
  }
}

function assertDistinct(addresses) {
  const normalized = addresses.map((address) => address.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(
      "Marketplace collection, UKI, router and WBNB addresses must be distinct."
    );
  }
}

function buildUkiMarketplaceTestnetPlan(environment = process.env) {
  assertFreshDeploy(environment);

  const feeBps = requireFeeBps(environment);
  const expectedConfirmation = `BSC_TESTNET_97_MARKETPLACE_FEE_${feeBps}`;
  const confirmation = requireEnv(
    environment,
    "UKI_MARKETPLACE_DEPLOYMENT_CONFIRM"
  );
  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `UKI_MARKETPLACE_DEPLOYMENT_CONFIRM must be exactly ${expectedConfirmation}.`
    );
  }

  const deployer = requireAddress(
    environment,
    "UKI_MARKETPLACE_DEPLOYER_ADDRESS"
  );
  const owner = requireAddress(environment, "UKI_MARKETPLACE_OWNER");
  const feeRecipient = requireAddress(
    environment,
    "UKI_MARKETPLACE_FEE_RECIPIENT"
  );
  const collection = requireAddress(
    environment,
    "UKI_MARKETPLACE_COLLECTION_ADDRESS"
  );
  const ukiToken = normalizeAddress(TESTNET_UKI_TOKEN, "TESTNET_UKI_TOKEN");
  const router = normalizeAddress(
    PANCAKE_V2_TESTNET_ROUTER,
    "PANCAKE_V2_TESTNET_ROUTER"
  );
  const wrappedNative = normalizeAddress(TESTNET_WBNB, "TESTNET_WBNB");

  assertDistinct([collection, ukiToken, router, wrappedNative]);

  return Object.freeze({
    chainId: BSC_TESTNET_CHAIN_ID,
    confirmation,
    collection,
    deployer,
    feeBps,
    feeRecipient,
    owner,
    router,
    ukiToken,
    wrappedNative,
  });
}

module.exports = {
  BSC_TESTNET_CHAIN_ID,
  MAX_FEE_BPS,
  PANCAKE_V2_TESTNET_ROUTER,
  TESTNET_UKI_TOKEN,
  TESTNET_WBNB,
  buildUkiMarketplaceTestnetPlan,
  normalizeAddress,
};
