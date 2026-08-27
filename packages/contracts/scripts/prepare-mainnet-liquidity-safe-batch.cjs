const fs = require('node:fs');
const path = require('node:path');

const hre = require('hardhat');

const {
  BSC_MAINNET_CHAIN_ID,
  LOCK_DURATION_SECONDS,
  MAINNET_ASM,
  MAINNET_PRESALE,
  MAINNET_UKI,
  MAINNET_USDT,
  PANCAKE_V2_FACTORY,
  PANCAKE_V2_ROUTER,
  PRICE_DECIMALS,
  buildSafeLiquidityBatch,
  calculateLiquidityQuoteFromRaw,
  deviationBps,
  normalizeAddress,
  positiveBigInt,
  positiveDecimal,
} = require('./lib/mainnet-uki-launch.cjs');

const ERC20_ABI = [
  'function allowance(address,address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];
const FACTORY_ABI = [
  'function createPair(address,address) returns (address)',
  'function getPair(address,address) view returns (address)',
];
const LOCKER_ABI = [
  'function LOCK_DURATION() view returns (uint64)',
  'function lpToken() view returns (address)',
  'function owner() view returns (address)',
  'function unlockTime() view returns (uint64)',
];
const PAIR_ABI = [
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
];
const PRESALE_ABI = ['function totalAsmRaised() view returns (uint256)'];
const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
];
const STAKING_ABI = [
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function ukiToken() view returns (address)',
];
function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to prepare the Safe liquidity batch.`);
  return value;
}

function optionalEnv(name) {
  return process.env[name]?.trim() || null;
}

async function assertCode(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') throw new Error(`${label} has no bytecode at ${address}.`);
}

function writeBatch(batch) {
  const requestedPath = optionalEnv('SAFE_BATCH_OUTPUT_PATH');
  if (!requestedPath) return null;
  const outputPath = path.resolve(requestedPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(batch, null, 2)}\n`, {
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
      `This batch generator is BSC Mainnet-only. Current network=${hre.network.name}, chainId=${network.chainId}.`,
    );
  }
  const safeAddress = normalizeAddress(
    requireEnv('MAINNET_LAUNCH_SAFE_ADDRESS'),
    'MAINNET_LAUNCH_SAFE_ADDRESS',
  );
  const expectedSafeOwner = normalizeAddress(
    requireEnv('MAINNET_LAUNCH_SAFE_OWNER_ADDRESS'),
    'MAINNET_LAUNCH_SAFE_OWNER_ADDRESS',
  );
  const stakingAddress = normalizeAddress(
    requireEnv('UKI_STAKING_ADDRESS'),
    'UKI_STAKING_ADDRESS',
  );
  const lockerAddress = normalizeAddress(
    requireEnv('LIQUIDITY_LOCKER_ADDRESS'),
    'LIQUIDITY_LOCKER_ADDRESS',
  );
  const snapshotBlockNumber = Number(requireEnv('MAINNET_LIQUIDITY_SNAPSHOT_BLOCK'));
  if (!Number.isSafeInteger(snapshotBlockNumber) || snapshotBlockNumber <= 0) {
    throw new Error('MAINNET_LIQUIDITY_SNAPSHOT_BLOCK must be a positive safe integer.');
  }
  const approvedAsmPriceUsdRaw = positiveDecimal(
    requireEnv('ASM_REFERENCE_PRICE_USD'),
    'ASM_REFERENCE_PRICE_USD',
  );
  const maxPriceDeviationBps = optionalEnv('ASM_REFERENCE_MAX_DEVIATION_BPS')
    ? positiveBigInt(optionalEnv('ASM_REFERENCE_MAX_DEVIATION_BPS'), 'ASM_REFERENCE_MAX_DEVIATION_BPS')
    : 100n;
  if (maxPriceDeviationBps > 1_000n) {
    throw new Error('ASM_REFERENCE_MAX_DEVIATION_BPS cannot exceed 1000 (10%).');
  }
  const deadlineSeconds = optionalEnv('SAFE_BATCH_DEADLINE_SECONDS')
    ? Number(optionalEnv('SAFE_BATCH_DEADLINE_SECONDS'))
    : 1_800;
  if (!Number.isSafeInteger(deadlineSeconds) || deadlineSeconds < 600 || deadlineSeconds > 7_200) {
    throw new Error('SAFE_BATCH_DEADLINE_SECONDS must be an integer between 600 and 7200.');
  }

  await Promise.all([
    assertCode(safeAddress, 'Launch Safe'),
    assertCode(stakingAddress, 'UKIStaking'),
    assertCode(lockerAddress, 'SixMonthLiquidityLocker'),
  ]);
  const safe = new hre.ethers.Contract(safeAddress, SAFE_ABI, hre.ethers.provider);
  const staking = new hre.ethers.Contract(stakingAddress, STAKING_ABI, hre.ethers.provider);
  const locker = new hre.ethers.Contract(lockerAddress, LOCKER_ABI, hre.ethers.provider);
  const factory = new hre.ethers.Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, hre.ethers.provider);
  const asm = new hre.ethers.Contract(MAINNET_ASM, ERC20_ABI, hre.ethers.provider);
  const uki = new hre.ethers.Contract(MAINNET_UKI, ERC20_ABI, hre.ethers.provider);
  const presale = new hre.ethers.Contract(MAINNET_PRESALE, PRESALE_ABI, hre.ethers.provider);
  const [
    owners,
    threshold,
    stakingOwner,
    stakingPaused,
    stakingToken,
    lockerOwner,
    lockerLpToken,
    lockerUnlockTime,
    lockerDuration,
    totalAsmRaisedRaw,
  ] = await Promise.all([
    safe.getOwners(),
    safe.getThreshold(),
    staking.owner(),
    staking.paused(),
    staking.ukiToken(),
    locker.owner(),
    locker.lpToken(),
    locker.unlockTime(),
    locker.LOCK_DURATION(),
    presale.totalAsmRaised({ blockTag: snapshotBlockNumber }),
  ]);
  if (owners.length !== 1 || threshold !== 1n) {
    throw new Error(`Launch Safe must be 1/1. Observed owners=${owners.length}, threshold=${threshold}.`);
  }
  if (normalizeAddress(owners[0], 'Safe owner') !== expectedSafeOwner) {
    throw new Error(`Launch Safe owner mismatch: ${owners[0]}.`);
  }
  if (
    normalizeAddress(stakingOwner, 'UKIStaking.owner') !== safeAddress ||
    normalizeAddress(stakingToken, 'UKIStaking.ukiToken') !== MAINNET_UKI ||
    stakingPaused
  ) {
    throw new Error('UKIStaking owner, token or pause state is not launch-ready.');
  }
  if (
    normalizeAddress(lockerOwner, 'LiquidityLocker.owner') !== safeAddress ||
    lockerDuration !== LOCK_DURATION_SECONDS
  ) {
    throw new Error('Liquidity locker beneficiary or 180-day duration mismatch.');
  }
  const [latest, snapshotBlock] = await Promise.all([
    hre.ethers.provider.getBlock('latest'),
    hre.ethers.provider.getBlock(snapshotBlockNumber),
  ]);
  if (!latest || !snapshotBlock?.hash) throw new Error('Current or snapshot BSC block is unavailable.');
  const snapshotConfirmations = latest.number - snapshotBlockNumber + 1;
  if (snapshotConfirmations < 12) {
    throw new Error(`Liquidity snapshot has only ${snapshotConfirmations}/12 confirmations.`);
  }
  if (lockerUnlockTime <= BigInt(latest.timestamp)) throw new Error('Liquidity locker is already mature.');

  const pairBefore = await factory.getPair(MAINNET_ASM, MAINNET_UKI);
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
  if (normalizeAddress(lockerLpToken, 'LiquidityLocker.lpToken') !== pairAddress) {
    throw new Error(`Locker LP token ${lockerLpToken} does not match expected pair ${pairAddress}.`);
  }

  const asmUsdtPairAddress = normalizeAddress(
    await factory.getPair(MAINNET_ASM, MAINNET_USDT, { blockTag: snapshotBlockNumber }),
    'ASM/USDT PancakeSwap V2 pair at snapshot',
  );
  const asmUsdtPair = new hre.ethers.Contract(asmUsdtPairAddress, PAIR_ABI, hre.ethers.provider);
  const [referenceToken0, referenceToken1, referenceReserves] = await Promise.all([
    asmUsdtPair.token0({ blockTag: snapshotBlockNumber }),
    asmUsdtPair.token1({ blockTag: snapshotBlockNumber }),
    asmUsdtPair.getReserves({ blockTag: snapshotBlockNumber }),
  ]);
  const normalizedReferenceToken0 = normalizeAddress(referenceToken0, 'ASM/USDT token0');
  const normalizedReferenceToken1 = normalizeAddress(referenceToken1, 'ASM/USDT token1');
  if (![
    `${MAINNET_ASM}:${MAINNET_USDT}`,
    `${MAINNET_USDT}:${MAINNET_ASM}`,
  ].includes(`${normalizedReferenceToken0}:${normalizedReferenceToken1}`)) {
    throw new Error(`Unexpected ASM/USDT token ordering at snapshot: ${referenceToken0}/${referenceToken1}.`);
  }
  const asmIsToken0 = normalizedReferenceToken0 === MAINNET_ASM;
  const asmReserve = asmIsToken0 ? referenceReserves[0] : referenceReserves[1];
  const usdtReserve = asmIsToken0 ? referenceReserves[1] : referenceReserves[0];
  if (asmReserve === 0n || usdtReserve === 0n) throw new Error('ASM/USDT snapshot pool is empty.');
  const asmSpotPriceUsdRaw = usdtReserve * 10n ** BigInt(PRICE_DECIMALS) / asmReserve;
  const priceDeviationBps = deviationBps(approvedAsmPriceUsdRaw, asmSpotPriceUsdRaw);
  if (priceDeviationBps > maxPriceDeviationBps) {
    throw new Error(
      `Approved ASM price differs from the snapshot spot by ${priceDeviationBps} bps; maximum is ${maxPriceDeviationBps}.`,
    );
  }
  const quote = calculateLiquidityQuoteFromRaw({
    totalAsmRaisedRaw,
    asmReferencePriceUsdRaw: asmSpotPriceUsdRaw,
  });
  const [safeAsmRaw, safeUkiRaw, asmAllowanceRaw, ukiAllowanceRaw] = await Promise.all([
    asm.balanceOf(safeAddress),
    uki.balanceOf(safeAddress),
    asm.allowance(safeAddress, PANCAKE_V2_ROUTER),
    uki.allowance(safeAddress, PANCAKE_V2_ROUTER),
  ]);
  if (safeAsmRaw < quote.asmAmountRaw) {
    throw new Error(`Safe needs ${quote.asmAmount} ASM; current balance is ${hre.ethers.formatUnits(safeAsmRaw, 18)}.`);
  }
  if (safeUkiRaw < quote.ukiAmountRaw) {
    throw new Error(`Safe needs ${quote.ukiAmount} UKI; current balance is ${hre.ethers.formatUnits(safeUkiRaw, 18)}.`);
  }

  const deadline = BigInt(latest.timestamp) + BigInt(deadlineSeconds);
  const batch = buildSafeLiquidityBatch({
    safeAddress,
    lockerAddress,
    asmAmountRaw: quote.asmAmountRaw,
    ukiAmountRaw: quote.ukiAmountRaw,
    deadline,
    asmAllowanceRaw,
    ukiAllowanceRaw,
  });
  const outputPath = writeBatch(batch);
  const encodedTransactions = batch.transactions.map((transaction, index) => ({
    index,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
    method: transaction.contractMethod.name,
    inputs: transaction.contractInputsValues,
  }));

  console.log(JSON.stringify({
    schema: 'cukies.uki-mainnet-safe-liquidity-batch.v1',
    network: hre.network.name,
    chainId: Number(network.chainId),
    safe: safeAddress,
    pair: pairAddress,
    locker: lockerAddress,
    unlockTime: lockerUnlockTime.toString(),
    unlockTimeIso: new Date(Number(lockerUnlockTime) * 1_000).toISOString(),
    immutableQuoteSnapshot: {
      blockNumber: snapshotBlockNumber,
      blockHash: snapshotBlock.hash,
      confirmations: snapshotConfirmations,
      totalAsmRaisedRaw: totalAsmRaisedRaw.toString(),
      asmUsdtPair: asmUsdtPairAddress,
      asmSpotPriceUsdRaw: asmSpotPriceUsdRaw.toString(),
      asmSpotPriceUsd: quote.asmReferencePriceUsd,
      approvedSanityPriceUsd: hre.ethers.formatUnits(approvedAsmPriceUsdRaw, PRICE_DECIMALS),
      priceDeviationBps: priceDeviationBps.toString(),
    },
    targetUkiPriceUsd: quote.ukiTargetPriceUsd,
    asmAmount: quote.asmAmount,
    ukiAmount: quote.ukiAmount,
    asmAmountRaw: quote.asmAmountRaw.toString(),
    ukiAmountRaw: quote.ukiAmountRaw.toString(),
    deadline: deadline.toString(),
    deadlineIso: new Date(Number(deadline) * 1_000).toISOString(),
    batchOutputPath: outputPath,
    transactionCount: encodedTransactions.length,
    transactions: encodedTransactions,
    reviewRequirements: [
      `Every approval spender must be ${PANCAKE_V2_ROUTER}.`,
      `Both amountMin fields must equal the desired amounts.`,
      `The LP recipient must be the locker ${lockerAddress}.`,
      'Do not sign after the printed deadline; regenerate the batch instead.',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
