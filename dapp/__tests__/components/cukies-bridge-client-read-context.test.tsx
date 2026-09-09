import { act, render, screen, waitFor } from '@testing-library/react';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: '0x00000000000000000000000000000000000000aa',
    chainId: 56,
    isConnected: true,
  })),
  useReadContract: jest.fn(() => ({ data: undefined })),
  useSwitchChain: jest.fn(() => ({ switchChain: jest.fn(), isPending: false })),
  useWriteContract: jest.fn(() => ({ writeContract: jest.fn(), isPending: false })),
}));

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowRightLeft: Icon,
    Check: Icon,
    Loader2: Icon,
    Network: Icon,
    RefreshCcw: Icon,
    Route: Icon,
    ShieldAlert: Icon,
    Wallet: Icon,
  };
});

jest.mock('@/hooks/use-tronlink', () => ({ useTronLink: jest.fn() }));
jest.mock('@/lib/legacy-marketplace/bridge-runtime', () => ({
  cukiesBridgeRuntimeConfig: {
    appEnv: 'production',
    mode: 'legacy-readonly',
    enabled: true,
    operationsEnabled: false,
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
  getLegacyTronWeb: () => window.tronWeb ?? null,
  getLegacyTronWalletRpcOrigin: (tronWeb?: { fullNode?: { host?: string } } | null) => {
    if (!tronWeb?.fullNode?.host) return null;
    return new URL(tronWeb.fullNode.host).origin;
  },
  isLegacyTronWalletOnRpc: (
    tronWeb: { fullNode?: { host?: string } } | null,
    expectedRpcUrl: string,
  ) => {
    if (!tronWeb?.fullNode?.host) return false;
    return new URL(tronWeb.fullNode.host).origin === new URL(expectedRpcUrl).origin;
  },
  readTronContractAt: jest.fn(),
  sendTronContractAt: jest.fn(),
}));

import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import { useTronLink } from '@/hooks/use-tronlink';
import { readTronContractAt } from '@/lib/legacy-marketplace/tron';
import { BridgeClient } from '@/components/legacy-marketplace/bridge-client';

const mockUseAccount = useAccount as jest.Mock;
const mockUseReadContract = useReadContract as jest.Mock;
const mockUseSwitchChain = useSwitchChain as jest.Mock;
const mockUseWriteContract = useWriteContract as jest.Mock;
const mockUseTronLink = useTronLink as jest.Mock;
const mockReadTronContractAt = readTronContractAt as jest.Mock;

const emptyPayload = {
  source: 'mongo',
  items: [],
  total: 0,
  offset: 0,
  limit: 60,
};

function setTronWallet(address: string, rpc = 'https://api.trongrid.io') {
  Object.defineProperty(window, 'tronWeb', {
    configurable: true,
    value: {
      fullNode: { host: rpc },
      defaultAddress: { base58: address },
      address: { toHex: jest.fn() },
      contract: jest.fn(),
    },
  });
}

describe('Bridge Legacy: estado y contexto de lecturas', () => {
  let walletAddress = 'TA';
  const fetchMock = jest.fn();

  beforeEach(() => {
    walletAddress = 'TA';
    setTronWallet(walletAddress);
    mockUseTronLink.mockImplementation(() => ({
      address: walletAddress,
      connect: jest.fn(),
      isConnected: true,
      isInstalled: true,
    }));
    mockReadTronContractAt.mockReset();
    mockReadTronContractAt.mockImplementation(async (_web: unknown, _abi: unknown, _address: string, name: string) => {
      if (name === 'bridgePrice') return '1000000';
      if (name === 'paused') return false;
      return false;
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => emptyPayload });
    global.fetch = fetchMock as never;
  });

  it('muestra sin verificar cuando la wallet esta desconectada o en Nile', async () => {
    mockUseTronLink.mockReturnValue({
      address: null,
      connect: jest.fn(),
      isConnected: false,
      isInstalled: true,
    });
    Object.defineProperty(window, 'tronWeb', { configurable: true, value: undefined });
    const disconnected = render(<BridgeClient />);
    expect(await screen.findByText('Sin verificar')).toBeInTheDocument();
    disconnected.unmount();

    walletAddress = 'TA';
    setTronWallet(walletAddress, 'https://nile.trongrid.io');
    mockUseTronLink.mockReturnValue({
      address: walletAddress,
      connect: jest.fn(),
      isConnected: true,
      isInstalled: true,
    });
    render(<BridgeClient />);
    expect(await screen.findByText('Sin verificar')).toBeInTheDocument();
  });

  it('muestra Disponible solo después de una lectura válida en TRON Mainnet', async () => {
    render(<BridgeClient />);

    expect(await screen.findByText('Disponible')).toBeInTheDocument();
    expect(screen.getAllByText('1 TRX').length).toBeGreaterThan(0);
  });

  it('limpia el snapshot cargado de A al entrar en B y muestra solo el de B', async () => {
    let deferB = false;
    const pending: Array<{ address: string; name: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
    mockReadTronContractAt.mockImplementation((_web: unknown, _abi: unknown, _address: string, name: string) => {
      if (!deferB || walletAddress !== 'TB') {
        return Promise.resolve(
          name === 'bridgePrice' ? (walletAddress === 'TA' ? '111' : '222') : false,
        );
      }
      return new Promise((resolve, reject) => pending.push({ address: walletAddress, name, resolve, reject }));
    });

    const view = render(<BridgeClient />);
    await waitFor(() => expect(screen.getAllByText('0.000111 TRX').length).toBeGreaterThan(0));

    deferB = true;
    walletAddress = 'TB';
    setTronWallet(walletAddress);
    view.rerender(<BridgeClient />);
    await waitFor(() => expect(pending.filter(({ address }) => address === 'TB')).toHaveLength(3));
    expect(screen.getAllByText('Sin verificar').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.000111 TRX')).not.toBeInTheDocument();

    await act(async () => {
      for (const request of pending.filter(({ address }) => address === 'TB')) {
        request.resolve(request.name === 'bridgePrice' ? '222' : false);
      }
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getAllByText('0.000222 TRX').length).toBeGreaterThan(0));
  });

  it('mantiene sin verificar mientras carga B y descarta la respuesta tardía de A', async () => {
    const pending: Array<{ address: string; name: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
    mockReadTronContractAt.mockImplementation((_web: unknown, _abi: unknown, _address: string, name: string) => (
      new Promise((resolve, reject) => pending.push({ address: walletAddress, name, resolve, reject }))
    ));

    const view = render(<BridgeClient />);
    await waitFor(() => expect(pending).toHaveLength(3));

    walletAddress = 'TB';
    setTronWallet(walletAddress);
    view.rerender(<BridgeClient />);
    await waitFor(() => expect(pending).toHaveLength(6));
    expect(screen.getAllByText('Sin verificar').length).toBeGreaterThan(0);

    for (const request of pending.filter(({ address }) => address === 'TB')) {
      request.resolve(request.name === 'bridgePrice' ? '222' : request.name === 'paused' ? false : false);
    }
    await waitFor(() => expect(screen.getAllByText('0.000222 TRX').length).toBeGreaterThan(0));
    await act(async () => {
      for (const request of pending.filter(({ address }) => address === 'TA')) {
        request.resolve(request.name === 'bridgePrice' ? '111' : request.name === 'paused' ? false : false);
      }
      await Promise.resolve();
    });

    expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.000111 TRX')).not.toBeInTheDocument();
  });

  it('conserva el snapshot B si la petición A termina con error después', async () => {
    const pending: Array<{ address: string; name: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
    mockReadTronContractAt.mockImplementation((_web: unknown, _abi: unknown, _address: string, name: string) => (
      new Promise((resolve, reject) => pending.push({ address: walletAddress, name, resolve, reject }))
    ));

    const view = render(<BridgeClient />);
    await waitFor(() => expect(pending).toHaveLength(3));
    walletAddress = 'TB';
    setTronWallet(walletAddress);
    view.rerender(<BridgeClient />);
    await waitFor(() => expect(pending).toHaveLength(6));

    for (const request of pending.filter(({ address }) => address === 'TB')) {
      request.resolve(request.name === 'bridgePrice' ? '222' : false);
    }
    await waitFor(() => expect(screen.getAllByText('0.000222 TRX').length).toBeGreaterThan(0));
    await act(async () => {
      for (const request of pending.filter(({ address }) => address === 'TA')) {
        request.reject(new Error('respuesta antigua'));
      }
      await Promise.resolve();
    });

    expect(screen.getAllByText('0.000222 TRX').length).toBeGreaterThan(0);
    expect(screen.queryByText('respuesta antigua')).not.toBeInTheDocument();
  });
});
