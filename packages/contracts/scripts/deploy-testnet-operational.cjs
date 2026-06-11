const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97;
const APPROVED_TESTNET_ASM_TOKEN = '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C';
const LAUNCH_SALE_START = 1781535600n; // 2026-06-15T17:00:00+02:00 Europe/Madrid / 15:00 UTC.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for testnet operational deploy`);
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

async function assertContractCode(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') throw new Error(`${label} has no bytecode at ${address}`);
}

async function roleMembers(contract, role) {
  const count = await contract.getRoleMemberCount(role);
  const members = [];
  for (let index = 0n; index < count; index++) {
    members.push(normalizeAddress(await contract.getRoleMember(role, index), `${role} member ${index}`));
  }
  return members.sort();
}

function sameAddressSet(actual, expected) {
  return JSON.stringify(actual.map((address) => normalizeAddress(address, 'actual role member')).sort())
    === JSON.stringify(expected.map((address) => normalizeAddress(address, 'expected role member')).sort());
}

function assertNoAttachEnv() {
  for (const name of ['UKI_TOKEN_ADDRESS', 'UKI_VESTING_VAULT_ADDRESS', 'UKI_PRESALE_ADDRESS']) {
    if (optionalEnv(name)) {
      throw new Error(`${name} must be empty for a fresh testnet operational deploy. Use the handover/preflight scripts for existing contracts.`);
    }
  }
}

async function signerForSupplyReceiver(deployer, supplyReceiver) {
  if (supplyReceiver === normalizeAddress(deployer.address, 'deployer.address')) return deployer;

  const receiverPrivateKey = optionalEnv('UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY');
  if (!receiverPrivateKey) {
    throw new Error(
      'UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY is required when UKI_INITIAL_SUPPLY_RECEIVER is not the deployer; the receiver must sign the vault funding transfer.'
    );
  }

  const receiverWallet = new hre.ethers.Wallet(receiverPrivateKey, hre.ethers.provider);
  const resolvedReceiver = normalizeAddress(receiverWallet.address, 'UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY address');
  if (resolvedReceiver !== supplyReceiver) {
    throw new Error(`UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY resolves to ${resolvedReceiver}, expected ${supplyReceiver}`);
  }

  const bnbBalance = await hre.ethers.provider.getBalance(supplyReceiver);
  if (bnbBalance === 0n) {
    throw new Error(`UKI_INITIAL_SUPPLY_RECEIVER ${supplyReceiver} has no BNB to pay gas for funding the vault.`);
  }

  return receiverWallet;
}

