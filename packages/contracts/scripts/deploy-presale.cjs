const hre = require('hardhat');

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

function resolveOwner(deployerAddress) {
  const owner = optionalAddress('SALE_OWNER_ADDRESS');
  if (owner) return owner;

  if (!isLocalNetwork(hre.network.name)) {
    throw new Error('SALE_OWNER_ADDRESS is required for non-local deploys. Use the launch multisig/admin owner.');
  }

  return deployerAddress;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const owner = resolveOwner(deployer?.address);
  if (!deployer) {
    throw new Error('DEPLOYER_PRIVATE_KEY is required for deploys.');
  }
  const treasury = requireEnv('SALE_TREASURY_ADDRESS');
  const asmTokenAddress = requireEnv('ASM_TOKEN_ADDRESS');
  const initialSupplyReceiver = optionalAddress('UKI_INITIAL_SUPPLY_RECEIVER') || deployer.address;
  const initialSupply = BigInt(process.env.UKI_INITIAL_SUPPLY || hre.ethers.parseEther('1000000000').toString());

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
    : await VestingVault.deploy(await ukiToken.getAddress(), owner);
  await vestingVault.waitForDeployment?.();

  const now = Math.floor(Date.now() / 1000);
  const saleStart = BigInt(process.env.SALE_START || String(now + 3600));
  const saleEnd = BigInt(process.env.SALE_END || String(Number(saleStart) + 30 * 24 * 60 * 60));
  const vestingStart = BigInt(process.env.VESTING_START || String(Number(saleStart)));

  const Presale = await hre.ethers.getContractFactory('Presale');
  const presale = await Presale.deploy({
    owner,
    asmToken: asmTokenAddress,
    vestingVault: await vestingVault.getAddress(),
    treasury,
    saleStart,
    saleEnd,
    ukiPerAsm: BigInt(process.env.UKI_PER_ASM || hre.ethers.parseEther('100').toString()),
    minAsmPerPurchase: BigInt(process.env.MIN_ASM_PER_PURCHASE || hre.ethers.parseEther('1').toString()),
    maxAsmPerPurchase: BigInt(process.env.MAX_ASM_PER_PURCHASE || hre.ethers.parseEther('10000').toString()),
    walletAsmCap: BigInt(process.env.WALLET_ASM_CAP || hre.ethers.parseEther('100000').toString()),
    totalUkiForSale: BigInt(process.env.TOTAL_UKI_FOR_SALE || hre.ethers.parseEther('10000000').toString()),
    vestingStart,
    vestingDuration: BigInt(process.env.VESTING_DURATION || String(9 * 30 * 24 * 60 * 60)),
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
  }, null, 2));

  console.log('Next steps:');
  console.log(`1. Transfer sale UKI to VestingVault: ${await vestingVault.getAddress()}`);
  console.log(`2. Grant VESTING_MANAGER_ROLE to Presale: ${await presale.getAddress()}`);
  console.log('3. Verify contracts with hardhat verify once constructor args are recorded.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
