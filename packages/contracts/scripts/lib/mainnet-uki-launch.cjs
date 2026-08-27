const {
  Interface,
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
  toUtf8Bytes,
} = require('ethers');

const BSC_MAINNET_CHAIN_ID = 56n;
const PANCAKE_V2_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const PANCAKE_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const MAINNET_ASM = '0x707F0f4a39a4a26239F7D00463B15AB5656861f9';
const MAINNET_UKI = '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA';
const MAINNET_PRESALE = '0x6E29448282bCc1c568Ec9450Bef50a01d67845C2';
const MAINNET_USDT = '0x55d398326f99059fF775485246999027B3197955';
const LIQUIDITY_BPS = 5_000n;
const BPS_DENOMINATOR = 10_000n;
const UKI_TARGET_PRICE_USD = '0.012';
const PRICE_DECIMALS = 18;
const LOCK_DURATION_SECONDS = 180n * 24n * 60n * 60n;

const ERC20_INTERFACE = new Interface([
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const ROUTER_INTERFACE = new Interface([
  'function addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint256 amountA,uint256 amountB,uint256 liquidity)',
]);

function normalizeAddress(value, label) {
  try {
    const normalized = getAddress(value);
    if (normalized === '0x0000000000000000000000000000000000000000') {
      throw new Error('zero address');
    }
    return normalized;
  } catch (_error) {
    throw new Error(`${label} must be a valid non-zero EVM address.`);
  }
}

function positiveBigInt(value, label) {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error('not positive');
    return parsed;
  } catch (_error) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function positiveDecimal(value, label) {
  try {
    const parsed = parseUnits(String(value), PRICE_DECIMALS);
    if (parsed <= 0n) throw new Error('not positive');
    return parsed;
  } catch (_error) {
    throw new Error(`${label} must be a positive decimal with at most ${PRICE_DECIMALS} decimals.`);
  }
}

function divideRoundHalfUp(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError('Division denominator must be positive.');
  return (numerator + denominator / 2n) / denominator;
}

function calculateLiquidityQuote({
  totalAsmRaisedRaw,
  asmReferencePriceUsd,
  ukiTargetPriceUsd = UKI_TARGET_PRICE_USD,
}) {
  return calculateLiquidityQuoteFromRaw({
    totalAsmRaisedRaw,
    asmReferencePriceUsdRaw: positiveDecimal(asmReferencePriceUsd, 'asmReferencePriceUsd'),
    ukiTargetPriceUsdRaw: positiveDecimal(ukiTargetPriceUsd, 'ukiTargetPriceUsd'),
  });
}

function calculateLiquidityQuoteFromRaw({
  totalAsmRaisedRaw,
  asmReferencePriceUsdRaw,
  ukiTargetPriceUsdRaw = parseUnits(UKI_TARGET_PRICE_USD, PRICE_DECIMALS),
}) {
  const totalAsm = positiveBigInt(totalAsmRaisedRaw, 'totalAsmRaisedRaw');
  const asmPriceRaw = positiveBigInt(asmReferencePriceUsdRaw, 'asmReferencePriceUsdRaw');
  const targetPriceRaw = positiveBigInt(ukiTargetPriceUsdRaw, 'ukiTargetPriceUsdRaw');
  const asmAmountRaw = totalAsm * LIQUIDITY_BPS / BPS_DENOMINATOR;
  const ukiAmountRaw = divideRoundHalfUp(asmAmountRaw * asmPriceRaw, targetPriceRaw);
  if (asmAmountRaw === 0n || ukiAmountRaw === 0n) {
    throw new Error('The calculated liquidity amounts must be positive.');
  }
  const impliedUkiPriceUsdRaw = divideRoundHalfUp(
    asmAmountRaw * asmPriceRaw,
    ukiAmountRaw,
  );

  return {
    totalAsmRaisedRaw: totalAsm,
    liquidityBps: LIQUIDITY_BPS,
    asmAmountRaw,
    ukiAmountRaw,
    asmReferencePriceUsdRaw: asmPriceRaw,
    ukiTargetPriceUsdRaw: targetPriceRaw,
    impliedUkiPriceUsdRaw,
    totalAsmRaised: formatUnits(totalAsm, 18),
    asmAmount: formatUnits(asmAmountRaw, 18),
    ukiAmount: formatUnits(ukiAmountRaw, 18),
    asmReferencePriceUsd: formatUnits(asmPriceRaw, PRICE_DECIMALS),
    ukiTargetPriceUsd: formatUnits(targetPriceRaw, PRICE_DECIMALS),
    impliedUkiPriceUsd: formatUnits(impliedUkiPriceUsdRaw, PRICE_DECIMALS),
  };
}

function deviationBps(reference, observed) {
  const expected = positiveBigInt(reference, 'reference');
  const actual = positiveBigInt(observed, 'observed');
  const difference = expected >= actual ? expected - actual : actual - expected;
  return divideRoundHalfUp(difference * BPS_DENOMINATOR, actual);
}

async function findFirstBlockAfterTimestamp({ safeBlockNumber, cutoffTimestamp, getBlock }) {
  const safe = positiveBigInt(safeBlockNumber, 'safeBlockNumber');
  const cutoff = positiveBigInt(cutoffTimestamp, 'cutoffTimestamp');
  if (typeof getBlock !== 'function') throw new TypeError('getBlock must be a function.');
  const safeBlock = await getBlock(safe);
  if (!safeBlock || BigInt(safeBlock.timestamp) <= cutoff) {
    throw new Error('The finalized chain head has not crossed the competition end timestamp.');
  }
  let low = 0n;
  let high = safe;
  while (low < high) {
    const middle = (low + high) / 2n;
    const block = await getBlock(middle);
    if (!block) throw new Error(`Block ${middle} is unavailable from the configured RPC.`);
    if (BigInt(block.timestamp) > cutoff) high = middle;
    else low = middle + 1n;
  }
  const candidate = await getBlock(low);
  if (!candidate?.hash || !/^0x[0-9a-f]{64}$/i.test(candidate.hash)) {
    throw new Error(`Block ${low} does not expose a valid hash.`);
  }
  if (low > 0n) {
    const previous = await getBlock(low - 1n);
    if (!previous || BigInt(previous.timestamp) > cutoff) {
      throw new Error('The resolved draw block is not the first block after the cutoff.');
    }
  }
  return {
    blockNumber: low,
    blockHash: candidate.hash.toLowerCase(),
    blockTimestamp: BigInt(candidate.timestamp),
  };
}

function method(name, inputs) {
  return {
    inputs: inputs.map(({ name: inputName, type }) => ({
      internalType: type,
      name: inputName,
      type,
    })),
    name,
    payable: false,
  };
}

const APPROVE_METHOD = method('approve', [
  { name: 'spender', type: 'address' },
  { name: 'amount', type: 'uint256' },
]);
const ADD_LIQUIDITY_METHOD = method('addLiquidity', [
  { name: 'tokenA', type: 'address' },
  { name: 'tokenB', type: 'address' },
  { name: 'amountADesired', type: 'uint256' },
  { name: 'amountBDesired', type: 'uint256' },
  { name: 'amountAMin', type: 'uint256' },
  { name: 'amountBMin', type: 'uint256' },
  { name: 'to', type: 'address' },
  { name: 'deadline', type: 'uint256' },
]);

function builderTransaction(to, contractMethod, contractInputsValues) {
  return {
    to,
    value: '0',
    data: null,
    contractMethod,
    contractInputsValues,
  };
}

function approveTransaction(token, spender, amount) {
  const normalizedToken = normalizeAddress(token, 'approval token');
  const normalizedSpender = normalizeAddress(spender, 'approval spender');
  const rawAmount = BigInt(amount).toString();
  return builderTransaction(
    normalizedToken,
    APPROVE_METHOD,
    { spender: normalizedSpender, amount: rawAmount },
  );
}

function serializeSafeJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeSafeJson(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort();
    let serialized = `{${JSON.stringify(keys)}`;
    for (const key of keys) serialized += `${serializeSafeJson(value[key])},`;
    return `${serialized}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function safeBatchChecksum(batch) {
  const { checksum: _checksum, ...metaWithoutChecksum } = batch.meta;
  const canonical = serializeSafeJson({
    ...batch,
    meta: { ...metaWithoutChecksum, name: null },
  });
  return keccak256(toUtf8Bytes(canonical));
}

function addSafeBatchChecksum(batch) {
  return {
    ...batch,
    meta: {
      ...batch.meta,
      checksum: safeBatchChecksum(batch),
    },
  };
}

function buildSafeLiquidityBatch({
  safeAddress,
  lockerAddress,
  asmAmountRaw,
  ukiAmountRaw,
  deadline,
  asmAllowanceRaw = 0n,
  ukiAllowanceRaw = 0n,
  createdAt = Date.now(),
}) {
  const safe = normalizeAddress(safeAddress, 'safeAddress');
  const locker = normalizeAddress(lockerAddress, 'lockerAddress');
  const asmAmount = positiveBigInt(asmAmountRaw, 'asmAmountRaw');
  const ukiAmount = positiveBigInt(ukiAmountRaw, 'ukiAmountRaw');
  const deadlineRaw = positiveBigInt(deadline, 'deadline');
  const transactions = [];

  if (BigInt(asmAllowanceRaw) !== 0n) {
    transactions.push(approveTransaction(MAINNET_ASM, PANCAKE_V2_ROUTER, 0n));
  }
  transactions.push(approveTransaction(MAINNET_ASM, PANCAKE_V2_ROUTER, asmAmount));
  if (BigInt(ukiAllowanceRaw) !== 0n) {
    transactions.push(approveTransaction(MAINNET_UKI, PANCAKE_V2_ROUTER, 0n));
  }
  transactions.push(approveTransaction(MAINNET_UKI, PANCAKE_V2_ROUTER, ukiAmount));

  const liquidityInputs = {
    tokenA: MAINNET_ASM,
    tokenB: MAINNET_UKI,
    amountADesired: asmAmount.toString(),
    amountBDesired: ukiAmount.toString(),
    amountAMin: asmAmount.toString(),
    amountBMin: ukiAmount.toString(),
    to: locker,
    deadline: deadlineRaw.toString(),
  };
  transactions.push(builderTransaction(
    PANCAKE_V2_ROUTER,
    ADD_LIQUIDITY_METHOD,
    liquidityInputs,
  ));

  return addSafeBatchChecksum({
    version: '1.0',
    chainId: BSC_MAINNET_CHAIN_ID.toString(),
    createdAt,
    meta: {
      name: 'UKI/ASM PancakeSwap V2 initial liquidity and 180-day LP lock',
      description: 'Exact approvals followed by initial V2 liquidity minted directly to the immutable locker.',
      txBuilderVersion: '2.1.0',
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: '',
    },
    transactions,
  });
}

module.exports = {
  ADD_LIQUIDITY_METHOD,
  APPROVE_METHOD,
  BPS_DENOMINATOR,
  BSC_MAINNET_CHAIN_ID,
  ERC20_INTERFACE,
  LIQUIDITY_BPS,
  LOCK_DURATION_SECONDS,
  MAINNET_ASM,
  MAINNET_PRESALE,
  MAINNET_UKI,
  MAINNET_USDT,
  PANCAKE_V2_FACTORY,
  PANCAKE_V2_ROUTER,
  PRICE_DECIMALS,
  ROUTER_INTERFACE,
  UKI_TARGET_PRICE_USD,
  addSafeBatchChecksum,
  buildSafeLiquidityBatch,
  calculateLiquidityQuote,
  calculateLiquidityQuoteFromRaw,
  deviationBps,
  divideRoundHalfUp,
  findFirstBlockAfterTimestamp,
  normalizeAddress,
  positiveBigInt,
  positiveDecimal,
  safeBatchChecksum,
};
