import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

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
  LandingWalletConnectButton: () => (
    <button type="button">Conectar wallet</button>
  ),
}));
jest.mock('lucide-react', () => {
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props} />
  );
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
const mockUsePublicClient = usePublicClient as jest.MockedFunction<
  typeof usePublicClient
>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<
  typeof useSwitchChain
>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<
  typeof useWriteContract
>;
const fetchMock = jest.fn();
const switchChain = jest.fn();
const writeContractAsync = jest.fn();
const waitForTransactionReceipt = jest.fn();

function authValue(user: User | null = { walletAddress: wallet } as User) {
  return {
    user,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: user ? ('evm' as const) : null,
    fetchUser: jest.fn(),
  };
}

function rewardStatus() {
  return {
    walletNormalized: wallet,
    allocations: [
      {
        allocationId: 'allocation-1',
        periodId: '2026-08-31',
        category: 'player',
        amountRaw: '2000000000000000000',
        status: 'allocated',
        createdAt: '2026-08-31T12:00:00.000Z',
      },
    ],
    ambassadorAllocations: [] as Array<{
      allocationId: string;
      periodId: string;
      category: 'ambassador_ordinary' | 'ambassador_weekly';
      amountRaw: string;
      status: 'allocated_offchain';
      availableAt: string;
      createdAt: string;
    }>,
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
    claimables: [
      {
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
      },
    ],
    publishedRewards: [
      {
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
      },
    ],
    blockedAllocations: 0,
    healthy: true,
    nextCursor: null as string | null,
  };
}

