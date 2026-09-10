import { render, screen, waitFor } from '@testing-library/react';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: '0x00000000000000000000000000000000000000aa',
    chainId: 97,
    isConnected: true,
  })),
  useReadContract: jest.fn((args: { functionName: string }) => {
    if (args.functionName === 'getMaxBreedsByCukie') return { data: BigInt(1), isLoading: false, isError: false };
    if (args.functionName === 'getPoints') return { data: BigInt(0), isLoading: false, isError: false };
    if (args.functionName === 'isApprovedForAll') return { data: false, isLoading: false, isError: false };
    return { data: BigInt(25), isLoading: false, isError: false };
  }),
  useSwitchChain: jest.fn(() => ({ switchChain: jest.fn(), isPending: false })),
  useWriteContract: jest.fn(() => ({ writeContract: jest.fn(), isPending: false })),
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
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: jest.fn(() => ({
    address: null,
    connect: jest.fn(),
    isConnected: false,
    isInstalled: false,
  })),
}));
jest.mock('@/lib/legacy-marketplace/runtime', () => ({
  legacyMarketplaceRuntime: {
    legacyMainnetReadEnabled: true,
    legacyMainnetOperationsEnabled: false,
  },
}));
jest.mock('@/lib/legacy-marketplace/bsc', () => ({
  legacyBscPublicClient: { readContract: jest.fn().mockResolvedValue(['10', '11', 0, 999999999999, 0, false, '0']) },
  readLegacyBscContract: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  LEGACY_TRON_MAINNET_RPC_URL: 'https://api.trongrid.io',
  getLegacyTronWeb: jest.fn(() => null),
  getLegacyTronWalletRpcOrigin: jest.fn(() => null),
  isLegacyTronWalletOnRpc: jest.fn(() => false),
  readLegacyTronContract: jest.fn(),
  sendLegacyTronContract: jest.fn(),
}));

import { BreedingClient } from '@/components/legacy-marketplace/breeding-client';
import { legacyBscPublicClient, readLegacyBscContract } from '@/lib/legacy-marketplace/bsc';
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';

const mockUseAccount = useAccount as jest.Mock;
const mockUseReadContract = useReadContract as jest.Mock;
const mockReadLegacyBscContract = readLegacyBscContract as jest.Mock;
const mockLegacyBscReadContract = legacyBscPublicClient.readContract as jest.Mock;
const mockSwitchChain = jest.fn();
const mockWriteContract = jest.fn();

describe('Crías Legacy: lectura BSC separada de la red de firma', () => {
  beforeEach(() => {
    mockUseAccount.mockReturnValue({
      address: '0x00000000000000000000000000000000000000aa',
      chainId: 97,
      isConnected: true,
    });
    mockUseReadContract.mockImplementation((args: { functionName: string }) => {
      if (args.functionName === 'getMaxBreedsByCukie') return { data: BigInt(1), isLoading: false, isError: false };
      if (args.functionName === 'getPoints') return { data: BigInt(0), isLoading: false, isError: false };
      if (args.functionName === 'isApprovedForAll') return { data: false, isLoading: false, isError: false };
      return { data: BigInt(25), isLoading: false, isError: false };
    });
    mockReadLegacyBscContract.mockReset().mockResolvedValue([]);
    mockLegacyBscReadContract.mockReset().mockResolvedValue(['10', '11', 0, 999999999999, 0, false, '0']);
    (useSwitchChain as jest.Mock).mockReturnValue({ switchChain: mockSwitchChain, isPending: false });
    (useWriteContract as jest.Mock).mockReturnValue({ writeContract: mockWriteContract, isPending: false });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as never;
    mockSwitchChain.mockClear();
    mockWriteContract.mockClear();
  });

  it('verifica los datos BSC Legacy con chainId 56 aunque la wallet siga en 97', async () => {
    render(<BreedingClient initialTab="start" />);

    await waitFor(() => {
      expect(screen.getByText('Lectura Legacy BSC verificada. La wallet puede permanecer en otra red hasta que quieras operar.')).toBeInTheDocument();
    });
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(mockUseReadContract).toHaveBeenCalled();
    for (const [args] of mockUseReadContract.mock.calls) {
      expect(args.chainId).toBe(56);
    }
    expect(mockSwitchChain).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aprobar cría' })).toBeDisabled();
  });

  it('permite cargar crías activas desde el cliente público 56 sin habilitar escrituras en 97', async () => {
    mockReadLegacyBscContract.mockResolvedValue(['A']);
    render(<BreedingClient initialTab="active" />);

    await waitFor(() => expect(screen.getByText('Breed #A')).toBeInTheDocument());
    expect(mockReadLegacyBscContract).toHaveBeenCalledWith(
      'breedingPoints',
      'getAllBreedsOwner',
      ['0x00000000000000000000000000000000000000aa'],
    );
    expect(mockLegacyBscReadContract).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeDisabled();
    expect(mockSwitchChain).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it('mantiene puntos y máximo sin verificar cuando la lectura BSC no responde', async () => {
    mockUseReadContract.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<BreedingClient initialTab="start" />);

    await waitFor(() => {
      expect(screen.getByText('Lectura Legacy BSC sin verificar. No se muestran ceros mientras falte la respuesta.')).toBeInTheDocument();
    });
    expect(screen.getByText('Puntos').parentElement).toHaveTextContent('-');
    expect(screen.getByText('Máximo de crías').parentElement).toHaveTextContent('-');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
