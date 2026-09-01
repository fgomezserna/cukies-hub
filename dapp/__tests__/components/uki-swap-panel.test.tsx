import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { parseUnits } from 'viem';

import { UkiSwapPanel } from '@/components/landing/uki-swap-panel';
import { PANCAKE_V2_ROUTER_BY_CHAIN } from '@/lib/uki-swap';

const mockWriteContractAsync = jest.fn();
const mockWaitForTransactionReceipt = jest.fn();
const mockReadContract = jest.fn();
const mockRefetchAllowance = jest.fn();

let mockConnected = false;
let mockAllowance = BigInt(0);

jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: mockConnected ? '0x0000000000000000000000000000000000000001' : undefined,
    chainId: mockConnected ? 56 : undefined,
    isConnected: mockConnected,
  }),
  useConnect: () => ({ connectAsync: jest.fn(), connectors: [], isPending: false }),
  usePublicClient: () => ({
    readContract: mockReadContract,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
  }),
  useReadContract: ({ functionName }: { functionName: string }) => {
    if (functionName === 'allowance') {
      return { data: mockAllowance, refetch: mockRefetchAllowance };
    }

    return {
      data: [
        BigInt('1000000000000000'),
        BigInt('685241860191561772'),
        BigInt('102507566607818239'),
        BigInt('30796100677377862888'),
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
  },
  useSwitchChain: () => ({ switchChainAsync: jest.fn(), isPending: false }),
  useWriteContract: () => ({ writeContractAsync: mockWriteContractAsync }),
}));

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowDown: Icon,
    CheckCircle2: Icon,
    ExternalLink: Icon,
    Loader2: Icon,
    Route: Icon,
    ShieldCheck: Icon,
    Wallet: Icon,
  };
});

jest.mock('@/components/landing/wallet-connector-dialog', () => ({
  WalletConnectorDialog: () => null,
}));

jest.mock('@/hooks/use-has-mounted', () => ({ useHasMounted: () => true }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/providers/public-locale-provider', () => ({
  usePublicLocale: () => ({ locale: 'es' }),
}));

describe('UkiSwapPanel', () => {
  beforeEach(() => {
    mockConnected = false;
    mockAllowance = BigInt(0);
    mockWriteContractAsync.mockReset();
    mockWaitForTransactionReceipt.mockReset();
    mockReadContract.mockReset();
    mockRefetchAllowance.mockReset();
  });

  it('muestra el swap dentro del hero con las tres rutas de mainnet', () => {
    render(<UkiSwapPanel />);

    expect(screen.getByRole('heading', { name: 'Comprar UKI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BNB' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'USDT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ASM' })).toBeInTheDocument();
    expect(screen.getByText('BNB → USDT → ASM → UKI')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad BNB' }), {
      target: { value: '0.001' },
    });

    expect(screen.getByText('30,7961 UKI')).toBeInTheDocument();
    expect(screen.getByText('30,64212 UKI')).toBeInTheDocument();
  });

  it('cambia la ruta mostrada al seleccionar USDT o ASM', () => {
    render(<UkiSwapPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'USDT' }));
    expect(screen.getByText('USDT → ASM → UKI')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Cantidad USDT' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ASM' }));
    expect(screen.getByText('ASM → UKI')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Cantidad ASM' })).toBeInTheDocument();
  });

  it('autoriza únicamente el importe introducido antes del swap ERC-20', async () => {
    mockConnected = true;
    mockWriteContractAsync.mockResolvedValue('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });

    render(<UkiSwapPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'USDT' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad USDT' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar importe exacto' }));

    await waitFor(() => {
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 56,
        address: '0x55d398326f99059fF775485246999027B3197955',
        functionName: 'approve',
        args: [PANCAKE_V2_ROUTER_BY_CHAIN[56], parseUnits('1', 18)],
      }));
    });
    expect(mockWaitForTransactionReceipt).toHaveBeenCalled();
    expect(await screen.findByText('Importe autorizado. Ya puedes firmar la compra.')).toBeInTheDocument();
  });
});
