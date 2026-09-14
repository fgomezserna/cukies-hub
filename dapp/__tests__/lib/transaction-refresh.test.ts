import {
  retryTransactionRefresh,
  TRANSACTION_REFRESH_RETRY_DELAYS_MS,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
  waitForTransactionRefresh,
} from '@/lib/transaction-refresh';

describe('transaction refresh retry helper', () => {
  it('mantiene una ventana suficiente para proyecciones que llegan después de un minuto', () => {
    expect(TRANSACTION_REFRESH_RETRY_DELAYS_MS.reduce<number>((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(58_000);
  });

  it('reintenta hasta observar convergencia sin convertir lecturas transitorias en fallo', async () => {
    const attempt = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(retryTransactionRefresh(attempt, { delays: [0, 0, 0] })).resolves.toBe(true);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('cancela una espera pendiente y no deja una actualización antigua después del contexto', async () => {
    const controller = new AbortController();
    const pending = waitForTransactionRefresh(1_000, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(retryTransactionRefresh(async () => true, {
      signal: controller.signal,
      delays: [0],
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('comprueba la cancelación después del callback antes de devolver éxito', async () => {
    const controller = new AbortController();
    await expect(retryTransactionRefresh(async () => {
      controller.abort();
      return true;
    }, { signal: controller.signal, delays: [0] })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('conserva el hash realmente minado cuando la wallet repricia la transacción', async () => {
    const originalHash = `0x${'1'.repeat(64)}` as `0x${string}`;
    const replacementHash = `0x${'2'.repeat(64)}` as `0x${string}`;
    const waitForTransactionReceipt = jest.fn(async (input: {
      hash: `0x${string}`;
      onReplaced?: (value: unknown) => void;
    }) => {
      input.onReplaced?.({
        reason: 'repriced',
        replacedTransaction: { hash: originalHash },
        transaction: { hash: replacementHash },
        transactionReceipt: { status: 'success', transactionHash: replacementHash },
      });
      return { status: 'success', transactionHash: replacementHash };
    });

    const result = await waitForConfirmedEvmTransaction(
      { waitForTransactionReceipt },
      originalHash,
    );

    expect(result.hash).toBe(replacementHash);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: originalHash,
      onReplaced: expect.any(Function),
    });
  });

  it('no confirma una operación cuando la transacción fue cancelada o reemplazada', async () => {
    const originalHash = `0x${'3'.repeat(64)}` as `0x${string}`;
    const replacementHash = `0x${'4'.repeat(64)}` as `0x${string}`;
    const waitForTransactionReceipt = jest.fn(async (input: {
      hash: `0x${string}`;
      onReplaced?: (value: unknown) => void;
    }) => {
      input.onReplaced?.({
        reason: 'cancelled',
        replacedTransaction: { hash: originalHash },
        transaction: { hash: replacementHash },
        transactionReceipt: { status: 'success', transactionHash: replacementHash },
      });
      return { status: 'success', transactionHash: replacementHash };
    });

    await expect(waitForConfirmedEvmTransaction(
      { waitForTransactionReceipt },
      originalHash,
    )).rejects.toBeInstanceOf(TransactionReplacementError);
  });

  it('mantiene pendiente el hash nuevo si una repricing aún no tiene receipt', async () => {
    const originalHash = `0x${'5'.repeat(64)}` as `0x${string}`;
    const replacementHash = `0x${'6'.repeat(64)}` as `0x${string}`;
    const waitForTransactionReceipt = jest.fn(async (input: {
      hash: `0x${string}`;
      onReplaced?: (value: unknown) => void;
    }) => {
      input.onReplaced?.({
        reason: 'repriced',
        replacedTransaction: { hash: originalHash },
        transaction: { hash: replacementHash },
      });
      throw new Error('timed out waiting for receipt');
    });

    await expect(waitForConfirmedEvmTransaction(
      { waitForTransactionReceipt },
      originalHash,
    )).rejects.toMatchObject({
      name: 'TransactionReplacementPendingError',
      message: 'TRANSACTION_PENDING',
      hash: replacementHash,
    });
    await expect(waitForConfirmedEvmTransaction(
      { waitForTransactionReceipt },
      originalHash,
    )).rejects.toBeInstanceOf(TransactionReplacementPendingError);
  });
});
