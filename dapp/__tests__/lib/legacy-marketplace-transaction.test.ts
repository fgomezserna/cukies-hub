import { getLegacyTronWeb } from '@/lib/legacy-marketplace/tron';
import { waitForLegacyTronReceipt } from '@/lib/legacy-marketplace/transaction';

jest.mock('@/lib/legacy-marketplace/tron', () => ({
  getLegacyTronWeb: jest.fn(),
}));

const txId = 'a'.repeat(64);
const otherTxId = 'b'.repeat(64);
const getLegacyTronWebMock = getLegacyTronWeb as jest.MockedFunction<typeof getLegacyTronWeb>;
const getTransactionInfo = jest.fn();

function tronWeb() {
  return {
    trx: { getTransactionInfo },
  } as unknown as NonNullable<ReturnType<typeof getLegacyTronWeb>>;
}

describe('confirmación de transacciones Legacy TRON', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLegacyTronWebMock.mockReturnValue(tronWeb());
  });

  it('mantiene pendiente un txid de broadcast sin receipt SUCCESS', async () => {
    getTransactionInfo.mockResolvedValue({ id: txId });

    await expect(waitForLegacyTronReceipt({ txid: txId }, { attempts: 2, delayMs: 0 }))
      .rejects.toThrow('TRANSACTION_PENDING');
    expect(getTransactionInfo).toHaveBeenCalledTimes(2);
  });

  it('confirma SUCCESS solo cuando el receipt devuelve el txid propio', async () => {
    getTransactionInfo.mockResolvedValue({
      txID: txId,
      receipt: { result: 'SUCCESS' },
    });

    await expect(waitForLegacyTronReceipt(txId, { attempts: 1, delayMs: 0 })).resolves.toBe(txId);
    expect(getTransactionInfo).toHaveBeenCalledWith(txId);
  });

  it.each([
    ['UNCONFIRMED', { id: txId, receipt: { result: 'UNCONFIRMED' } }],
    ['UNSUCCESSFUL', { id: txId, receipt: { result: 'UNSUCCESSFUL' } }],
    ['hash diferente', { id: otherTxId, receipt: { result: 'SUCCESS' } }],
  ])('no confirma %s', async (_label, info) => {
    getTransactionInfo.mockResolvedValue(info);

    await expect(waitForLegacyTronReceipt(txId, { attempts: 1, delayMs: 0 }))
      .rejects.toThrow();
  });

  it('reintenta tras un error transitorio y confirma el SUCCESS posterior', async () => {
    getTransactionInfo
      .mockRejectedValueOnce(new Error('TRON_RPC_TEMPORARY'))
      .mockResolvedValueOnce({ id: txId, receipt: { result: 'SUCCESS' } });

    await expect(waitForLegacyTronReceipt(txId, { attempts: 2, delayMs: 0 })).resolves.toBe(txId);
    expect(getTransactionInfo).toHaveBeenCalledTimes(2);
  });

  it('no desbloquea por un receipt REVERT de otro hash y sigue reintentando el propio', async () => {
    getTransactionInfo
      .mockResolvedValueOnce({ id: otherTxId, receipt: { result: 'REVERT' } })
      .mockResolvedValueOnce({ id: txId, receipt: { result: 'SUCCESS' } });

    await expect(waitForLegacyTronReceipt(txId, { attempts: 2, delayMs: 0 })).resolves.toBe(txId);
    expect(getTransactionInfo).toHaveBeenCalledTimes(2);
  });

  it('corta inmediatamente cuando la señal ya está abortada', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(waitForLegacyTronReceipt(txId, {
      signal: controller.signal,
      attempts: 3,
      delayMs: 0,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(getTransactionInfo).not.toHaveBeenCalled();
  });
});
