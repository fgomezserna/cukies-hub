const hre = require('hardhat');

const APPROVED_ASM_TOKEN_BY_CHAIN_ID = {
  56: '0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c',
  97: '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C',
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for production-style deploys`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value && value !== '' ? value : null;
}

function normalizeAddress(value, envName) {
  try {
    return hre.ethers.getAddress(value);
  } catch (_error) {
    throw new Error(`${envName} must be a valid address. Received: ${value}`);
  }
}

function requireAddress(name) {
  return normalizeAddress(requireEnv(name), name);
}

function optionalAddress(name) {
  const value = optionalEnv(name);
  return value ? normalizeAddress(value, name) : null;
}

function requireUint(name) {
  const value = requireEnv(name);
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error('not positive');
    return parsed;
  } catch (_error) {
    throw new Error(`${name} must be a positive integer string. Received: ${value}`);
  }
}

function isLocalNetwork(networkName) {
  return networkName === 'hardhat' || networkName === 'localhost';
}

function assertProductionNetwork() {
  if (isLocalNetwork(hre.network.name)) {
    throw new Error('Use deploy-presale.cjs or simulate-full-deploy.cjs for local/test flows.');
  }
}

function assertApprovedAsmToken(asmTokenAddress) {
  const expected = APPROVED_ASM_TOKEN_BY_CHAIN_ID[hre.network.config.chainId];
  if (!expected) {
    throw new Error(`No approved ASM token configured for chain id ${hre.network.config.chainId}.`);
  }

  const normalizedExpected = normalizeAddress(expected, 'APPROVED_ASM_TOKEN');
  if (asmTokenAddress !== normalizedExpected) {
    throw new Error(
      `ASM_TOKEN_ADDRESS mismatch for ${hre.network.name}. Expected ${normalizedExpected}, received ${asmTokenAddress}.`
    );
  }
}

async function assertContractCode(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') {
    throw new Error(`${label} has no bytecode at ${address}`);
  }
}

async function main() {
  assertProductionNetwork();

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error('DEPLOYER_PRIVATE_KEY is required for production-style deploys.');
  }

  const owner = requireAddress('SALE_OWNER_ADDRESS');
  const treasury = requireAddress('SALE_TREASURY_ADDRESS');
  const asmTokenAddress = requireAddress('ASM_TOKEN_ADDRESS');
  assertApprovedAsmToken(asmTokenAddress);

  const initialSupply = requireUint('UKI_INITIAL_SUPPLY');
  const saleStart = requireUint('SALE_START');
  const saleEnd = requireUint('SALE_END');
  const vestingStart = requireUint('VESTING_START');
  const vestingDuration = requireUint('VESTING_DURATION');
  const ukiPerAsm = requireUint('UKI_PER_ASM');
  const minAsmPerPurchase = requireUint('MIN_ASM_PER_PURCHASE');
  const totalUkiForSale = requireUint('TOTAL_UKI_FOR_SALE');

  if (saleEnd <= saleStart) throw new Error('SALE_END must be greater than SALE_START');
  if (vestingStart < saleEnd) throw new Error('VESTING_START must be greater than or equal to SALE_END');

  const UKIToken = await hre.ethers.getContractFactory('UKIToken');
  const ukiTokenAddress = optionalAddress('UKI_TOKEN_ADDRESS');
  const initialSupplyReceiver = optionalAddress('UKI_INITIAL_SUPPLY_RECEIVER');
  if (!ukiTokenAddress && !initialSupplyReceiver) {
    throw new Error('UKI_INITIAL_SUPPLY_RECEIVER is required when deploying a new UKIToken.');
  }

  const ukiToken = ukiTokenAddress
    ? UKIToken.attach(ukiTokenAddress)
    : await UKIToken.deploy(owner, initialSupplyReceiver, initialSupply);
  await ukiToken.waitForDeployment?.();
  const resolvedUkiTokenAddress = await ukiToken.getAddress();
  await assertContractCode(resolvedUkiTokenAddress, 'UKIToken');

  const ukiOwner = normalizeAddress(await ukiToken.owner(), 'UKIToken.owner');
  if (ukiOwner !== owner) {
    throw new Error(`UKIToken.owner mismatch. Expected ${owner}, received ${ukiOwner}.`);
  }
  const totalSupply = await ukiToken.totalSupply();
  if (totalSupply !== initialSupply) {
    throw new Error(`UKIToken.totalSupply mismatch. Expected ${initialSupply}, received ${totalSupply}.`);
  }

  const VestingVault = await hre.ethers.getContractFactory('VestingVault');
  const vaultAddress = optionalAddress('UKI_VESTING_VAULT_ADDRESS');
  const vestingVault = vaultAddress
    ? VestingVault.attach(vaultAddress)
    : await VestingVault.deploy(resolvedUkiTokenAddress, owner, vestingStart, vestingDuration, saleEnd);
  await vestingVault.waitForDeployment?.();
  const resolvedVaultAddress = await vestingVault.getAddress();
  await assertContractCode(resolvedVaultAddress, 'VestingVault');

  const vaultToken = normalizeAddress(await vestingVault.ukiToken(), 'VestingVault.ukiToken');
  if (vaultToken !== resolvedUkiTokenAddress) {
    throw new Error(`VestingVault.ukiToken mismatch. Expected ${resolvedUkiTokenAddress}, received ${vaultToken}.`);
  }
  if (!(await vestingVault.hasRole(await vestingVault.DEFAULT_ADMIN_ROLE(), owner))) {
    throw new Error(`VestingVault DEFAULT_ADMIN_ROLE is not held by ${owner}.`);
  }
  const vaultPresaleVestingStart = await vestingVault.presaleVestingStart();
  const vaultPresaleVestingDuration = await vestingVault.presaleVestingDuration();
  if (vaultPresaleVestingStart !== vestingStart) {
    throw new Error(
      `VestingVault.presaleVestingStart mismatch. Expected ${vestingStart}, received ${vaultPresaleVestingStart}.`
    );
  }
  if (vaultPresaleVestingDuration !== vestingDuration) {
    throw new Error(
      `VestingVault.presaleVestingDuration mismatch. Expected ${vestingDuration}, received ${vaultPresaleVestingDuration}.`
    );
  }

  const Presale = await hre.ethers.getContractFactory('Presale');
  const presale = await Presale.deploy({
    owner,
    asmToken: asmTokenAddress,
    vestingVault: resolvedVaultAddress,
    treasury,
    saleStart,
    saleEnd,
    ukiPerAsm,
    minAsmPerPurchase,
    totalUkiForSale,
  });
  await presale.waitForDeployment();

  console.log(JSON.stringify({
    script: 'deploy-presale.production.cjs',
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    owner,
    treasury,
    asmToken: asmTokenAddress,
    ukiToken: resolvedUkiTokenAddress,
    vestingVault: resolvedVaultAddress,
    presale: await presale.getAddress(),
    saleParameters: {
      saleStart: saleStart.toString(),
      saleEnd: saleEnd.toString(),
      ukiPerAsm: ukiPerAsm.toString(),
      minAsmPerPurchase: minAsmPerPurchase.toString(),
      totalUkiForSale: totalUkiForSale.toString(),
    },
    presaleVestingParameters: {
      vestingStart: vestingStart.toString(),
      vestingDuration: vestingDuration.toString(),
      unallocatedWithdrawalUnlockTime: (await vestingVault.unallocatedWithdrawalUnlockTime()).toString(),
      vestingConfigFrozen: await vestingVault.presaleVestingConfigFrozen(),
    },
  }, null, 2));

  console.log('Next Safe-controlled steps:');
  console.log(`1. Transfer sale UKI to VestingVault: ${resolvedVaultAddress}`);
  console.log(`   Unallocated withdrawals are locked until after SALE_END: ${saleEnd}`);
  console.log(`2. Grant PRESALE_VESTING_ROLE to Presale: ${await presale.getAddress()}`);
  console.log('3. Grant ALLOCATION_MANAGER_ROLE only if an approved Safe/operator must create internal schedules.');
  console.log('4. Revoke temporary allocation operators after internal schedules are created.');
  console.log('5. Review sale parameters and call setSaleEnabled(true) before opening the sale.');
  console.log('6. Keep sale parameters mutable through the Safe while operational risk is active.');
  console.log('7. At TGE, update VestingVault presale vesting config if needed and call freezePresaleVestingConfig() before claims.');
  console.log('8. Run preflight:presale with all final env values.');
  console.log('9. Verify contracts with hardhat verify once constructor args are recorded.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
