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
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];
const LOCKER_ABI = [
  'function LOCK_DURATION() view returns (uint64)',
  'function lockedLiquidity() view returns (uint256)',
  'function lpToken() view returns (address)',
  'function owner() view returns (address)',
  'function releasableLiquidity() view returns (uint256)',
  'function unlockTime() view returns (uint64)',
];
const PAIR_ABI = [
  'event Mint(address indexed sender,uint256 amount0,uint256 amount1)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'function balanceOf(address) view returns (uint256)',
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
  'function totalStaked() view returns (uint256)',
  'function ukiToken() view returns (address)',
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for mainnet launch verification.`);
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

async function confirmedReceipt(hash, label, expectedContractAddress = null) {
  const receipt = await hre.ethers.provider.getTransactionReceipt(hash);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} receipt is missing or failed.`);
  const latest = await hre.ethers.provider.getBlockNumber();
  const confirmations = latest - receipt.blockNumber + 1;
  if (confirmations < 12) throw new Error(`${label} has only ${confirmations}/12 confirmations.`);
  if (
    expectedContractAddress &&
    normalizeAddress(receipt.contractAddress, `${label}.contractAddress`) !== expectedContractAddress
  ) {
    throw new Error(`${label} contract address mismatch: ${receipt.contractAddress}.`);
  }
  return { receipt, confirmations };
}

