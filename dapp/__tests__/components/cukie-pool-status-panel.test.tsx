import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { CukiePoolStatusPanel } from '@/components/cukie-pool/status-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/lib/contracts/uki-nft-vaults', () => ({
  cukiePoolNftVaultAbi: [],
  ukiNftVaults: {
    chainId: null,
    cukieMasterNftVaultAddress: null,
    cukiePoolNftVaultAddress: null,
    collectionAddresses: [],
    collectionConfigInvalid: false,
    recoveryCollectionAddresses: [],
    recoveryCollectionConfigInvalid: false,
    explorerBaseUrl: null,
    ready: { cukieMaster: false, cukiePool: false },
    mode: { cukieMaster: 'legacy', cukiePool: 'legacy' },
  },
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Clock3: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Lock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  LogOut: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Unlock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const fetchMock = jest.fn();
const writeContractAsync = jest.fn();

const walletAddress = '0x1111111111111111111111111111111111111111';
const vaultAddress = '0x2222222222222222222222222222222222222222';
const collectionAddress = '0x3333333333333333333333333333333333333333';
const otherVaultAddress = '0x4444444444444444444444444444444444444444';
const approvalHash = `0x${'a'.repeat(64)}` as const;
const depositHash = `0x${'b'.repeat(64)}` as const;
const user = { walletAddress } as User;

const mutableVaultConfig = ukiNftVaults as unknown as {
  chainId: 56 | 97 | null;
  cukieMasterNftVaultAddress: `0x${string}` | null;
  cukiePoolNftVaultAddress: `0x${string}` | null;
  collectionAddresses: `0x${string}`[];
  collectionConfigInvalid: boolean;
  recoveryCollectionAddresses: `0x${string}`[];
  recoveryCollectionConfigInvalid: boolean;
  explorerBaseUrl: string | null;
  ready: { cukieMaster: boolean; cukiePool: boolean };
  mode: { cukieMaster: 'legacy' | 'custodial' | 'invalid'; cukiePool: 'legacy' | 'custodial' | 'invalid' };
};

function authValue(currentUser: User | null, walletType: 'evm' | null = null) {
  return {
    user: currentUser,
    isLoading: false,
    isWaitingForApproval: false,
    walletType,
    fetchUser: jest.fn(),
  } as ReturnType<typeof useAuth>;
}

function configureVault() {
  Object.assign(mutableVaultConfig, {
    chainId: 97,
    cukiePoolNftVaultAddress: vaultAddress,
    collectionAddresses: [collectionAddress],
    collectionConfigInvalid: false,
    recoveryCollectionAddresses: [collectionAddress],
    recoveryCollectionConfigInvalid: false,
    explorerBaseUrl: 'https://testnet.bscscan.com',
    ready: { cukieMaster: false, cukiePool: true },
    mode: { cukieMaster: 'legacy', cukiePool: 'custodial' },
  });
}

function availableAsset(tokenId = '7') {
  return {
    assetId: `97:${collectionAddress}:${tokenId}`,
    chain: 'BSC',
    chainId: 97,
    collectionAddress,
    tokenId,
    generation: 'original',
    rarity: 'rare',
    custody: 'wallet',
    status: 'available',
    canDeposit: true,
  };
}

function position(input?: {
  tokenId?: string;
  status?: 'pending' | 'active' | 'exit_requested' | 'withdrawable' | 'withdrawn';
  activationAt?: string;
  withdrawableAt?: string;
  depositCalendarVersion?: string;
  exitCalendarVersion?: string;
}) {
  const tokenId = input?.tokenId ?? '7';
  const status = input?.status ?? 'active';
  const assetId = `97:${collectionAddress}:${tokenId}`;
  const exiting = status === 'exit_requested' || status === 'withdrawable' || status === 'withdrawn';
  return {
    source: 'custodial_vault',
    positionId: `${assetId}:epoch:1`,
    assetId,
    chain: 'BSC',
    chainId: 97,
    collectionAddress,
    tokenId,
    vaultAddress,
    beneficiaryNormalized: walletAddress,
    depositEpoch: '1',
    status,
    lifecycleOpen: status !== 'withdrawn',
    custody: status === 'withdrawn' ? 'wallet' : 'cukie_pool_nft_vault',
    ownerRewardEligible: !exiting,
    depositedAt: '2026-08-15T13:00:00.000Z',
    activationAt: input?.activationAt ?? '2026-08-15T14:00:00.000Z',
    depositCalendarVersion: input?.depositCalendarVersion ?? '1',
    exitRequestedAt: exiting ? '2026-08-15T15:00:00.000Z' : null,
    withdrawableAt: exiting
      ? input?.withdrawableAt ?? '2026-08-16T14:00:00.000Z'
      : null,
    exitCalendarVersion: exiting ? input?.exitCalendarVersion ?? '1' : null,
    withdrawnAt: status === 'withdrawn' ? '2026-08-16T14:01:00.000Z' : null,
    sourceHealthy: true,
  };
}

function poolStatus(input?: {
  indexerStatus?: 'ready' | 'unavailable';
  serverVaultAddress?: string;
  availableAssets?: ReturnType<typeof availableAsset>[];
  positions?: ReturnType<typeof position>[];
}) {
  const indexerStatus = input?.indexerStatus ?? 'ready';
  return {
    mode: 'custodial_vault',
    walletNormalized: walletAddress,
    nftCustody: {
      mode: 'custodial',
      chainId: 97,
      vaultAddress: input?.serverVaultAddress ?? vaultAddress,
      collectionAddresses: [collectionAddress],
      indexer: { status: indexerStatus },
    },
    positions: input?.positions ?? [],
    availableAssets: input?.availableAssets ?? [],
    sourceHealthy: indexerStatus === 'ready',
  };
}

function successfulResponse(data: ReturnType<typeof poolStatus>) {
  return { ok: true, json: async () => ({ status: 'ok', data }) };
}

describe('CukiePoolStatusPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    global.fetch = fetchMock;
    Object.assign(mutableVaultConfig, {
      chainId: null,
      cukieMasterNftVaultAddress: null,
      cukiePoolNftVaultAddress: null,
      collectionAddresses: [],
      collectionConfigInvalid: false,
      recoveryCollectionAddresses: [],
      recoveryCollectionConfigInvalid: false,
      explorerBaseUrl: null,
      ready: { cukieMaster: false, cukiePool: false },
      mode: { cukieMaster: 'legacy', cukiePool: 'legacy' },
    });
    mockUseAccount.mockReturnValue({
      address: undefined,
      chainId: undefined,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue(null as unknown as ReturnType<typeof usePublicClient>);
    mockUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);
  });

  it('does not query the pool without an authenticated wallet', () => {
    mockUseAuth.mockReturnValue(authValue(null));

    render(<CukiePoolStatusPanel />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Conecta y autentica tu wallet EVM/i)).toBeInTheDocument();
    expect(screen.getByText('Recuperación de emergencia')).toBeInTheDocument();
  });

  it('approves and deposits on-chain before accepting the canonical projection', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(walletAddress)
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000')
        .mockResolvedValueOnce(false),
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValueOnce(approvalHash).mockResolvedValueOnce(depositHash);
    const asset = availableAsset();
    fetchMock
      .mockResolvedValueOnce(successfulResponse(poolStatus({ availableAssets: [asset] })))
      .mockResolvedValueOnce(successfulResponse(poolStatus({ positions: [position({ status: 'pending' })] })));

    render(<CukiePoolStatusPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Depositar/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Depósito confirmado en BSC',
    ));
    expect(writeContractAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
      address: collectionAddress,
      functionName: 'approve',
      args: [vaultAddress, BigInt(7)],
    }));
    expect(writeContractAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
      address: vaultAddress,
      functionName: 'deposit',
      args: [collectionAddress, BigInt(7)],
    }));
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('unlocks other NFTs after the first deposit receipt while keeping that asset pending', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(walletAddress)
        .mockResolvedValueOnce(vaultAddress)
        .mockResolvedValueOnce(true),
      waitForTransactionReceipt,
      getTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success' }),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValueOnce(depositHash);
    const first = availableAsset('7');
    const second = availableAsset('8');
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      availableAssets: [first, second],
    })));

    render(<CukiePoolStatusPanel />);

    const firstCard = (await screen.findByText('Cukie #7')).closest('article');
    const secondCard = screen.getByText('Cukie #8').closest('article');
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    const firstButton = within(firstCard!).getByRole('button', { name: 'Depositar' });
    await waitFor(() => expect(firstButton).toBeEnabled());
    fireEvent.click(firstButton);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'ya puedes operar con otro',
    ));
    expect(within(firstCard!).getByRole('button', { name: /Actualizando depósito/i })).toBeDisabled();
    expect(within(secondCard!).getByRole('button', { name: 'Depositar' })).toBeEnabled();
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1);
  });

  it('keeps exit and mature withdrawal enabled when indexer health blocks deposits', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      indexerStatus: 'unavailable',
      positions: [
        position({ tokenId: '8', status: 'active' }),
        position({ tokenId: '9', status: 'withdrawable' }),
      ],
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByRole('button', { name: /Solicitar salida/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Retirar NFT/i })).toBeEnabled();
    expect(screen.getByText(/Los depósitos están bloqueados/i)).toBeInTheDocument();
  });

  it('retries automatically until the indexer becomes ready', async () => {
    jest.useFakeTimers();
    try {
      configureVault();
      mockUseAuth.mockReturnValue(authValue(user, 'evm'));
      mockUseAccount.mockReturnValue({
        address: walletAddress,
        chainId: 97,
        isConnected: true,
      } as unknown as ReturnType<typeof useAccount>);
      mockUsePublicClient.mockReturnValue({
        readContract: jest.fn(),
        waitForTransactionReceipt: jest.fn(),
      } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
      fetchMock
        .mockResolvedValueOnce(successfulResponse(poolStatus({ indexerStatus: 'unavailable' })))
        .mockResolvedValueOnce(successfulResponse(poolStatus({
          availableAssets: [availableAsset()],
        })));

      render(<CukiePoolStatusPanel />);

      expect(await screen.findByText(/Los depósitos están bloqueados/i)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
      });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('button', { name: /Depositar/i })).toBeEnabled();
      expect(screen.queryByText(/Los depósitos están bloqueados/i)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops retrying after 180 seconds and a manual refresh starts a new window', async () => {
    jest.useFakeTimers();
    try {
      configureVault();
      mockUseAuth.mockReturnValue(authValue(user, 'evm'));
      mockUseAccount.mockReturnValue({
        address: walletAddress,
        chainId: 97,
        isConnected: true,
      } as unknown as ReturnType<typeof useAccount>);
      mockUsePublicClient.mockReturnValue({
        readContract: jest.fn(),
        waitForTransactionReceipt: jest.fn(),
      } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
      fetchMock.mockResolvedValue(successfulResponse(poolStatus({
        indexerStatus: 'unavailable',
      })));

      render(<CukiePoolStatusPanel />);

      expect(await screen.findByText(/Los depósitos están bloqueados/i)).toBeInTheDocument();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });
      const callsAtWindowEnd = fetchMock.mock.calls.length;
      expect(callsAtWindowEnd).toBeGreaterThan(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(callsAtWindowEnd);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(callsAtWindowEnd + 1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(callsAtWindowEnd + 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the API activation cutoff and deposit calendar version without assuming a fixed hour', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      positions: [position({
        status: 'pending',
        activationAt: '2026-08-15T18:30:00.000Z',
        depositCalendarVersion: '7',
      })],
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByText('Próximo corte y activación')).toBeInTheDocument();
    expect(screen.getByText(/15 ago 2026, 18:30 UTC/i)).toBeInTheDocument();
    expect(screen.getByText('Calendario de depósito v7')).toBeInTheDocument();
    expect(screen.queryByText(/Calendario de salida/i)).not.toBeInTheDocument();
  });

  it('shows the API withdrawal cutoff and the calendar version locked by the exit request', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      positions: [position({
        status: 'exit_requested',
        withdrawableAt: '2026-08-16T21:45:00.000Z',
        depositCalendarVersion: '7',
        exitCalendarVersion: '9',
      })],
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByText('Próximo corte y retirada')).toBeInTheDocument();
    expect(screen.getByText(/16 ago 2026, 21:45 UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/Puede seguir prestándose hasta ese corte/i)).toBeInTheDocument();
    expect(screen.getByText('Calendario de depósito v7')).toBeInTheDocument();
    expect(screen.getByText('Calendario de salida v9')).toBeInTheDocument();
  });

  it('blocks every signature when API and client vault identities differ', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      serverVaultAddress: otherVaultAddress,
      positions: [position({ status: 'active' })],
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByRole('button', { name: /Solicitar salida/i })).toBeDisabled();
    expect(screen.getByText(/configuración servida por la API no coincide/i)).toBeInTheDocument();
  });
});
