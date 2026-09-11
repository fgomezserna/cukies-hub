import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

const wallet = '0x00000000000000000000000000000000000000aa';
const vault = '0x9999999999999999999999999999999999999999';
const transactionHash = `0x${'a'.repeat(64)}` as `0x${string}`;
const oneUki = BigInt('1000000000000000000');
const twoUki = BigInt('2000000000000000000');
const tenUki = BigInt('10000000000000000000');

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
  useReadContract: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/providers/wallet-coordinator-context', () => {
  const requestWallet = jest.fn();
  return {
    FALLBACK_COORDINATOR: { requestWallet },
    useWalletCoordinator: () => ({
      requestWallet,
      evm: { isConnecting: false },
    }),
  };
});
jest.mock('@/lib/contracts/uki-sale', () => ({
  getBscScanTxUrl: (hash: string) => `https://testnet.bscscan.com/tx/${hash}`,
  ukiSaleContracts: {
    chainId: 97,
    vestingVaultAddress: '0x9999999999999999999999999999999999999999',
    blockExplorerBaseUrl: 'https://testnet.bscscan.com',
  },
  vestingVaultAbi: [],
}));
jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => React.createElement('span', props);
  return {
    AlertTriangle: Icon,
    CalendarClock: Icon,
    ChevronDown: Icon,
    CheckCircle2: Icon,
    ExternalLink: Icon,
    LockKeyhole: Icon,
    ShieldCheck: Icon,
    Sparkles: Icon,
    Wallet: Icon,
  };
});

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseReadContract = useReadContract as jest.MockedFunction<typeof useReadContract>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const waitForTransactionReceipt = jest.fn();
const writeContractAsync = jest.fn();
let refetchCalls = 0;
let metadataRefetchCalls = 0;

function readValue(functionName: string, released = BigInt(0), claimable = oneUki) {
  if (functionName === 'scheduleOf') {
    return {
      totalAmount: tenUki,
      releasedAmount: released,
      start: BigInt(1_700_000_000),
      cliff: BigInt(0),
      duration: BigInt(31_536_000),
    };
  }
  if (functionName === 'releasable') return claimable;
  if (functionName === 'totalAllocated') return tenUki;
  if (functionName === 'totalReleased') return released;
  if (functionName === 'unallocatedBalance') return BigInt(0);
  if (functionName === 'presaleVestingStart') return BigInt(1_700_000_000);
  return undefined;
}

function readValueForAttempt(functionName: string, attempt: number) {
  if (attempt >= 2) return readValue(functionName, oneUki, BigInt(0));
  if (attempt === 1) return readValue(functionName, BigInt(0), twoUki);
  return readValue(functionName);
}

const globalReadFunctions = new Set([
  'totalAllocated',
  'totalReleased',
  'unallocatedBalance',
  'presaleVestingStart',
]);

async function flushAsyncWork() {
  for (let index = 0; index < 16; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

import PublicVestingPage from '@/app/vesting/page';

describe('PublicVestingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refetchCalls = 0;
    metadataRefetchCalls = 0;
    mockUseAccount.mockReturnValue({
      address: wallet,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      waitForTransactionReceipt,
    } as unknown as ReturnType<typeof usePublicClient>);
    mockUseSwitchChain.mockReturnValue({
      switchChain: jest.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useSwitchChain>);
    mockUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);
    mockUseReadContract.mockImplementation((input) => {
      const functionName = String(input?.functionName);
      const [data, setData] = React.useState(() => readValue(functionName));
      const refetch = React.useCallback(async () => {
        if (globalReadFunctions.has(functionName)) {
          metadataRefetchCalls += 1;
          throw new Error('metadata provider delayed');
        }
        const attempt = Math.floor(refetchCalls / 2);
        refetchCalls += 1;
        const nextData = readValueForAttempt(functionName, attempt);
        setData(nextData);
        return { status: 'success', data: nextData };
      }, [functionName]);
      return {
        data,
        isError: false,
        refetch,
      } as never;
    });
    writeContractAsync.mockResolvedValue(transactionHash);
    waitForTransactionReceipt.mockResolvedValue({
      status: 'success',
      transactionHash,
    });
  });

  it('mantiene el lock tras receipt con lecturas antiguas/devengo y lo libera al aumentar released', async () => {
    render(<PublicVestingPage />);

    const claimButton = await screen.findByRole('button', { name: 'Reclamar UKI disponible' });
    expect(claimButton).toBeEnabled();
    jest.useFakeTimers();
    try {
      fireEvent.click(claimButton);
      await flushAsyncWork();

      expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
        chainId: 97,
        address: vault,
        functionName: 'releaseAll',
      }));
      expect(waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: transactionHash,
        onReplaced: expect.any(Function),
      });
      expect(refetchCalls).toBe(2);
      expect(metadataRefetchCalls).toBe(4);
      expect(screen.getByRole('button', { name: 'Cobro pendiente' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Comprobar cobro' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reclamar UKI disponible' })).not.toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await flushAsyncWork();
      expect(refetchCalls).toBe(4);
      expect(metadataRefetchCalls).toBe(8);
      expect(screen.getByRole('button', { name: 'Cobro pendiente' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Comprobar cobro' })).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1_000);
      });
      await flushAsyncWork();
      expect(refetchCalls).toBe(6);
      expect(metadataRefetchCalls).toBe(12);
      expect(screen.getByRole('status')).toHaveTextContent('Cobro confirmado y calendario actualizado.');
      expect(screen.queryByRole('button', { name: 'Comprobar cobro' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reclamar UKI disponible' })).toBeDisabled();
      expect(screen.getByRole('link', { name: /Transacción de reclamación enviada/ })).toHaveAttribute(
        'href',
        `https://testnet.bscscan.com/tx/${transactionHash}`,
      );
      expect(writeContractAsync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('no muestra éxito de la wallet original cuando la cuenta cambia mientras espera el receipt', async () => {
    let accountState = {
      address: wallet,
      chainId: 97,
      isConnected: true,
    };
    mockUseAccount.mockImplementation(() => accountState as unknown as ReturnType<typeof useAccount>);
    const resolveReceipt = jest.fn();
    const receiptPromise = new Promise<{ status: string; transactionHash: `0x${string}` }>((resolve) => {
      resolveReceipt.mockImplementation(resolve);
    });
    waitForTransactionReceipt.mockReturnValue(receiptPromise);

    const view = render(<PublicVestingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reclamar UKI disponible' }));
    await waitFor(() => expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: transactionHash,
      onReplaced: expect.any(Function),
    }));

    accountState = {
      address: '0x00000000000000000000000000000000000000bb',
      chainId: 97,
      isConnected: true,
    };
    view.rerender(<PublicVestingPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reclamar UKI disponible' })).toBeInTheDocument());

    await act(async () => {
      resolveReceipt({ status: 'success', transactionHash });
    });
    expect(screen.queryByText(/Cobro confirmado en la cadena/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
  });
});
