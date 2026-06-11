const hre = require('hardhat');

const BSC_MAINNET_CHAIN_ID = 56;
const MAINNET_SALE_START = 1781535600n; // 2026-06-15T17:00:00+02:00 Europe/Madrid / 15:00 UTC.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for mainnet Safe handover`);
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

function parseBoolEnv(name, defaultValue) {
  const value = optionalEnv(name);
  if (value === null) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false. Received ${value}`);
}

async function maybeWait(label, txPromise) {
  const tx = await txPromise;
  console.log(`${label}: ${tx.hash}`);
  await tx.wait();
  return tx;
}

async function signerForRemainderSource(deployer, sourceAddress) {
  if (sourceAddress === normalizeAddress(deployer.address, 'deployer.address')) return deployer;

  const sourcePrivateKey = optionalEnv('UKI_REMAINDER_SOURCE_PRIVATE_KEY');
  if (!sourcePrivateKey) {
    throw new Error('UKI_REMAINDER_SOURCE_PRIVATE_KEY is required when UKI_REMAINDER_SOURCE_ADDRESS is not DEPLOYER_ADDRESS.');
  }

  const sourceWallet = new hre.ethers.Wallet(sourcePrivateKey, hre.ethers.provider);
  const resolvedSource = normalizeAddress(sourceWallet.address, 'UKI_REMAINDER_SOURCE_PRIVATE_KEY address');
  if (resolvedSource !== sourceAddress) {
    throw new Error(`UKI_REMAINDER_SOURCE_PRIVATE_KEY resolves to ${resolvedSource}, expected ${sourceAddress}`);
  }
  return sourceWallet;
}

async function main() {
  if (hre.network.name !== 'bsc' || hre.network.config.chainId !== BSC_MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Use --network bsc. Current network=${hre.network.name}, chainId=${hre.network.config.chainId}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');

  const deployerAddress = normalizeAddress(deployer.address, 'deployer.address');
  const expectedDeployer = requireAddress('DEPLOYER_ADDRESS');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch. Private key resolves to ${deployerAddress}, expected ${expectedDeployer}`);
  }

  const safeOwner = requireAddress('SAFE_OWNER_ADDRESS');
  const finalAsmTreasury = requireAddress('FINAL_ASM_TREASURY_ADDRESS');
  const remainderReceiver = requireAddress('UKI_REMAINDER_RECEIVER_ADDRESS');
  const remainderSource = optionalAddress('UKI_REMAINDER_SOURCE_ADDRESS') || deployerAddress;
  const allocationManager = optionalAddress('ALLOCATION_MANAGER_ADDRESS');

  const ukiTokenAddress = requireAddress('UKI_TOKEN_ADDRESS');
  const vaultAddress = requireAddress('UKI_VESTING_VAULT_ADDRESS');
  const presaleAddress = requireAddress('UKI_PRESALE_ADDRESS');
  const expectedSaleStart = optionalEnv('SALE_START') ? requireUint('SALE_START') : MAINNET_SALE_START;
  const expectedSaleEnd = requireUint('SALE_END');
  const expectedVestingStart = requireUint('VESTING_START');
  const expectedVestingDuration = requireUint('VESTING_DURATION');
  const expectedUkiPerAsm = requireUint('UKI_PER_ASM');
  const expectedMinAsmPerPurchase = requireUint('MIN_ASM_PER_PURCHASE');
  const expectedTotalUkiForSale = requireUint('TOTAL_UKI_FOR_SALE');
  const targetSaleEnabled = parseBoolEnv('SALE_ENABLED_AFTER_HANDOVER', true);

  if (expectedSaleStart !== MAINNET_SALE_START) {
    throw new Error(`SALE_START must be ${MAINNET_SALE_START} (2026-06-15 17:00 Europe/Madrid). Received ${expectedSaleStart}`);
  }
  if (expectedSaleEnd <= expectedSaleStart) throw new Error('SALE_END must be greater than SALE_START.');
  if (expectedVestingStart < expectedSaleEnd) throw new Error('VESTING_START must be greater than or equal to SALE_END.');

  const UKIToken = await hre.ethers.getContractFactory('UKIToken');
  const VestingVault = await hre.ethers.getContractFactory('VestingVault');
  const Presale = await hre.ethers.getContractFactory('Presale');
  const uki = UKIToken.attach(ukiTokenAddress);
  const vault = VestingVault.attach(vaultAddress);
  const presale = Presale.attach(presaleAddress);

  if (normalizeAddress(await uki.owner(), 'UKIToken.owner') !== deployerAddress) {
    throw new Error('UKIToken.owner must still be DEPLOYER_ADDRESS before this handover script runs.');
  }
  if (normalizeAddress(await presale.owner(), 'Presale.owner') !== deployerAddress) {
    throw new Error('Presale.owner must still be DEPLOYER_ADDRESS before this handover script runs.');
  }
  if (!(await vault.hasRole(await vault.DEFAULT_ADMIN_ROLE(), deployerAddress))) {
    throw new Error('DEPLOYER_ADDRESS must still hold VestingVault DEFAULT_ADMIN_ROLE before this handover script runs.');
  }

  if (normalizeAddress(await presale.treasury(), 'Presale.treasury') !== finalAsmTreasury) {
    await maybeWait('setTreasury', presale.setTreasury(finalAsmTreasury));
  }
  if ((await presale.saleStart()) !== expectedSaleStart || (await presale.saleEnd()) !== expectedSaleEnd) {
    await maybeWait('setSaleWindow', presale.setSaleWindow(expectedSaleStart, expectedSaleEnd));
  }
  if ((await presale.ukiPerAsm()) !== expectedUkiPerAsm) {
    await maybeWait('setUkiPerAsm', presale.setUkiPerAsm(expectedUkiPerAsm));
  }
  if ((await presale.minAsmPerPurchase()) !== expectedMinAsmPerPurchase) {
    await maybeWait('setMinAsmPerPurchase', presale.setMinAsmPerPurchase(expectedMinAsmPerPurchase));
  }
  if ((await presale.totalUkiForSale()) !== expectedTotalUkiForSale) {
    await maybeWait('setTotalUkiForSale', presale.setTotalUkiForSale(expectedTotalUkiForSale));
  }
  if ((await presale.saleEnabled()) !== targetSaleEnabled) {
    await maybeWait('setSaleEnabled', presale.setSaleEnabled(targetSaleEnabled));
  }

  if ((await vault.presaleVestingStart()) !== expectedVestingStart || (await vault.presaleVestingDuration()) !== expectedVestingDuration) {
    if (await vault.presaleVestingConfigFrozen()) throw new Error('Vesting config is already frozen and does not match expected values.');
    await maybeWait('setPresaleVestingConfig', vault.setPresaleVestingConfig(expectedVestingStart, expectedVestingDuration));
  }
  if ((await vault.unallocatedWithdrawalUnlockTime()) !== expectedSaleEnd) {
    throw new Error('VestingVault.unallocatedWithdrawalUnlockTime is immutable and must equal SALE_END. Redeploy if it does not match.');
  }

  const presaleRole = await vault.PRESALE_VESTING_ROLE();
  const allocationRole = await vault.ALLOCATION_MANAGER_ROLE();
  const defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();

  if (!(await vault.hasRole(presaleRole, presaleAddress))) {
    await maybeWait('grant PRESALE_VESTING_ROLE to Presale', vault.grantRole(presaleRole, presaleAddress));
  }

  const allocationMembersBefore = await roleMembers(vault, allocationRole);
  for (const member of allocationMembersBefore) {
    if (allocationManager && member === allocationManager) continue;
    await maybeWait(`revoke ALLOCATION_MANAGER_ROLE from ${member}`, vault.revokeRole(allocationRole, member));
  }
  if (allocationManager && !(await vault.hasRole(allocationRole, allocationManager))) {
    await maybeWait('grant ALLOCATION_MANAGER_ROLE', vault.grantRole(allocationRole, allocationManager));
  }

  const remainderSigner = await signerForRemainderSource(deployer, remainderSource);
  const remainderBalance = await uki.balanceOf(remainderSource);
  if (remainderBalance > 0n && remainderSource !== remainderReceiver) {
    await maybeWait('transfer remaining UKI', uki.connect(remainderSigner).transfer(remainderReceiver, remainderBalance));
  }

  if (normalizeAddress(await uki.owner(), 'UKIToken.owner') !== safeOwner) {
    await maybeWait('transfer UKIToken ownership', uki.transferOwnership(safeOwner));
  }
  if (normalizeAddress(await presale.owner(), 'Presale.owner') !== safeOwner) {
    await maybeWait('transfer Presale ownership', presale.transferOwnership(safeOwner));
  }
  if (!(await vault.hasRole(defaultAdminRole, safeOwner))) {
    await maybeWait('grant DEFAULT_ADMIN_ROLE to Safe', vault.grantRole(defaultAdminRole, safeOwner));
  }
  if (await vault.hasRole(defaultAdminRole, deployerAddress)) {
    await maybeWait('revoke DEFAULT_ADMIN_ROLE from deployer', vault.revokeRole(defaultAdminRole, deployerAddress));
  }

  const finalDefaultAdmins = await roleMembers(vault, defaultAdminRole);
  const finalPresaleRoleMembers = await roleMembers(vault, presaleRole);
  const finalAllocationRoleMembers = await roleMembers(vault, allocationRole);
  const expectedAllocationMembers = allocationManager ? [allocationManager] : [];

  const finalChecks = {
    ukiOwner: normalizeAddress(await uki.owner(), 'UKIToken.owner'),
    presaleOwner: normalizeAddress(await presale.owner(), 'Presale.owner'),
    defaultAdmins: finalDefaultAdmins,
    presaleRoleMembers: finalPresaleRoleMembers,
    allocationRoleMembers: finalAllocationRoleMembers,
    treasury: normalizeAddress(await presale.treasury(), 'Presale.treasury'),
    saleEnabled: await presale.saleEnabled(),
    deployerUkiBalance: (await uki.balanceOf(deployerAddress)).toString(),
    remainderSourceBalance: (await uki.balanceOf(remainderSource)).toString(),
    remainderReceiverBalance: (await uki.balanceOf(remainderReceiver)).toString(),
  };

  if (finalChecks.ukiOwner !== safeOwner) throw new Error('Final UKIToken owner is not SAFE_OWNER_ADDRESS.');
  if (finalChecks.presaleOwner !== safeOwner) throw new Error('Final Presale owner is not SAFE_OWNER_ADDRESS.');
  if (!sameAddressSet(finalDefaultAdmins, [safeOwner])) throw new Error(`Final DEFAULT_ADMIN_ROLE mismatch: ${finalDefaultAdmins}`);
  if (!sameAddressSet(finalPresaleRoleMembers, [presaleAddress])) throw new Error(`Final PRESALE_VESTING_ROLE mismatch: ${finalPresaleRoleMembers}`);
  if (!sameAddressSet(finalAllocationRoleMembers, expectedAllocationMembers)) throw new Error(`Final ALLOCATION_MANAGER_ROLE mismatch: ${finalAllocationRoleMembers}`);

  console.log(JSON.stringify({
    script: 'safe-handover-mainnet.cjs',
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployerAddress,
    safeOwner,
    finalAsmTreasury,
    remainderSource,
    remainderReceiver,
    contracts: {
      ukiToken: ukiTokenAddress,
      vestingVault: vaultAddress,
      presale: presaleAddress,
    },
    finalChecks,
    nextPhase: [
      'Run preflight:presale with SALE_OWNER_ADDRESS=SAFE_OWNER_ADDRESS and DEPLOYER_ADDRESS=deployer.',
      'Verify all contracts on BscScan if not already verified.',
      'Configure dapp with mainnet contract addresses.',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
