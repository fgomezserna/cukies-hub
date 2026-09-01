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
    AlertCircle: Icon,
    CalendarClock: Icon,
    CheckCircle2: Icon,
    ChevronDown: Icon,
    Clock3: Icon,
    ExternalLink: Icon,
    Gift: Icon,
    History: Icon,
    Loader2: Icon,
    RefreshCw: Icon,
    ShieldAlert: Icon,
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
    totalAllocatedRaw: '2000000000000000000',
    totalClaimedRaw: '0',
    pendingRaw: '1000000000000000000',
    claimableRaw: '1000000000000000000',
    scheduledRaw: '0',
    expiredRaw: '0',
    allocationCount: 1,
    claimCount: 0,
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
    publishedRewards: [{
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
    blockedAllocations: 0,
    healthy: true,
    nextCursor: null,
  };
}

describe('PremiosContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue(authValue());
    mockUseAccount.mockReturnValue({
      address: wallet,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
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

    expect(await screen.findByRole('heading', { name: 'Premios para tu wallet' })).toBeInTheDocument();
    expect(screen.getAllByText('1 UKI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Premio de partida')).toBeInTheDocument();
    expect(screen.getByText(/Puedes cobrarlo hasta/)).toBeInTheDocument();
    expect(screen.queryByText(/preventa/i)).not.toBeInTheDocument();
  });

  it('distingue el total ganado del importe que sigue en preparación', async () => {
    const data = rewardStatus();
    data.pageAllocatedRaw = '999000000000000000000';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data }) });
    render(<PremiosContent />);

    await screen.findByRole('heading', { name: 'Premios para tu wallet' });
    expect(screen.getAllByText('En preparación')[0].parentElement).toHaveTextContent('1 UKI');
    expect(screen.getByText('Ganado en total').parentElement).toHaveTextContent('2 UKI');
    expect(screen.queryByText('999 UKI')).not.toBeInTheDocument();
  });

  it('bloquea el cobro si la wallet activa no coincide con la sesión', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x3333333333333333333333333333333333333333',
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    render(<PremiosContent />);

    expect(await screen.findByText('Conecta la wallet asociada a estos premios')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Cobrar 1 UKI' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('separa los próximos cobros de los que ya han agotado su plazo', async () => {
    const data = rewardStatus();
    const scheduled = {
      ...data.publishedRewards[0],
      batch: {
        ...data.publishedRewards[0].batch,
        batchId: ('0x' + 'c'.repeat(64)) as `0x${string}`,
        periodId: '2026-W36',
        startsAt: '2026-09-05T12:00:00.000Z',
      },
      onChainStatus: 'scheduled' as const,
    };
    const expired = {
      ...data.publishedRewards[0],
      batch: {
        ...data.publishedRewards[0].batch,
        batchId: ('0x' + 'd'.repeat(64)) as `0x${string}`,
        periodId: '2026-W30',
      },
      onChainStatus: 'expired' as const,
    };
    data.claimables = [];
    data.claimableRaw = '0';
    data.pendingRaw = '0';
    data.publishedRewards = [scheduled, expired];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data }) });
    render(<PremiosContent />);

    expect(await screen.findByRole('heading', { name: 'Próximos cobros' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plazos finalizados' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cobrar .* UKI/ })).not.toBeInTheDocument();
  });

  it('solicita el cambio de red antes de habilitar el cobro', async () => {
    mockUseAccount.mockReturnValue({
      address: wallet,
      chainId: 56,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    render(<PremiosContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar de red para cobrar' }));
    expect(switchChain).toHaveBeenCalledWith({ chainId: 97 });
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('cobra con el batch y la prueba publicados y refresca al confirmar', async () => {
    render(<PremiosContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cobrar 1 UKI' }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 97,
      address: distributor,
      functionName: 'claim',
      args: [batchId, BigInt('1000000000000000000'), []],
    })));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: transactionHash });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('no confirma un cobro cuya transacción ha revertido', async () => {
    waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    render(<PremiosContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cobrar 1 UKI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El cobro no se ha completado');
    expect(screen.queryByText('Cobro confirmado')).not.toBeInTheDocument();
  });

  it('falla con un mensaje de cliente si el servicio no responde', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ status: 'error' }) });
    render(<PremiosContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No podemos actualizar tus premios ahora');
    expect(screen.queryByText(/Mongo|staging|contrato/i)).not.toBeInTheDocument();
  });
});
