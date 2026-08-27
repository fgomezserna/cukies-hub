const { expect } = require('chai');
const { Interface, getAddress, parseUnits } = require('ethers');

const {
  LOCK_DURATION_SECONDS,
  MAINNET_ASM,
  MAINNET_UKI,
  PANCAKE_V2_ROUTER,
  buildSafeLiquidityBatch,
  calculateLiquidityQuote,
  deviationBps,
  findFirstBlockAfterTimestamp,
  safeBatchChecksum,
} = require('../scripts/lib/mainnet-uki-launch.cjs');

function encodeBatchTransaction(transaction, contractInterface) {
  const values = transaction.contractMethod.inputs.map(
    (input) => transaction.contractInputsValues[input.name],
  );
  return contractInterface.encodeFunctionData(transaction.contractMethod.name, values);
}

describe('UKI mainnet launch plan', function () {
  it('uses exactly 50% of the on-chain ASM raised and targets 0.012 USD per UKI', function () {
    const quote = calculateLiquidityQuote({
      totalAsmRaisedRaw: parseUnits('5996.0696', 18),
      asmReferencePriceUsd: '7.2',
    });

    expect(quote.totalAsmRaised).to.equal('5996.0696');
    expect(quote.asmAmount).to.equal('2998.0348');
    expect(quote.ukiAmount).to.equal('1798820.88');
    expect(quote.ukiTargetPriceUsd).to.equal('0.012');
    expect(quote.impliedUkiPriceUsd).to.equal('0.012');
    expect(LOCK_DURATION_SECONDS).to.equal(15_552_000n);
  });

  it('rounds only at token wei precision and rejects invalid economic inputs', function () {
    const quote = calculateLiquidityQuote({
      totalAsmRaisedRaw: parseUnits('1.000000000000000001', 18),
      asmReferencePriceUsd: '7.1373',
    });
    expect(quote.asmAmountRaw).to.equal(500000000000000000n);
    expect(quote.ukiAmountRaw).to.be.greaterThan(0n);

    expect(() => calculateLiquidityQuote({
      totalAsmRaisedRaw: 0n,
      asmReferencePriceUsd: '7.2',
    })).to.throw('totalAsmRaisedRaw must be a positive integer');
    expect(() => calculateLiquidityQuote({
      totalAsmRaisedRaw: 1n,
      asmReferencePriceUsd: 'not-a-price',
    })).to.throw('asmReferencePriceUsd must be a positive decimal');
  });

  it('measures price-reference drift in basis points', function () {
    expect(deviationBps(parseUnits('7.2', 18), parseUnits('7.2', 18))).to.equal(0n);
    expect(deviationBps(parseUnits('7.128', 18), parseUnits('7.2', 18))).to.equal(100n);
  });

  it('builds exact Safe approvals and mints every LP directly to the locker', function () {
    const safe = '0x00000000000000000000000000000000000000A1';
    const locker = '0x00000000000000000000000000000000000000B2';
    const asmAmount = parseUnits('2998.0348', 18);
    const ukiAmount = parseUnits('1798820.88', 18);
    const deadline = 1_800_000_000n;
    const batch = buildSafeLiquidityBatch({
      safeAddress: safe,
      lockerAddress: locker,
      asmAmountRaw: asmAmount,
      ukiAmountRaw: ukiAmount,
      deadline,
      createdAt: 123,
    });

    expect(batch.chainId).to.equal('56');
    expect(batch.meta.createdFromSafeAddress).to.equal(safe);
    expect(batch.transactions).to.have.length(3);
    const erc20 = new Interface(['function approve(address,uint256)']);
    const router = new Interface([
      'function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)',
    ]);
    expect(batch.transactions.every((transaction) => transaction.data === null)).to.equal(true);
    expect(batch.meta.checksum).to.equal(safeBatchChecksum(batch));
    expect(batch.meta.checksum).to.equal(
      '0x4ed7bb0625082794a050da5dea4b1131ee22f47b3110906b95051035d8b7f870',
    );
    const asmApproval = erc20.decodeFunctionData(
      'approve',
      encodeBatchTransaction(batch.transactions[0], erc20),
    );
    const ukiApproval = erc20.decodeFunctionData(
      'approve',
      encodeBatchTransaction(batch.transactions[1], erc20),
    );
    const liquidity = router.decodeFunctionData(
      'addLiquidity',
      encodeBatchTransaction(batch.transactions[2], router),
    );

    expect(batch.transactions[0].to).to.equal(MAINNET_ASM);
    expect(asmApproval[0]).to.equal(PANCAKE_V2_ROUTER);
    expect(asmApproval[1]).to.equal(asmAmount);
    expect(batch.transactions[1].to).to.equal(MAINNET_UKI);
    expect(ukiApproval[0]).to.equal(PANCAKE_V2_ROUTER);
    expect(ukiApproval[1]).to.equal(ukiAmount);
    expect(batch.transactions[2].to).to.equal(PANCAKE_V2_ROUTER);
    expect(liquidity[0]).to.equal(MAINNET_ASM);
    expect(liquidity[1]).to.equal(MAINNET_UKI);
    expect(liquidity[2]).to.equal(asmAmount);
    expect(liquidity[3]).to.equal(ukiAmount);
    expect(liquidity[4]).to.equal(asmAmount);
    expect(liquidity[5]).to.equal(ukiAmount);
    expect(liquidity[6]).to.equal(getAddress(locker));
    expect(liquidity[7]).to.equal(deadline);
  });

  it('resets existing allowances before granting the exact launch amounts', function () {
    const batch = buildSafeLiquidityBatch({
      safeAddress: '0x00000000000000000000000000000000000000A1',
      lockerAddress: '0x00000000000000000000000000000000000000B2',
      asmAmountRaw: 10n,
      ukiAmountRaw: 20n,
      deadline: 30n,
      asmAllowanceRaw: 1n,
      ukiAllowanceRaw: 2n,
      createdAt: 123,
    });
    const erc20 = new Interface(['function approve(address,uint256)']);

    expect(batch.transactions).to.have.length(5);
    expect(erc20.decodeFunctionData('approve', encodeBatchTransaction(batch.transactions[0], erc20))[1]).to.equal(0n);
    expect(erc20.decodeFunctionData('approve', encodeBatchTransaction(batch.transactions[1], erc20))[1]).to.equal(10n);
    expect(erc20.decodeFunctionData('approve', encodeBatchTransaction(batch.transactions[2], erc20))[1]).to.equal(0n);
    expect(erc20.decodeFunctionData('approve', encodeBatchTransaction(batch.transactions[3], erc20))[1]).to.equal(20n);
  });

  it('selects the first fixed BSC block strictly after the competition closes', async function () {
    const blocks = Array.from({ length: 16 }, (_, number) => ({
      number,
      timestamp: 1_000n + BigInt(number) * 3n,
      hash: `0x${number.toString(16).padStart(64, '0')}`,
    }));
    const selected = await findFirstBlockAfterTimestamp({
      safeBlockNumber: 15n,
      cutoffTimestamp: 1_025n,
      getBlock: async (number) => blocks[Number(number)],
    });

    expect(selected.blockNumber).to.equal(9n);
    expect(selected.blockTimestamp).to.equal(1_027n);
    expect(selected.blockHash).to.equal(`0x${'9'.padStart(64, '0')}`);
  });
});