async function main() {
  if (hre.network.name !== 'bscTestnet' || hre.network.config.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(`This script is testnet-only. Use --network bscTestnet. Current network=${hre.network.name}, chainId=${hre.network.config.chainId}`);
  }
  assertNoAttachEnv();

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');

  const expectedDeployer = requireAddress('DEPLOYER_ADDRESS');
  const deployerAddress = normalizeAddress(deployer.address, 'deployer.address');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch. Private key resolves to ${deployerAddress}, expected ${expectedDeployer}`);
  }

  const asmTokenAddress = requireAddress('ASM_TOKEN_ADDRESS');
  if (asmTokenAddress !== normalizeAddress(APPROVED_TESTNET_ASM_TOKEN, 'APPROVED_TESTNET_ASM_TOKEN')) {
    throw new Error(`ASM_TOKEN_ADDRESS must be testnet tASM ${APPROVED_TESTNET_ASM_TOKEN}. Received ${asmTokenAddress}`);
  }

  const owner = deployerAddress;
  const treasury = requireAddress('SALE_TREASURY_ADDRESS');
  const initialSupplyReceiver = requireAddress('UKI_INITIAL_SUPPLY_RECEIVER');
  const initialSupply = requireUint('UKI_INITIAL_SUPPLY');
  const saleStart = optionalEnv('SALE_START') ? requireUint('SALE_START') : LAUNCH_SALE_START;
  const saleEnd = requireUint('SALE_END');
  const vestingStart = requireUint('VESTING_START');
  const vestingDuration = requireUint('VESTING_DURATION');
  const ukiPerAsm = requireUint('UKI_PER_ASM');
  const minAsmPerPurchase = requireUint('MIN_ASM_PER_PURCHASE');
  const totalUkiForSale = requireUint('TOTAL_UKI_FOR_SALE');

  if (saleStart !== LAUNCH_SALE_START) {
    throw new Error(`SALE_START must be ${LAUNCH_SALE_START} (2026-06-15 17:00 Europe/Madrid). Received ${saleStart}`);
  }
  if (saleEnd <= saleStart) throw new Error('SALE_END must be greater than SALE_START.');
  if (vestingStart < saleEnd) throw new Error('VESTING_START must be greater than or equal to SALE_END.');
  if (totalUkiForSale > initialSupply) throw new Error('TOTAL_UKI_FOR_SALE cannot exceed UKI_INITIAL_SUPPLY.');

  const UKIToken = await hre.ethers.getContractFactory('UKIToken');
  const ukiToken = await UKIToken.deploy(owner, initialSupplyReceiver, initialSupply);
  await ukiToken.waitForDeployment();
  const ukiTokenAddress = await ukiToken.getAddress();
  await assertContractCode(ukiTokenAddress, 'UKIToken');

  const VestingVault = await hre.ethers.getContractFactory('VestingVault');
  const vestingVault = await VestingVault.deploy(ukiTokenAddress, owner, vestingStart, vestingDuration, saleEnd);
  await vestingVault.waitForDeployment();
  const vestingVaultAddress = await vestingVault.getAddress();
  await assertContractCode(vestingVaultAddress, 'VestingVault');

  const Presale = await hre.ethers.getContractFactory('Presale');
  const presale = await Presale.deploy({
    owner,
    asmToken: asmTokenAddress,
    vestingVault: vestingVaultAddress,
    treasury,
    saleStart,
    saleEnd,
    ukiPerAsm,
    minAsmPerPurchase,
    totalUkiForSale,
  });
  await presale.waitForDeployment();
  const presaleAddress = await presale.getAddress();
  await assertContractCode(presaleAddress, 'Presale');

  const supplySigner = await signerForSupplyReceiver(deployer, initialSupplyReceiver);
  await (await ukiToken.connect(supplySigner).transfer(vestingVaultAddress, totalUkiForSale)).wait();

  const presaleRole = await vestingVault.PRESALE_VESTING_ROLE();
  await (await vestingVault.grantRole(presaleRole, presaleAddress)).wait();

  await (await presale.setSaleEnabled(true)).wait();

  const defaultAdminRole = await vestingVault.DEFAULT_ADMIN_ROLE();
  const allocationRole = await vestingVault.ALLOCATION_MANAGER_ROLE();
  const checks = {
    ukiOwner: normalizeAddress(await ukiToken.owner(), 'UKIToken.owner') === owner,
    presaleOwner: normalizeAddress(await presale.owner(), 'Presale.owner') === owner,
    vaultDefaultAdmins: await roleMembers(vestingVault, defaultAdminRole),
    vaultPresaleRoleMembers: await roleMembers(vestingVault, presaleRole),
    vaultAllocationRoleMembers: await roleMembers(vestingVault, allocationRole),
    vaultFunding: (await vestingVault.unallocatedBalance()).toString(),
    saleEnabled: await presale.saleEnabled(),
    saleStart: (await presale.saleStart()).toString(),
    unallocatedWithdrawalUnlockTime: (await vestingVault.unallocatedWithdrawalUnlockTime()).toString(),
  };

  if (!checks.ukiOwner) throw new Error('UKIToken owner check failed.');
  if (!checks.presaleOwner) throw new Error('Presale owner check failed.');
  if (!sameAddressSet(checks.vaultDefaultAdmins, [owner])) throw new Error(`Vault admin members mismatch: ${checks.vaultDefaultAdmins}`);
  if (!sameAddressSet(checks.vaultPresaleRoleMembers, [presaleAddress])) throw new Error(`Presale role members mismatch: ${checks.vaultPresaleRoleMembers}`);
  if (!sameAddressSet(checks.vaultAllocationRoleMembers, [])) throw new Error(`Allocation role should be empty at deploy: ${checks.vaultAllocationRoleMembers}`);
  if ((await vestingVault.unallocatedBalance()) < totalUkiForSale) throw new Error('VestingVault funding check failed.');
  if (!(await presale.saleEnabled())) throw new Error('Presale saleEnabled check failed.');

  console.log(JSON.stringify({
    script: 'deploy-testnet-operational.cjs',
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployerAddress,
    owner,
    asmTreasury: treasury,
    initialSupplyReceiver,
    contracts: {
      ukiToken: ukiTokenAddress,
      vestingVault: vestingVaultAddress,
      presale: presaleAddress,
    },
    saleParameters: {
      saleStart: saleStart.toString(),
      saleStartHuman: '2026-06-15 17:00 Europe/Madrid / 15:00 UTC',
      saleEnd: saleEnd.toString(),
      ukiPerAsm: ukiPerAsm.toString(),
      minAsmPerPurchase: minAsmPerPurchase.toString(),
      totalUkiForSale: totalUkiForSale.toString(),
      saleEnabled: true,
    },
    vestingParameters: {
      vestingStart: vestingStart.toString(),
      vestingDuration: vestingDuration.toString(),
      unallocatedWithdrawalUnlockTime: saleEnd.toString(),
    },
    checks,
    nextPhase: [
      'Run BscScan verification for UKIToken, VestingVault and Presale.',
      'Run testnet safe handover or final preflight if Safe addresses are ready.',
      'Run preflight:presale with final owner/admin env values.',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
