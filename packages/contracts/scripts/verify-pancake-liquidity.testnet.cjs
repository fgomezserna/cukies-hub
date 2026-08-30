const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97n;
const PANCAKE_V2_FACTORY = '0x6725F303b657a9451d8BA641348b6761A6CC7a17';
const PANCAKE_V2_ROUTER = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
const TESTNET_WBNB = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';
const TESTNET_ASM = '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C';
const TESTNET_UKI = '0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c';
const TESTNET_ASM_UKI_PAIR = '0x8fa397B4E1DED911161f13C128DF369cE9a95B3A';

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];
const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
];
const ROUTER_ABI = [
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function getAmountsOut(uint256,address[]) view returns (uint256[])',
];

function normalizeAddress(value, label) {
  try {
    const normalized = hre.ethers.getAddress(value);
    if (normalized === hre.ethers.ZeroAddress) throw new Error('zero address');
    return normalized;
  } catch (_error) {
    throw new Error(`${label} must be a valid non-zero EVM address.`);
  }
}

async function assertCode(address, label, blockTag) {
  const code = await hre.ethers.provider.getCode(address, blockTag);
  if (code === '0x') throw new Error(`${label} has no bytecode at ${address}.`);
  return code;
}

async function tokenIdentity(address, expected, blockTag) {
  await assertCode(address, expected.label, blockTag);
  const token = new hre.ethers.Contract(address, ERC20_ABI, hre.ethers.provider);
  const [name, symbol, decimals] = await Promise.all([
    token.name({ blockTag }),
    token.symbol({ blockTag }),
    token.decimals({ blockTag }),
  ]);
  if (name !== expected.name || symbol !== expected.symbol || decimals !== expected.decimals) {
    throw new Error(
      `${expected.label} identity mismatch: name=${name}, symbol=${symbol}, decimals=${decimals}.`,
    );
  }
  return { address, name, symbol, decimals: Number(decimals) };
}

async function routeQuote(router, label, amountIn, path, blockTag) {
  try {
    const amounts = await router.getAmountsOut(amountIn, path, { blockTag });
    return {
      label,
      available: true,
      path,
      amountsRaw: amounts.map(String),
    };
  } catch (error) {
    return {
      label,
      available: false,
      path,
      reason: error.shortMessage || 'PancakeSwap V2 router rejected the route',
    };
  }
}

