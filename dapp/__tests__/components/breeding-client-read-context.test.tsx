import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockWagmiConfig = {};

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({ address: undefined, chainId: 56, isConnected: false })),
  useConfig: jest.fn(() => mockWagmiConfig),
  useReadContract: jest.fn(() => ({ data: undefined })),
  useSwitchChain: jest.fn(() => ({ switchChain: jest.fn(), isPending: false })),
  useWriteContract: jest.fn(() => ({ writeContractAsync: jest.fn(), isPending: false })),
}));
jest.mock('wagmi/actions', () => ({
  getAccount: jest.fn(() => ({ address: undefined })),
  getChainId: jest.fn(() => undefined),
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
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: () => <div />,
}));
jest.mock('@/hooks/use-tronlink', () => ({ useTronLink: jest.fn() }));
jest.mock('@/lib/legacy-marketplace/runtime', () => ({
  legacyMarketplaceRuntime: {
    legacyMainnetReadEnabled: true,
    legacyMainnetOperationsEnabled: false,
  },
}));
jest.mock('@/lib/legacy-marketplace/bsc', () => ({
  legacyBscPublicClient: { readContract: jest.fn().mockResolvedValue([]) },
  readLegacyBscContract: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  LEGACY_TRON_MAINNET_RPC_URL: 'https://api.trongrid.io',
  getLegacyTronWeb: () => window.tronWeb ?? null,
  getLegacyTronWalletRpcOrigin: (tronWeb?: { fullNode?: { host?: string } } | null) => (
    tronWeb?.fullNode?.host ? new URL(tronWeb.fullNode.host).origin : null
  ),
  isLegacyTronWalletOnRpc: (tronWeb: { fullNode?: { host?: string } } | null, expected: string) => {
    const host = tronWeb?.fullNode?.host;
    if (!host) return false;
    return new URL(host).origin === new URL(expected).origin;
  },
  readLegacyTronContract: jest.fn(),
  sendLegacyTronContract: jest.fn(),
}));

import { useTronLink } from '@/hooks/use-tronlink';
import { readLegacyTronContract } from '@/lib/legacy-marketplace/tron';
import { BreedingClient } from '@/components/legacy-marketplace/breeding-client';

const mockUseTronLink = useTronLink as jest.Mock;
const mockReadLegacyTronContract = readLegacyTronContract as jest.Mock;

type PendingRead = {
  address: string;
  name: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

function setTronWallet(address: string) {
  Object.defineProperty(window, 'tronWeb', {
    configurable: true,
    value: {
      fullNode: { host: 'https://api.trongrid.io' },
      defaultAddress: { base58: address },
      contract: jest.fn(),
    },
  });
}

describe('Crías Legacy: ownership de lecturas activas', () => {
  let walletAddress = 'TA';
  let pending: PendingRead[];

  beforeEach(() => {
    walletAddress = 'TA';
    pending = [];
    setTronWallet(walletAddress);
    mockUseTronLink.mockImplementation(() => ({
      address: walletAddress,
      connect: jest.fn(),
      isConnected: true,
      isInstalled: true,
    }));
    mockReadLegacyTronContract.mockReset();
    mockReadLegacyTronContract.mockImplementation((_web: unknown, _contract: string, name: string) => (
      new Promise((resolve, reject) => pending.push({ address: walletAddress, name, resolve, reject }))
    ));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }) as never;
  });

  async function renderAccountB() {
    const view = render(<BreedingClient initialTab="active" />);
    fireClickTron();
    await waitFor(() => expect(pending.filter(({ address }) => address === 'TA')).toHaveLength(4));
    walletAddress = 'TB';
    setTronWallet(walletAddress);
    view.rerender(<BreedingClient initialTab="active" />);
    await waitFor(() => expect(pending.filter(({ address }) => address === 'TB')).toHaveLength(4));
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeDisabled();
    return view;
  }

  function fireClickTron() {
    const button = screen.getByRole('button', { name: 'TRON' });
    fireEvent.click(button);
  }

  function resolveSnapshotAndIds(address: string, breedId = 'B') {
    for (const request of pending.filter(({ address: owner }) => owner === address)) {
      request.resolve(request.name === 'getAllBreedsOwner' ? [breedId] : 1);
    }
  }

  function resolveBreedDetails(address: string) {
    for (const request of pending.filter(({ address: owner, name }) => owner === address && name === 'getBreed')) {
      request.resolve(['10', '11', 0, 999999999999, 0, false, '0']);
    }
  }

  it('limpia la cría cargada de A al entrar en B y muestra solo la de B', async () => {
    let deferB = false;
    mockReadLegacyTronContract.mockImplementation((_web: unknown, _contract: string, name: string) => {
      if (!deferB || walletAddress !== 'TB') {
        if (name === 'getAllBreedsOwner') return Promise.resolve(['A']);
        if (name === 'getBreed') return Promise.resolve(['10', '11', 0, 999999999999, 0, false, '0']);
        return Promise.resolve(1);
      }
      return new Promise((resolve, reject) => pending.push({ address: walletAddress, name, resolve, reject }));
    });

    const view = render(<BreedingClient initialTab="active" />);
    fireClickTron();
    await waitFor(() => expect(screen.getByText('Breed #A')).toBeInTheDocument());

    deferB = true;
    walletAddress = 'TB';
    setTronWallet(walletAddress);
    view.rerender(<BreedingClient initialTab="active" />);
    await waitFor(() => expect(screen.queryByText('Breed #A')).not.toBeInTheDocument());
    await waitFor(() => expect(pending.filter(({ address }) => address === 'TB')).toHaveLength(4));
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeDisabled();

    await act(async () => {
      resolveSnapshotAndIds('TB');
      await Promise.resolve();
    });
    await waitFor(() => expect(pending.some(({ address, name }) => address === 'TB' && name === 'getBreed')).toBe(true));
    await act(async () => {
      resolveBreedDetails('TB');
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Breed #B')).toBeInTheDocument());
  });

  it('muestra B al resolver B primero y descarta la respuesta tardía de A', async () => {
    await renderAccountB();
    await act(async () => {
      resolveSnapshotAndIds('TB');
      await Promise.resolve();
    });
    await waitFor(() => expect(pending.some(({ address, name }) => address === 'TB' && name === 'getBreed')).toBe(true));
    await act(async () => {
      resolveBreedDetails('TB');
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Breed #B')).toBeInTheDocument());
    await act(async () => {
      resolveSnapshotAndIds('TA');
      await Promise.resolve();
    });
    expect(screen.getByText('Breed #B')).toBeInTheDocument();
  });

  it('mantiene B si la respuesta A termina con error después', async () => {
    await renderAccountB();
    await act(async () => {
      resolveSnapshotAndIds('TB');
      await Promise.resolve();
    });
    await waitFor(() => expect(pending.some(({ address, name }) => address === 'TB' && name === 'getBreed')).toBe(true));
    await act(async () => {
      resolveBreedDetails('TB');
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Breed #B')).toBeInTheDocument());
    await act(async () => {
      for (const request of pending.filter(({ address }) => address === 'TA')) {
        request.reject(new Error('respuesta antigua'));
      }
      await Promise.resolve();
    });
    expect(screen.getByText('Breed #B')).toBeInTheDocument();
    expect(screen.queryByText('respuesta antigua')).not.toBeInTheDocument();
  });
});
