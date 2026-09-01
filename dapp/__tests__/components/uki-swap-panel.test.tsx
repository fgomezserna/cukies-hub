import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { parseUnits } from 'viem';

import { UkiSwapPanel } from '@/components/landing/uki-swap-panel';
import { PANCAKE_V2_ROUTER_BY_CHAIN } from '@/lib/uki-swap';

const mockWriteContractAsync = jest.fn();
const mockWaitForTransactionReceipt = jest.fn();
const mockReadContract = jest.fn();
const mockRefetchAllowance = jest.fn();
const mockRefetchExactInputQuote = jest.fn();
const mockRefetchExactOutputQuote = jest.fn();
const mockUseReadContract = jest.fn(({ functionName }: { functionName: string }) => {
  if (functionName === 'allowance') {
    return { data: mockAllowance, refetch: mockRefetchAllowance };
  }

  if (functionName === 'getAmountsIn') {
    return {
      data: [
        parseUnits('1', 18),
        parseUnits('2', 18),
        parseUnits('3', 18),
        parseUnits('1000', 18),
      ],
      error: null,
      isFetching: false,
      refetch: mockRefetchExactOutputQuote,
    };
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
    refetch: mockRefetchExactInputQuote,
  };
});

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
  useReadContract: (args: { functionName: string }) => mockUseReadContract(args),
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
    mockRefetchExactInputQuote.mockReset();
    mockRefetchExactOutputQuote.mockReset();
    mockUseReadContract.mockClear();
  });

  it('muestra el swap dentro del hero con los cuatro activos de mainnet y sin la ruta técnica', () => {
    render(<UkiSwapPanel />);

    expect(screen.getByRole('heading', { name: 'Comprar UKI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BNB' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'USDT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'USDC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ASM' })).toBeInTheDocument();
    expect(screen.queryByText(/Ruta ejecutada/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Importe a pagar BNB' }), {
      target: { value: '0.001' },
    });

    expect(screen.getByRole('textbox', { name: 'Importe a pagar UKI' })).toHaveValue('30.79610067');
    expect(screen.getByText('30,64212 UKI')).toBeInTheDocument();
  });

  it('permite seleccionar USDT, USDC o ASM como activo de pago', () => {
    render(<UkiSwapPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'USDT' }));
    expect(screen.getByRole('textbox', { name: 'Importe a pagar USDT' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'USDC' }));
    expect(screen.getByRole('textbox', { name: 'Importe a pagar USDC' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ASM' }));
    expect(screen.getByRole('textbox', { name: 'Importe a pagar ASM' })).toBeInTheDocument();
  });

  it('calcula cuánto BNB hace falta al escribir la cantidad deseada de UKI', () => {
    render(<UkiSwapPanel />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Importe a pagar UKI' }), {
      target: { value: '1000' },
    });

    expect(screen.getByRole('textbox', { name: 'Importe a pagar BNB' })).toHaveValue('1');
    expect(screen.getByText('1,005 BNB')).toBeInTheDocument();
    expect(mockUseReadContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'getAmountsIn',
      args: [parseUnits('1000', 18), expect.any(Array)],
    }));
  });

  it('autoriza únicamente el importe introducido antes del swap ERC-20', async () => {
    mockConnected = true;
    mockWriteContractAsync.mockResolvedValue('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });

    render(<UkiSwapPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'USDT' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Importe a pagar USDT' }), {
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

  it('autoriza el máximo calculado cuando el usuario fija los UKI que quiere recibir', async () => {
    mockConnected = true;
    mockWriteContractAsync.mockResolvedValue('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });

    render(<UkiSwapPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'USDC' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Importe a pagar UKI' }), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar importe exacto' }));

    await waitFor(() => {
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 56,
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        functionName: 'approve',
        args: [PANCAKE_V2_ROUTER_BY_CHAIN[56], parseUnits('1.005', 18)],
      }));
    });
  });

  it('usa el swap de salida exacta y limita el BNB máximo al fijar los UKI', async () => {
    mockConnected = true;
    mockReadContract.mockResolvedValue([
      parseUnits('1', 18),
      parseUnits('2', 18),
      parseUnits('3', 18),
      parseUnits('1000', 18),
    ]);
    mockWriteContractAsync.mockResolvedValue('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });

    render(<UkiSwapPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Importe a pagar UKI' }), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comprar UKI' }));

    await waitFor(() => {
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 56,
        functionName: 'swapETHForExactTokens',
        args: [
          parseUnits('1000', 18),
          expect.any(Array),
          '0x0000000000000000000000000000000000000001',
          expect.any(BigInt),
        ],
        value: parseUnits('1.005', 18),
      }));
    });
  });
});