describe('PremiosContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(window.history.state, '', '/premios');
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue(authValue());
    mockUseAccount.mockReturnValue({
      address: wallet,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      waitForTransactionReceipt,
    } as unknown as ReturnType<typeof usePublicClient>);
    mockUseSwitchChain.mockReturnValue({
      switchChain,
      isPending: false,
    } as unknown as ReturnType<typeof useSwitchChain>);
    mockUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data: rewardStatus() }),
    });
    writeContractAsync.mockResolvedValue(transactionHash);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
  });

  it('pide conectar la wallet y no consulta datos privados sin sesión', () => {
    mockUseAuth.mockReturnValue(authValue(null));
    render(<PremiosContent />);

    expect(
      screen.getByRole('heading', { name: 'Consulta y cobra tus recompensas' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Conectar wallet' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explica el saldo, la fecha límite y el origen sin mencionar la preventa', async () => {
    const user = userEvent.setup();
    render(<PremiosContent />);

    expect(
      await screen.findByRole('heading', { name: 'Premios para tu wallet' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('1 UKI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Puedes cobrarlo hasta/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Historial/ }));
    expect(screen.getByText('Premio de partida')).toBeInTheDocument();
    expect(screen.queryByText(/preventa/i)).not.toBeInTheDocument();
  });

  it('distingue el total ganado del importe que sigue en preparación', async () => {
    const data = rewardStatus();
    data.pageAllocatedRaw = '999000000000000000000';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data }),
    });
    render(<PremiosContent />);

    await screen.findByRole('heading', { name: 'Premios para tu wallet' });
    expect(
      screen.getAllByText('En preparación')[0].parentElement,
    ).toHaveTextContent('1 UKI');
    expect(screen.getByText('Ganado en total').parentElement).toHaveTextContent(
      '2 UKI',
    );
    expect(screen.queryByText('999 UKI')).not.toBeInTheDocument();
  });

  it('bloquea el cobro si la wallet activa no coincide con la sesión', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x3333333333333333333333333333333333333333',
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    render(<PremiosContent />);

    expect(
      await screen.findByText('Conecta la wallet asociada a estos premios'),
    ).toBeInTheDocument();
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
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data }),
    });
    render(<PremiosContent />);

    expect(
      await screen.findByRole('heading', { name: 'Próximos cobros' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Plazos finalizados' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Cobrar .* UKI/ }),
    ).not.toBeInTheDocument();
  });

  it('solicita el cambio de red antes de habilitar el cobro', async () => {
    mockUseAccount.mockReturnValue({
      address: wallet,
      chainId: 56,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    render(<PremiosContent />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cambiar de red para cobrar' }),
    );
    expect(switchChain).toHaveBeenCalledWith({ chainId: 97 });
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('cobra con el batch y la prueba publicados y refresca al confirmar', async () => {
    render(<PremiosContent />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cobrar 1 UKI' }),
    );

    await waitFor(() =>
      expect(writeContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 97,
          address: distributor,
          functionName: 'claim',
          args: [batchId, BigInt('1000000000000000000'), []],
        }),
      ),
    );
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: transactionHash,
      onReplaced: expect.any(Function),
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('no confirma un cobro cuya transacción ha revertido', async () => {
    waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    render(<PremiosContent />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cobrar 1 UKI' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El cobro no se ha completado',
    );
    expect(screen.queryByText('Cobro confirmado')).not.toBeInTheDocument();
  });

  it('conserva hash y ofrece comprobar de nuevo cuando el receipt llega tarde', async () => {
    waitForTransactionReceipt
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 'success' });
    render(<PremiosContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cobrar 1 UKI' }));
    expect(await screen.findByText(/Cobro enviado/)).toBeInTheDocument();
    const recheck = screen.getByRole('button', { name: /Comprobar cobro enviado/ });
    fireEvent.click(recheck);
    await waitFor(() => expect(screen.getByText('Cobro confirmado. Los UKI ya están en tu wallet.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Comprobar cobro enviado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cobrar 1 UKI' })).not.toBeInTheDocument();
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it('falla con un mensaje de cliente si el servicio no responde', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error' }),
    });
    render(<PremiosContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No podemos actualizar tus premios ahora',
    );
    expect(
      screen.queryByText(/Mongo|staging|contrato/i),
    ).not.toBeInTheDocument();
  });

  it('mantiene un único panel visible y cambia entre cobrar e historial', async () => {
    const user = userEvent.setup();
    render(<PremiosContent />);

    const claimableTab = await screen.findByRole('tab', { name: /Por cobrar/ });
    const historyTab = screen.getByRole('tab', { name: /Historial/ });
    expect(claimableTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Premios para tu wallet',
    );

    await user.click(historyTab);

    await waitFor(() =>
      expect(historyTab).toHaveAttribute('aria-selected', 'true'),
    );
    expect(claimableTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Historial de premios',
    );
  });

  it('permite cambiar de tab con el teclado', async () => {
    const user = userEvent.setup();
    render(<PremiosContent />);

    const claimableTab = await screen.findByRole('tab', { name: /Por cobrar/ });
    const historyTab = screen.getByRole('tab', { name: /Historial/ });
    await user.click(claimableTab);
    await user.keyboard('{ArrowRight}');

    expect(historyTab).toHaveFocus();
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('abre el historial filtrado desde category=ambassador', async () => {
    const data = rewardStatus();
    data.ambassadorAllocations = [
      {
        allocationId: 'ambassador-1',
        periodId: '2026-W36',
        category: 'ambassador_ordinary',
        amountRaw: '3000000000000000000',
        status: 'allocated_offchain',
        availableAt: '2026-09-06T12:00:00.000Z',
        createdAt: '2026-09-06T12:00:00.000Z',
      },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data }),
    });
    window.history.replaceState(
      window.history.state,
      '',
      '/premios?category=ambassador',
    );
    render(<PremiosContent />);

    const historyTab = await screen.findByRole('tab', { name: /Historial/ });
    await waitFor(() =>
      expect(historyTab).toHaveAttribute('aria-selected', 'true'),
    );
    expect(
      screen.getByText('Mostrando comisiones de embajador'),
    ).toBeInTheDocument();
    expect(screen.getByText('Comisión de embajador')).toBeInTheDocument();
    expect(screen.queryByText('Premio de partida')).not.toBeInTheDocument();
  });

  it('abre Por cobrar al recibir el hash de cobro', async () => {
    window.history.replaceState(
      window.history.state,
      '',
      '/premios#cobrar-premios',
    );
    render(<PremiosContent />);

    const claimableTab = await screen.findByRole('tab', { name: /Por cobrar/ });
    await waitFor(() =>
      expect(claimableTab).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Premios para tu wallet',
    );
  });

  it('revela y enfoca el ancla del historial cuando llega la lectura pendiente', async () => {
    let finish!: (response: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    window.history.replaceState(window.history.state, '', '/premios#reward-history-title');
    render(<PremiosContent />);
    expect(screen.queryByRole('heading', { name: 'Historial de premios' })).not.toBeInTheDocument();

    await act(async () => {
      finish({ ok: true, json: async () => ({ status: 'ok', data: rewardStatus() }) });
    });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Historial de premios' })).toHaveFocus());
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Historial de premios');
  });

  it('sincroniza atrás y adelante sin reemplazar el estado de Next', async () => {
    const user = userEvent.setup();
    const nextState = { __NA: true, marker: 'next-router-state' };
    window.history.replaceState(nextState, '', '/premios');
    render(<PremiosContent />);

    const claimableTab = await screen.findByRole('tab', { name: /Por cobrar/ });
    const historyTab = screen.getByRole('tab', { name: /Historial/ });
    await user.click(historyTab);
    expect(window.location.hash).toBe('#historial-premios');
    expect(window.history.state).toEqual(nextState);

    window.history.replaceState(nextState, '', '/premios#cobrar-premios');
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() =>
      expect(claimableTab).toHaveAttribute('aria-selected', 'true'),
    );
    expect(historyTab).toHaveAttribute('aria-selected', 'false');
  });

  it('conserva la paginación del historial al cambiar de tab', async () => {
    const user = userEvent.setup();
    const firstPage = rewardStatus();
    firstPage.nextCursor = 'cursor-2';
    const secondPage = {
      ...rewardStatus(),
      allocations: [
        ...rewardStatus().allocations,
        {
          allocationId: 'allocation-2',
          periodId: '2026-09-01',
          category: 'player',
          amountRaw: '4000000000000000000',
          status: 'allocated' as const,
          createdAt: '2026-09-01T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    };
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', data: firstPage }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', data: secondPage }),
      });
    render(<PremiosContent />);

    const historyTab = await screen.findByRole('tab', { name: /Historial/ });
    await user.click(historyTab);
    await waitFor(() =>
      expect(historyTab).toHaveAttribute('aria-selected', 'true'),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver más movimientos' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getAllByText('Premio de partida')).toHaveLength(2),
    );

    await user.click(screen.getByRole('tab', { name: /Por cobrar/ }));
    await user.click(screen.getByRole('tab', { name: /Historial/ }));
    expect(screen.getAllByText('Premio de partida')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Ver más movimientos' }),
    ).not.toBeInTheDocument();
  });

  it('mantiene visible el estado de una transacción pendiente al cambiar de tab', async () => {
    const user = userEvent.setup();
    let resolveWrite: (hash: `0x${string}`) => void = () => undefined;
    writeContractAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve as (hash: `0x${string}`) => void;
        }),
    );
    render(<PremiosContent />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cobrar 1 UKI' }),
    );
    expect(
      await screen.findByText('Confirmando cobro… No cierres esta pantalla.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Historial/ }));
    expect(
      screen.getByText('Confirmando cobro… No cierres esta pantalla.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Por cobrar/ }));
    expect(
      screen.getByRole('button', { name: 'Confirmando cobro…' }),
    ).toBeInTheDocument();

    resolveWrite(transactionHash);
    await waitFor(() =>
      expect(waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: transactionHash,
        onReplaced: expect.any(Function),
      }),
    );
  });
});
