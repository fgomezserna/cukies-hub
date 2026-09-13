import { act, renderHook, waitFor } from '@testing-library/react';
import type { UkiMarketplaceOrderView } from '@/lib/uki-marketplace/types';

let mockAddress: string | null = null;
let mockChainId: number | null = 97;
let mockPublicClient: unknown = null;
let mockWriteContractAsync: jest.Mock = jest.fn();

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: mockAddress, chainId: mockChainId }),
  usePublicClient: () => mockPublicClient,
  useWriteContract: () => ({ writeContractAsync: mockWriteContractAsync }),
}));
jest.mock('@/lib/uki-marketplace/public-config', () => ({
  ukiMarketplacePublicConfig: { chainId: 97, marketplaceAddress: '0x00000000000000000000000000000000000000cc' },
}));

import {
  cancelUkiMarketplaceOrder,
  UkiMarketplaceCancelPendingError,
  useUkiMarketplaceCancelController,
  type UkiMarketplaceCancelPublicClient,
  type UkiMarketplaceCancelWriteContract,
} from '@/components/uki-marketplace/cancel-order';

const seller = '0x00000000000000000000000000000000000000aa' as `0x${string}`;
const collection = '0x00000000000000000000000000000000000000bb' as `0x${string}`;
const marketplace = '0x00000000000000000000000000000000000000cc' as `0x${string}`;
const orderId = `0x${'1'.repeat(64)}` as `0x${string}`;
const txHash = `0x${'2'.repeat(64)}` as `0x${string}`;
const replacementHash = `0x${'3'.repeat(64)}` as `0x${string}`;
const price = BigInt('1250000000000000000000');

const order: UkiMarketplaceOrderView = {
  orderId,
  chainId: 97,
  marketplaceAddress: marketplace,
  collectionAddress: collection,
  tokenId: '73',
  seller,
  ukiPriceRaw: price.toString(),
  expiresAt: '2027-01-15T08:00:00.000Z',
  nonceRaw: '1',
  feeBps: 500,
  status: 'active',
  attentionReason: null,
  buyer: null,
  paymentToken: null,
  paymentAmountRaw: null,
  feeAmountRaw: null,
  listedAt: '2026-09-01T10:00:00.000Z',
  soldAt: null,
  cancelledAt: null,
  expiredAt: null,
  invalidatedAt: null,
};

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  const readContract = jest.fn(async (input: { functionName: string }) => {
    if (Object.prototype.hasOwnProperty.call(overrides, input.functionName)) {
      return overrides[input.functionName];
    }
    if (input.functionName === 'orders') return [seller, collection, BigInt(73), price, BigInt(1_800_000_000), BigInt(1), 500, 1];
    if (input.functionName === 'orderState') return 1;
    if (input.functionName === 'activeOrderIds') return orderId;
    if (input.functionName === 'collectionAllowed') return true;
    if (input.functionName === 'ownerOf') return seller;
    throw new Error(`Unexpected read ${input.functionName}`);
  });
  const waitForTransactionReceipt = jest.fn(async () => ({ status: 'success' }));
  return {
    readContract,
    waitForTransactionReceipt,
  } as unknown as UkiMarketplaceCancelPublicClient;
}

const writeContractAsync = jest.fn(async () => txHash) as unknown as UkiMarketplaceCancelWriteContract;

