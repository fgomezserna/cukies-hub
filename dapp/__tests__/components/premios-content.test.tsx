import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { PremiosContent } from '@/components/premios/premios-content';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('lucide-react', () => {
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />;
  return {
    ArrowRight: Icon,
    CalendarClock: Icon,
    CheckCircle2: Icon,
    Gift: Icon,
    Loader2: Icon,
    RefreshCw: Icon,
    Sparkles: Icon,
    Trophy: Icon,
    Wallet: Icon,
  };
});

const wallet = '0x2222222222222222222222222222222222222222';
const batchId = ('0x' + 'a'.repeat(64)) as `0x${string}`;
const distributor = '0x1111111111111111111111111111111111111111';
const transactionHash = ('0x' + 'b'.repeat(64)) as `0x${string}`;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const fetchMock = jest.fn();
const switchChain = jest.fn();
const writeContractAsync = jest.fn();
const waitForTransactionReceipt = jest.fn();

function authValue(user: User | null = { walletAddress: wallet } as User) {
  return {
    user,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: user ? 'evm' as const : null,
    fetchUser: jest.fn(),
  };
}

function rewardStatus() {
  return {
    walletNormalized: wallet,
    allocations: [{
      allocationId: 'allocation-1',
      periodId: '2026-08-31',
      category: 'player',
      amountRaw: '2000000000000000000',
      status: 'allocated',
      createdAt: '2026-08-31T12:00:00.000Z',
    }],
    claims: [],
    pageAllocatedRaw: '2000000000000000000',
    claimableRaw: '1000000000000000000',
    claimPublished: true,
    claimables: [{
      batch: {
        batchId,
        periodId: '2026-08-31',
        chainId: 97,
        distributorAddress: distributor,
        amountRaw: '1000000000000000000',
        startsAt: '2026-08-31T12:00:00.000Z',
        expiresAt: '2026-09-30T12:00:00.000Z',
      },
      proof: { siblings: [] },
      onChainStatus: 'claimable',
    }],
    publishedRewards: [],
    blockedAllocations: 0,
    healthy: true,
  };
}

describe('PremiosContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue(authValue());
    mockUseAccount.mockReturnValue({ chainId: 97 } as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({ waitForTransactionReceipt } as unknown as ReturnType<typeof usePublicClient>);
    mockUseSwitchChain.mockReturnValue({ switchChain, isPending: false } as unknown as ReturnType<typeof useSwitchChain>);
    mockUseWriteContract.mockReturnValue({ writeContractAsync } as unknown as ReturnType<typeof useWriteContract>);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: rewardStatus() }) });
    writeContractAsync.mockResolvedValue(transactionHash);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
  });

  it('pide conectar la wallet y no consulta datos privados sin sesión', () => {
    mockUseAuth.mockReturnValue(authValue(null));
    render(<PremiosContent />);

    expect(screen.getByRole('heading', { name: 'Consulta y cobra tus recompensas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar wallet' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explica el saldo, la fecha límite y el origen sin mencionar la preventa', async () => {
    render(<PremiosContent />);

    expect(await screen.findByRole('heading', { name: 'Premios disponibles' })).toBeInTheDocument();
    expect(screen.getAllByText('1 UKI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Premio de partida')).toBeInTheDocument();
    expect(screen.getByText(/No pierdes un premio por no entrar durante una semana/)).toBeInTheDocument();
    expect(screen.queryByText(/preventa/i)).not.toBeInTheDocument();
  });

  it('solicita el cambio de red antes de habilitar el cobro', async () => {
    mockUseAccount.mockReturnValue({ chainId: 56 } as ReturnType<typeof useAccount>);
    render(<PremiosContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar de red para cobrar' }));
    expect(switchChain).toHaveBeenCalledWith({ chainId: 97 });
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('cobra con el batch y la prueba publicados y refresca al confirmar', async () => {
    render(<PremiosContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cobrar premio' }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 97,
      address: distributor,
      functionName: 'claim',
      args: [batchId, BigInt('1000000000000000000'), []],
    })));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: transactionHash });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('falla con un mensaje de cliente si el servicio no responde', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ status: 'error' }) });
    render(<PremiosContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No podemos cargar tus premios ahora');
    expect(screen.queryByText(/Mongo|staging|contrato/i)).not.toBeInTheDocument();
  });
});
