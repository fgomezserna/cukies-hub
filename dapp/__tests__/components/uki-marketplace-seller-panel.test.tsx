import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const wallet = '0x00000000000000000000000000000000000000aa';
const marketplace = '0x1111111111111111111111111111111111111111';
const collection = '0x2222222222222222222222222222222222222222';
const approvalHash = `0x${'a'.repeat(64)}`;
const orderHash = `0x${'b'.repeat(64)}`;
const cancelHash = `0x${'c'.repeat(64)}`;
const orderId = `0x${'1'.repeat(64)}`;

let published = false;
let cancelled = false;
let existingActiveOrder = false;
let approved = false;
let requiresApproval = false;

const readContract = jest.fn(async (input: { functionName: string }) => {
  switch (input.functionName) {
    case 'feeBps':
      return 1_000;
    case 'ownerOf':
      return wallet;
    case 'collectionAllowed':
      return true;
    case 'getApproved':
      return approved ? marketplace : '0x0000000000000000000000000000000000000000';
    case 'isApprovedForAll':
      return false;
    case 'activeOrderIds':
      return published || existingActiveOrder ? orderId : `0x${'0'.repeat(64)}`;
    case 'orderState':
      return 1;
    default:
      throw new Error(`Unexpected read ${input.functionName}`);
  }
});
const waitForTransactionReceipt = jest.fn(async () => ({ status: 'success' }));
const writeContractAsync = jest.fn(async (input: { functionName: string }) => {
  if (input.functionName === 'approve') {
    approved = true;
    return approvalHash;
  }
  if (input.functionName === 'createOrder') {
    published = true;
    return orderHash;
  }
  if (input.functionName === 'cancelOrder') {
    cancelled = true;
    return cancelHash;
  }
  throw new Error(`Unexpected write ${input.functionName}`);
});

jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x00000000000000000000000000000000000000aa',
    chainId: 97,
    connector: { id: 'mock' },
    isConnected: true,
  }),
  usePublicClient: () => ({ readContract, waitForTransactionReceipt }),
  useSwitchChain: () => ({ switchChain: jest.fn(), isPending: false }),
  useWriteContract: () => ({ writeContractAsync }),
}));
jest.mock('@/hooks/use-has-mounted', () => ({ useHasMounted: () => true }));
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { walletAddress: '0x00000000000000000000000000000000000000aa' },
    walletType: 'evm',
    isLoading: false,
    fetchUser: jest.fn(),
  }),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
jest.mock('@/lib/uki-marketplace/public-config', () => ({
  ukiMarketplacePublicConfig: {
    ready: true,
    chainId: 97,
    marketplaceAddress: '0x1111111111111111111111111111111111111111',
    collectionAddresses: ['0x2222222222222222222222222222222222222222'],
    explorerBaseUrl: 'https://testnet.bscscan.com',
    issues: [],
  },
}));

import { UkiMarketplaceSellerPanel } from '@/components/uki-marketplace/seller-panel';

const inventoryItem = {
  assetId: `97:${collection}:73`,
  collectionAddress: collection,
  tokenId: '73',
  imageUrl: '/cuki/73.png',
  rarity: 'rare',
  state: 'available',
  listingEligible: true,
  listingBlockers: [],
};

function sellerOrder(status: 'active' | 'cancelled' | 'requires_attention' = 'active') {
  return {
    orderId,
    chainId: 97,
    marketplaceAddress: marketplace,
    collectionAddress: collection,
    tokenId: '73',
    seller: wallet,
    ukiPriceRaw: '1250000000000000000000',
    expiresAt: '2026-09-15T14:00:00.000Z',
    nonceRaw: '1',
    feeBps: 1_000,
    status,
    attentionReason: status === 'requires_attention' ? 'approval_required' : null,
    buyer: null,
    paymentToken: null,
    paymentAmountRaw: null,
    feeAmountRaw: null,
    listedAt: '2026-08-30T10:00:00.000Z',
    soldAt: null,
    cancelledAt: status === 'cancelled' ? '2026-08-30T11:00:00.000Z' : null,
    expiredAt: null,
    invalidatedAt: null,
  };
}

describe('zona vendedor marketplace UKI', () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/inventory')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', data: { items: [inventoryItem] } }),
      };
    }
    const orders = existingActiveOrder || published
      ? [sellerOrder(cancelled
        ? 'cancelled'
        : requiresApproval && !approved
          ? 'requires_attention'
          : 'active')]
      : [];
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', data: { orders } }),
    };
  });

  beforeEach(() => {
    published = false;
    cancelled = false;
    existingActiveOrder = false;
    approved = false;
    requiresApproval = false;
    jest.clearAllMocks();
    global.fetch = fetchMock as never;
  });

  it('aprueba por token y crea la orden solo tras verificar chain, owner y colección', async () => {
    render(<UkiMarketplaceSellerPanel />);

    await waitFor(() => expect(screen.getByText('Cukie #73')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Precio del vendedor en UKI'), {
      target: { value: '1250' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar y publicar' }));

    await waitFor(() => {
      expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 97,
        address: collection,
        functionName: 'approve',
        args: [marketplace, BigInt(73)],
      }));
      expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 97,
        address: marketplace,
        functionName: 'createOrder',
      }));
    });
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByText(/confirmada y visible en tu historial/)).toBeInTheDocument();
    });
  });

  it('cancela por order ID y espera el receipt antes de cerrar el historial', async () => {
    existingActiveOrder = true;
    render(<UkiMarketplaceSellerPanel />);

    const cancelButton = await screen.findByRole('button', { name: 'Cancelar on-chain' });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 97,
        address: marketplace,
        functionName: 'cancelOrder',
        args: [orderId],
      }));
    });
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: cancelHash });
    await waitFor(() => {
      expect(screen.getByText('Orden cancelada y reflejada en tu historial.')).toBeInTheDocument();
    });
  });

  it('restaura una aprobación revocada sin crear una orden nueva', async () => {
    existingActiveOrder = true;
    requiresApproval = true;
    render(<UkiMarketplaceSellerPanel />);

    const approveButton = await screen.findByRole('button', { name: 'Restaurar aprobación' });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 97,
        address: collection,
        functionName: 'approve',
        args: [marketplace, BigInt(73)],
      }));
    });
    expect(writeContractAsync).not.toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'createOrder',
    }));
    await waitFor(() => {
      expect(screen.getByText('Aprobación restaurada; la orden vuelve a estar activa.')).toBeInTheDocument();
    });
  });
});
