import {
  executeNftTransaction,
  nftTransactionContextMatches,
  type NftTransactionContext,
  type NftTransactionClient,
} from '@/lib/nft-vault/transaction-lifecycle';

describe('nftTransactionContextMatches', () => {
  const expected: NftTransactionContext = {
    wallet: '0x1111111111111111111111111111111111111111',
    chainId: 97,
    vault: '0x2222222222222222222222222222222222222222',
  };

  it('rechaza una wallet desconectada sin lanzar', () => {
    expect(nftTransactionContextMatches(expected, {
      wallet: null,
      chainId: 97,
      vault: expected.vault,
    })).toBe(false);
    expect(nftTransactionContextMatches(expected, null)).toBe(false);
  });
});

describe('executeNftTransaction replacements', () => {
  const expected: NftTransactionContext = {
    wallet: '0x1111111111111111111111111111111111111111',
    chainId: 97,
    vault: '0x2222222222222222222222222222222222222222',
  };
  const originalHash = `0x${'a'.repeat(64)}` as const;
  const replacementHash = `0x${'b'.repeat(64)}` as const;
  const baseInput = {
    request: { address: expected.vault },
    guard: { ready: true, reason: 'ready', switchToTarget: jest.fn() },
    expectedContext: expected,
    currentContext: () => expected,
    isReady: () => true,
    write: jest.fn().mockResolvedValue(originalHash),
    errorPrefix: 'NFT_OPERATION',
    onSubmitted: jest.fn(),
    onReverted: jest.fn(),
    onConfirmed: jest.fn(),
  };

  it('usa el hash real tras una repriorización y confirma una sola vez', async () => {
    const onReplaced = jest.fn();
    const waitForTransactionReceipt = jest.fn(async (input: Parameters<NftTransactionClient['waitForTransactionReceipt']>[0]) => {
      input.onReplaced?.({
        reason: 'repriced',
        replacedTransaction: { hash: originalHash },
        transaction: { hash: replacementHash },
        transactionReceipt: { status: 'success', transactionHash: replacementHash },
      });
      return { status: 'success', transactionHash: replacementHash };
    });
    const result = await executeNftTransaction({
      ...baseInput,
      client: { simulateContract: jest.fn().mockResolvedValue({}), waitForTransactionReceipt },
      onReplaced,
    });

    expect(result).toBe(replacementHash);
    expect(onReplaced).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'repriced',
      replacedHash: originalHash,
      replacementHash,
    }), true);
    expect(baseInput.onConfirmed).toHaveBeenCalledWith(
      replacementHash,
      true,
      expect.objectContaining({ status: 'success', transactionHash: replacementHash }),
    );
    expect(baseInput.onReverted).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'replaced'] as const)('no confirma una operación NFT cuando la razón es %s', async (reason) => {
    baseInput.onSubmitted.mockClear();
    baseInput.onReverted.mockClear();
    baseInput.onConfirmed.mockClear();
    const waitForTransactionReceipt = jest.fn(async (input: Parameters<NftTransactionClient['waitForTransactionReceipt']>[0]) => {
      input.onReplaced?.({
        reason,
        replacedTransaction: { hash: originalHash },
        transaction: { hash: replacementHash },
        transactionReceipt: { status: 'success', transactionHash: replacementHash },
      });
      return { status: 'success', transactionHash: replacementHash };
    });

    await expect(executeNftTransaction({
      ...baseInput,
      client: { simulateContract: jest.fn().mockResolvedValue({}), waitForTransactionReceipt },
    })).rejects.toThrow(`NFT_OPERATION_TRANSACTION_${reason.toUpperCase()}`);
    expect(baseInput.onReverted).toHaveBeenCalledWith(true);
    expect(baseInput.onConfirmed).not.toHaveBeenCalled();
  });
});
