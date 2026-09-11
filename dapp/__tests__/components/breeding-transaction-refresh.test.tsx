import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockWagmiConfig = {};
const mockWriteContractAsync = jest.fn();
const mockWaitForTransactionReceipt = jest.fn();
const mockLegacyBscReadContract = jest.fn();
const mockBscReadContract = jest.fn();
const mockRefetchBscMaxBreeds = jest.fn();
const mockRefetchBscPoints = jest.fn();
const mockRequestWallet = jest.fn();
const mockRetryTransactionRefresh = jest.fn();

let mockEvmAddress = '0x00000000000000000000000000000000000000aa';
let mockEvmChainId = 56;
let mockActiveBreedIds: string[] = [];
let mockCompletedItems: LegacyMarketplaceCukiItem[] = [];

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: mockEvmAddress,
    chainId: mockEvmChainId,
    isConnected: true,
  })),
  useConfig: jest.fn(() => mockWagmiConfig),
  useReadContract: jest.fn((args: { functionName: string }) => {
    if (args.functionName === 'getMaxBreedsByCukie') {
      return {
        data: BigInt(2),
        isLoading: false,
        isError: false,
        refetch: mockRefetchBscMaxBreeds,
      };
    }
    if (args.functionName === 'getPoints') {
      return {
        data: BigInt(100),
        isLoading: false,
        isError: false,
        refetch: mockRefetchBscPoints,
      };
    }
    if (args.functionName === 'isApprovedForAll') {
      return { data: true, isLoading: false, isError: false };
    }
    return { data: BigInt(25), isLoading: false, isError: false };
  }),
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
    Baby: Icon,
    Check: Icon,
    Dna: Icon,
    Heart: Icon,
    Loader2: Icon,
    Network: Icon,
    RefreshCcw: Icon,
    Sparkles: Icon,
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
    address: null,
    connect: jest.fn(),
    isConnected: false,
    isInstalled: false,
    isLoading: false,
  })),
}));

jest.mock('@/providers/wallet-coordinator-context', () => ({
  useWalletCoordinator: jest.fn(() => ({ requestWallet: mockRequestWallet })),
}));

jest.mock('@/lib/legacy-marketplace/runtime', () => ({
  legacyMarketplaceRuntime: {
    legacyMainnetReadEnabled: true,
    legacyMainnetOperationsEnabled: true,
  },
}));

jest.mock('@/lib/legacy-marketplace/bsc', () => ({
  legacyBscPublicClient: {
    readContract: (...args: unknown[]) => mockBscReadContract(...args),
    waitForTransactionReceipt: (...args: unknown[]) => mockWaitForTransactionReceipt(...args),
  },
  readLegacyBscContract: (...args: unknown[]) => mockLegacyBscReadContract(...args),
}));

jest.mock('@/lib/legacy-marketplace/tron', () => ({
  LEGACY_TRON_MAINNET_RPC_URL: 'https://api.trongrid.io',
  getLegacyTronWeb: jest.fn(() => null),
  getLegacyTronWalletRpcOrigin: jest.fn(() => null),
  isLegacyTronWalletOnRpc: jest.fn(() => false),
  readLegacyTronContract: jest.fn(),
  sendLegacyTronContract: jest.fn(),
}));

jest.mock('@/lib/transaction-refresh', () => {
  const actual = jest.requireActual<typeof import('@/lib/transaction-refresh')>('@/lib/transaction-refresh');
  return {
    ...actual,
    retryTransactionRefresh: (attempt: () => Promise<boolean>) => mockRetryTransactionRefresh(attempt),
  };
});

import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { BreedingClient } from '@/components/legacy-marketplace/breeding-client';

const startHash = `0x${'1'.repeat(64)}`;
const openHash = `0x${'2'.repeat(64)}`;
const walletA = '0x00000000000000000000000000000000000000aa';
const walletB = '0x00000000000000000000000000000000000000bb';

function candidate(tokenId: string, owner: string): LegacyMarketplaceCukiItem {
  return {
    id: tokenId,
    tokenId,
    chainId: 56,
    collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
    cukiNumber: Number(tokenId),
    owner,
    ownerNormalized: owner.toLowerCase(),
    identityVerified: true,
    ownershipVerified: true,
    ownershipSource: 'legacy-ownerOf',
    eligibilityVerified: true,
    eligibilitySource: 'legacy-getNumBreedsByCukie',
    network: 'BSC',
    origin: 'original',
    birthNetwork: 'BSC',
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
}

function completedCuki(tokenId: string): LegacyMarketplaceCukiItem {
  return {
    ...candidate(tokenId, mockEvmAddress),
    origin: 'breed',
    state: 'available',
    parents: [
      {
        id: '1',
        tokenId: '1',
        cukiNumber: 1,
        network: 'BSC',
        birthNetwork: 'BSC',
        state: 'available',
        imageUrl: null,
        generation: 1,
      },
      {
        id: '2',
        tokenId: '2',
        cukiNumber: 2,
        network: 'BSC',
        birthNetwork: 'BSC',
        state: 'available',
        imageUrl: null,
        generation: 1,
      },
    ],
  };
}

function mockFetchResponse(input: unknown) {
  const path = new URL(String(input), 'http://localhost');
  if (path.pathname.endsWith('/breeding/completed')) {
    return Promise.resolve({ ok: true, json: async () => ({ status: 'verified', items: mockCompletedItems }) });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({ status: 'verified', items: [candidate('1', mockEvmAddress), candidate('2', mockEvmAddress)] }),
  });
}