function writeVerificationIfRequested(verification) {
  const requestedPath = optionalEnv('MAINNET_LAUNCH_VERIFICATION_PATH');
  if (!requestedPath) return null;
  const outputPath = path.resolve(requestedPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(verification, null, 2)}\n`, {
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
      `This verification is BSC Mainnet-only. Current network=${hre.network.name}, chainId=${network.chainId}.`,
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
  const stakingAddress = normalizeAddress(requireEnv('UKI_STAKING_ADDRESS'), 'UKI_STAKING_ADDRESS');
  const lockerAddress = normalizeAddress(requireEnv('LIQUIDITY_LOCKER_ADDRESS'), 'LIQUIDITY_LOCKER_ADDRESS');
  const stakingDeploymentTxHash = requireEnv('UKI_STAKING_DEPLOYMENT_TX_HASH');
  const lockerDeploymentTxHash = requireEnv('LIQUIDITY_LOCKER_DEPLOYMENT_TX_HASH');
  const liquidityTxHash = requireEnv('LIQUIDITY_TX_HASH');
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

  const [stakingDeployment, lockerDeployment, liquidityTransaction] = await Promise.all([
    confirmedReceipt(stakingDeploymentTxHash, 'UKIStaking deployment', stakingAddress),
    confirmedReceipt(lockerDeploymentTxHash, 'Liquidity locker deployment', lockerAddress),
    confirmedReceipt(liquidityTxHash, 'Safe liquidity batch'),
  ]);
  const [latestBlock, snapshotBlock] = await Promise.all([
    hre.ethers.provider.getBlock('latest'),
    hre.ethers.provider.getBlock(snapshotBlockNumber),
  ]);
  if (!latestBlock || !snapshotBlock?.hash) throw new Error('Current or snapshot BSC block is unavailable.');
  const snapshotConfirmations = latestBlock.number - snapshotBlockNumber + 1;
  if (snapshotConfirmations < 12) {
    throw new Error(`Liquidity snapshot has only ${snapshotConfirmations}/12 confirmations.`);
  }
  if (liquidityTransaction.receipt.blockNumber < snapshotBlockNumber) {
    throw new Error('Liquidity transaction predates its immutable quote snapshot.');
  }
  const [stakingCode, lockerCode] = await Promise.all([
    assertCode(stakingAddress, 'UKIStaking'),
    assertCode(lockerAddress, 'SixMonthLiquidityLocker'),
    assertCode(safeAddress, 'Launch Safe'),
  ]);
  const factory = new hre.ethers.Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, hre.ethers.provider);
  const pairAddress = normalizeAddress(
    await factory.getPair(MAINNET_ASM, MAINNET_UKI),
    'UKI/ASM PancakeSwap V2 pair',
  );
  const pair = new hre.ethers.Contract(pairAddress, PAIR_ABI, hre.ethers.provider);
  const locker = new hre.ethers.Contract(lockerAddress, LOCKER_ABI, hre.ethers.provider);
  const staking = new hre.ethers.Contract(stakingAddress, STAKING_ABI, hre.ethers.provider);
  const safe = new hre.ethers.Contract(safeAddress, SAFE_ABI, hre.ethers.provider);
  const asm = new hre.ethers.Contract(MAINNET_ASM, ERC20_ABI, hre.ethers.provider);
  const uki = new hre.ethers.Contract(MAINNET_UKI, ERC20_ABI, hre.ethers.provider);
  const presale = new hre.ethers.Contract(MAINNET_PRESALE, PRESALE_ABI, hre.ethers.provider);
  const [
    token0,
    token1,
    reserves,
    totalSupply,
    lockerLpBalance,
    safeLpBalance,
    lockerToken,
    lockerOwner,
    lockerUnlockTime,
    lockerDuration,
    releasable,
    stakingToken,
    stakingOwner,
    stakingPaused,
    totalStaked,
    safeOwners,
    safeThreshold,
    asmAllowance,
    ukiAllowance,
    totalAsmRaisedRaw,
  ] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
    pair.totalSupply(),
    pair.balanceOf(lockerAddress),
    pair.balanceOf(safeAddress),
    locker.lpToken(),
    locker.owner(),
    locker.unlockTime(),
    locker.LOCK_DURATION(),
    locker.releasableLiquidity(),
    staking.ukiToken(),
    staking.owner(),
    staking.paused(),
    staking.totalStaked(),
    safe.getOwners(),
    safe.getThreshold(),
    asm.allowance(safeAddress, PANCAKE_V2_ROUTER),
    uki.allowance(safeAddress, PANCAKE_V2_ROUTER),
    presale.totalAsmRaised({ blockTag: snapshotBlockNumber }),
  ]);
  const normalizedToken0 = normalizeAddress(token0, 'pair.token0');
  const normalizedToken1 = normalizeAddress(token1, 'pair.token1');
  if (![
    `${MAINNET_ASM}:${MAINNET_UKI}`,
    `${MAINNET_UKI}:${MAINNET_ASM}`,
  ].includes(`${normalizedToken0}:${normalizedToken1}`)) {
    throw new Error(`Unexpected UKI/ASM pair tokens: ${normalizedToken0}/${normalizedToken1}.`);
  }
  if (
    normalizeAddress(lockerToken, 'LiquidityLocker.lpToken') !== pairAddress ||
    normalizeAddress(lockerOwner, 'LiquidityLocker.owner') !== safeAddress ||
    lockerDuration !== LOCK_DURATION_SECONDS ||
    releasable !== 0n
  ) {
    throw new Error('Liquidity locker linkage, beneficiary, duration or pre-maturity state mismatch.');
  }
  if (lockerLpBalance === 0n || safeLpBalance !== 0n || totalSupply === 0n) {
    throw new Error('LP custody invariant failed: locker must hold LP and Safe must hold none.');
  }
  if (
    normalizeAddress(stakingToken, 'UKIStaking.ukiToken') !== MAINNET_UKI ||
    normalizeAddress(stakingOwner, 'UKIStaking.owner') !== safeAddress ||
    stakingPaused
  ) {
    throw new Error('UKIStaking linkage, owner or pause state mismatch.');
  }
  if (safeOwners.length !== 1 || safeThreshold !== 1n) {
    throw new Error(`Launch Safe changed before verification: owners=${safeOwners.length}, threshold=${safeThreshold}.`);
  }
  if (normalizeAddress(safeOwners[0], 'Safe owner') !== expectedSafeOwner) {
    throw new Error(`Launch Safe owner changed before verification: ${safeOwners[0]}.`);
  }
  if (asmAllowance !== 0n || ukiAllowance !== 0n) {
    throw new Error(`Router allowances were not consumed exactly: ASM=${asmAllowance}, UKI=${ukiAllowance}.`);
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
  const mintEvents = liquidityTransaction.receipt.logs
    .filter((log) => normalizeAddress(log.address, 'liquidity log address') === pairAddress)
    .map((log) => {
      try {
        return pair.interface.parseLog(log);
      } catch (_error) {
        return null;
      }
    })
    .filter((event) => event?.name === 'Mint');
  if (mintEvents.length !== 1) throw new Error(`Expected exactly one pair Mint event, found ${mintEvents.length}.`);
  const expectedAmount0 = normalizedToken0 === MAINNET_ASM ? quote.asmAmountRaw : quote.ukiAmountRaw;
  const expectedAmount1 = normalizedToken1 === MAINNET_UKI ? quote.ukiAmountRaw : quote.asmAmountRaw;
  if (mintEvents[0].args.amount0 !== expectedAmount0 || mintEvents[0].args.amount1 !== expectedAmount1) {
    throw new Error(
      `Mint amounts mismatch: ${mintEvents[0].args.amount0}/${mintEvents[0].args.amount1}, expected ${expectedAmount0}/${expectedAmount1}.`,
    );
  }

  const verification = {
    schema: 'cukies.uki-mainnet-launch-verification.v1',
    verifiedAtBlock: await hre.ethers.provider.getBlockNumber(),
    network: hre.network.name,
    chainId: Number(network.chainId),
    safe: {
      address: safeAddress,
      owners: safeOwners.map((owner) => normalizeAddress(owner, 'Safe owner')),
      threshold: Number(safeThreshold),
    },
    staking: {
      address: stakingAddress,
      owner: safeAddress,
      paused: stakingPaused,
      totalStakedRaw: totalStaked.toString(),
      deploymentTxHash: stakingDeploymentTxHash,
      deploymentBlock: stakingDeployment.receipt.blockNumber,
      confirmations: stakingDeployment.confirmations,
      runtimeCodeHash: hre.ethers.keccak256(stakingCode),
    },
    liquidity: {
      transactionHash: liquidityTxHash,
      transactionBlock: liquidityTransaction.receipt.blockNumber,
      confirmations: liquidityTransaction.confirmations,
      pair: pairAddress,
      token0: normalizedToken0,
      token1: normalizedToken1,
      reserve0Raw: reserves[0].toString(),
      reserve1Raw: reserves[1].toString(),
      totalSupplyRaw: totalSupply.toString(),
      asmAmountRaw: quote.asmAmountRaw.toString(),
      ukiAmountRaw: quote.ukiAmountRaw.toString(),
      asmAmount: quote.asmAmount,
      ukiAmount: quote.ukiAmount,
      targetUkiPriceUsd: quote.ukiTargetPriceUsd,
      impliedUkiPriceUsd: quote.impliedUkiPriceUsd,
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
    },
    locker: {
      address: lockerAddress,
      beneficiary: safeAddress,
      lockedLpRaw: lockerLpBalance.toString(),
      releasableLpRaw: releasable.toString(),
      unlockTime: lockerUnlockTime.toString(),
      unlockTimeIso: new Date(Number(lockerUnlockTime) * 1_000).toISOString(),
      deploymentTxHash: lockerDeploymentTxHash,
      deploymentBlock: lockerDeployment.receipt.blockNumber,
      confirmations: lockerDeployment.confirmations,
      runtimeCodeHash: hre.ethers.keccak256(lockerCode),
    },
    productionEnvironment: {
      NEXT_PUBLIC_UKI_CHAIN_ID: '56',
      NEXT_PUBLIC_ASM_TOKEN_ADDRESS: MAINNET_ASM,
      NEXT_PUBLIC_UKI_TOKEN_ADDRESS: MAINNET_UKI,
      NEXT_PUBLIC_UKI_STAKING_ADDRESS: stakingAddress,
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
      CHAIN_INDEXER_UKI_STAKING_ADDRESS: stakingAddress,
      CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK: String(stakingDeployment.receipt.blockNumber),
      CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_BSC_BLOCK: String(stakingDeployment.receipt.blockNumber),
      CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_TX_HASH: stakingDeploymentTxHash,
      CHAIN_INDEXER_UKI_STAKING_RUNTIME_CODE_HASH: hre.ethers.keccak256(stakingCode),
      TREASURE_HUNT_COMPETITION_ENABLED: 'false',
      TREASURE_HUNT_COMPETITION_ID: 'uki-staking-mainnet-2026-08',
      TREASURE_HUNT_COMPETITION_RULES_VERSION: '1',
      TREASURE_HUNT_COMPETITION_ELIGIBILITY_KIND: 'uki_staking',
      TREASURE_HUNT_COMPETITION_STAKING_ADDRESS: stakingAddress,
      TREASURE_HUNT_COMPETITION_STAKE_PER_ATTEMPT_RAW: '2000000000000000000000',
      TREASURE_HUNT_COMPETITION_TOP_ATTEMPTS_PER_WALLET: '10',
      TREASURE_HUNT_COMPETITION_POINTS_PER_TICKET: '100',
      TREASURE_HUNT_COMPETITION_BASE_PRIZE_UKI_RAW: '50000000000000000000000',
      TREASURE_HUNT_COMPETITION_STAKE_PRIZE_BPS: '1000',
      TREASURE_HUNT_COMPETITION_PRIZE_PER_WINNER_UKI_RAW: '10000000000000000000000',
      TREASURE_HUNT_COMPETITION_MAX_WINS_PER_WALLET: '1',
      TREASURE_HUNT_COMPETITION_INDEXER_MAX_AGE_MS: '300000',
    },
    requiredBeforeCompetitionEnable: [
      'Append UKI_STAKING to CHAIN_INDEXER_CONTRACT_ALIASES without removing existing aliases.',
      'Deploy both dapp and the separate sybil-slayer mainnet resource from the same commit.',
      'Wait until both UKI_STAKING cursors are verified and caught up with 12 confirmations.',
      'Set the approved start/end UTC timestamps and unique production secrets.',
      'Keep TREASURE_HUNT_COMPETITION_ENABLED=false through the smoke test, then enable once.',
    ],
  };
  const verificationPath = writeVerificationIfRequested(verification);
  console.log(JSON.stringify({ ...verification, verificationPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
