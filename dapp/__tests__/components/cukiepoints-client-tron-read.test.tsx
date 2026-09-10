import { act, render, screen, waitFor } from '@testing-library/react';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowUpRight: Icon,
    ChevronDown: Icon,
    Coins: Icon,
    Database: Icon,
    Flame: Icon,
    Loader2: Icon,
    Network: Icon,
    RefreshCcw: Icon,
    Sparkles: Icon,
    Wallet: Icon,
  };
});
jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({ address: '0x00000000000000000000000000000000000000aa' })),
  useReadContract: jest.fn(() => ({ data: undefined, isLoading: false })),
}));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: jest.fn(),
}));
jest.mock('@/lib/legacy-marketplace/runtime', () => ({
  legacyMarketplaceRuntime: {
    legacyMainnetReadEnabled: true,
    legacyMainnetOperationsEnabled: false,
  },
}));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  LEGACY_TRON_MAINNET_RPC_URL: 'https://api.trongrid.io',
  getLegacyTronWeb: jest.fn(),
  getLegacyTronReadWeb: jest.fn(),
  getLegacyTronWalletRpcOrigin: jest.fn(),
  isLegacyTronWalletOnRpc: jest.fn(),
  readLegacyTronContract: jest.fn(),
}));

import { CukiePointsClient } from '@/components/legacy-marketplace/cukiepoints-client';
import { useTronLink } from '@/hooks/use-tronlink';
import {
  getLegacyTronReadWeb,
  getLegacyTronWeb,
  getLegacyTronWalletRpcOrigin,
  isLegacyTronWalletOnRpc,
  readLegacyTronContract,
} from '@/lib/legacy-marketplace/tron';

const mockUseTronLink = useTronLink as jest.Mock;
const mockGetLegacyTronReadWeb = getLegacyTronReadWeb as jest.Mock;
const mockGetLegacyTronWeb = getLegacyTronWeb as jest.Mock;
const mockGetLegacyTronWalletRpcOrigin = getLegacyTronWalletRpcOrigin as jest.Mock;
const mockIsLegacyTronWalletOnRpc = isLegacyTronWalletOnRpc as jest.Mock;
const mockReadLegacyTronContract = readLegacyTronContract as jest.Mock;

const emptyPayload = {
  source: 'mongo',
  items: [],
  total: 0,
  offset: 0,
  limit: 24,
  summary: {
    totalPoints: 0,
    totalTransactions: 0,
    facets: { networks: [], types: [] },
  },
};

type Wallet = {
  fullNode: { host: string };
  defaultAddress: { base58: string };
};

