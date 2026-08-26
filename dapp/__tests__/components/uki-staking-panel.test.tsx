import { fireEvent, render, screen } from '@testing-library/react';
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
  UKI_PRESALE_CHAIN_LABEL: 'BNB Smart Chain Testnet',
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
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const walletAddress = '0x3333333333333333333333333333333333333333';
const tokenAddress = '0x1111111111111111111111111111111111111111';
const stakingAddress = '0x2222222222222222222222222222222222222222';
const writeContract = jest.fn();
const switchChain = jest.fn();
const reset = jest.fn();
const toast = jest.fn();
const routePreview = {
  currentRequirementRaw: parseUnits('20000', 18).toString(),
  presaleLockedRaw: parseUnits('40000', 18).toString(),
  indexedStakedRaw: parseUnits('25000', 18).toString(),
  allocatedSlots: 3,
};

let allowance = BigInt(0);
let stakingToken = tokenAddress;
let stakingPaused = false;

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

  it('offers Cukie Master amounts and previews vesting plus staking without showing attempts', () => {
    render(<UkiStakingPanel routePreview={routePreview} />);

    fireEvent.click(screen.getByRole('button', { name: '20.000' }));
    expect(screen.getByLabelText('Cantidad de UKI')).toHaveValue('20000');
    expect(screen.getByText(/Total computable: 85\.000 UKI · 4\/5 Cukie Masters/i)).toBeInTheDocument();
    expect(screen.getByText(/Faltarían 15\.000 UKI computables/i)).toBeInTheDocument();
    expect(screen.queryByText(/partidas concedidas/i)).not.toBeInTheDocument();
    expect(screen.getByText('Conectar')).toBeInTheDocument();
    expect(screen.getByText('Autorizar')).toBeInTheDocument();
    expect(screen.getAllByText('Depositar')).toHaveLength(2);
  });

  it('calcula el depósito exacto necesario para la siguiente plaza', () => {
    render(<UkiStakingPanel routePreview={routePreview} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lo necesario' }));

    expect(screen.getByLabelText('Cantidad de UKI')).toHaveValue('15000');
    expect(screen.getByText(/Total computable: 80\.000 UKI · 4\/5 Cukie Masters/i)).toBeInTheDocument();
  });

  it('switches explicitly to BSC Testnet when the wallet is on another chain', () => {
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 56,
      isConnected: true,
    } as never);

    render(<UkiStakingPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar a BNB Smart Chain Testnet/i }));

    expect(switchChain).toHaveBeenCalledWith(
      { chainId: 97 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
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
    fireEvent.click(screen.getByRole('button', { name: /Cambiar a BNB Smart Chain Testnet/i }));

    const switchOptions = switchChain.mock.calls[0]?.[1] as { onError?: () => void } | undefined;
    switchOptions?.onError?.();

    expect(toast).toHaveBeenCalledWith({
      title: 'No se pudo cambiar la red',
      description: 'Abre tu wallet y acepta el cambio a BNB Smart Chain Testnet.',
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
    expect(screen.getByText(/token y contrato coincidan/i)).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });
});
