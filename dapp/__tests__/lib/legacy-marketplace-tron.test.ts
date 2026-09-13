import {
  waitForLegacyTronReceipt,
  type LegacyTronWebLike,
} from '@/lib/legacy-marketplace/tron';

type GetTransactionInfo = NonNullable<
  NonNullable<LegacyTronWebLike['trx']>['getTransactionInfo']
>;

function tronWebWith(getTransactionInfo: GetTransactionInfo): LegacyTronWebLike {
  return {
    trx: { getTransactionInfo },
    contract: jest.fn() as LegacyTronWebLike['contract'],
  };
}

describe('waitForLegacyTronReceipt', () => {
  it('propaga un receipt fallido sin esperar hasta el timeout', async () => {
    const getTransactionInfo = jest.fn() as jest.MockedFunction<GetTransactionInfo>;
    getTransactionInfo.mockResolvedValue({
      receipt: {
        result: 'FAILED',
        resMessage: 'REVERT opcode executed',
      },
    });

    await expect(
      waitForLegacyTronReceipt(
        tronWebWith(getTransactionInfo),
        'a'.repeat(64),
        { timeoutMs: 1_000, pollIntervalMs: 250 },
      ),
    ).rejects.toThrow('TRON receipt failure: REVERT opcode executed');
    expect(getTransactionInfo).toHaveBeenCalledTimes(1);
  });

  it('espera un receipt pendiente y devuelve el confirmado', async () => {
    const getTransactionInfo = jest.fn() as jest.MockedFunction<GetTransactionInfo>;
    getTransactionInfo
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        receipt: { result: 'SUCCESS' },
        blockNumber: 86215085,
      });

    await expect(
      waitForLegacyTronReceipt(
        tronWebWith(getTransactionInfo),
        'b'.repeat(64),
        { timeoutMs: 1_000, pollIntervalMs: 250 },
      ),
    ).resolves.toMatchObject({
      transactionId: 'b'.repeat(64),
      info: { blockNumber: 86215085 },
    });
    expect(getTransactionInfo).toHaveBeenCalledTimes(2);
  });
});
