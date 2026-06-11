const hre = require('hardhat');

const APPROVED_ASM_TOKEN_BY_CHAIN_ID = {
  56: '0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c',
  97: '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C',
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalAddress(name) {
  const value = process.env[name];
  return value && value !== '' ? value : null;
}

function isLocalNetwork(networkName) {
  return networkName === 'hardhat' || networkName === 'localhost';
}

function normalizeAddress(value, envName) {
  try {
    return hre.ethers.getAddress(value);
  } catch (_error) {
    throw new Error(`${envName} must be a valid address. Received: ${value}`);
  }
}

function assertApprovedAsmToken(asmTokenAddress) {
  if (isLocalNetwork(hre.network.name)) return;

  const expected = APPROVED_ASM_TOKEN_BY_CHAIN_ID[hre.network.config.chainId];
  if (!expected) {
    throw new Error(`No approved ASM token configured for chain id ${hre.network.config.chainId}.`);
  }

  const normalizedActual = normalizeAddress(asmTokenAddress, 'ASM_TOKEN_ADDRESS');
  const normalizedExpected = normalizeAddress(expected, 'APPROVED_ASM_TOKEN');
  if (normalizedActual !== normalizedExpected) {
    throw new Error(
      `ASM_TOKEN_ADDRESS mismatch for ${hre.network.name}. Expected ${normalizedExpected}, received ${normalizedActual}.`
    );
  }
}

function resolveOwner(deployerAddress) {
  const owner = optionalAddress('SALE_OWNER_ADDRESS');
  if (owner) return owner;

  if (!isLocalNetwork(hre.network.name)) {
    throw new Error('SALE_OWNER_ADDRESS is required for non-local deploys. Use the launch multisig/admin owner.');
  }

  return deployerAddress;
}

async function main() {
  if (!isLocalNetwork(hre.network.name)) {
    throw new Error('scripts/deploy-presale.cjs is local/dev only. Use scripts/deploy-presale.production.cjs for bscTestnet/bsc.');
  }

  const [deployer] = await hre.ethers.getSigners();
  const owner = resolveOwner(deployer?.address);
  if (!deployer) {
    throw new Error('DEPLOYER_PRIVATE_KEY is required for deploys.');
  }
  const treasury = requireEnv('SALE_TREASURY_ADDRESS');
  const asmTokenAddress = requireEnv('ASM_TOKEN_ADDRESS');
  assertApprovedAsmToken(asmTokenAddress);
  const initialSupplyReceiver = optionalAddress('UKI_INITIAL_SUPPLY_RECEIVER') || deployer.address;
  const initialSupply = BigInt(process.env.UKI_INITIAL_SUPPLY || hre.ethers.parseEther('1000000000').toString());
  const now = Math.floor(Date.now() / 1000);
  const saleStart = BigInt(process.env.SALE_START || String(now + 3600));
  const saleEnd = BigInt(process.env.SALE_END || String(Number(saleStart) + 30 * 24 * 60 * 60));
  const vestingStart = BigInt(process.env.VESTING_START || String(saleEnd));
  const vestingDuration = BigInt(process.env.VESTING_DURATION || String(9 * 30 * 24 * 60 * 60));

  const UKIToken = await hre.ethers.getContractFactory('UKIToken');
  const ukiTokenAddress = optionalAddress('UKI_TOKEN_ADDRESS');
  const ukiToken = ukiTokenAddress
    ? UKIToken.attach(ukiTokenAddress)
    : await UKIToken.deploy(owner, initialSupplyReceiver, initialSupply);
  await ukiToken.waitForDeployment?.();

  const VestingVault = await hre.ethers.getContractFactory('VestingVault');
  const vaultAddress = optionalAddress('UKI_VESTING_VAULT_ADDRESS');
  const vestingVault = vaultAddress
    ? VestingVault.attach(vaultAddress)
    : await VestingVault.deploy(await ukiToken.getAddress(), owner, vestingStart, vestingDuration, saleEnd);
  await vestingVault.waitForDeployment?.();

  const Presale = await hre.ethers.getContractFactory('Presale');
  const presale = await Presale.deploy({
    owner,
    asmToken: asmTokenAddress,
    vestingVault: await vestingVault.getAddress(),
    treasury,
    saleStart,
    saleEnd,
    ukiPerAsm: BigInt(process.env.UKI_PER_ASM || hre.ethers.parseEther('100').toString()),
    minAsmPerPurchase: BigInt(process.env.MIN_ASM_PER_PURCHASE || hre.ethers.parseEther('5').toString()),
    totalUkiForSale: BigInt(process.env.TOTAL_UKI_FOR_SALE || hre.ethers.parseEther('250000000').toString()),
  });
  await presale.waitForDeployment();

  console.log(JSON.stringify({
    network: hre.network.name,
    deployer: deployer.address,
    owner,
    treasury,
    asmToken: asmTokenAddress,
    ukiToken: await ukiToken.getAddress(),
    vestingVault: await vestingVault.getAddress(),
    presale: await presale.getAddress(),
    unallocatedWithdrawalUnlockTime: (await vestingVault.unallocatedWithdrawalUnlockTime()).toString(),
  }, null, 2));

  console.log('Next steps:');
  console.log(`1. Transfer sale UKI to VestingVault: ${await vestingVault.getAddress()}`);
  console.log(`   Unallocated withdrawals are locked until after SALE_END: ${saleEnd}`);
  console.log(`2. Grant PRESALE_VESTING_ROLE to Presale: ${await presale.getAddress()}`);
  console.log('3. Grant ALLOCATION_MANAGER_ROLE only if a documented allocation operator must create team/advisor/ecosystem schedules.');
  console.log('4. Review sale parameters and call setSaleEnabled(true) before opening the sale.');
  console.log('5. Keep sale parameters mutable through the owner/Safe while operational risk is active.');
  console.log('6. At TGE, update VestingVault presale vesting config if needed and call freezePresaleVestingConfig() before claims.');
  console.log('7. Run preflight with:');
  console.log(`   UKI_PRESALE_ADDRESS=${await presale.getAddress()} \\`);
  console.log(`   UKI_VESTING_VAULT_ADDRESS=${await vestingVault.getAddress()} \\`);
  console.log(`   SALE_OWNER_ADDRESS=${owner} \\`);
  console.log(`   SALE_TREASURY_ADDRESS=${treasury} \\`);
  console.log(`   pnpm --filter @cukies/contracts preflight:presale -- --network ${hre.network.name}`);
  console.log('8. Verify contracts with hardhat verify once constructor args are recorded.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