async function pairSnapshot(pairAddress, expectedTokens, blockTag) {
  const runtimeCode = await assertCode(pairAddress, 'ASM/UKI PancakeSwap V2 pair', blockTag);
  const pair = new hre.ethers.Contract(pairAddress, PAIR_ABI, hre.ethers.provider);
  const [token0Raw, token1Raw, reserves, totalSupply] = await Promise.all([
    pair.token0({ blockTag }),
    pair.token1({ blockTag }),
    pair.getReserves({ blockTag }),
    pair.totalSupply({ blockTag }),
  ]);
  const token0 = normalizeAddress(token0Raw, 'pair.token0');
  const token1 = normalizeAddress(token1Raw, 'pair.token1');
  const expected = new Set(expectedTokens.map((address) => normalizeAddress(address, 'expected pair token')));
  if (!expected.has(token0) || !expected.has(token1) || token0 === token1) {
    throw new Error(`Unexpected ASM/UKI pair token ordering: ${token0}/${token1}.`);
  }
  if (reserves[0] === 0n || reserves[1] === 0n || totalSupply === 0n) {
    throw new Error('ASM/UKI PancakeSwap V2 pair has no usable liquidity.');
  }
  return {
    address: pairAddress,
    token0,
    token1,
    reserve0Raw: reserves[0].toString(),
    reserve1Raw: reserves[1].toString(),
    totalSupplyRaw: totalSupply.toString(),
    blockTimestampLast: Number(reserves[2]),
    runtimeCodeHash: hre.ethers.keccak256(runtimeCode),
  };
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== 'bscTestnet' || network.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `This verifier is BSC Testnet-only. Current network=${hre.network.name}, chainId=${network.chainId}.`,
    );
  }

  const snapshotBlockNumber = await hre.ethers.provider.getBlockNumber();
  const snapshotBlock = await hre.ethers.provider.getBlock(snapshotBlockNumber);
  if (!snapshotBlock?.hash) throw new Error(`BSC Testnet block ${snapshotBlockNumber} is unavailable.`);

  const factoryAddress = normalizeAddress(PANCAKE_V2_FACTORY, 'PancakeSwap V2 factory');
  const routerAddress = normalizeAddress(PANCAKE_V2_ROUTER, 'PancakeSwap V2 router');
  const asmAddress = normalizeAddress(TESTNET_ASM, 'tASM');
  const ukiAddress = normalizeAddress(TESTNET_UKI, 'UKI');
  const expectedPairAddress = normalizeAddress(TESTNET_ASM_UKI_PAIR, 'ASM/UKI pair');
  await Promise.all([
    assertCode(factoryAddress, 'PancakeSwap V2 factory', snapshotBlockNumber),
    assertCode(routerAddress, 'PancakeSwap V2 router', snapshotBlockNumber),
  ]);

  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, hre.ethers.provider);
  const router = new hre.ethers.Contract(routerAddress, ROUTER_ABI, hre.ethers.provider);
  const [routerFactoryRaw, wbnbRaw, pairRaw, asm, uki] = await Promise.all([
    router.factory({ blockTag: snapshotBlockNumber }),
    router.WETH({ blockTag: snapshotBlockNumber }),
    factory.getPair(asmAddress, ukiAddress, { blockTag: snapshotBlockNumber }),
    tokenIdentity(
      asmAddress,
      { label: 'tASM', name: 'Test ASM', symbol: 'tASM', decimals: 18n },
      snapshotBlockNumber,
    ),
    tokenIdentity(
      ukiAddress,
      { label: 'UKI', name: 'Cukies UKI', symbol: 'UKI', decimals: 18n },
      snapshotBlockNumber,
    ),
  ]);
  const routerFactory = normalizeAddress(routerFactoryRaw, 'router.factory');
  const wbnbAddress = normalizeAddress(wbnbRaw, 'router.WETH');
  const pairAddress = normalizeAddress(pairRaw, 'factory ASM/UKI pair');
  if (routerFactory !== factoryAddress) {
    throw new Error(`PancakeSwap V2 router factory mismatch: ${routerFactory}.`);
  }
  if (wbnbAddress !== normalizeAddress(TESTNET_WBNB, 'expected WBNB')) {
    throw new Error(`Unexpected PancakeSwap V2 Testnet WBNB: ${wbnbAddress}.`);
  }
  if (pairAddress !== expectedPairAddress) {
    throw new Error(`Unexpected ASM/UKI PancakeSwap V2 pair: ${pairAddress}.`);
  }

  const pair = await pairSnapshot(
    pairAddress,
    [asmAddress, ukiAddress],
    snapshotBlockNumber,
  );
  const directAsmRoute = await routeQuote(
    router,
    'ASM -> UKI',
    hre.ethers.parseUnits('0.001', asm.decimals),
    [asmAddress, ukiAddress],
    snapshotBlockNumber,
  );
  if (!directAsmRoute.available) {
    throw new Error(`The verified ASM/UKI pair cannot quote a direct swap: ${directAsmRoute.reason}.`);
  }

  const [wbnbAsmPairRaw, wbnbUkiPairRaw, directWbnbRoute, wbnbViaAsmRoute] = await Promise.all([
    factory.getPair(wbnbAddress, asmAddress, { blockTag: snapshotBlockNumber }),
    factory.getPair(wbnbAddress, ukiAddress, { blockTag: snapshotBlockNumber }),
    routeQuote(
      router,
      'WBNB -> UKI',
      hre.ethers.parseEther('0.001'),
      [wbnbAddress, ukiAddress],
      snapshotBlockNumber,
    ),
    routeQuote(
      router,
      'WBNB -> ASM -> UKI',
      hre.ethers.parseEther('0.001'),
      [wbnbAddress, asmAddress, ukiAddress],
      snapshotBlockNumber,
    ),
  ]);
  const optionalUsdt = process.env.PANCAKE_TESTNET_USDT_ADDRESS?.trim() || null;
  let usdt = {
    configured: false,
    available: null,
    reason: 'No canonical BSC Testnet USDT address is configured or asserted by this repository.',
  };
  if (optionalUsdt) {
    const usdtAddress = normalizeAddress(optionalUsdt, 'PANCAKE_TESTNET_USDT_ADDRESS');
    await assertCode(usdtAddress, 'configured Testnet USDT', snapshotBlockNumber);
    const token = new hre.ethers.Contract(usdtAddress, ERC20_ABI, hre.ethers.provider);
    const [symbol, decimals] = await Promise.all([
      token.symbol({ blockTag: snapshotBlockNumber }),
      token.decimals({ blockTag: snapshotBlockNumber }),
    ]);
    const direct = await routeQuote(
      router,
      `${symbol} -> UKI`,
      hre.ethers.parseUnits('1', Number(decimals)),
      [usdtAddress, ukiAddress],
      snapshotBlockNumber,
    );
    const viaAsm = await routeQuote(
      router,
      `${symbol} -> ASM -> UKI`,
      hre.ethers.parseUnits('1', Number(decimals)),
      [usdtAddress, asmAddress, ukiAddress],
      snapshotBlockNumber,
    );
    usdt = {
      configured: true,
      address: usdtAddress,
      symbol,
      decimals: Number(decimals),
      available: direct.available || viaAsm.available,
      routes: [direct, viaAsm],
    };
  }

  console.log(JSON.stringify({
    schema: 'cukies.pancake-v2-testnet-verification.v1',
    network: hre.network.name,
    chainId: Number(network.chainId),
    snapshot: {
      blockNumber: snapshotBlockNumber,
      blockHash: snapshotBlock.hash,
      timestamp: snapshotBlock.timestamp,
      timestampIso: new Date(snapshotBlock.timestamp * 1_000).toISOString(),
    },
    pancakeV2: {
      factory: factoryAddress,
      router: routerAddress,
      routerFactory,
      wbnb: wbnbAddress,
    },
    tokens: { asm, uki },
    pair,
    purchasing: {
      asm: { available: true, routes: [directAsmRoute] },
      bnb: {
        available: directWbnbRoute.available || wbnbViaAsmRoute.available,
        wbnbAsmPair: wbnbAsmPairRaw,
        wbnbUkiPair: wbnbUkiPairRaw,
        routes: [directWbnbRoute, wbnbViaAsmRoute],
      },
      usdt,
    },
    recommendedStageEnvironment: {
      NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS: pairAddress,
      NEXT_PUBLIC_UKI_SWAP_URL:
        `https://pancakeswap.finance/swap?chain=bscTestnet&inputCurrency=${asmAddress}&outputCurrency=${ukiAddress}`,
      NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS: '',
      NEXT_PUBLIC_UKI_LIQUIDITY_UNLOCK_LABEL: '',
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