describe('cancelación UKI con identidad exacta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddress = seller;
    mockChainId = 97;
    mockPublicClient = null;
    mockWriteContractAsync = jest.fn();
  });

  it('revalida propietario, orden activa y precio antes de firmar', async () => {
    const client = makeClient({ ownerOf: '0x00000000000000000000000000000000000000dd' });

    await expect(cancelUkiMarketplaceOrder({
      order,
      walletAddress: seller,
      expectedChainId: 97,
      marketplaceAddress: marketplace,
      publicClient: client,
      writeContractAsync,
    })).rejects.toThrow('MARKETPLACE_CANCEL_STALE_ORDER');
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('firma una sola vez y devuelve el hash minado', async () => {
    const client = makeClient();
    const result = await cancelUkiMarketplaceOrder({
      order,
      walletAddress: seller,
      expectedChainId: 97,
      marketplaceAddress: marketplace,
      publicClient: client,
      writeContractAsync,
    });

    expect(result.hash).toBe(txHash);
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 97,
      functionName: 'cancelOrder',
      args: [orderId],
    }));
  });

  it('conserva el hash como pending cuando el RPC no confirma el receipt', async () => {
    const client = makeClient();
    const wait = client.waitForTransactionReceipt as unknown as jest.Mock;
    wait.mockRejectedValueOnce(new Error('RPC timeout'));

    await expect(cancelUkiMarketplaceOrder({
      order,
      walletAddress: seller,
      expectedChainId: 97,
      marketplaceAddress: marketplace,
      publicClient: client,
      writeContractAsync,
    })).rejects.toBeInstanceOf(UkiMarketplaceCancelPendingError);
  });

  it('conserva una transacción repriciada como pendiente para reintento', async () => {
    const client = makeClient();
    const wait = client.waitForTransactionReceipt as unknown as jest.Mock;
    wait.mockImplementationOnce(async (input: { onReplaced?: (value: unknown) => void }) => {
      input.onReplaced?.({
        reason: 'repriced',
        replacedHash: txHash,
        replacementHash,
      });
      throw new Error('RPC timeout');
    });

    await expect(cancelUkiMarketplaceOrder({
      order,
      walletAddress: seller,
      expectedChainId: 97,
      marketplaceAddress: marketplace,
      publicClient: client,
      writeContractAsync,
    })).rejects.toBeInstanceOf(UkiMarketplaceCancelPendingError);
  });

  it('conserva el pending oculto al cambiar de orden y lo recupera al volver al contexto original', async () => {
    const client = makeClient();
    const wait = client.waitForTransactionReceipt as unknown as jest.Mock;
    wait.mockImplementationOnce(async (input: { onReplaced?: (value: unknown) => void }) => {
      input.onReplaced?.({
        reason: 'repriced',
        replacedHash: txHash,
        replacementHash,
      });
      throw new Error('RPC timeout');
    });
    mockPublicClient = client;
    mockWriteContractAsync.mockResolvedValue(txHash);
    const otherOrder = { ...order, orderId: `0x${'9'.repeat(64)}` as `0x${string}`, tokenId: '74' };
    const view = renderHook(
      ({ currentOrder }: { currentOrder: UkiMarketplaceOrderView }) => useUkiMarketplaceCancelController({ order: currentOrder }),
      { initialProps: { currentOrder: order } },
    );

    await act(async () => {
      expect(await view.result.current.cancelOrder()).toBe(false);
    });
    await waitFor(() => expect(view.result.current.pending?.hash).toBe(replacementHash));

    view.rerender({ currentOrder: otherOrder });
    await waitFor(() => expect(view.result.current.pending).toBeNull());
    view.rerender({ currentOrder: order });
    await waitFor(() => expect(view.result.current.pending?.hash).toBe(replacementHash));
    expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
  });

  it('limpia el pending cuando el receipt comprobado está revertido', async () => {
    const client = makeClient();
    const wait = client.waitForTransactionReceipt as unknown as jest.Mock;
    wait.mockImplementationOnce(async (input: { onReplaced?: (value: unknown) => void }) => {
      input.onReplaced?.({
        reason: 'repriced',
        replacedHash: txHash,
        replacementHash,
      });
      throw new Error('RPC timeout');
    });
    mockPublicClient = client;
    mockWriteContractAsync.mockResolvedValue(txHash);
    const view = renderHook(() => useUkiMarketplaceCancelController({ order }));

    await act(async () => {
      expect(await view.result.current.cancelOrder()).toBe(false);
    });
    await waitFor(() => expect(view.result.current.pending?.hash).toBe(replacementHash));

    wait.mockResolvedValueOnce({ status: 'reverted' });
    await act(async () => {
      expect(await view.result.current.recheckPending()).toBe(false);
    });
    await waitFor(() => expect(view.result.current.pending).toBeNull());
    expect(view.result.current.error).toMatch(/revertida/i);
  });
});