describe('Crías Legacy: confirmación y proyección sin repetir firma', () => {
  beforeEach(() => {
    mockEvmAddress = walletA;
    mockEvmChainId = 56;
    mockActiveBreedIds = [];
    mockCompletedItems = [];
    jest.clearAllMocks();
    mockRequestWallet.mockResolvedValue({ kind: 'evm', address: mockEvmAddress, chainId: 56 });
    mockLegacyBscReadContract.mockImplementation(async (contract: string, functionName: string) => {
      if (contract === 'breedingPoints' && functionName === 'getAllBreedsOwner') return mockActiveBreedIds;
      return [];
    });
    mockBscReadContract.mockImplementation(async () => ['1', '2', 0, 1, 0, false, '0']);
    mockWaitForTransactionReceipt.mockImplementation(async (input: { hash: string }) => ({
      status: 'success',
      transactionHash: input.hash,
    }));
    mockWriteContractAsync.mockImplementation(async (input: { functionName: string }) => (
      input.functionName === 'breed' ? openHash : startHash
    ));
    mockRetryTransactionRefresh.mockImplementation(async (attempt: () => Promise<boolean>) => attempt());
    global.fetch = jest.fn(mockFetchResponse) as never;
  });

  it('descarta la respuesta tardía de la wallet A y no permite que su finally desbloquee la operación de B', async () => {
    let resolveA: ((hash: string) => void) | undefined;
    let resolveB: ((hash: string) => void) | undefined;
    mockWriteContractAsync.mockImplementation(() => new Promise<string>((resolve) => {
      if (!resolveA) resolveA = resolve;
      else resolveB = resolve;
    }));

    const view = render(<BreedingClient initialTab="start" />);
    const parentA1 = await screen.findByRole('button', { name: /Cukie #1/ });
    const parentA2 = await screen.findByRole('button', { name: /Cukie #2/ });
    fireEvent.click(parentA1);
    fireEvent.click(parentA2);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar cría' }));
    await waitFor(() => expect(mockWriteContractAsync).toHaveBeenCalledTimes(1));
    expect(mockWriteContractAsync.mock.calls[0][0]).toEqual(expect.objectContaining({ functionName: 'start' }));

    mockEvmAddress = walletB;
    view.rerender(<BreedingClient initialTab="start" />);
    await screen.findByRole('button', { name: /Cukie #1/ });
    const parentB1 = screen.getByRole('button', { name: /Cukie #1/ });
    const parentB2 = screen.getByRole('button', { name: /Cukie #2/ });
    fireEvent.click(parentB1);
    fireEvent.click(parentB2);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar cría' }));
    await waitFor(() => expect(mockWriteContractAsync).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Iniciar cría' })).toBeDisabled();

    await act(async () => {
      resolveA?.(startHash);
      await Promise.resolve();
    });
    expect(mockWriteContractAsync).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Cría confirmada en BSC/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar cría' })).toBeDisabled();

    await act(async () => {
      resolveB?.(startHash);
      await Promise.resolve();
    });
  });

  it('distingue apertura de inicio y no cuenta un hijo antiguo con los mismos padres como nueva proyección', async () => {
    mockActiveBreedIds = ['7'];
    mockBscReadContract.mockImplementation(async () => ['1', '2', 0, 1, 0, false, '0']);
    mockCompletedItems = [completedCuki('99')];

    render(<BreedingClient initialTab="active" />);
    await screen.findByText('Breed #7');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Cukie' }));

    await waitFor(() => expect(mockWriteContractAsync).toHaveBeenCalledTimes(1));
    expect(mockWriteContractAsync.mock.calls[0][0]).toEqual(expect.objectContaining({ functionName: 'breed' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprobar operación' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/La operación fue confirmada en BSC/i)).toBeInTheDocument());

    mockActiveBreedIds = [];
    mockCompletedItems = [completedCuki('100')];
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar operación' }));

    await waitFor(() => expect(screen.getByText(/Cría abierta en BSC/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Comprobar operación' })).not.toBeInTheDocument();
    expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync.mock.calls[0][0]).not.toEqual(expect.objectContaining({ functionName: 'start' }));
  });
});
