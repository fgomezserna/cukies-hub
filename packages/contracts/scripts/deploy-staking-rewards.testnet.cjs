const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the testnet staking/rewards deploy.`);
  return value;
}

function normalizeAddress(value, label) {
  try {
    return hre.ethers.getAddress(value);
  } catch (_error) {
    throw new Error(`${label} must be a valid address. Received: ${value}`);
  }
}

async function contractIdentity(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') throw new Error(`${label} has no bytecode at ${address}.`);
  return {
    address,
    runtimeCodeHash: hre.ethers.keccak256(code),
  };
}

async function main() {
  if (hre.network.name !== 'bscTestnet' || hre.network.config.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `This script is BSC Testnet-only. Current network=${hre.network.name}, chainId=${hre.network.config.chainId}.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');

  const deployerAddress = normalizeAddress(deployer.address, 'deployer.address');
  const expectedDeployer = normalizeAddress(requireEnv('DEPLOYER_ADDRESS'), 'DEPLOYER_ADDRESS');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch. Key resolves to ${deployerAddress}, expected ${expectedDeployer}.`);
  }

  const owner = normalizeAddress(
    process.env.UKI_ECONOMY_OWNER_ADDRESS?.trim() || expectedDeployer,
    'UKI_ECONOMY_OWNER_ADDRESS'
  );
  const ukiTokenAddress = normalizeAddress(requireEnv('UKI_TOKEN_ADDRESS'), 'UKI_TOKEN_ADDRESS');
  const tokenCode = await hre.ethers.provider.getCode(ukiTokenAddress);
  if (tokenCode === '0x') throw new Error(`UKI_TOKEN_ADDRESS has no bytecode at ${ukiTokenAddress}.`);

  const ukiToken = await hre.ethers.getContractAt(
    ['function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)'],
    ukiTokenAddress
  );
  const [supply, deployerUkiBefore, deployerBnbBefore] = await Promise.all([
    ukiToken.totalSupply(),
    ukiToken.balanceOf(deployerAddress),
    hre.ethers.provider.getBalance(deployerAddress),
  ]);
  if (supply === 0n) throw new Error('UKI token totalSupply is zero.');
  if (deployerBnbBefore === 0n) throw new Error('Deployer has no tBNB for gas.');

  const UKIStaking = await hre.ethers.getContractFactory('UKIStaking');
  const staking = await UKIStaking.deploy(ukiTokenAddress, owner);
  const stakingDeployment = staking.deploymentTransaction();
  const stakingReceipt = await stakingDeployment.wait();
  const stakingAddress = await staking.getAddress();

  const RewardsDistributor = await hre.ethers.getContractFactory('RewardsDistributor');
  const rewardsDistributor = await RewardsDistributor.deploy(ukiTokenAddress, owner);
  const rewardsDeployment = rewardsDistributor.deploymentTransaction();
  const rewardsReceipt = await rewardsDeployment.wait();
  const rewardsDistributorAddress = await rewardsDistributor.getAddress();

  const [stakingIdentity, rewardsIdentity] = await Promise.all([
    contractIdentity(stakingAddress, 'UKIStaking'),
    contractIdentity(rewardsDistributorAddress, 'RewardsDistributor'),
  ]);

  const checks = {
    stakingOwner: normalizeAddress(await staking.owner(), 'UKIStaking.owner'),
    stakingToken: normalizeAddress(await staking.ukiToken(), 'UKIStaking.ukiToken'),
    stakingPaused: await staking.paused(),
    totalStakedRaw: (await staking.totalStaked()).toString(),
    rewardsOwner: normalizeAddress(await rewardsDistributor.owner(), 'RewardsDistributor.owner'),
    rewardsToken: normalizeAddress(await rewardsDistributor.ukiToken(), 'RewardsDistributor.ukiToken'),
    rewardsPaused: await rewardsDistributor.paused(),
    rewardsReservedRaw: (await rewardsDistributor.totalReserved()).toString(),
    rewardsFreeBalanceRaw: (await rewardsDistributor.freeBalance()).toString(),
  };

  if (checks.stakingOwner !== owner || checks.rewardsOwner !== owner) {
    throw new Error(`Owner check failed: ${JSON.stringify(checks)}.`);
  }
  if (checks.stakingToken !== ukiTokenAddress || checks.rewardsToken !== ukiTokenAddress) {
    throw new Error(`UKI token binding check failed: ${JSON.stringify(checks)}.`);
  }
  if (checks.stakingPaused || checks.rewardsPaused) throw new Error('Fresh contracts must not be paused.');
  if (checks.totalStakedRaw !== '0' || checks.rewardsReservedRaw !== '0') {
    throw new Error(`Fresh accounting must start at zero: ${JSON.stringify(checks)}.`);
  }

  console.log(JSON.stringify({
    script: 'deploy-staking-rewards.testnet.cjs',
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployerAddress,
    owner,
    ukiToken: ukiTokenAddress,
    ukiSupplyRaw: supply.toString(),
    deployerUkiBeforeRaw: deployerUkiBefore.toString(),
    contracts: {
      ukiStaking: {
        ...stakingIdentity,
        deploymentBlock: stakingReceipt.blockNumber,
        deploymentTransaction: stakingDeployment.hash,
      },
      rewardsDistributor: {
        ...rewardsIdentity,
        deploymentBlock: rewardsReceipt.blockNumber,
        deploymentTransaction: rewardsDeployment.hash,
      },
    },
    checks,
    funding: {
      rewardsDistributorFunded: false,
      reason: 'Reward amounts and batches remain an explicit post-deploy decision.',
    },
    verifyCommands: [
      `pnpm --filter @cukies/contracts exec hardhat verify --network bscTestnet ${stakingAddress} ${ukiTokenAddress} ${owner}`,
      `pnpm --filter @cukies/contracts exec hardhat verify --network bscTestnet ${rewardsDistributorAddress} ${ukiTokenAddress} ${owner}`,
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
