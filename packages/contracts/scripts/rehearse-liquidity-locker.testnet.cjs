const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97n;
const PANCAKE_V2_FACTORY = '0x6725F303b657a9451d8BA641348b6761A6CC7a17';
const PANCAKE_V2_ROUTER = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
const TESTNET_ASM = '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C';
const TESTNET_UKI = '0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c';
const ASM_AMOUNT = hre.ethers.parseUnits('0.1', 18);
const UKI_AMOUNT = hre.ethers.parseUnits('60', 18);
const DEFAULT_UNLOCK_DELAY_SECONDS = 180n;

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];
const FACTORY_ABI = [
  'function getPair(address,address) view returns (address)',
];
const ROUTER_ABI = [
  'function factory() view returns (address)',
  'function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)',
];
const PAIR_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112,uint112,uint32)',
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the BSC Testnet liquidity-lock rehearsal.`);
  return value;
}

function address(value, label) {
  try {
    const normalized = hre.ethers.getAddress(value);
    if (normalized === hre.ethers.ZeroAddress) throw new Error('zero address');
    return normalized;
  } catch (_error) {
    throw new Error(`${label} must be a valid non-zero EVM address.`);
  }
}

async function waitForSuccess(transaction, label, confirmations = 1) {
  const receipt = await transaction.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed.`);
  return receipt;
}

async function approveExact(token, owner, spender, amount, label) {
  const current = await token.allowance(owner, spender);
  if (current !== 0n) {
    await waitForSuccess(await token.approve(spender, 0), `${label} allowance reset`);
  }
  return waitForSuccess(await token.approve(spender, amount), `${label} approval`);
}