type PendingRead = {
  wallet: string;
  name: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

function setWallet(wallet: Wallet) {
  mockGetLegacyTronWeb.mockReturnValue(wallet);
  mockGetLegacyTronWalletRpcOrigin.mockImplementation(
    (value?: Wallet | null) => value?.fullNode.host ? new URL(value.fullNode.host).origin : null,
  );
  mockIsLegacyTronWalletOnRpc.mockImplementation(
    (value: Wallet | null, expected: string) => Boolean(
      value?.fullNode.host
      && new URL(value.fullNode.host).origin === new URL(expected).origin,
    ),
  );
}

describe('CukiePointsClient: lectura TRON Legacy', () => {
  let walletAddress: string;
  let walletWeb: Wallet;
  let readWeb: Wallet;
  let pending: PendingRead[];
  let fetchMock: jest.Mock;

  beforeEach(() => {
    walletAddress = 'TA';
    walletWeb = {
      fullNode: { host: 'https://api.trongrid.io' },
      defaultAddress: { base58: walletAddress },
    };
    readWeb = {
      fullNode: { host: 'https://tron-rpc.publicnode.com' },
      defaultAddress: { base58: walletAddress },
    };
    pending = [];
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyPayload,
    });
    global.fetch = fetchMock as never;
    mockUseTronLink.mockImplementation(() => ({
      address: walletAddress,
      connect: jest.fn(),
      isConnected: true,
      isInstalled: true,
    }));
    mockGetLegacyTronReadWeb.mockReset().mockReturnValue(readWeb);
    mockReadLegacyTronContract.mockReset();
    setWallet(walletWeb);
  });

  it('usa el RPC de lectura y conserva los campos que sí responden ante un 429', async () => {
    mockReadLegacyTronContract.mockImplementation(
      (_web: Wallet, _contract: string, name: string) => {
        if (name === 'getPoints') return Promise.resolve(0);
        if (name === 'getTotalPoints') return Promise.resolve(5024269);
        if (name === 'getTotalPointsEmited') {
          return Promise.reject(Object.assign(new Error('Request failed with status code 429'), { status: 429 }));
        }
        return Promise.resolve(481592);
      },
    );

    render(<CukiePointsClient />);

    await waitFor(() => {
      expect(screen.getByText('Lectura TRON parcial; algunos datos están sin verificar.')).toBeInTheDocument();
    });
    expect(mockGetLegacyTronReadWeb).toHaveBeenCalledWith(walletAddress);
    expect(mockReadLegacyTronContract).toHaveBeenCalledTimes(4);
    for (const [web] of mockReadLegacyTronContract.mock.calls) {
      expect(web).toBe(readWeb);
      expect(web).not.toBe(walletWeb);
    }
    expect(screen.getByText('5,024,269')).toBeInTheDocument();
    expect(screen.getByText('481,592')).toBeInTheDocument();
    expect(screen.queryByText('Request failed with status code 429')).not.toBeInTheDocument();
    expect(screen.getByText('No se pudo verificar TRON ahora. Algunos datos no están disponibles.')).toBeInTheDocument();
  });

  it('descarta resolve y reject de una wallet anterior después de cambiar a B', async () => {
    mockReadLegacyTronContract.mockImplementation(
      (_web: Wallet, _contract: string, name: string, args?: readonly unknown[]) => (
        new Promise((resolve, reject) => {
          pending.push({
            wallet: String(args?.[0] ?? walletAddress),
            name,
            resolve,
            reject,
          });
        })
      ),
    );

    const view = render(<CukiePointsClient />);
    await waitFor(() => expect(pending.filter(({ wallet }) => wallet === 'TA')).toHaveLength(4));

    walletAddress = 'TB';
    walletWeb.defaultAddress.base58 = walletAddress;
    readWeb.defaultAddress.base58 = walletAddress;
    view.rerender(<CukiePointsClient />);
    await waitFor(() => expect(pending.filter(({ wallet }) => wallet === 'TB')).toHaveLength(4));

    await act(async () => {
      for (const request of pending.filter(({ wallet }) => wallet === 'TB')) {
        request.resolve(request.name === 'getTotalPoints' ? 222 : 2);
      }
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('222')).toBeInTheDocument());

    await act(async () => {
      for (const request of pending.filter(({ wallet }) => wallet === 'TA')) {
        request.name === 'getTotalPoints'
          ? request.resolve(111)
          : request.reject(new Error('respuesta antigua'));
      }
      await Promise.resolve();
    });
    expect(screen.getByText('222')).toBeInTheDocument();
    expect(screen.queryByText('111')).not.toBeInTheDocument();
    expect(screen.queryByText('respuesta antigua')).not.toBeInTheDocument();
  });

  it('limpia el snapshot al cambiar el RPC del wallet y no solicita cambio de red', async () => {
    mockReadLegacyTronContract.mockResolvedValue(7);
    const view = render(<CukiePointsClient />);
    await waitFor(() => expect(screen.getByText('Lectura TRON verificada.')).toBeInTheDocument());
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);

    walletWeb.fullNode.host = 'https://nile.trongrid.io';
    view.rerender(<CukiePointsClient />);

    await waitFor(() => expect(screen.getByText('Lectura TRON sin verificar.')).toBeInTheDocument());
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(mockGetLegacyTronReadWeb).toHaveBeenCalledTimes(1);
  });
});
