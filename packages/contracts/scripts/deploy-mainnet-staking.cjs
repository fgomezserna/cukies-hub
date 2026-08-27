const fs = require('node:fs');
const path = require('node:path');

const hre = require('hardhat');

const {
  BSC_MAINNET_CHAIN_ID,
  MAINNET_UKI,
  normalizeAddress,
} = require('./lib/mainnet-uki-launch.cjs');

const CONFIRMATION_PHRASE = 'DEPLOY_UKI_STAKING_ON_BSC_MAINNET';
const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
];
const TOKEN_ABI = [
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the BSC Mainnet staking deploy.`);
  return value;
}

function optionalEnv(name) {
  return process.env[name]?.trim() || null;
}

async function assertCode(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') throw new Error(`${label} has no bytecode at ${address}.`);
  return code;
}

async function waitForSuccess(transaction, label, confirmations) {
  const receipt = await transaction.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed.`);
  return receipt;
}

function writeManifestIfRequested(manifest) {
  const requestedPath = optionalEnv('MAINNET_STAKING_MANIFEST_PATH');
  if (!requestedPath) return null;
  const outputPath = path.resolve(requestedPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  return outputPath;
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== 'bsc' || network.chainId !== BSC_MAINNET_CHAIN_ID) {
    throw new Error(
      `This deploy is BSC Mainnet-only. Current network=${hre.network.name}, chainId=${network.chainId}.`,
    );
  }
  if (requireEnv('MAINNET_STAKING_DEPLOY_CONFIRM') !== CONFIRMATION_PHRASE) {
    throw new Error(`MAINNET_STAKING_DEPLOY_CONFIRM must equal ${CONFIRMATION_PHRASE}.`);
  }
  const safeAddress = normalizeAddress(
    requireEnv('MAINNET_LAUNCH_SAFE_ADDRESS'),
    'MAINNET_LAUNCH_SAFE_ADDRESS',
  );
  const expectedSafeOwner = normalizeAddress(
    requireEnv('MAINNET_LAUNCH_SAFE_OWNER_ADDRESS'),
    'MAINNET_LAUNCH_SAFE_OWNER_ADDRESS',
  );
  const expectedDeployer = normalizeAddress(requireEnv('DEPLOYER_ADDRESS'), 'DEPLOYER_ADDRESS');
  const confirmations = optionalEnv('MAINNET_LAUNCH_CONFIRMATIONS')
    ? Number(optionalEnv('MAINNET_LAUNCH_CONFIRMATIONS'))
    : 12;
  if (!Number.isSafeInteger(confirmations) || confirmations < 12 || confirmations > 100) {
    throw new Error('MAINNET_LAUNCH_CONFIRMATIONS must be an integer between 12 and 100.');
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required for the staking deploy.');
  const deployerAddress = normalizeAddress(deployer.address, 'deployer.address');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch: signer=${deployerAddress}, expected=${expectedDeployer}.`);
  }
  const deployerBnbBefore = await hre.ethers.provider.getBalance(deployerAddress);
  if (deployerBnbBefore === 0n) throw new Error('The deployer has no BNB for gas.');

  await Promise.all([
    assertCode(safeAddress, 'Launch Safe'),
    assertCode(MAINNET_UKI, 'UKI token'),
  ]);
  const safe = new hre.ethers.Contract(safeAddress, SAFE_ABI, hre.ethers.provider);
  const uki = new hre.ethers.Contract(MAINNET_UKI, TOKEN_ABI, hre.ethers.provider);
  const [owners, threshold, ukiName, ukiSymbol, ukiDecimals] = await Promise.all([
    safe.getOwners(),
    safe.getThreshold(),
    uki.name(),
    uki.symbol(),
    uki.decimals(),
  ]);
  if (owners.length !== 1 || threshold !== 1n) {
    throw new Error(`Launch Safe must be 1/1. Observed owners=${owners.length}, threshold=${threshold}.`);
  }
  if (normalizeAddress(owners[0], 'Safe owner') !== expectedSafeOwner) {
    throw new Error(`Launch Safe owner mismatch: ${owners[0]}.`);
  }
  if (ukiName !== 'Cukies UKI' || ukiSymbol !== 'UKI' || ukiDecimals !== 18n) {
    throw new Error(`UKI identity mismatch: name=${ukiName}, symbol=${ukiSymbol}, decimals=${ukiDecimals}.`);
  }

  const UKIStaking = await hre.ethers.getContractFactory('UKIStaking', deployer);
  const staking = await UKIStaking.deploy(MAINNET_UKI, safeAddress);
  await staking.waitForDeployment();
  const stakingReceipt = await waitForSuccess(
    staking.deploymentTransaction(),
    'UKIStaking deployment',
    confirmations,
  );
  const stakingAddress = normalizeAddress(await staking.getAddress(), 'UKIStaking');
  const stakingCode = await assertCode(stakingAddress, 'UKIStaking');
  const [stakingToken, stakingOwner, stakingPaused, deployerBnbAfter] = await Promise.all([
    staking.ukiToken(),
    staking.owner(),
    staking.paused(),
    hre.ethers.provider.getBalance(deployerAddress),
  ]);
  if (normalizeAddress(stakingToken, 'UKIStaking.ukiToken') !== MAINNET_UKI) {
    throw new Error('UKIStaking token linkage mismatch.');
  }
  if (normalizeAddress(stakingOwner, 'UKIStaking.owner') !== safeAddress || stakingPaused) {
    throw new Error('UKIStaking owner or pause state mismatch.');
  }

  const manifest = {
    schema: 'cukies.uki-mainnet-staking.v1',
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployerAddress,
    safe: {
      address: safeAddress,
      owners: owners.map((owner) => normalizeAddress(owner, 'Safe owner')),
      threshold: Number(threshold),
    },
    token: MAINNET_UKI,
    staking: {
      address: stakingAddress,
      owner: safeAddress,
      paused: false,
      deploymentTxHash: stakingReceipt.hash,
      deploymentBlock: stakingReceipt.blockNumber,
      runtimeCodeHash: hre.ethers.keccak256(stakingCode),
    },
    gas: {
      deployerBnbBefore: hre.ethers.formatEther(deployerBnbBefore),
      deployerBnbAfter: hre.ethers.formatEther(deployerBnbAfter),
      spentBnb: hre.ethers.formatEther(deployerBnbBefore - deployerBnbAfter),
    },
    nextPhase: 'Verify source, configure the indexer and run a mainnet staking smoke test.',
  };
  const manifestPath = writeManifestIfRequested(manifest);
  console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
