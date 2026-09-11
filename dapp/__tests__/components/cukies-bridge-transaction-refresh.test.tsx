import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockWagmiConfig = {};
const mockPublicClient = { waitForTransactionReceipt: jest.fn() };
const mockWriteContractAsync = jest.fn();
const mockRequestWallet = jest.fn();
const mockReadTronContractAt = jest.fn();
const mockSendTronContractAt = jest.fn();
const mockWaitForLegacyTronReceipt = jest.fn();
const mockRetryTransactionRefresh = jest.fn();

let mockEvmAddress = '0x00000000000000000000000000000000000000aa';
let mockEvmChainId = 56;
let mockTronAddress = 'TA';
let mockDestinationItems: LegacyMarketplaceCukiItem[] = [];
const mockTronWeb = {
  ready: true,
  defaultAddress: { base58: mockTronAddress },
  fullNode: { host: 'https://api.trongrid.io' },
  contract: jest.fn(),
};

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: mockEvmAddress,
    chainId: mockEvmChainId,
    isConnected: true,
  })),
  useConfig: jest.fn(() => mockWagmiConfig),
  usePublicClient: jest.fn(() => mockPublicClient),
  useReadContract: jest.fn(() => ({ data: undefined })),
  useWriteContract: jest.fn(() => ({
    writeContractAsync: mockWriteContractAsync,
    isPending: false,
  })),
}));

jest.mock('wagmi/actions', () => ({
  getAccount: jest.fn(() => ({ address: mockEvmAddress })),
  getChainId: jest.fn(() => mockEvmChainId),
}));

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowRightLeft: Icon,
    Check: Icon,
    ChevronDown: Icon,
    Loader2: Icon,
    Network: Icon,
    RefreshCcw: Icon,
    Route: Icon,
    ShieldAlert: Icon,
    Wallet: Icon,
  };
});

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: () => <div />,
}));

jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: jest.fn(() => ({
    address: mockTronAddress,
    connect: jest.fn(),
    isConnected: true,
    isInstalled: true,
    isLoading: false,
  })),
}));

jest.mock('@/providers/wallet-coordinator-context', () => ({
  useWalletCoordinator: jest.fn(() => ({ requestWallet: mockRequestWallet })),
}));

jest.mock('@/lib/legacy-marketplace/bridge-runtime', () => ({
  cukiesBridgeRuntimeConfig: {
    appEnv: 'production',
    mode: 'legacy-readonly',
    enabled: true,
    operationsEnabled: true,
    bsc: {
      chainId: 56,
      networkLabel: 'BNB Smart Chain',
      collectionAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
      endpointAddress: '0xb775ec58411f0460716cc7fa6fbbe2c38afd2a6e',
      explorerBaseUrl: 'https://bscscan.com',
    },
    tron: {
      network: 'mainnet',
      networkLabel: 'TRON Mainnet',
      rpcUrl: 'https://api.trongrid.io',
      collectionAddress: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
      endpointAddress: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
    },
    issues: [],
  },
}));

jest.mock('@/lib/legacy-marketplace/tron', () => ({
  getLegacyTronWeb: jest.fn(() => mockTronWeb),
  getLegacyTronWalletRpcOrigin: jest.fn((tronWeb?: { fullNode?: { host?: string } } | null) => (
    tronWeb?.fullNode?.host ? new URL(tronWeb.fullNode.host).origin : null
  )),
  isLegacyTronWalletOnRpc: jest.fn((tronWeb: { fullNode?: { host?: string } } | null, expected: string) => {
    const host = tronWeb?.fullNode?.host;
    if (!host) return false;
    return new URL(host).origin === new URL(expected).origin;
  }),
  readTronContractAt: (...args: unknown[]) => mockReadTronContractAt(...args),
  sendTronContractAt: (...args: unknown[]) => mockSendTronContractAt(...args),
}));

jest.mock('@/lib/legacy-marketplace/transaction', () => {
  const actual = jest.requireActual<typeof import('@/lib/legacy-marketplace/transaction')>(
    '@/lib/legacy-marketplace/transaction',
  );
  return {
    ...actual,
    waitForLegacyTronReceipt: (...args: unknown[]) => mockWaitForLegacyTronReceipt(...args),
  };
});

jest.mock('@/lib/transaction-refresh', () => {
  const actual = jest.requireActual<typeof import('@/lib/transaction-refresh')>('@/lib/transaction-refresh');
  return {
    ...actual,
    retryTransactionRefresh: (attempt: () => Promise<boolean>) => mockRetryTransactionRefresh(attempt),
  };
});

import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';
import { BridgeClient } from '@/components/legacy-marketplace/bridge-client';

const bridgeTxId = 'a'.repeat(64);
const tronCollection = 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe';
const bscCollection = '0x0dbDeBCC62f11005BF434ABFad74564E896aC861';

