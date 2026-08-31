import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { parseUnits } from 'viem';
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useToast } from '@/hooks/use-toast';
import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';
import { useAuth } from '@/providers/auth-provider';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useReadContract: jest.fn(),
  useSwitchChain: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/hooks/use-has-mounted');
jest.mock('@/hooks/use-toast');
jest.mock('@/hooks/use-treasure-hunt-competition-overview');
jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: ({ evmOnly }: { evmOnly?: boolean }) => (
    <button type="button" data-evm-only={String(Boolean(evmOnly))}>
      Conectar wallet para gestionar staking
    </button>
  ),
}));
jest.mock('@/components/landing/sale-config', () => ({
  UKI_PRESALE_CHAIN_ID: 97,
  UKI_PRESALE_CHAIN_LABEL: 'BNB Smart Chain',
}));
jest.mock('@/lib/contracts/uki-sale', () => ({
  erc20Abi: [],
  ukiStakingAbi: [],
  ukiSaleContracts: {
    ukiTokenAddress: '0x1111111111111111111111111111111111111111',
    ukiStakingAddress: '0x2222222222222222222222222222222222222222',
    blockExplorerBaseUrl: 'https://testnet.bscscan.com',
  },
  getBscScanTxUrl: (hash: string) => `https://testnet.bscscan.com/tx/${hash}`,
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  ArrowDownToLine: () => null,
  ArrowUpFromLine: () => null,
  Check: () => null,
  ExternalLink: () => null,
  Loader2: () => null,
  RefreshCw: () => null,
  ShieldCheck: () => null,
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseReadContract = useReadContract as jest.MockedFunction<typeof useReadContract>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseWaitForTransactionReceipt = useWaitForTransactionReceipt as jest.MockedFunction<
  typeof useWaitForTransactionReceipt
>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const mockUseHasMounted = useHasMounted as jest.MockedFunction<typeof useHasMounted>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseTreasureHuntCompetitionOverview = useTreasureHuntCompetitionOverview as jest.MockedFunction<
  typeof useTreasureHuntCompetitionOverview
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const walletAddress = '0x3333333333333333333333333333333333333333';
const tokenAddress = '0x1111111111111111111111111111111111111111';
const stakingAddress = '0x2222222222222222222222222222222222222222';
const writeContract = jest.fn();
const switchChain = jest.fn();
const reset = jest.fn();
const toast = jest.fn();
const reloadCompetition = jest.fn();
const routePreview = {
  currentRequirementRaw: parseUnits('20000', 18).toString(),
  presaleLockedRaw: parseUnits('40000', 18).toString(),
  indexedStakedRaw: parseUnits('25000', 18).toString(),
  allocatedSlots: 3,
};

let allowance = BigInt(0);
let stakingToken = tokenAddress;
let stakingPaused = false;
let competitionOverview: ReturnType<typeof useTreasureHuntCompetitionOverview>;

function readResult(data: unknown, isError = false) {
  return {
    data,
    isError,
    refetch: jest.fn(),
  } as never;
}

describe('UkiStakingPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowance = BigInt(0);
    stakingToken = tokenAddress;
    stakingPaused = false;
    mockUseHasMounted.mockReturnValue(true);
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as never);
    mockUseSwitchChain.mockReturnValue({ switchChain, isPending: false } as never);
    mockUseWriteContract.mockReturnValue({
      writeContract,
      data: undefined,
      error: null,
      isPending: false,
      reset,
    } as never);
    mockUseWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
    } as never);
    mockUseToast.mockReturnValue({ toast } as never);
    competitionOverview = {
      status: {
        success: true,
        configured: true,
        enabled: true,
        phase: 'active',
        campaign: {
          campaignId: 'uki-staking-testnet-2026-08',
          eligibilityKind: 'uki_staking',
          startsAt: '2026-08-27T00:00:00.000Z',
          endsAt: '2026-09-15T00:00:00.000Z',
          stakePerAttemptRaw: parseUnits('2000', 18).toString(),
          topAttemptsPerWallet: 10,
          pointsPerTicket: 100,
          basePrizeUkiRaw: '0',
          stakePrizeBps: 1000,
          prizePerWinnerUkiRaw: '0',
          maxWinsPerWallet: 1,
          poolBps: 2500,
          playerRewardBps: 1000,
          sponsorRewardBps: 2500,
          maxWinningAttemptsPerWallet: 10,
          cliffMonths: 9,
          vestingMonths: 6,
        },
        participant: null,
        eligibility: {
          ready: true,
          stakedUkiRaw: parseUnits('25000', 18).toString(),
          totalStakedUkiRaw: parseUnits('25000', 18).toString(),
          indexedThroughBlock: 123,
          indexedAt: '2026-08-29T12:00:00.000Z',
          disqualified: false,
          disqualificationEvidence: null,
          issues: [],
          attemptsGranted: 12,
          attemptsUsed: 2,
          attemptsRemaining: 10,
          topAttemptsCount: 2,
          totalTickets: 0,
          provisionalTickets: 0,
        },
      },
      leaderboard: [],
      leaderboardMeta: null,
      isLoading: false,
      error: null,
      reload: reloadCompetition,
    };
    mockUseTreasureHuntCompetitionOverview.mockReturnValue(competitionOverview);
    mockUseAuth.mockReturnValue({
      user: { walletAddress },
      isLoading: false,
      isWaitingForApproval: false,
      walletType: 'evm',
      fetchUser: jest.fn(),
    } as never);
    mockUseReadContract.mockImplementation((config) => {
      switch (config?.functionName) {
        case 'ukiToken':
          return readResult(stakingToken);
        case 'paused':
          return readResult(stakingPaused);
        case 'balanceOf':
          return readResult(parseUnits('50000', 18));
        case 'allowance':
          return readResult(allowance);
        case 'stakedBalance':
          return readResult(parseUnits('25000', 18));
        default:
          return readResult(undefined);
      }
    });
  });

  it('asks for a wallet without attempting a contract write', () => {
    mockUseAccount.mockReturnValue({ isConnected: false } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByRole('button', { name: /Conectar wallet para gestionar staking/i }))
      .toHaveAttribute('data-evm-only', 'true');
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('separates Cukie Master previews from the backend tournament allowance', () => {
    render(<UkiStakingPanel routePreview={routePreview} />);

    fireEvent.click(screen.getByRole('button', { name: '20.000' }));
    expect(screen.getByLabelText('Cantidad de UKI')).toHaveValue('20000');
    expect(screen.getByText(/Tendrías 45\.000 UKI en staking y 4\/5 Cukie Masters/i)).toBeInTheDocument();
    expect(screen.getByText(/Te faltarían 15\.000 UKI para el siguiente Cukie Master/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('10');
    expect(screen.getByText(/Concedidas: 12/i)).toBeInTheDocument();
    expect(screen.getByText(/Usadas: 2/i)).toBeInTheDocument();
    expect(screen.queryByText('Pasos de la operación')).not.toBeInTheDocument();
    expect(screen.getByText(/Recibes 1 partida por cada 2\.?000 UKI/i)).toBeInTheDocument();
    expect(screen.getByText(/Cukie Master se calcula por separado/i)).toBeInTheDocument();
    expect(screen.getAllByText('Depositar')).toHaveLength(1);
  });

  it('shows the backend remainder instead of deriving attempts from the contract balance', () => {
    render(<UkiStakingPanel />);

    expect(screen.getByText('25.000')).toBeInTheDocument();
    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('10');
  });

  it('shows a loading state before the backend returns the wallet eligibility', () => {
    mockUseTreasureHuntCompetitionOverview.mockReturnValue({
      ...competitionOverview,
      status: null,
      isLoading: true,
    } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('···');
  });

  it('does not expose stale eligibility when the signed session belongs to another wallet', () => {
    mockUseAuth.mockReturnValue({
      user: { walletAddress: '0x4444444444444444444444444444444444444444' },
      isLoading: false,
      isWaitingForApproval: false,
      walletType: 'evm',
      fetchUser: jest.fn(),
    } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('—');
    expect(screen.getByText(/Conecta y firma esta wallet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Concedidas:/i)).not.toBeInTheDocument();
  });

  it('shows zero and explains a tournament disqualification', () => {
    mockUseTreasureHuntCompetitionOverview.mockReturnValue({
      ...competitionOverview,
      status: competitionOverview.status ? {
        ...competitionOverview.status,
        eligibility: competitionOverview.status.eligibility ? {
          ...competitionOverview.status.eligibility,
          disqualified: true,
          attemptsRemaining: 0,
        } : null,
      } : null,
    } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('0');
    expect(screen.getByText(/wallet está descalificada del torneo/i)).toBeInTheDocument();
  });

  it('does not invent an allowance while the indexer is pending', () => {
    mockUseTreasureHuntCompetitionOverview.mockReturnValue({
      ...competitionOverview,
      status: competitionOverview.status ? {
        ...competitionOverview.status,
        eligibility: competitionOverview.status.eligibility ? {
          ...competitionOverview.status.eligibility,
          ready: false,
          attemptsRemaining: 99,
        } : null,
      } : null,
    } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('—');
    expect(screen.getByText(/Aún estamos confirmando el estado de esta wallet/i)).toBeInTheDocument();
  });

  it('requests a signed session when the backend has no wallet eligibility', () => {
    mockUseTreasureHuntCompetitionOverview.mockReturnValue({
      ...competitionOverview,
      status: competitionOverview.status
        ? { ...competitionOverview.status, eligibility: null }
        : null,
    } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByLabelText('Partidas disponibles')).toHaveTextContent('—');
    expect(screen.getByText(/Conecta y firma esta wallet/i)).toBeInTheDocument();
  });

  it('offers a backend allowance retry after a competition refresh error', () => {
    mockUseTreasureHuntCompetitionOverview.mockReturnValue({
      ...competitionOverview,
      error: 'No se pudo consultar el estado de la competición.',
    } as never);

    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar cupo' }));

    expect(reloadCompetition).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/No se ha podido actualizar el cupo del torneo/i)).toBeInTheDocument();
  });

  it('ofrece cantidades simples sin exponer cálculos internos de la plaza', () => {
    render(<UkiStakingPanel routePreview={routePreview} />);

    fireEvent.click(screen.getByRole('button', { name: '2.000' }));

    expect(screen.getByLabelText('Cantidad de UKI')).toHaveValue('2000');
    expect(screen.queryByRole('button', { name: 'Lo necesario' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Total computable:/i)).not.toBeInTheDocument();
  });

  it('switches explicitly to the configured network when the wallet is on another chain', () => {
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 56,
      isConnected: true,
    } as never);

    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar a BNB Smart Chain/i }));

    expect(switchChain).toHaveBeenCalledWith(
      { chainId: 97 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('keeps BSC balance reads enabled when the wallet is on another chain', () => {
    const queryEnabled = new Map<string, boolean>();
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 56,
      isConnected: true,
    } as never);
    mockUseReadContract.mockImplementation((config) => {
      queryEnabled.set(String(config?.functionName), Boolean(config?.query?.enabled));
      switch (config?.functionName) {
        case 'ukiToken':
          return readResult(stakingToken);
        case 'paused':
          return readResult(stakingPaused);
        case 'balanceOf':
          return readResult(parseUnits('50000', 18));
        case 'allowance':
          return readResult(allowance);
        case 'stakedBalance':
          return readResult(parseUnits('25000', 18));
        default:
          return readResult(undefined);
      }
    });

    render(<UkiStakingPanel />);

    expect(queryEnabled.get('balanceOf')).toBe(true);
    expect(queryEnabled.get('allowance')).toBe(true);
    expect(queryEnabled.get('stakedBalance')).toBe(true);
    expect(screen.getByText('50.000')).toBeInTheDocument();
    expect(screen.getByText('25.000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cambiar a BNB Smart Chain/i })).toBeEnabled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('offers an explicit retry after a contract read fails', async () => {
    const refetchLiquidBalance = jest.fn().mockResolvedValue({ data: parseUnits('50000', 18) });
    mockUseReadContract.mockImplementation((config) => {
      switch (config?.functionName) {
        case 'ukiToken':
          return readResult(stakingToken);
        case 'paused':
          return readResult(stakingPaused);
        case 'balanceOf':
          return {
            data: undefined,
            isError: true,
            refetch: refetchLiquidBalance,
          } as never;
        case 'allowance':
          return readResult(allowance);
        case 'stakedBalance':
          return readResult(parseUnits('25000', 18));
        default:
          return readResult(undefined);
      }
    });

    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar lecturas' }));

    await waitFor(() => expect(refetchLiquidBalance).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/No se han podido leer los balances con garantías/i)).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('blocks contract writes until the connected EVM wallet has authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isWaitingForApproval: false,
      walletType: null,
      fetchUser: jest.fn(),
    } as never);

    render(<UkiStakingPanel />);

    expect(screen.getByText(/Firma el acceso con esta wallet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conectar wallet para gestionar staking/i }))
      .toHaveAttribute('data-evm-only', 'true');
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('explains how to finish the switch when the EVM wallet rejects it', () => {
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 56,
      isConnected: true,
    } as never);

    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar a BNB Smart Chain/i }));

    const switchOptions = switchChain.mock.calls[0]?.[1] as { onError?: () => void } | undefined;
    switchOptions?.onError?.();

    expect(toast).toHaveBeenCalledWith({
      title: 'No se pudo cambiar la red',
      description: 'Abre tu wallet y acepta el cambio a BNB Smart Chain.',
      variant: 'destructive',
    });
  });

  it('approves only the entered UKI amount when allowance is insufficient', () => {
    render(<UkiStakingPanel />);
    fireEvent.change(screen.getByLabelText('Cantidad de UKI'), { target: { value: '21000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar UKI exactos' }));

    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 97,
      address: tokenAddress,
      functionName: 'approve',
      args: [stakingAddress, parseUnits('21000', 18)],
    }));
  });

  it('stakes directly once the exact amount is already approved', () => {
    allowance = parseUnits('50000', 18);

    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Hacer staking' }));

    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 97,
      address: stakingAddress,
      functionName: 'stake',
      args: [parseUnits('2000', 18)],
    }));
  });

  it('refreshes tournament attempts after a confirmed staking transaction', async () => {
    allowance = parseUnits('50000', 18);
    const tournamentRefresh = jest.fn();
    window.addEventListener('cukies:treasure-hunt:competition:refresh', tournamentRefresh);
    const { rerender } = render(<UkiStakingPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Hacer staking' }));
    mockUseWriteContract.mockReturnValue({
      writeContract,
      data: `0x${'a'.repeat(64)}`,
      error: null,
      isPending: false,
      reset,
    } as never);
    mockUseWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: true,
    } as never);
    rerender(<UkiStakingPanel />);

    await waitFor(() => expect(tournamentRefresh).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith({
      title: 'Staking confirmado',
      description: 'Tu staking de UKI está confirmado. Estamos actualizando tus partidas del torneo.',
    });
    window.removeEventListener('cukies:treasure-hunt:competition:refresh', tournamentRefresh);
  });

  it('withdraws only up to the verified staked balance', () => {
    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirar UKI' }));

    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 97,
      address: stakingAddress,
      functionName: 'unstake',
      args: [parseUnits('2000', 18)],
    }));

    fireEvent.change(screen.getByLabelText('Cantidad de UKI'), { target: { value: '30000' } });
    expect(screen.getByRole('button', { name: 'Retirar UKI' })).toBeDisabled();
    expect(screen.getByText(/No tienes suficiente UKI en staking/i)).toBeInTheDocument();
  });

  it('keeps withdrawals available while new deposits are paused', () => {
    stakingPaused = true;

    render(<UkiStakingPanel />);
    expect(screen.getByRole('button', { name: 'Aprobar UKI exactos' })).toBeDisabled();
    expect(screen.getByText(/nuevos depósitos están pausados/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    expect(screen.getByRole('button', { name: 'Retirar UKI' })).toBeEnabled();
  });

  it('fails closed if the staking contract points to a different token', () => {
    stakingToken = '0x4444444444444444444444444444444444444444';

    render(<UkiStakingPanel />);

    expect(screen.getByRole('button', { name: 'Aprobar UKI exactos' })).toBeDisabled();
    expect(screen.getByText(/No podemos verificar el staking ahora/i)).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });
});
