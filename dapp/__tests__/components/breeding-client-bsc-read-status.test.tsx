import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
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
      expect(screen.getByText('Lectura Legacy BSC verificada. Puedes consultar estos datos aunque la wallet esté en otra red.')).toBeInTheDocument();
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

  it('permite previsualizar y seleccionar candidatos BSC con la wallet en 97', async () => {
    const candidate = {
      id: '29',
      tokenId: '29',
      chainId: 56,
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      cukiNumber: 29,
      owner: '0x00000000000000000000000000000000000000aa',
      ownerNormalized: '0x00000000000000000000000000000000000000aa',
      identityVerified: true,
      network: 'BSC',
      origin: 'original',
      birthNetwork: 'BSC',
      imageUrl: null,
      type: 1,
      state: 'available',
      price: 0,
      priceOriginal: '0',
      skills: {},
      childrenCount: 0,
      childrenCountTron: 0,
      childrenCountBsc: 0,
      parents: [],
      children: [],
      history: [],
      timestamp: null,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [candidate], status: 'verified' }),
    }) as never;

    render(<BreedingClient initialTab="start" />);

    const candidateButton = await screen.findByRole('button', {
      name: /Cukie #29/,
    });
    expect(candidateButton).not.toBeDisabled();
    expect(screen.queryByText('La wallet está conectada a una red incorrecta.')).not.toBeInTheDocument();
    expect(mockSwitchChain).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it('oculta candidatos con chain, colección o identidad de propietario no verificables', async () => {
    const canonical = {
      id: '29',
      tokenId: '29',
      chainId: 56,
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      cukiNumber: 29,
      owner: '0x00000000000000000000000000000000000000aa',
      ownerNormalized: '0x00000000000000000000000000000000000000aa',
      identityVerified: true,
      network: 'BSC',
      origin: 'original',
      birthNetwork: 'BSC',
      imageUrl: null,
      type: 1,
      state: 'available',
      price: 0,
      priceOriginal: '0',
      skills: {},
      childrenCount: 0,
      childrenCountTron: 0,
      childrenCountBsc: 0,
      parents: [],
      children: [],
      history: [],
      timestamp: null,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'partial',
        items: [
          canonical,
          { ...canonical, tokenId: '97', id: '97', chainId: 97 },
          {
            ...canonical,
            tokenId: 'wrong-contract',
            id: 'wrong-contract',
            collectionAddress: '0x0000000000000000000000000000000000000001',
          },
          {
            ...canonical,
            tokenId: 'null-identity',
            id: 'null-identity',
            chainId: null,
            collectionAddress: null,
            identityVerified: undefined,
          },
        ],
      }),
    }) as never;

    render(<BreedingClient initialTab="start" />);

    const canonicalButton = await screen.findByRole('button', {
      name: /Cukie #29/,
    });
    expect(canonicalButton).not.toBeDisabled();
    expect(screen.queryByText('Cukie #97')).not.toBeInTheDocument();
    expect(screen.queryByText('Cukie #wrong-contract')).not.toBeInTheDocument();
    expect(screen.queryByText('Cukie #null-identity')).not.toBeInTheDocument();
  });

  it('descarta la respuesta de candidatos de una wallet anterior', async () => {
    const walletA = '0x00000000000000000000000000000000000000aa';
    const walletB = '0x00000000000000000000000000000000000000bb';
    const pending = new Map<string, (value: unknown) => void>();
    const candidate = (tokenId: string, owner: string) => ({
      id: tokenId,
      tokenId,
      chainId: 56,
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      cukiNumber: Number(tokenId),
      owner,
      ownerNormalized: owner.toLowerCase(),
      identityVerified: true,
      network: 'BSC',
      origin: 'original',
      birthNetwork: 'BSC',
      imageUrl: null,
      type: 1,
      state: 'available',
      price: 0,
      priceOriginal: '0',
      skills: {},
      childrenCount: 0,
      childrenCountTron: 0,
      childrenCountBsc: 0,
      parents: [],
      children: [],
      history: [],
      timestamp: null,
    });
    global.fetch = jest.fn((input) => {
      const requestOwner = new URL(String(input), 'http://localhost').searchParams.get('owner');
      return new Promise((resolve) => {
        pending.set(requestOwner ?? '', resolve);
      });
    }) as never;

    mockUseAccount.mockReturnValue({
      address: walletA,
      chainId: 97,
      isConnected: true,
    });
    const view = render(<BreedingClient initialTab="start" />);
    await waitFor(() => expect(pending.has(walletA)).toBe(true));

    mockUseAccount.mockReturnValue({
      address: walletB,
      chainId: 97,
      isConnected: true,
    });
    view.rerender(<BreedingClient initialTab="start" />);
    await waitFor(() => expect(pending.has(walletB)).toBe(true));

    await act(async () => {
      pending.get(walletB)?.({
        ok: true,
        json: async () => ({
          status: 'verified',
          items: [candidate('32', walletB)],
        }),
      });
      await Promise.resolve();
    });
    await screen.findByRole('button', { name: /Cukie #32/ });

    await act(async () => {
      pending.get(walletA)?.({
        ok: true,
        json: async () => ({
          status: 'verified',
          items: [candidate('31', walletA)],
        }),
      });
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /Cukie #32/ })).toBeInTheDocument();
    expect(screen.queryByText('Cukie #31')).not.toBeInTheDocument();
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
    const refreshButton = screen.getByRole('button', { name: 'Actualizar' });
    expect(refreshButton).not.toBeDisabled();
    fireEvent.click(refreshButton);
    await waitFor(() => expect(mockReadLegacyBscContract.mock.calls.length).toBeGreaterThan(1));
    expect(mockSwitchChain).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it('mantiene disponible el reintento de crías activas tras un fallo de lectura', async () => {
    mockReadLegacyBscContract
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValueOnce(['B']);
    render(<BreedingClient initialTab="active" />);

    const refreshButton = await screen.findByRole('button', {
      name: 'Actualizar',
    });
    await waitFor(() => expect(refreshButton).not.toBeDisabled());
    fireEvent.click(refreshButton);
    await waitFor(() => expect(screen.getByText('Breed #B')).toBeInTheDocument());
    expect(mockSwitchChain).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it('mantiene puntos y máximo sin verificar cuando la lectura BSC no responde', async () => {
    mockUseReadContract.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<BreedingClient initialTab="start" />);

    await waitFor(() => {
      expect(screen.getByText('Lectura Legacy BSC no disponible ahora. Pulsa Actualizar para reintentar.')).toBeInTheDocument();
    });
    expect(screen.getByText('Puntos').parentElement).toHaveTextContent('-');
    expect(screen.getByText('Máximo de crías').parentElement).toHaveTextContent('-');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