const candidate: LegacyMarketplaceCukiItem = {
  id: '7',
  tokenId: '7',
  chainId: null,
  collectionAddress: tronCollection,
  cukiNumber: 7,
  owner: mockTronAddress,
  ownerNormalized: mockTronAddress,
  identityVerified: true,
  ownershipVerified: true,
  ownershipSource: 'legacy-ownerOf',
  eligibilityVerified: true,
  eligibilitySource: 'legacy-getNumBreedsByCukie',
  network: 'TRON',
  origin: 'original',
  birthNetwork: 'TRON',
  imageUrl: null,
  type: 1,
  state: 'available',
  price: 0,
  priceOriginal: '0',
  skills: { generation: 1 },
  childrenCount: 0,
  childrenCountTron: 0,
  childrenCountBsc: 0,
  parents: [],
  children: [],
  history: [],
  timestamp: null,
};

function destinationItem(): LegacyMarketplaceCukiItem {
  return {
    ...candidate,
    chainId: 56,
    collectionAddress: bscCollection,
    owner: mockEvmAddress,
    ownerNormalized: mockEvmAddress.toLowerCase(),
    network: 'BSC',
    birthNetwork: 'TRON',
    state: 'available',
  };
}

function mockFetchResponse(input: unknown) {
  const query = new URL(String(input), 'http://localhost').searchParams;
  const state = query.get('state');
  const network = query.get('network');
  const items = state === 'available' && network === 'TRON'
    ? [candidate]
    : state === 'available' && network === 'BSC'
    ? mockDestinationItems
    : [];
  return Promise.resolve({
    ok: true,
    json: async () => ({ source: 'mongo', items, total: items.length, offset: 0, limit: 60 }),
  });
}

describe('Bridge Legacy: confirmación y refresh de transacción', () => {
  beforeEach(() => {
    mockEvmAddress = '0x00000000000000000000000000000000000000aa';
    mockEvmChainId = 56;
    mockTronAddress = 'TA';
    mockTronWeb.defaultAddress.base58 = mockTronAddress;
    mockDestinationItems = [];
    jest.clearAllMocks();
    mockRequestWallet.mockResolvedValue({ kind: 'tron', address: mockTronAddress });
    mockReadTronContractAt.mockImplementation(async (_web: unknown, _abi: unknown, _address: string, name: string) => {
      if (name === 'bridgePrice') return '1000000';
      if (name === 'paused') return false;
      return true;
    });
    mockSendTronContractAt.mockResolvedValue({ txid: bridgeTxId });
    mockRetryTransactionRefresh.mockImplementation(async (attempt: () => Promise<boolean>) => attempt());
    global.fetch = jest.fn(mockFetchResponse) as never;
  });

  async function selectCandidate() {
    const button = await screen.findByRole('button', { name: /Cukie #7/ });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Iniciar bridge' })).toBeEnabled();
    });
  }

  it('conserva el txid TRON pendiente, mantiene el pending ante un cambio EVM y comprueba sin firmar otra vez', async () => {
    mockWaitForLegacyTronReceipt
      .mockRejectedValueOnce(new Error('TRANSACTION_PENDING'))
      .mockResolvedValueOnce(bridgeTxId);

    const view = render(<BridgeClient />);
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar bridge' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Comprobar envío' })).toBeInTheDocument();
    });
    expect(screen.getByText(/El bridge sigue pendiente de confirmación/i)).toBeInTheDocument();
    expect(mockSendTronContractAt).toHaveBeenCalledTimes(1);

    mockEvmAddress = '0x00000000000000000000000000000000000000bb';
    view.rerender(<BridgeClient />);
    expect(screen.getByRole('button', { name: 'Comprobar envío' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Comprobar envío' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Comprobar entrega' })).toBeInTheDocument();
    });
    expect(mockSendTronContractAt).toHaveBeenCalledTimes(1);
  });

  it('separa receipt origen de entrega destino y permite converger después del refresh agotado sin nuevo broadcast', async () => {
    mockWaitForLegacyTronReceipt.mockResolvedValue(bridgeTxId);

    render(<BridgeClient />);
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar bridge' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Comprobar entrega' })).toBeInTheDocument();
    });
    expect(screen.getByText(/La entrega en la red destino aún no aparece/i)).toBeInTheDocument();
    expect(mockSendTronContractAt).toHaveBeenCalledTimes(1);

    mockDestinationItems = [destinationItem()];
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar entrega' }));
    await waitFor(() => {
      expect(screen.getByText(/Bridge completado\. El Cukie ya está disponible/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Comprobar entrega' })).not.toBeInTheDocument();
    expect(mockSendTronContractAt).toHaveBeenCalledTimes(1);
  });
});
