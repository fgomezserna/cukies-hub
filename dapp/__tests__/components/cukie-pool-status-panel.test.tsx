import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithRuntime as render } from '../../test-utils/runtime-test-wrapper';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { CukiePoolStatusPanel } from '@/components/cukie-pool/status-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import {
  loadPendingNftVaultOperations,
  pendingNftVaultStorageKey,
  savePendingNftVaultOperation,
  type NftVaultPendingOperation,
} from '@/lib/nft-vault/pending-operations';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';
import { usePathname } from 'next/navigation';

jest.mock('@/providers/auth-provider');
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
  useSwitchChain: jest.fn(),
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
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt, src }: { alt: string; src?: string | null }) => (
    <span role="img" aria-label={alt} data-src={src ?? 'fallback'} />
  ),
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ArrowRight: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Clock3: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Gamepad2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Lock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  LogOut: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  RefreshCw: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Unlock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  WalletCards: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const fetchMock = jest.fn();
const writeContractAsync = jest.fn();

const walletAddress = '0x1111111111111111111111111111111111111111';
const vaultAddress = '0x2222222222222222222222222222222222222222';
const collectionAddress = '0x3333333333333333333333333333333333333333';
const otherVaultAddress = '0x4444444444444444444444444444444444444444';
const approvalHash = `0x${'a'.repeat(64)}` as const;
const depositHash = `0x${'b'.repeat(64)}` as const;
const withdrawHash = `0x${'c'.repeat(64)}` as const;
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
    imageUrl: `https://example.com/cukies/${tokenId}.png`,
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
    imageUrl: `https://example.com/cukies/${tokenId}.png`,
    generation: 'original',
    rarity: 'rare',
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
  availability?: {
    status: 'complete' | 'partial';
    unknownAssets: number;
  };
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
    availability: input?.availability ?? { status: 'complete', unknownAssets: 0 },
    sourceHealthy: indexerStatus === 'ready',
  };
}

function successfulResponse(data: ReturnType<typeof poolStatus>) {
  return { ok: true, json: async () => ({ status: 'ok', data }) };
}

function pendingDeposit(asset = availableAsset()): NftVaultPendingOperation {
  return {
    version: 1,
    chainId: 97,
    walletAddress,
    vaultAddress,
    assetId: asset.assetId,
    collectionAddress: asset.collectionAddress,
    tokenId: asset.tokenId,
    action: 'deposit',
    phase: 'syncing_projection',
    txHash: depositHash,
    createdAt: 1,
    updatedAt: 1,
  };
}

