import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const seller = '0x1111111111111111111111111111111111111111';
const buyer = '0x2222222222222222222222222222222222222222';
const listingHash = `0x${'c'.repeat(64)}`;
let currentChainId: number | undefined = 1;
let currentAddress: string | undefined = buyer;

const readContract = jest.fn(async (input: { functionName: string }) => {
  if (input.functionName === 'paused') return false;
  if (input.functionName === 'ownerOf') return seller;
  if (input.functionName === 'marketTokens') return [seller, BigInt('195000000000000000'), BigInt(0), true, BigInt(0), BigInt(0)];
  if (input.functionName === 'feeCancelPrice' || input.functionName === 'feeChangePrice') return BigInt(0);
  throw new Error(`Unexpected read ${input.functionName}`);
});
const waitForTransactionReceipt = jest.fn(async () => ({ status: 'success' }));
const writeContractAsync = jest.fn(async () => listingHash);
const requestWallet = jest.fn(async () => {
  currentAddress = buyer;
  currentChainId = 56;
  return { kind: 'evm' as const, address: buyer, chainId: 56 };
});
const publicClient = { readContract, waitForTransactionReceipt };
const wagmiConfig = {};

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
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
  useAccount: () => ({ address: currentAddress, chainId: currentChainId, isConnected: Boolean(currentAddress) }),
  useConnect: () => ({ isPending: false }),
  useConfig: () => wagmiConfig,
  usePublicClient: () => publicClient,
  useReadContract: () => ({ data: undefined }),
  useWriteContract: () => ({ writeContractAsync, isPending: false }),
}));
jest.mock('wagmi/actions', () => ({
  getAccount: () => ({ address: currentAddress }),
  getChainId: () => currentChainId,
}));
jest.mock('@/providers/wallet-coordinator-context', () => ({
  useWalletCoordinator: () => ({ requestWallet, evm: { isConnecting: false } }),
}));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: () => ({ address: null, isConnected: false, isInstalled: false }),
}));
jest.mock('@/lib/legacy-marketplace/runtime', () => ({
  legacyMarketplaceRuntime: { legacyMarketplaceActionsEnabled: true },
}));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  getLegacyTronWeb: () => null,
  getLegacyTronReadWeb: () => null,
  readLegacyTronContract: jest.fn(),
  sendLegacyTronContract: jest.fn(),
}));
jest.mock('@/lib/legacy-marketplace/action-safety', () => ({
  assertDisplayedPriceUnchanged: jest.fn(),
  assertEvmActionContext: jest.fn(),
  assertTronActionContext: jest.fn(),
  captureTronActionContext: jest.fn(),
  isSameEvmWallet: (left: string | null | undefined, right: string | null | undefined) => Boolean(left && right && left.toLowerCase() === right.toLowerCase()),
  isSameTronWallet: jest.fn(() => false),
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

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

import { MarketplaceActions } from '@/components/legacy-marketplace/marketplace-actions';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

const cuki: LegacyMarketplaceCukiItem = {
  id: '4314',
  tokenId: '4314',
  chainId: 56,
  collectionAddress: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
  cukiNumber: 4314,
  owner: seller,
  network: 'BSC',
  origin: 'mint',
  birthNetwork: 'BSC',
  imageUrl: null,
  type: 2,
  state: 'onSale',
  price: 0.195,
  priceOriginal: '195000000000000000',
  skills: { generation: 1 },
  childrenCount: 0,
  childrenCountTron: 0,
  childrenCountBsc: 0,
  parents: [],
  children: [],
  history: [],
  timestamp: null,
};

describe('MarketplaceActions · compra BSC', () => {
  beforeEach(() => {
    currentChainId = 1;
    currentAddress = buyer;
    jest.clearAllMocks();
    (globalThis.fetch as jest.Mock) = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: {
          item: { ...cuki, owner: buyer, state: 'available' },
          changed: true,
          paused: false,
        },
      }),
    }));
  });

  it('cambia a BNB Smart Chain antes de enviar una única compra', async () => {
    render(<MarketplaceActions cuki={cuki} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a BNB Smart Chain' }));
    await waitFor(() => expect(screen.getByText('Wallet lista. Revisa la acción y confirma la transacción.')).toBeInTheDocument());
    expect(currentChainId).toBe(56);

    fireEvent.click(screen.getByRole('button', { name: 'Conectar y revisar compra' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar compra' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'buyToken',
      account: buyer,
      chainId: 56,
      value: BigInt('195000000000000000'),
    })));
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/Compra confirmada en BNB Smart Chain/)).toBeInTheDocument());
  });
});
