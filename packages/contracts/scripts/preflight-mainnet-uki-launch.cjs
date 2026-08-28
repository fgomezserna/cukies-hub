const hre = require('hardhat');

const {
  BSC_MAINNET_CHAIN_ID,
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
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function owner() view returns (address)',
  'function symbol() view returns (string)',
];
const FACTORY_ABI = [
  'function getPair(address,address) view returns (address)',
];
const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];
const PRESALE_ABI = [
  'function asmToken() view returns (address)',
  'function saleEnabled() view returns (bool)',
  'function totalAsmRaised() view returns (uint256)',
  'function treasury() view returns (address)',
];
const ROUTER_ABI = ['function factory() view returns (address)'];
const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the mainnet launch preflight.`);
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

async function tokenIdentity(address, expected) {
  await assertCode(address, expected.label);
  const token = new hre.ethers.Contract(address, ERC20_ABI, hre.ethers.provider);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);
  if (name !== expected.name || symbol !== expected.symbol || decimals !== 18n) {
    throw new Error(
      `${expected.label} identity mismatch: name=${name}, symbol=${symbol}, decimals=${decimals}.`,
    );
  }
  return token;
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== 'bsc' || network.chainId !== BSC_MAINNET_CHAIN_ID) {
    throw new Error(
      `This preflight is BSC Mainnet-only. Current network=${hre.network.name}, chainId=${network.chainId}.`,
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
  const asmReferencePriceUsd = requireEnv('ASM_REFERENCE_PRICE_USD');
  const maxDeviationBps = optionalEnv('ASM_REFERENCE_MAX_DEVIATION_BPS')
    ? positiveBigInt(optionalEnv('ASM_REFERENCE_MAX_DEVIATION_BPS'), 'ASM_REFERENCE_MAX_DEVIATION_BPS')
    : 100n;
  if (maxDeviationBps > 1_000n) {
    throw new Error('ASM_REFERENCE_MAX_DEVIATION_BPS cannot exceed 1000 (10%).');
  }
  const snapshotBlockNumber = await hre.ethers.provider.getBlockNumber();
  const snapshotBlock = await hre.ethers.provider.getBlock(snapshotBlockNumber);
  if (!snapshotBlock?.hash) throw new Error(`BSC snapshot block ${snapshotBlockNumber} is unavailable.`);

  await Promise.all([
    assertCode(safeAddress, 'Launch Safe'),
    assertCode(PANCAKE_V2_FACTORY, 'PancakeSwap V2 factory'),
    assertCode(PANCAKE_V2_ROUTER, 'PancakeSwap V2 router'),
    assertCode(MAINNET_PRESALE, 'UKI presale'),
  ]);
  const [asm, uki] = await Promise.all([
    tokenIdentity(MAINNET_ASM, { label: 'ASM', name: 'Ascensum token', symbol: 'ASM' }),
    tokenIdentity(MAINNET_UKI, { label: 'UKI', name: 'Cukies UKI', symbol: 'UKI' }),
  ]);
  const safe = new hre.ethers.Contract(safeAddress, SAFE_ABI, hre.ethers.provider);
  const factory = new hre.ethers.Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, hre.ethers.provider);
  const router = new hre.ethers.Contract(PANCAKE_V2_ROUTER, ROUTER_ABI, hre.ethers.provider);
  const presale = new hre.ethers.Contract(MAINNET_PRESALE, PRESALE_ABI, hre.ethers.provider);
  const [safeOwners, safeThreshold, routerFactory, presaleAsm, treasury, totalAsmRaisedRaw, saleEnabled] =
    await Promise.all([
      safe.getOwners(),
      safe.getThreshold(),
      router.factory(),
      presale.asmToken(),
      presale.treasury(),
      presale.totalAsmRaised({ blockTag: snapshotBlockNumber }),
      presale.saleEnabled(),
    ]);

  if (normalizeAddress(routerFactory, 'router.factory') !== PANCAKE_V2_FACTORY) {
    throw new Error(`PancakeSwap V2 router factory mismatch: ${routerFactory}.`);
  }
  if (normalizeAddress(presaleAsm, 'Presale.asmToken') !== MAINNET_ASM) {
    throw new Error(`Presale ASM mismatch: ${presaleAsm}.`);
  }
  if (safeOwners.length !== 1 || safeThreshold !== 1n) {
    throw new Error(
      `Launch Safe must be 1/1 for this phase. Observed owners=${safeOwners.length}, threshold=${safeThreshold}.`,
    );
  }
  if (
    normalizeAddress(safeOwners[0], 'Safe owner') !== expectedSafeOwner
  ) {
    throw new Error(`Launch Safe owner mismatch: ${safeOwners[0]}.`);
  }

  const ukiAsmPair = await factory.getPair(MAINNET_ASM, MAINNET_UKI, {
    blockTag: snapshotBlockNumber,
  });
  if (ukiAsmPair !== hre.ethers.ZeroAddress) {
    throw new Error(`UKI/ASM PancakeSwap V2 pair already exists at ${ukiAsmPair}.`);
  }
  const asmUsdtPairAddress = normalizeAddress(
    await factory.getPair(MAINNET_ASM, MAINNET_USDT, { blockTag: snapshotBlockNumber }),
    'ASM/USDT PancakeSwap V2 pair',
  );
  const asmUsdtPair = new hre.ethers.Contract(asmUsdtPairAddress, PAIR_ABI, hre.ethers.provider);
  const [token0, token1, reserves] = await Promise.all([
    asmUsdtPair.token0(),
    asmUsdtPair.token1(),
    asmUsdtPair.getReserves({ blockTag: snapshotBlockNumber }),
  ]);
  const token0Address = normalizeAddress(token0, 'ASM/USDT token0');
  const token1Address = normalizeAddress(token1, 'ASM/USDT token1');
  if (![
    `${MAINNET_ASM}:${MAINNET_USDT}`,
    `${MAINNET_USDT}:${MAINNET_ASM}`,
  ].includes(`${token0Address}:${token1Address}`)) {
    throw new Error(`Unexpected ASM/USDT token ordering: ${token0Address}/${token1Address}.`);
  }
  const asmReserve = token0Address === MAINNET_ASM ? reserves[0] : reserves[1];
  const usdtReserve = token0Address === MAINNET_USDT ? reserves[0] : reserves[1];
  if (asmReserve === 0n || usdtReserve === 0n) throw new Error('ASM/USDT reference pool is empty.');
  const observedAsmPriceUsdRaw = usdtReserve * 10n ** BigInt(PRICE_DECIMALS) / asmReserve;
  const referencePriceRaw = positiveDecimal(asmReferencePriceUsd, 'ASM_REFERENCE_PRICE_USD');
  const priceDeviationBps = deviationBps(referencePriceRaw, observedAsmPriceUsdRaw);
  if (priceDeviationBps > maxDeviationBps) {
    throw new Error(
      `ASM_REFERENCE_PRICE_USD differs from the ASM/USDT V2 spot by ${priceDeviationBps} bps; maximum is ${maxDeviationBps}.`,
    );
  }

  const quote = calculateLiquidityQuoteFromRaw({
    totalAsmRaisedRaw,
    asmReferencePriceUsdRaw: observedAsmPriceUsdRaw,
  });
  const treasuryAddress = normalizeAddress(treasury, 'Presale.treasury');
  const ukiSource = optionalEnv('UKI_LIQUIDITY_SOURCE_ADDRESS')
    ? normalizeAddress(optionalEnv('UKI_LIQUIDITY_SOURCE_ADDRESS'), 'UKI_LIQUIDITY_SOURCE_ADDRESS')
    : normalizeAddress(await uki.owner(), 'UKIToken.owner');
  const [treasuryAsmRaw, treasuryBnbRaw, ukiSourceBalanceRaw, ukiSourceBnbRaw, safeAsmRaw, safeUkiRaw] =
    await Promise.all([
      asm.balanceOf(treasuryAddress, { blockTag: snapshotBlockNumber }),
      hre.ethers.provider.getBalance(treasuryAddress, snapshotBlockNumber),
      uki.balanceOf(ukiSource, { blockTag: snapshotBlockNumber }),
      hre.ethers.provider.getBalance(ukiSource, snapshotBlockNumber),
      asm.balanceOf(safeAddress, { blockTag: snapshotBlockNumber }),
      uki.balanceOf(safeAddress, { blockTag: snapshotBlockNumber }),
    ]);
  if (treasuryAsmRaw < quote.asmAmountRaw) {
    throw new Error(`ASM treasury balance is below the required ${quote.asmAmount} ASM.`);
  }
  if (ukiSourceBalanceRaw < quote.ukiAmountRaw) {
    throw new Error(`UKI source balance is below the required ${quote.ukiAmount} UKI.`);
  }

  console.log(JSON.stringify({
    schema: 'cukies.uki-mainnet-launch-preflight.v1',
    observedAtBlock: snapshotBlockNumber,
    observedAt: new Date(Number(snapshotBlock.timestamp) * 1_000).toISOString(),
    network: hre.network.name,
    chainId: Number(network.chainId),
    identities: {
      asm: MAINNET_ASM,
      uki: MAINNET_UKI,
      presale: MAINNET_PRESALE,
      pancakeV2Factory: PANCAKE_V2_FACTORY,
      pancakeV2Router: PANCAKE_V2_ROUTER,
      ukiAsmPair: null,
    },
    safe: {
      address: safeAddress,
      owners: safeOwners.map((owner) => normalizeAddress(owner, 'Safe owner')),
      threshold: Number(safeThreshold),
      asmBalance: hre.ethers.formatUnits(safeAsmRaw, 18),
      ukiBalance: hre.ethers.formatUnits(safeUkiRaw, 18),
    },
    asmReference: {
      pair: asmUsdtPairAddress,
      configuredSanityPriceUsd: hre.ethers.formatUnits(referencePriceRaw, PRICE_DECIMALS),
      observedSpotPriceUsd: hre.ethers.formatUnits(observedAsmPriceUsdRaw, PRICE_DECIMALS),
      deviationBps: priceDeviationBps.toString(),
      maximumDeviationBps: maxDeviationBps.toString(),
    },
    quote: {
      totalAsmRaised: quote.totalAsmRaised,
      liquidityShare: '50%',
      asmAmount: quote.asmAmount,
      ukiAmount: quote.ukiAmount,
      targetUkiPriceUsd: quote.ukiTargetPriceUsd,
      impliedUkiPriceUsd: quote.impliedUkiPriceUsd,
      asmAmountRaw: quote.asmAmountRaw.toString(),
      ukiAmountRaw: quote.ukiAmountRaw.toString(),
    },
    immutableQuoteSnapshot: {
      blockNumber: snapshotBlockNumber,
      blockHash: snapshotBlock.hash,
      totalAsmRaisedRaw: totalAsmRaisedRaw.toString(),
      asmSpotPriceUsdRaw: observedAsmPriceUsdRaw.toString(),
      environment: {
        MAINNET_LIQUIDITY_SNAPSHOT_BLOCK: String(snapshotBlockNumber),
      },
    },
    funding: {
      asmTreasury: treasuryAddress,
      asmTreasuryBalance: hre.ethers.formatUnits(treasuryAsmRaw, 18),
      asmTreasuryBnb: hre.ethers.formatEther(treasuryBnbRaw),
      ukiSource,
      ukiSourceBalance: hre.ethers.formatUnits(ukiSourceBalanceRaw, 18),
      ukiSourceBnb: hre.ethers.formatEther(ukiSourceBnbRaw),
      transferAsmToSafe: quote.asmAmount,
      transferUkiToSafe: quote.ukiAmount,
    },
    saleEnabled,
    readyForInfrastructureDeployment: true,
    readyForLiquidityBatch: safeAsmRaw >= quote.asmAmountRaw && safeUkiRaw >= quote.ukiAmountRaw,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