function pendingWithdraw(asset = availableAsset()): NftVaultPendingOperation {
  return {
    version: 1,
    chainId: 97,
    walletAddress,
    vaultAddress,
    assetId: asset.assetId,
    collectionAddress: asset.collectionAddress,
    tokenId: asset.tokenId,
    action: 'withdraw',
    phase: 'awaiting_receipt',
    txHash: withdrawHash,
    createdAt: 1,
    updatedAt: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('CukiePoolStatusPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
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
    mockUseSwitchChain.mockReturnValue({ switchChainAsync: jest.fn() } as unknown as ReturnType<typeof useSwitchChain>);
    mockUsePathname.mockReturnValue('/cukie-hodler');
    mockUsePublicClient.mockReturnValue(null as unknown as ReturnType<typeof usePublicClient>);
    mockUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);
  });

  it('does not query the pool without an authenticated wallet', () => {
    mockUseAuth.mockReturnValue(authValue(null));

    render(<CukiePoolStatusPanel />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Conecta tu wallet para ver qué Cukies puedes aportar/i)).toBeInTheDocument();
    expect(screen.queryByText('Recuperación de emergencia')).not.toBeInTheDocument();
  });

  it('explains the two useful totals and shows artwork for wallet and pool Cukies', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      availableAssets: [availableAsset('8')],
      positions: [position({ tokenId: '7', status: 'active' })],
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByText('1 Cukie está disponible para partidas')).toBeInTheDocument();
    expect(screen.getByText('1 Cukie para aportar')).toBeInTheDocument();
    expect(screen.getByText('Depósito registrado')).toBeInTheDocument();
    expect(screen.getByText(/Todo al día/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cukie #7' })).toHaveAttribute(
      'data-src',
      'https://example.com/cukies/7.png',
    );
    expect(screen.getByRole('img', { name: 'Cukie #8' })).toHaveAttribute(
      'data-src',
      'https://example.com/cukies/8.png',
    );
  });

  it('retains the last known Pool list while a degraded source returns empty arrays', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({ address: walletAddress, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({ simulateContract: jest.fn(), readContract: jest.fn(), waitForTransactionReceipt: jest.fn() } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const known = poolStatus({ availableAssets: [availableAsset('8')], positions: [position({ tokenId: '7' })] });
    fetchMock
      .mockResolvedValueOnce(successfulResponse(known))
      .mockResolvedValueOnce(successfulResponse(poolStatus({ indexerStatus: 'unavailable' })))
      .mockResolvedValueOnce(successfulResponse(known));

    render(<CukiePoolStatusPanel />);
    expect(await screen.findByText('1 Cukie para aportar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    expect(await screen.findByText(/Estamos actualizando tus Cukies/i)).toBeInTheDocument();
    expect(screen.getByText('1 Cukie para aportar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aportar este Cukie/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    await waitFor(() => expect(screen.queryByText(/Estamos actualizando tus Cukies/i)).not.toBeInTheDocument());
    expect(screen.getByText('1 Cukie para aportar')).toBeInTheDocument();
  });

  it('explains a partial recovery read without hiding confirmed wallet assets', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({ address: walletAddress, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      availableAssets: [availableAsset('8')],
      availability: { status: 'partial', unknownAssets: 1 },
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByText(/No hemos podido comprobar un Cukie ahora/i)).toBeInTheDocument();
    expect(screen.getByText('1 Cukie para aportar')).toBeInTheDocument();
  });

  it('keeps a pending deposit card when a healthy response temporarily omits the asset', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({ address: walletAddress, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({ simulateContract: jest.fn(), readContract: jest.fn(), waitForTransactionReceipt: jest.fn() } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const asset = availableAsset();
    savePendingNftVaultOperation(window.localStorage, pendingDeposit(asset));
    const known = poolStatus({ availableAssets: [asset] });
    fetchMock
      .mockResolvedValueOnce(successfulResponse(known))
      .mockResolvedValueOnce(successfulResponse(poolStatus()));

    render(<CukiePoolStatusPanel />);
    expect(await screen.findByRole('button', { name: /Actualizando depósito/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    expect(await screen.findByRole('button', { name: /Actualizando depósito/i })).toBeDisabled();
    expect(screen.getByRole('img', { name: 'Cukie #7' })).toBeInTheDocument();
  });

  it('ignora un receipt retrasado después de cambiar la red de la wallet', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const receipt = deferred<{ status: string }>();
    const getTransactionReceipt = jest.fn().mockReturnValue(receipt.promise);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const pending = pendingDeposit(availableAsset());
    const awaiting = { ...pending, phase: 'awaiting_receipt' as const };
    savePendingNftVaultOperation(window.localStorage, awaiting);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    const view = render(<CukiePoolStatusPanel />);
    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: depositHash }));

    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 56,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<CukiePoolStatusPanel />);
    await act(async () => {
      receipt.resolve({ status: 'success' });
      await Promise.resolve();
    });

    expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([awaiting]);
  });

  it('no persiste ni actualiza la UI si el componente se desmonta durante el receipt', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const receipt = deferred<{ status: string }>();
    const getTransactionReceipt = jest.fn().mockReturnValue(receipt.promise);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const awaiting = { ...pendingDeposit(availableAsset()), phase: 'awaiting_receipt' as const };
    savePendingNftVaultOperation(window.localStorage, awaiting);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    const view = render(<CukiePoolStatusPanel />);
    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: depositHash }));
    view.unmount();
    await act(async () => {
      receipt.resolve({ status: 'success' });
      await Promise.resolve();
    });

    expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([awaiting]);
  });

  it('no limpia la operación nueva del mismo asset si positionOf responde tarde', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const positionRead = deferred<unknown>();
    const getTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    const readContract = jest.fn().mockImplementation((request: { functionName?: string }) => (
      request.functionName === 'positionOf' ? positionRead.promise : Promise.resolve(walletAddress)
    ));
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract,
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const original = pendingDeposit(availableAsset());
    const syncing = { ...original, depositEpoch: '2' };
    savePendingNftVaultOperation(window.localStorage, syncing);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    render(<CukiePoolStatusPanel />);
    await waitFor(() => expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'positionOf',
      args: [collectionAddress, BigInt(7)],
    })));

    const replacement = {
      ...syncing,
      txHash: `0x${'c'.repeat(64)}` as const,
      updatedAt: 2,
    };
    savePendingNftVaultOperation(window.localStorage, replacement);
    await act(async () => {
      positionRead.resolve({
        beneficialOwner: walletAddress,
        depositEpoch: BigInt(2),
        depositedAt: BigInt(100),
        activationAt: BigInt(200),
      });
      await Promise.resolve();
    });

    expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([replacement]);
  });

  it('does not retain another wallet list after the Pool identity changes', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({ address: walletAddress, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({ simulateContract: jest.fn(), readContract: jest.fn(), waitForTransactionReceipt: jest.fn() } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock
      .mockResolvedValueOnce(successfulResponse(poolStatus({ availableAssets: [availableAsset('8')] })))
      .mockResolvedValueOnce(successfulResponse(poolStatus()));
    const view = render(<CukiePoolStatusPanel />);
    expect(await screen.findByText('1 Cukie para aportar')).toBeInTheDocument();

    const otherWallet = '0x9999999999999999999999999999999999999999';
    mockUseAuth.mockReturnValue(authValue({ walletAddress: otherWallet } as User, 'evm'));
    mockUseAccount.mockReturnValue({ address: otherWallet, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<CukiePoolStatusPanel />);
    await waitFor(() => expect(screen.queryByText('1 Cukie para aportar')).not.toBeInTheDocument());
    expect(screen.queryByRole('img', { name: 'Cukie #8' })).not.toBeInTheDocument();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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
    fireEvent.click(await screen.findByRole('button', { name: /Aportar este Cukie/i }));

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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('simula el depósito antes de pedir cualquier firma', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const simulateContract = jest.fn().mockResolvedValue({ request: {} });
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(walletAddress)
        .mockResolvedValueOnce(vaultAddress)
        .mockResolvedValueOnce(true),
      simulateContract,
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValueOnce(depositHash);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    render(<CukiePoolStatusPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Aportar este Cukie/i }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledTimes(1));
    expect(simulateContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'deposit',
      account: walletAddress,
    }));
    expect(simulateContract.mock.invocationCallOrder[0]).toBeLessThan(
      writeContractAsync.mock.invocationCallOrder[0],
    );
  });

  it('vuelve a bloquear el depósito si la wallet cambia durante la simulación', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    let accountState = {
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    };
    mockUseAccount.mockImplementation(() => accountState as unknown as ReturnType<typeof useAccount>);
    let rerenderPanel: ((ui: React.ReactElement) => void) | undefined;
    const simulateContract = jest.fn().mockImplementation(async () => {
      accountState = { address: walletAddress, chainId: 56, isConnected: true };
      rerenderPanel?.(<CukiePoolStatusPanel />);
    });
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(walletAddress)
        .mockResolvedValueOnce(vaultAddress)
        .mockResolvedValueOnce(true),
      simulateContract,
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    const view = render(<CukiePoolStatusPanel />);
    rerenderPanel = view.rerender;
    fireEvent.click(await screen.findByRole('button', { name: /Aportar este Cukie/i }));

    expect(await screen.findByText(/Cambia tu wallet a la red correcta/i)).toBeInTheDocument();
    expect(screen.queryByText(/wallet, la red o el vault cambiaron/i)).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('conserva el receipt pendiente en la wallet original si cambia durante la espera', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    let accountState = {
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    };
    mockUseAccount.mockImplementation(() => accountState as unknown as ReturnType<typeof useAccount>);
    const resolveReceipt = jest.fn();
    const receiptPromise = new Promise<{ status: string }>((resolve) => {
      resolveReceipt.mockImplementation(resolve);
    });
    const waitForTransactionReceipt = jest.fn().mockReturnValue(receiptPromise);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(walletAddress)
        .mockResolvedValueOnce(vaultAddress)
        .mockResolvedValueOnce(true),
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValueOnce(depositHash);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    const view = render(<CukiePoolStatusPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Aportar este Cukie/i }));
    await waitFor(() => expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: depositHash }));

    const otherWallet = '0x9999999999999999999999999999999999999999';
    accountState = { address: otherWallet, chainId: 97, isConnected: true };
    mockUseAuth.mockReturnValue(authValue({ walletAddress: otherWallet } as User, 'evm'));
    view.rerender(<CukiePoolStatusPanel />);
    await waitFor(() => expect(screen.queryByText(/Aportar este Cukie/i)).not.toBeInTheDocument());

    await act(async () => resolveReceipt({ status: 'success' }));
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(pendingNftVaultStorageKey({
      chainId: 97,
      walletAddress,
      vaultAddress,
    }))).toContain(depositHash);
  });

  it('explica un inventario stale cuando ownerOf ya no pertenece a la wallet', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn().mockResolvedValue(otherVaultAddress),
      simulateContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    render(<CukiePoolStatusPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Aportar este Cukie/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no está en tu wallet/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/inventario puede estar desactualizado/i);
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('distingue un revert de simulación y evita pedir la firma', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const simulateContract = jest.fn().mockRejectedValue(new Error('ContractFunctionRevertedError: CollectionNotAllowed'));
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(walletAddress)
        .mockResolvedValueOnce(vaultAddress)
        .mockResolvedValueOnce(true),
      simulateContract,
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({ availableAssets: [availableAsset()] })));

    render(<CukiePoolStatusPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Aportar este Cukie/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no permite esta colección/i);
    expect(writeContractAsync).not.toHaveBeenCalled();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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
    const firstButton = within(firstCard!).getByRole('button', { name: 'Aportar este Cukie' });
    await waitFor(() => expect(firstButton).toBeEnabled());
    fireEvent.click(firstButton);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'ya puedes operar con otro',
    ));
    expect(within(firstCard!).getByRole('button', { name: /Actualizando depósito/i })).toBeDisabled();
    expect(within(secondCard!).getByRole('button', { name: 'Aportar este Cukie' })).toBeEnabled();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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

    expect(await screen.findByRole('button', { name: /Solicitar devolución/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Retirar a mi wallet/i })).toBeEnabled();
    expect(screen.getByText(/Los depósitos están bloqueados/i)).toBeInTheDocument();
  });

  it('conserva la retirada pendiente tras un receipt success si la siguiente proyección llega degradada', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const getTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const asset = availableAsset();
    const pending = pendingWithdraw(asset);
    savePendingNftVaultOperation(window.localStorage, pending);
    const known = poolStatus({ positions: [position({ tokenId: asset.tokenId, status: 'withdrawable' })] });
    fetchMock
      .mockResolvedValueOnce(successfulResponse(known))
      .mockResolvedValueOnce(successfulResponse(poolStatus({ indexerStatus: 'unavailable' })));

    render(<CukiePoolStatusPanel />);

    const button = await screen.findByRole('button', { name: /Retirada confirmada · actualizando colección/i });
    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: withdrawHash }));
    expect(await screen.findByText(/Estamos actualizando tus Cukies/i)).toBeInTheDocument();
    await waitFor(() => expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([expect.objectContaining({ action: 'withdraw', phase: 'syncing_projection', txHash: withdrawHash })]));
    expect(button).toBeDisabled();
    expect(screen.getAllByText('Retirada confirmada').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Retirada confirmada en BSC\. Estamos actualizando tu colección/i)).toBeInTheDocument();
    expect(screen.getByText(/Retirada confirmada, actualizando colección/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver estado' })).toBeInTheDocument();
    expect(screen.queryByText('Listo para retirar')).not.toBeInTheDocument();
    expect(screen.queryByText(/Retirada disponible desde/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/La espera terminó\. Retira este Cukie/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a retirar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirar a mi wallet desde el Cukie Pool/i })).not.toBeInTheDocument();
  });

  it('limpia la retirada solo cuando la proyección saludable confirma la posición cerrada', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const getTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const asset = availableAsset();
    savePendingNftVaultOperation(window.localStorage, pendingWithdraw(asset));
    fetchMock
      .mockResolvedValueOnce(successfulResponse(poolStatus({
        positions: [position({ tokenId: asset.tokenId, status: 'withdrawable' })],
      })))
      .mockResolvedValueOnce(successfulResponse(poolStatus({
        positions: [position({ tokenId: asset.tokenId, status: 'withdrawn' })],
      })));

    render(<CukiePoolStatusPanel />);

    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: withdrawHash }));
    await waitFor(() => expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([]));
    expect(screen.queryByRole('button', { name: /Retirar a mi wallet desde el Cukie Pool/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no has aportado ningún Cukie al pool/i)).toBeInTheDocument();
  });

  it('expone un receipt reverted como fallo y permite reintentar tras limpiar el pending', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    const getTransactionReceipt = jest.fn().mockResolvedValue({ status: 'reverted' });
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const asset = availableAsset();
    savePendingNftVaultOperation(window.localStorage, pendingWithdraw(asset));
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      positions: [position({ tokenId: asset.tokenId, status: 'withdrawable' })],
    })));

    render(<CukiePoolStatusPanel />);

    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: withdrawHash }));
    expect(await screen.findByText(/fue revertida\. Puedes intentarlo de nuevo/i)).toBeInTheDocument();
    expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([]);
    expect(screen.getByRole('button', { name: /Retirar a mi wallet desde el Cukie Pool/i })).toBeEnabled();
  });

  it('conserva el pending de retirada si la wallet cambia mientras espera el receipt', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    let accountState = {
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    };
    mockUseAccount.mockImplementation(() => accountState as unknown as ReturnType<typeof useAccount>);
    const receipt = deferred<{ status: string }>();
    const getTransactionReceipt = jest.fn().mockReturnValue(receipt.promise);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn(),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    const pending = pendingWithdraw();
    savePendingNftVaultOperation(window.localStorage, pending);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      positions: [position({ status: 'withdrawable' })],
    })));

    const view = render(<CukiePoolStatusPanel />);
    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: withdrawHash }));

    accountState = { address: walletAddress, chainId: 56, isConnected: true };
    view.rerender(<CukiePoolStatusPanel />);
    await act(async () => {
      receipt.resolve({ status: 'success' });
      await Promise.resolve();
    });

    expect(loadPendingNftVaultOperations(window.localStorage, {
      chainId: 97,
      walletAddress,
      vaultAddress,
    })).toEqual([pending]);
  });

  it('explains a pending Cukie without presenting it as reward eligible', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      positions: [position({ status: 'pending' })],
    })));

    render(<CukiePoolStatusPanel />);

    expect((await screen.findAllByText('Activándose')).length).toBeGreaterThan(0);
    expect(screen.getByText(/todavía no puede entrar en partidas/i)).toBeInTheDocument();
    expect(screen.queryByText(/Opta al reparto cuando se use/i)).not.toBeInTheDocument();
  });

  it('requires an explicit confirmation before requesting an irreversible exit', async () => {
    configureVault();
    mockUseAuth.mockReturnValue(authValue(user, 'evm'));
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      chainId: 97,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success' }),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValueOnce(depositHash);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      positions: [position({ status: 'active' })],
    })));

    render(<CukiePoolStatusPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /Solicitar devolución/i }));
    expect(writeContractAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/La devolución no se puede cancelar/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar salida/i }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: vaultAddress,
      functionName: 'requestExit',
      args: [collectionAddress, BigInt(7)],
    })));
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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
        await jest.advanceTimersByTimeAsync(30_000);
      });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('button', { name: /Aportar este Cukie/i })).toBeEnabled();
      expect(screen.queryByText(/Los depósitos están bloqueados/i)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('pausa el polling al ocultar la página y permite una lectura manual', async () => {
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
        readContract: jest.fn(),
        waitForTransactionReceipt: jest.fn(),
      } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
      fetchMock.mockResolvedValue(successfulResponse(poolStatus({
        indexerStatus: 'unavailable',
      })));

      const view = render(<CukiePoolStatusPanel />);

      expect(await screen.findByText(/Los depósitos están bloqueados/i)).toBeInTheDocument();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      const callsBeforePause = fetchMock.mock.calls.length;
      expect(callsBeforePause).toBe(2);

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      fireEvent(document, new Event('visibilitychange'));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(callsBeforePause);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(callsBeforePause + 1);

      view.unmount();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(callsBeforePause + 1);
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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

    expect(await screen.findByText('Disponible para partidas desde')).toBeInTheDocument();
    expect(screen.getByText(/15 ago 2026, 18:30 UTC/i)).toBeInTheDocument();
    expect(screen.queryByText(/Calendario de depósito/i)).not.toBeInTheDocument();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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

    expect(await screen.findByText('Podrás retirarlo desde')).toBeInTheDocument();
    expect(screen.getByText(/16 ago 2026, 21:45 UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/Sigue disponible para partidas hasta ese momento/i)).toBeInTheDocument();
    expect(screen.queryByText(/Calendario de depósito/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Calendario de salida/i)).not.toBeInTheDocument();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    fetchMock.mockResolvedValue(successfulResponse(poolStatus({
      serverVaultAddress: otherVaultAddress,
      positions: [position({ status: 'active' })],
    })));

    render(<CukiePoolStatusPanel />);

    expect(await screen.findByRole('button', { name: /Solicitar devolución/i })).toBeDisabled();
    expect(screen.getByText(/El Pool de Cukies no está disponible ahora/i)).toBeInTheDocument();
  });
});
