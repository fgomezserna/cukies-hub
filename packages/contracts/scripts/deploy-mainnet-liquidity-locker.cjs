const fs = require('node:fs');
const path = require('node:path');

const hre = require('hardhat');

const {
  BSC_MAINNET_CHAIN_ID,
  LOCK_DURATION_SECONDS,
  MAINNET_ASM,
  MAINNET_UKI,
  PANCAKE_V2_FACTORY,
  normalizeAddress,
} = require('./lib/mainnet-uki-launch.cjs');

const CONFIRMATION_PHRASE = 'DEPLOY_180_DAY_LIQUIDITY_LOCKER_ON_BSC_MAINNET';
const FACTORY_ABI = [
  'function createPair(address,address) returns (address)',
  'function getPair(address,address) view returns (address)',
];
const PAIR_ABI = [
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function totalSupply() view returns (uint256)',
];
const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the BSC Mainnet locker deploy.`);
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
  const requestedPath = optionalEnv('MAINNET_LOCKER_MANIFEST_PATH');
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
  if (requireEnv('MAINNET_LOCKER_DEPLOY_CONFIRM') !== CONFIRMATION_PHRASE) {
    throw new Error(`MAINNET_LOCKER_DEPLOY_CONFIRM must equal ${CONFIRMATION_PHRASE}.`);
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
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required for the locker deploy.');
  const deployerAddress = normalizeAddress(deployer.address, 'deployer.address');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch: signer=${deployerAddress}, expected=${expectedDeployer}.`);
  }
  const deployerBnbBefore = await hre.ethers.provider.getBalance(deployerAddress);
  if (deployerBnbBefore === 0n) throw new Error('The deployer has no BNB for gas.');

  await Promise.all([
    assertCode(safeAddress, 'Launch Safe'),
    assertCode(MAINNET_UKI, 'UKI token'),
    assertCode(MAINNET_ASM, 'ASM token'),
    assertCode(PANCAKE_V2_FACTORY, 'PancakeSwap V2 factory'),
  ]);
  const safe = new hre.ethers.Contract(safeAddress, SAFE_ABI, hre.ethers.provider);
  const factory = new hre.ethers.Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, deployer);
  const [owners, threshold, pairBefore] = await Promise.all([
    safe.getOwners(),
    safe.getThreshold(),
    factory.getPair(MAINNET_ASM, MAINNET_UKI),
  ]);
  if (owners.length !== 1 || threshold !== 1n) {
    throw new Error(`Launch Safe must be 1/1. Observed owners=${owners.length}, threshold=${threshold}.`);
  }
  if (normalizeAddress(owners[0], 'Safe owner') !== expectedSafeOwner) {
    throw new Error(`Launch Safe owner mismatch: ${owners[0]}.`);
  }

  let pairAddress;
  if (pairBefore === hre.ethers.ZeroAddress) {
    pairAddress = normalizeAddress(
      await factory.createPair.staticCall(MAINNET_ASM, MAINNET_UKI),
      'predicted UKI/ASM V2 pair',
    );
  } else {
    pairAddress = normalizeAddress(pairBefore, 'UKI/ASM V2 pair');
    const pair = new hre.ethers.Contract(pairAddress, PAIR_ABI, hre.ethers.provider);
    const [reserves, totalSupply] = await Promise.all([pair.getReserves(), pair.totalSupply()]);
    if (reserves[0] !== 0n || reserves[1] !== 0n || totalSupply !== 0n) {
      throw new Error(`UKI/ASM V2 pair ${pairAddress} already contains liquidity.`);
    }
  }

  const Locker = await hre.ethers.getContractFactory('SixMonthLiquidityLocker', deployer);
  const locker = await Locker.deploy(pairAddress, safeAddress);
  await locker.waitForDeployment();
  const lockerReceipt = await waitForSuccess(
    locker.deploymentTransaction(),
    'SixMonthLiquidityLocker deployment',
    confirmations,
  );
  const lockerAddress = normalizeAddress(await locker.getAddress(), 'SixMonthLiquidityLocker');
  const lockerBlock = await hre.ethers.provider.getBlock(lockerReceipt.blockNumber);
  if (!lockerBlock) throw new Error(`Locker deployment block ${lockerReceipt.blockNumber} is unavailable.`);
  const lockerCode = await assertCode(lockerAddress, 'SixMonthLiquidityLocker');
  const [lockerLp, beneficiary, unlockTime, duration, deployerBnbAfter] = await Promise.all([
    locker.lpToken(),
    locker.owner(),
    locker.unlockTime(),
    locker.LOCK_DURATION(),
    hre.ethers.provider.getBalance(deployerAddress),
  ]);
  if (
    normalizeAddress(lockerLp, 'LiquidityLocker.lpToken') !== pairAddress ||
    normalizeAddress(beneficiary, 'LiquidityLocker.owner') !== safeAddress
  ) {
    throw new Error('Liquidity locker LP token or beneficiary mismatch.');
  }
  if (duration !== LOCK_DURATION_SECONDS) throw new Error(`Unexpected lock duration: ${duration}.`);
  const expectedUnlock = BigInt(lockerBlock.timestamp) + LOCK_DURATION_SECONDS;
  if (unlockTime !== expectedUnlock) {
    throw new Error(`Locker unlock mismatch: ${unlockTime}, expected ${expectedUnlock}.`);
  }

  const manifest = {
    schema: 'cukies.uki-mainnet-liquidity-locker.v1',
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployerAddress,
    safe: {
      address: safeAddress,
      owners: owners.map((owner) => normalizeAddress(owner, 'Safe owner')),
      threshold: Number(threshold),
    },
    tokens: { asm: MAINNET_ASM, uki: MAINNET_UKI },
    pancakeV2: {
      factory: PANCAKE_V2_FACTORY,
      pair: pairAddress,
      pairCreated: pairBefore !== hre.ethers.ZeroAddress,
    },
    liquidityLocker: {
      address: lockerAddress,
      lpToken: pairAddress,
      beneficiary: safeAddress,
      lockDurationSeconds: duration.toString(),
      unlockTime: unlockTime.toString(),
      unlockTimeIso: new Date(Number(unlockTime) * 1_000).toISOString(),
      deploymentTxHash: lockerReceipt.hash,
      deploymentBlock: lockerReceipt.blockNumber,
      runtimeCodeHash: hre.ethers.keccak256(lockerCode),
    },
    gas: {
      deployerBnbBefore: hre.ethers.formatEther(deployerBnbBefore),
      deployerBnbAfter: hre.ethers.formatEther(deployerBnbAfter),
      spentBnb: hre.ethers.formatEther(deployerBnbBefore - deployerBnbAfter),
    },
    nextPhase: 'Run the final price preflight, fund the Safe and generate the exact liquidity batch.',
  };
  const manifestPath = writeManifestIfRequested(manifest);
  console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
