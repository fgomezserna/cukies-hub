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

function optionalEnv(name) {
  const value = process.env[name];
  return value && value !== '' ? value : null;
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

function normalizeAddress(value, envName) {
  try {
    return hre.ethers.getAddress(value);
  } catch (_error) {
    throw new Error(`${envName} must be a valid address. Received: ${value}`);
  }
}

function approvedAsmTokenForChain() {
  const approved = APPROVED_ASM_TOKEN_BY_CHAIN_ID[hre.network.config.chainId];
  return approved ? normalizeAddress(approved, 'APPROVED_ASM_TOKEN') : null;
}

async function roleMembers(contract, role) {
  const count = await contract.getRoleMemberCount(role);
  const members = [];
  for (let index = 0n; index < count; index++) {
    members.push(normalizeAddress(await contract.getRoleMember(role, index), `role ${role} member ${index}`));
  }
  return members.sort();
}

function sameAddressSet(actual, expected) {
  const normalizedActual = actual.map((address) => normalizeAddress(address, 'actual role member')).sort();
  const normalizedExpected = expected.map((address) => normalizeAddress(address, 'expected role member')).sort();
  return JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected);
}

async function main() {
  const expectedOwner = normalizeAddress(requireEnv('SALE_OWNER_ADDRESS'), 'SALE_OWNER_ADDRESS');
  const expectedTreasury = normalizeAddress(requireEnv('SALE_TREASURY_ADDRESS'), 'SALE_TREASURY_ADDRESS');
  const expectedAsmToken = normalizeAddress(requireEnv('ASM_TOKEN_ADDRESS'), 'ASM_TOKEN_ADDRESS');
  const expectedUkiToken = normalizeAddress(requireEnv('UKI_TOKEN_ADDRESS'), 'UKI_TOKEN_ADDRESS');
  const presaleAddress = normalizeAddress(requireEnv('UKI_PRESALE_ADDRESS'), 'UKI_PRESALE_ADDRESS');
  const vaultAddress = normalizeAddress(requireEnv('UKI_VESTING_VAULT_ADDRESS'), 'UKI_VESTING_VAULT_ADDRESS');
  const expectedSaleStart = requireUint('SALE_START');
  const expectedSaleEnd = requireUint('SALE_END');
  const expectedVestingStart = requireUint('VESTING_START');
  const expectedVestingDuration = requireUint('VESTING_DURATION');
  const expectedUkiPerAsm = requireUint('UKI_PER_ASM');
  const expectedMinAsmPerPurchase = requireUint('MIN_ASM_PER_PURCHASE');
  const expectedTotalUkiForSale = requireUint('TOTAL_UKI_FOR_SALE');
  const expectedSaleEnabled = optionalEnv('SALE_ENABLED');
  const expectedVestingConfigFrozen = optionalEnv('VESTING_CONFIG_FROZEN');

  const Presale = await hre.ethers.getContractFactory('Presale');
  const VestingVault = await hre.ethers.getContractFactory('VestingVault');
  const UKIToken = await hre.ethers.getContractFactory('UKIToken');
  const presale = Presale.attach(presaleAddress);
  const vault = VestingVault.attach(vaultAddress);
  const uki = UKIToken.attach(expectedUkiToken);

  const checks = [];
  function record(name, ok, details) {
    checks.push({ name, ok, details });
  }

  const presaleOwner = normalizeAddress(await presale.owner(), 'Presale.owner');
  const ukiOwner = normalizeAddress(await uki.owner(), 'UKIToken.owner');
  const treasury = normalizeAddress(await presale.treasury(), 'Presale.treasury');
  const presaleAsmToken = normalizeAddress(await presale.asmToken(), 'Presale.asmToken');
  const presaleVault = normalizeAddress(await presale.vestingVault(), 'Presale.vestingVault');
  const vaultUkiToken = normalizeAddress(await vault.ukiToken(), 'VestingVault.ukiToken');
  const saleStart = await presale.saleStart();
  const saleEnd = await presale.saleEnd();
  const vestingStart = await vault.presaleVestingStart();
  const vestingDuration = await vault.presaleVestingDuration();
  const unallocatedWithdrawalUnlockTime = await vault.unallocatedWithdrawalUnlockTime();
  const vestingConfigFrozen = await vault.presaleVestingConfigFrozen();
  const ukiPerAsm = await presale.ukiPerAsm();
  const minAsmPerPurchase = await presale.minAsmPerPurchase();
  const totalUkiForSale = await presale.totalUkiForSale();
  const saleEnabled = await presale.saleEnabled();
  const unallocatedBalance = await vault.unallocatedBalance();
  const presaleRole = await vault.PRESALE_VESTING_ROLE();
  const allocationRole = await vault.ALLOCATION_MANAGER_ROLE();
  const defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();
  const allocationManagerAddress = optionalEnv('ALLOCATION_MANAGER_ADDRESS');
  const deployerAddress = optionalEnv('DEPLOYER_ADDRESS');
  const approvedAsmToken = approvedAsmTokenForChain();
  const expectedAllocationMembers = allocationManagerAddress
    ? [normalizeAddress(allocationManagerAddress, 'ALLOCATION_MANAGER_ADDRESS')]
    : [];
  const defaultAdminMembers = await roleMembers(vault, defaultAdminRole);
  const presaleRoleMembers = await roleMembers(vault, presaleRole);
  const allocationRoleMembers = await roleMembers(vault, allocationRole);

  record('presale owner matches SALE_OWNER_ADDRESS', presaleOwner === expectedOwner, `${presaleOwner} expected ${expectedOwner}`);
  record('UKI owner matches SALE_OWNER_ADDRESS', ukiOwner === expectedOwner, `${ukiOwner} expected ${expectedOwner}`);
  record('vault admin matches SALE_OWNER_ADDRESS', await vault.hasRole(defaultAdminRole, expectedOwner), expectedOwner);
  record(
    'vault DEFAULT_ADMIN_ROLE has exactly SALE_OWNER_ADDRESS',
    sameAddressSet(defaultAdminMembers, [expectedOwner]),
    `${defaultAdminMembers.join(',')} expected ${expectedOwner}`
  );
  record('treasury matches SALE_TREASURY_ADDRESS', treasury === expectedTreasury, `${treasury} expected ${expectedTreasury}`);
  record('presale ASM token matches ASM_TOKEN_ADDRESS', presaleAsmToken === expectedAsmToken, `${presaleAsmToken} expected ${expectedAsmToken}`);
  if (approvedAsmToken) {
    record('ASM_TOKEN_ADDRESS matches approved token for chain', expectedAsmToken === approvedAsmToken, `${expectedAsmToken} expected ${approvedAsmToken}`);
  } else {
    record('approved ASM token exists for chain', false, `chain id ${hre.network.config.chainId}`);
  }
  record('presale points to expected vault', presaleVault === vaultAddress, `${presaleVault} expected ${vaultAddress}`);
  record('vault points to expected UKI token', vaultUkiToken === expectedUkiToken, `${vaultUkiToken} expected ${expectedUkiToken}`);
  record('saleStart matches SALE_START', saleStart === expectedSaleStart, `${saleStart} expected ${expectedSaleStart}`);
  record('saleEnd matches SALE_END', saleEnd === expectedSaleEnd, `${saleEnd} expected ${expectedSaleEnd}`);
  record('vault presaleVestingStart matches VESTING_START', vestingStart === expectedVestingStart, `${vestingStart} expected ${expectedVestingStart}`);
  record('vault presaleVestingDuration matches VESTING_DURATION', vestingDuration === expectedVestingDuration, `${vestingDuration} expected ${expectedVestingDuration}`);
  record(
    'vault unallocated withdrawal unlock matches SALE_END',
    unallocatedWithdrawalUnlockTime === expectedSaleEnd,
    `${unallocatedWithdrawalUnlockTime} expected ${expectedSaleEnd}`
  );
  record('ukiPerAsm matches UKI_PER_ASM', ukiPerAsm === expectedUkiPerAsm, `${ukiPerAsm} expected ${expectedUkiPerAsm}`);
  record('minAsmPerPurchase matches MIN_ASM_PER_PURCHASE', minAsmPerPurchase === expectedMinAsmPerPurchase, `${minAsmPerPurchase} expected ${expectedMinAsmPerPurchase}`);
  record('totalUkiForSale matches TOTAL_UKI_FOR_SALE', totalUkiForSale === expectedTotalUkiForSale, `${totalUkiForSale} expected ${expectedTotalUkiForSale}`);
  if (expectedSaleEnabled !== null) {
    record(
      'sale enabled matches SALE_ENABLED',
      saleEnabled === (expectedSaleEnabled === 'true'),
      `${saleEnabled} expected ${expectedSaleEnabled}`
    );
  }
  if (expectedVestingConfigFrozen !== null) {
    record(
      'vault presale vesting freeze matches VESTING_CONFIG_FROZEN',
      vestingConfigFrozen === (expectedVestingConfigFrozen === 'true'),
      `${vestingConfigFrozen} expected ${expectedVestingConfigFrozen}`
    );
  }
  record('presale has PRESALE_VESTING_ROLE', await vault.hasRole(presaleRole, presaleAddress), presaleAddress);
  record(
    'vault PRESALE_VESTING_ROLE has exactly Presale',
    sameAddressSet(presaleRoleMembers, [presaleAddress]),
    `${presaleRoleMembers.join(',')} expected ${presaleAddress}`
  );
  record('presale does not have ALLOCATION_MANAGER_ROLE', !(await vault.hasRole(allocationRole, presaleAddress)), presaleAddress);
  if (allocationManagerAddress) {
    const allocationManager = normalizeAddress(allocationManagerAddress, 'ALLOCATION_MANAGER_ADDRESS');
    record('allocation manager has ALLOCATION_MANAGER_ROLE', await vault.hasRole(allocationRole, allocationManager), allocationManager);
  }
  record(
    allocationManagerAddress
      ? 'vault ALLOCATION_MANAGER_ROLE has exactly ALLOCATION_MANAGER_ADDRESS'
      : 'vault ALLOCATION_MANAGER_ROLE is empty',
    sameAddressSet(allocationRoleMembers, expectedAllocationMembers),
    `${allocationRoleMembers.join(',')} expected ${expectedAllocationMembers.join(',')}`
  );
  if (deployerAddress) {
    const deployer = normalizeAddress(deployerAddress, 'DEPLOYER_ADDRESS');
    record('deployer is not UKI owner', ukiOwner !== deployer, deployer);
    record('deployer is not Presale owner', presaleOwner !== deployer, deployer);
    record('deployer does not have DEFAULT_ADMIN_ROLE', !(await vault.hasRole(defaultAdminRole, deployer)), deployer);
    record('deployer does not have PRESALE_VESTING_ROLE', !(await vault.hasRole(presaleRole, deployer)), deployer);
    record('deployer does not have ALLOCATION_MANAGER_ROLE', !(await vault.hasRole(allocationRole, deployer)), deployer);
  }
  record('vault has enough unallocated UKI for sale cap', unallocatedBalance >= totalUkiForSale, `${unallocatedBalance} >= ${totalUkiForSale}`);
  record('vesting starts at or after sale end', vestingStart >= saleEnd, `${vestingStart} >= ${saleEnd}`);
  record('presale is not paused', !(await presale.paused()), 'Presale.paused() must be false before opening');
  record('UKI token is not paused', !(await uki.paused()), 'UKIToken.paused() must be false before opening');

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({
    network: hre.network.name,
    presale: presaleAddress,
    vestingVault: vaultAddress,
    checks,
    ready: failed.length === 0,
  }, null, 2));

  if (failed.length > 0) {
    throw new Error(`Presale preflight failed: ${failed.map((check) => check.name).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