function revertData(error) {
  if (!error || typeof error !== 'object') return null;
  if (typeof error.data === 'string') return error.data;
  if (error.data && typeof error.data.data === 'string') return error.data.data;
  if (error.error) return revertData(error.error);
  return null;
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== 'bscTestnet' || network.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `This rehearsal is BSC Testnet-only. Current network=${hre.network.name}, chainId=${network.chainId}`,
    );
  }
  if (requireEnv('LIQUIDITY_LOCK_TESTNET_CONFIRM') !== 'CREATE_PANCAKE_V2_TEST_LP_AND_LOCK') {
    throw new Error(
      'LIQUIDITY_LOCK_TESTNET_CONFIRM must be CREATE_PANCAKE_V2_TEST_LP_AND_LOCK.',
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');
  const deployerAddress = address(deployer.address, 'deployer');
  const expectedDeployer = address(requireEnv('DEPLOYER_ADDRESS'), 'DEPLOYER_ADDRESS');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch: signer is ${deployerAddress}.`);
  }

  const beneficiary = process.env.LIQUIDITY_LOCK_BENEFICIARY
    ? address(process.env.LIQUIDITY_LOCK_BENEFICIARY, 'LIQUIDITY_LOCK_BENEFICIARY')
    : deployerAddress;
  if (beneficiary !== deployerAddress) {
    throw new Error('This full release rehearsal requires LIQUIDITY_LOCK_BENEFICIARY=DEPLOYER_ADDRESS.');
  }

  const unlockDelay = process.env.LIQUIDITY_LOCK_TEST_DELAY_SECONDS
    ? BigInt(process.env.LIQUIDITY_LOCK_TEST_DELAY_SECONDS)
    : DEFAULT_UNLOCK_DELAY_SECONDS;
  if (unlockDelay < 120n || unlockDelay > 900n) {
    throw new Error('LIQUIDITY_LOCK_TEST_DELAY_SECONDS must be between 120 and 900 seconds.');
  }

  const routerAddress = address(PANCAKE_V2_ROUTER, 'Pancake V2 router');
  const factoryAddress = address(PANCAKE_V2_FACTORY, 'Pancake V2 factory');
  const asmAddress = address(TESTNET_ASM, 'tASM');
  const ukiAddress = address(TESTNET_UKI, 'tUKI');
  const router = new hre.ethers.Contract(routerAddress, ROUTER_ABI, deployer);
  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, deployer);
  const asm = new hre.ethers.Contract(asmAddress, ERC20_ABI, deployer);
  const uki = new hre.ethers.Contract(ukiAddress, ERC20_ABI, deployer);

  const [routerFactory, asmDecimals, ukiDecimals, asmBalance, ukiBalance] = await Promise.all([
    router.factory(),
    asm.decimals(),
    uki.decimals(),
    asm.balanceOf(deployerAddress),
    uki.balanceOf(deployerAddress),
  ]);
  if (address(routerFactory, 'router.factory') !== factoryAddress) {
    throw new Error(`Pancake router factory mismatch: ${routerFactory}.`);
  }
  if (asmDecimals !== 18n || ukiDecimals !== 18n) {
    throw new Error(`Unexpected token decimals: tASM=${asmDecimals}, tUKI=${ukiDecimals}.`);
  }
  if (asmBalance < ASM_AMOUNT || ukiBalance < UKI_AMOUNT) {
    throw new Error('The testnet deployer lacks the required 0.1 tASM or 60 tUKI.');
  }

  const pairBefore = await factory.getPair(asmAddress, ukiAddress);
  if (pairBefore !== hre.ethers.ZeroAddress) {
    throw new Error(
      `The tASM/tUKI Pancake V2 pair already exists at ${pairBefore}. `
      + 'Use a purpose-built existing-pair rehearsal instead of changing its price.',
    );
  }

  const asmApprovalReceipt = await approveExact(
    asm,
    deployerAddress,
    routerAddress,
    ASM_AMOUNT,
    'tASM',
  );
  const ukiApprovalReceipt = await approveExact(
    uki,
    deployerAddress,
    routerAddress,
    UKI_AMOUNT,
    'tUKI',
  );

  const latestBeforeLiquidity = await hre.ethers.provider.getBlock('latest');
  const deadline = BigInt(latestBeforeLiquidity.timestamp) + 600n;
  const liquidityTx = await router.addLiquidity(
    asmAddress,
    ukiAddress,
    ASM_AMOUNT,
    UKI_AMOUNT,
    ASM_AMOUNT,
    UKI_AMOUNT,
    deployerAddress,
    deadline,
  );
  const liquidityReceipt = await waitForSuccess(liquidityTx, 'Pancake V2 addLiquidity');
  const pairAddress = address(await factory.getPair(asmAddress, ukiAddress), 'Pancake V2 pair');
  const pair = new hre.ethers.Contract(pairAddress, PAIR_ABI, deployer);
  const mintedLiquidity = await pair.balanceOf(deployerAddress);
  if (mintedLiquidity === 0n) throw new Error('Pancake V2 minted no LP tokens.');

  const latestBeforeDeploy = await hre.ethers.provider.getBlock('latest');
  const unlockTime = BigInt(latestBeforeDeploy.timestamp) + unlockDelay;
  const LiquidityLocker = await hre.ethers.getContractFactory('LiquidityLocker');
  const locker = await LiquidityLocker.deploy(pairAddress, beneficiary, unlockTime);
  await locker.waitForDeployment();
  const lockerAddress = address(await locker.getAddress(), 'LiquidityLocker');
  const deploymentReceipt = await waitForSuccess(
    locker.deploymentTransaction(),
    'LiquidityLocker deployment',
  );

  const lockReceipt = await waitForSuccess(
    await pair.transfer(lockerAddress, mintedLiquidity),
    'LP transfer to LiquidityLocker',
    12,
  );

  const stillLockedSelector = locker.interface.getError('LiquidityStillLocked').selector;
  let earlyReleaseRevertSelector = null;
  try {
    await locker.releaseLiquidity.staticCall();
    throw new Error('Early release unexpectedly succeeded.');
  } catch (error) {
    const data = revertData(error);
    earlyReleaseRevertSelector = data ? data.slice(0, 10) : null;
    if (earlyReleaseRevertSelector !== stillLockedSelector) {
      throw new Error(
        `Early release did not revert with LiquidityStillLocked: ${error.shortMessage || error.message}`,
      );
    }
  }

  const [token0, token1, reserves, totalSupply, lockedBalance, releasable, runtimeCode] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
    pair.totalSupply(),
    pair.balanceOf(lockerAddress),
    locker.releasableLiquidity(),
    hre.ethers.provider.getCode(lockerAddress),
  ]);
  if (lockedBalance !== mintedLiquidity || releasable !== 0n) {
    throw new Error('Post-lock balance or pre-maturity releasable amount is incorrect.');
  }
  if (await pair.balanceOf(deployerAddress) !== 0n) {
    throw new Error('The deployer still holds rehearsal LP tokens after locking.');
  }

  console.log(JSON.stringify({
    schema: 'cukies.liquidity-locker-testnet-rehearsal.v1',
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployerAddress,
    beneficiary,
    pancakeV2: {
      factory: factoryAddress,
      router: routerAddress,
      pair: pairAddress,
      token0: address(token0, 'pair.token0'),
      token1: address(token1, 'pair.token1'),
      asmAmountRaw: ASM_AMOUNT.toString(),
      ukiAmountRaw: UKI_AMOUNT.toString(),
      reserve0Raw: reserves[0].toString(),
      reserve1Raw: reserves[1].toString(),
      totalSupplyRaw: totalSupply.toString(),
      mintedAndLockedLpRaw: mintedLiquidity.toString(),
      asmApprovalTxHash: asmApprovalReceipt.hash,
      ukiApprovalTxHash: ukiApprovalReceipt.hash,
      addLiquidityTxHash: liquidityReceipt.hash,
    },
    locker: {
      address: lockerAddress,
      lpToken: address(await locker.lpToken(), 'locker.lpToken'),
      owner: address(await locker.owner(), 'locker.owner'),
      unlockTime: unlockTime.toString(),
      unlockTimeIso: new Date(Number(unlockTime) * 1000).toISOString(),
      lockedLpRaw: lockedBalance.toString(),
      releasableLpRaw: releasable.toString(),
      deploymentTxHash: deploymentReceipt.hash,
      deploymentBlock: deploymentReceipt.blockNumber,
      lockTxHash: lockReceipt.hash,
      lockBlock: lockReceipt.blockNumber,
      runtimeCodeHash: hre.ethers.keccak256(runtimeCode),
      earlyReleaseRejected: true,
      earlyReleaseRevertSelector,
    },
    nextCommand: `LIQUIDITY_LOCKER_ADDRESS=${lockerAddress} pnpm --filter @cukies/contracts complete:testnet:liquidity-locker`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
