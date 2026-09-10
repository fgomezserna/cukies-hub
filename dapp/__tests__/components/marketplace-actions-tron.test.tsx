import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const seller = 'TX6HFfdqgDQVAtGVuUqPp3RbHtnLUq9qDE';
const buyer = 'TQpJQw7YqgJ5Yh4m1Z4xC8b5xK2mF9sVJhM';
const txId = 'b'.repeat(64);
const tronWeb = {
  ready: true,
  defaultAddress: { base58: buyer },
  fullNode: { host: 'https://api.trongrid.io' },
  trx: {
    getTransactionInfo: jest.fn(async () => ({ receipt: { result: 'SUCCESS' } })),
  },
  contract: jest.fn(),
  address: { toHex: (value: string) => value },
};
const readLegacyTronContract = jest.fn(async (_web: unknown, contract: string, functionName: string) => {
  if (contract === 'marketplace' && functionName === 'paused') return false;
  if (contract === 'token' && functionName === 'ownerOf') return seller;
  if (contract === 'marketplace' && functionName === 'marketTokens') return [seller, '3333000000', '333300000', true, '0', '0'];
  throw new Error(`Unexpected read ${contract}.${functionName}`);
});
const sendLegacyTronContract = jest.fn(async () => ({ id: txId, receipt: { result: 'SUCCESS' } }));
const requestWallet = jest.fn(async () => ({ kind: 'tron' as const, address: buyer }));
const routerRefresh = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('lucide-react', () => {
  const Icon = () => null;
  return {
    CircleDollarSign: Icon,
    RotateCcw: Icon,
    Tag: Icon,
    Wallet: Icon,
  };
});
jest.mock('wagmi', () => ({
  useAccount: () => ({ address: null, chainId: undefined, isConnected: false }),
  useConnect: () => ({ isPending: false }),
  useConfig: () => ({ account: undefined, chainId: undefined }),
  usePublicClient: () => null,
  useReadContract: () => ({ data: undefined }),
  useWriteContract: () => ({ writeContractAsync: jest.fn(), isPending: false }),
}));
jest.mock('wagmi/actions', () => ({
  getAccount: () => ({ address: null }),
  getChainId: () => undefined,
}));
jest.mock('@/providers/wallet-coordinator-context', () => ({
  useWalletCoordinator: () => ({ requestWallet, evm: { isConnecting: false } }),
}));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: () => ({ address: buyer, isConnected: true, isInstalled: true }),
}));
jest.mock('@/lib/legacy-marketplace/runtime', () => ({
  legacyMarketplaceRuntime: { legacyMarketplaceActionsEnabled: true },
}));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  getLegacyTronWeb: () => tronWeb,
  getLegacyTronReadWeb: () => tronWeb,
  readLegacyTronContract: (...args: Parameters<typeof readLegacyTronContract>) => readLegacyTronContract(...args),
  sendLegacyTronContract: (...args: Parameters<typeof sendLegacyTronContract>) => sendLegacyTronContract(...args),
}));
jest.mock('@/lib/legacy-marketplace/action-safety', () => ({
  assertDisplayedPriceUnchanged: jest.fn(),
  assertEvmActionContext: jest.fn(),
  assertTronActionContext: jest.fn(),
  captureTronActionContext: jest.fn(() => ({
    address: buyer,
    nodeHost: 'api.trongrid.io',
    chainId: 'tron:mainnet',
  })),
  isSameEvmWallet: (left: string | null | undefined, right: string | null | undefined) => Boolean(left && right && left.toLowerCase() === right.toLowerCase()),
  isSameTronWallet: (_web: unknown, left: string | null | undefined, right: string | null | undefined) => left === right,
  reconcileConfirmedMarketplaceAction: async (confirm: () => Promise<unknown>, reconcile: () => Promise<void>) => {
    const result = await confirm();
    try {
      await reconcile();
      return { result, reconciled: true as const };
    } catch {
      return { result, reconciled: false as const };
    }
  },
}));

import { MarketplaceActions } from '@/components/legacy-marketplace/marketplace-actions';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

const cuki: LegacyMarketplaceCukiItem = {
  id: '2000000004314',
  tokenId: '2000000004314',
  chainId: null,
  collectionAddress: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
  cukiNumber: 4314,
  owner: seller,
  network: 'TRON',
  origin: 'mint',
  birthNetwork: 'TRON',
  imageUrl: null,
  type: 2,
  state: 'onSale',
  price: 3333,
  priceOriginal: '3333000000',
  skills: { generation: 1 },
  childrenCount: 0,
  childrenCountTron: 0,
  childrenCountBsc: 0,
  parents: [],
  children: [],
  history: [],
  timestamp: null,
};

describe('MarketplaceActions · compra TRON', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis.fetch as jest.Mock) = jest.fn(async () => ({ ok: true }));
  });

  it('conserva el txid devuelto tras el broadcast y no vuelve a firmar', async () => {
    render(<MarketplaceActions cuki={cuki} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar y revisar compra' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar compra' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));

    await waitFor(() => expect(sendLegacyTronContract).toHaveBeenCalledWith(
      tronWeb,
      'marketplace',
      'buyToken',
      [cuki.tokenId],
      expect.objectContaining({ shouldPollResponse: false, callValue: 3333000000 }),
      expect.any(Function),
    ));
    await waitFor(() => expect(screen.getByText(/Compra confirmada en TRON Mainnet/)).toBeInTheDocument());
    expect(sendLegacyTronContract).toHaveBeenCalledTimes(1);
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('explica que falta el signer de TronLink y deja reintentar', async () => {
    sendLegacyTronContract.mockRejectedValueOnce(new Error('TRON_SIGNER_UNAVAILABLE'));
    render(<MarketplaceActions cuki={cuki} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar y revisar compra' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar compra' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));

    await waitFor(() => expect(screen.getByText('Conecta TronLink para confirmar la operación y vuelve a intentarlo.')).toBeInTheDocument());
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('mantiene bloqueada la compra tras timeout y permite reconsultar sin otro broadcast', async () => {
    let reads = 0;
    tronWeb.trx.getTransactionInfo.mockImplementation(async () => {
      reads += 1;
      return (reads < 7 ? {} : { receipt: { result: 'SUCCESS' } }) as unknown as {
        receipt: { result: string };
      };
    });

    render(<MarketplaceActions cuki={cuki} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar y revisar compra' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar compra' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprobar operación pendiente' })).toBeEnabled(), { timeout: 10_000 });
    expect(sendLegacyTronContract).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar operación pendiente' }));

    await waitFor(() => expect(screen.getByText(/Compra confirmada en TRON Mainnet/)).toBeInTheDocument());
    expect(sendLegacyTronContract).toHaveBeenCalledTimes(1);
  }, 12_000);
});
