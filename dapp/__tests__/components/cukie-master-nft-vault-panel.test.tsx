import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { renderWithRuntime as render } from '../../test-utils/runtime-test-wrapper';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { CukieMasterNftVaultPanel } from '@/components/cukie-master/nft-vault-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import { useAppRuntime } from '@/providers/app-runtime-provider';
import {
  savePendingNftVaultOperation,
  type NftVaultPendingOperation,
} from '@/lib/nft-vault/pending-operations';
import { useAuth } from '@/providers/auth-provider';
import { usePathname } from 'next/navigation';

jest.mock('@/providers/auth-provider');
jest.mock('@/providers/app-runtime-provider', () => {
  const actual = jest.requireActual('@/providers/app-runtime-provider');
  return { ...actual, useAppRuntime: jest.fn(actual.useAppRuntime) };
});
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: (props: { alt: string }) => <span>{props.alt}</span>,
}));
jest.mock('@/components/landing/primitives', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/nft-vault/recovery-panel', () => ({
  NftVaultRecoveryPanel: () => <div>Recuperación on-chain</div>,
}));
jest.mock('@/lib/contracts/uki-nft-vaults', () => ({
  cukieMasterNftVaultAbi: [
    {
      type: 'event',
      name: 'Deposited',
      inputs: [
        { indexed: true, name: 'collection', type: 'address' },
        { indexed: true, name: 'tokenId', type: 'uint256' },
        { indexed: true, name: 'beneficiary', type: 'address' },
        { indexed: false, name: 'depositEpoch', type: 'uint256' },
        { indexed: false, name: 'depositedAt', type: 'uint256' },
      ],
    },
    {
      type: 'function',
      name: 'positionOf',
      stateMutability: 'view',
      inputs: [
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
      ],
      outputs: [{ components: [
        { name: 'beneficialOwner', type: 'address' },
        { name: 'depositEpoch', type: 'uint256' },
        { name: 'depositedAt', type: 'uint256' },
      ], name: '', type: 'tuple' }],
    },
  ],
  ukiNftVaults: {
    chainId: 97,
    cukieMasterNftVaultAddress: '0x2222222222222222222222222222222222222222',
    cukiePoolNftVaultAddress: null,
    collectionAddresses: ['0x3333333333333333333333333333333333333333'],
    recoveryCollectionAddresses: ['0x3333333333333333333333333333333333333333'],
    explorerBaseUrl: 'https://testnet.bscscan.com',
    ready: { cukieMaster: true, cukiePool: false },
    mode: { cukieMaster: 'custodial', cukiePool: 'legacy' },
  },
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: () => <span />,
  CheckCircle2: () => <span />,
  Loader2: () => <span />,
  LockKeyhole: () => <span />,
  Unlock: () => <span />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAppRuntime = useAppRuntime as jest.MockedFunction<typeof useAppRuntime>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const wallet = '0x1111111111111111111111111111111111111111';
const vault = '0x2222222222222222222222222222222222222222';
const collection = '0x3333333333333333333333333333333333333333';
const approvalHash = `0x${'a'.repeat(64)}` as const;
const depositHash = `0x${'b'.repeat(64)}` as const;
const fetchMock = jest.fn();
const readContract = jest.fn();
const getTransactionReceipt = jest.fn();
const waitForTransactionReceipt = jest.fn();
const simulateContract = jest.fn();
const writeContractAsync = jest.fn();

function status(input: { indexer?: 'ready' | 'syncing' | 'unavailable'; deposited?: boolean; depositEpoch?: string | null } = {}) {
  const deposited = input.deposited ?? false;
  return {
    walletNormalized: wallet,
    nftCustody: {
      mode: 'custodial',
      chainId: 97,
      vaultAddress: vault,
      collectionAddresses: [collection],
      explorerBaseUrl: 'https://testnet.bscscan.com',
      indexer: { status: input.indexer ?? 'ready' },
    },
    nftInventory: [{
      assetId: `97:${collection}:98000001`,
      canonicalAssetId: `97:${collection}:98000001`,
      collectionAddress: collection,
      tokenId: '98000001',
      imageUrl: null,
      rarity: 'rare',
      rarityPoints: 4,
      state: deposited ? 'staked_master' : 'available',
      blockers: [] as string[],
      custody: deposited ? 'cukie_master_nft_vault' : 'wallet',
      depositEpoch: deposited ? input.depositEpoch ?? '2' : null,
      canDeposit: !deposited,
      canWithdraw: deposited,
    }],
  };
}

function statusWithSecondAsset(input: Parameters<typeof status>[0] = {}) {
  const data = status(input);
  data.nftInventory.push({
    ...data.nftInventory[0],
    assetId: `97:${collection}:98000002`,
    canonicalAssetId: `97:${collection}:98000002`,
    tokenId: '98000002',
    state: 'available',
    custody: 'wallet',
    depositEpoch: null,
    canDeposit: true,
    canWithdraw: false,
  });
  return data;
}

function response(data: ReturnType<typeof status>) {
  return { ok: true, json: async () => ({ status: 'ok', data }) };
}

function pendingOperation(
  overrides: Partial<NftVaultPendingOperation> = {},
): NftVaultPendingOperation {
  return {
    version: 1,
    chainId: 97,
    walletAddress: wallet,
    vaultAddress: vault,
    assetId: `97:${collection}:98000001`,
    collectionAddress: collection,
    tokenId: '98000001',
    action: 'deposit',
    phase: 'awaiting_receipt',
    txHash: depositHash,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function masterDepositedReceipt(input: {
  tokenId?: bigint;
  beneficiary?: string;
  depositEpoch?: bigint;
} = {}) {
  const abi = [{
    type: 'event',
    name: 'Deposited',
    inputs: [
      { indexed: true, name: 'collection', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'beneficiary', type: 'address' },
      { indexed: false, name: 'depositEpoch', type: 'uint256' },
      { indexed: false, name: 'depositedAt', type: 'uint256' },
    ],
  }] as const;
  const topics = encodeEventTopics({
    abi,
    eventName: 'Deposited',
    args: {
      collection,
      tokenId: input.tokenId ?? BigInt(98000001),
      beneficiary: (input.beneficiary ?? wallet) as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [input.depositEpoch ?? BigInt(2), BigInt(100)],
  );
  return {
    status: 'success' as const,
    logs: [{ address: vault, topics, data }],
  };
}

describe('CukieMasterNftVaultPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppRuntime.mockImplementation(jest.requireActual('@/providers/app-runtime-provider').useAppRuntime);
    fetchMock.mockReset();
    localStorage.clear();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue({
      user: { walletAddress: wallet },
      isLoading: false,
      isWaitingForApproval: false,
      walletType: 'evm',
      fetchUser: jest.fn(),
    } as never);
    mockUseAccount.mockReturnValue({ address: wallet, chainId: 97, isConnected: true } as never);
    mockUseSwitchChain.mockReturnValue({ switchChainAsync: jest.fn() } as never);
    mockUsePublicClient.mockReturnValue({ readContract, getTransactionReceipt, waitForTransactionReceipt, simulateContract } as never);
    mockUseWriteContract.mockReturnValue({ writeContractAsync } as never);
    mockUsePathname.mockReturnValue('/cukie-master');
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
    simulateContract.mockResolvedValue({});
    getTransactionReceipt.mockRejectedValue(new Error('receipt not available yet'));
  });

  it('aprueba y deposita el ERC-721 directamente en el vault', async () => {
    fetchMock
      .mockResolvedValueOnce(response(status()))
      .mockResolvedValueOnce(response(status({ deposited: true })));
    readContract
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce('0x0000000000000000000000000000000000000000')
      .mockResolvedValueOnce(false);
    writeContractAsync
      .mockResolvedValueOnce(approvalHash)
      .mockResolvedValueOnce(depositHash);

    render(<CukieMasterNftVaultPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Hacer staking/i }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledTimes(2));
    expect(writeContractAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
      address: collection,
      functionName: 'approve',
      args: [vault, BigInt(98000001)],
    }));
    expect(writeContractAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
      address: vault,
      functionName: 'deposit',
      args: [collection, BigInt(98000001)],
    }));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: approvalHash }));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: depositHash }));
  });

  it('bloquea el NFT desde el primer click y evita un segundo depósito', async () => {
    fetchMock.mockResolvedValue(response(status()));
    readContract
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce(vault)
      .mockResolvedValueOnce(false);
    let resolveWrite!: (hash: typeof depositHash) => void;
    writeContractAsync.mockReturnValueOnce(new Promise((resolve) => { resolveWrite = resolve; }));

    render(<CukieMasterNftVaultPanel />);
    const button = await screen.findByRole('button', { name: /Hacer staking/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledTimes(1));
    await act(async () => resolveWrite(depositHash));
    await waitFor(() => expect(waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: depositHash })));
  });

  it('libera las demás tarjetas cuando el receipt llega aunque el refresh global quede pendiente', async () => {
    let masterConverged = false;
    const refreshAfterTransaction = jest.fn(() => new Promise<void>(() => undefined));
    mockUseAppRuntime.mockReturnValue({ address: wallet, refreshAfterTransaction } as never);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/economy/v1/cukie-master')) {
        return response(statusWithSecondAsset({ deposited: masterConverged }));
      }
      return response(statusWithSecondAsset({ deposited: masterConverged }));
    });
    readContract.mockImplementation(async (input: { functionName?: string }) => {
      if (input.functionName === 'ownerOf') return wallet;
      if (input.functionName === 'getApproved') return vault;
      if (input.functionName === 'isApprovedForAll') return false;
      return {
        beneficialOwner: wallet,
        depositEpoch: BigInt(2),
        depositedAt: BigInt(100),
      };
    });
    getTransactionReceipt.mockResolvedValue(masterDepositedReceipt());
    waitForTransactionReceipt.mockResolvedValue(masterDepositedReceipt());
    writeContractAsync.mockImplementation(async () => {
      masterConverged = true;
      return depositHash;
    });

    render(<CukieMasterNftVaultPanel />);
    const firstHeading = (await screen.findAllByText('Cukie #98000001'))[0];
    const firstCard = firstHeading.closest('article') as HTMLElement;
    fireEvent.click(within(firstCard).getByRole('button', { name: /Hacer staking/i }));

    await waitFor(() => expect(refreshAfterTransaction).toHaveBeenCalledWith('master-nft'));
    expect(await within(firstCard).findByRole('button', { name: /Retirar inmediatamente/i })).toBeEnabled();
    const available = screen.getAllByRole('button', { name: /Hacer staking/i });
    expect(available).toHaveLength(1);
    expect(available[0]).toBeEnabled();
    expect(screen.queryByText(/Retirando/i)).not.toBeInTheDocument();
  });

  it('restaura tras recargar una transacción pendiente y mantiene el NFT bloqueado', async () => {
    const pending = pendingOperation({ action: 'deposit', phase: 'awaiting_receipt', txHash: depositHash });
    savePendingNftVaultOperation(localStorage, pending);
    fetchMock.mockResolvedValue(response(status()));

    render(<CukieMasterNftVaultPanel />);

    const button = await screen.findByRole('button', { name: /Confirmando depósito/i });
    expect(button).toBeDisabled();
    expect(screen.getByRole('link', { name: /Ver transacción de esta operación/i })).toHaveAttribute(
      'href',
      `https://testnet.bscscan.com/tx/${depositHash}`,
    );
    expect(writeContractAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: depositHash }));
  });

  it('reanuda el recibo tras recargar y desbloquea solo cuando el indexador refleja la custodia', async () => {
    savePendingNftVaultOperation(localStorage, pendingOperation({
      action: 'deposit',
      phase: 'awaiting_receipt',
      txHash: depositHash,
    }));
    let resolveProjection!: (value: ReturnType<typeof response>) => void;
    fetchMock
      .mockResolvedValueOnce(response(status()))
      .mockReturnValueOnce(new Promise((resolve) => { resolveProjection = resolve; }));
    getTransactionReceipt.mockResolvedValueOnce(masterDepositedReceipt());
    readContract.mockResolvedValueOnce({
      beneficialOwner: wallet,
      depositEpoch: BigInt(2),
      depositedAt: BigInt(100),
    });

    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByRole('button', { name: /Depósito confirmado/i })).toBeDisabled();
    await act(async () => resolveProjection(response(status({ deposited: true }))));
    expect(await screen.findByRole('button', { name: /Retirar inmediatamente/i })).toBeEnabled();
    await waitFor(() => expect(localStorage.length).toBe(0));
  });

  it('muestra el depósito confirmado por RPC antes de que termine la proyección API y mantiene el lock', async () => {
    savePendingNftVaultOperation(localStorage, pendingOperation({
      phase: 'awaiting_receipt',
      txHash: depositHash,
    }));
    let resolveProjection!: (value: ReturnType<typeof response>) => void;
    fetchMock
      .mockResolvedValueOnce(response(status()))
      .mockReturnValueOnce(new Promise((resolve) => { resolveProjection = resolve; }));
    getTransactionReceipt.mockResolvedValue(masterDepositedReceipt());
    readContract.mockResolvedValue({
      beneficialOwner: wallet,
      depositEpoch: BigInt(2),
      depositedAt: BigInt(100),
    });

    render(<CukieMasterNftVaultPanel />);

    const confirmed = await screen.findByRole('button', { name: /Depósito confirmado/i });
    expect(confirmed).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Hacer staking/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/actualizando inventario/i).length).toBeGreaterThan(0);
    expect(localStorage.length).toBe(1);

    await act(async () => resolveProjection(response(status({ deposited: true, depositEpoch: '2' }))));
    await waitFor(() => expect(localStorage.length).toBe(0));
    expect(await screen.findByText(/reflejada en el inventario/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Retirar inmediatamente/i })).toBeEnabled();
  });

  it('no libera el pending si la API devuelve el token en un epoch distinto', async () => {
    const pending = pendingOperation({ phase: 'syncing_projection', depositEpoch: '2' });
    savePendingNftVaultOperation(localStorage, pending);
    fetchMock
      .mockResolvedValueOnce(response(status()))
      .mockResolvedValue(response(status({ deposited: true, depositEpoch: '1' })));
    getTransactionReceipt.mockResolvedValue(masterDepositedReceipt({ depositEpoch: BigInt(2) }));
    readContract.mockResolvedValue({
      beneficialOwner: wallet,
      depositEpoch: BigInt(2),
      depositedAt: BigInt(100),
    });

    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByRole('button', { name: /Depósito confirmado/i })).toBeDisabled();
    await waitFor(() => expect(localStorage.length).toBe(1));
    expect(screen.queryByRole('button', { name: /Hacer staking/i })).not.toBeInTheDocument();
  });

  it('no borra una operación sustitutiva cuando el recibo antiguo termina tarde', async () => {
    const original = pendingOperation({ phase: 'syncing_projection', depositEpoch: '2' });
    const replacement = pendingOperation({
      phase: 'syncing_projection',
      txHash: approvalHash,
      depositEpoch: '3',
      updatedAt: 2,
    });
    savePendingNftVaultOperation(localStorage, original);
    fetchMock.mockResolvedValue(response(status()));
    getTransactionReceipt.mockResolvedValue(masterDepositedReceipt({ depositEpoch: BigInt(2) }));
    let resolvePosition!: (value: unknown) => void;
    readContract.mockReturnValueOnce(new Promise((resolve) => { resolvePosition = resolve; }));

    render(<CukieMasterNftVaultPanel />);
    await waitFor(() => expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'positionOf' })));

    savePendingNftVaultOperation(localStorage, replacement);
    await act(async () => resolvePosition({
      beneficialOwner: wallet,
      depositEpoch: BigInt(2),
      depositedAt: BigInt(100),
    }));

    await waitFor(() => expect(JSON.parse(localStorage.getItem(`cukies:nft-vault:pending:v1:97:${wallet}:${vault}`) ?? '[]'))
      .toEqual([expect.objectContaining({ txHash: approvalHash, depositEpoch: '3' })]));
  });

  it('permite continuar el depósito solo si la aprobación sigue vigente on-chain', async () => {
    savePendingNftVaultOperation(localStorage, pendingOperation({
      action: 'approval',
      phase: 'approval_confirmed',
      txHash: approvalHash,
    }));
    fetchMock
      .mockResolvedValueOnce(response(status()))
      .mockResolvedValueOnce(response(status({ deposited: true })));
    readContract
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce(vault)
      .mockResolvedValueOnce(false);
    writeContractAsync.mockResolvedValueOnce(depositHash);

    render(<CukieMasterNftVaultPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Continuar staking/i }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledTimes(1));
    expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: vault,
      functionName: 'deposit',
    }));
  });

  it('no persiste una operación si la firma se rechaza antes de devolver hash', async () => {
    fetchMock.mockResolvedValue(response(status()));
    readContract
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce(vault)
      .mockResolvedValueOnce(false);
    writeContractAsync.mockRejectedValueOnce(new Error('User rejected request'));

    render(<CukieMasterNftVaultPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Hacer staking/i }));

    expect(await screen.findByText(/wallet canceló la firma/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hacer staking/i })).toBeEnabled();
    expect(localStorage.length).toBe(0);
  });

  it('mantiene el lock en memoria si el navegador deniega localStorage', async () => {
    const persistedStorage = window.localStorage;
    const deniedStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => { throw new DOMException('Denied', 'SecurityError'); }),
      removeItem: jest.fn(() => undefined),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: deniedStorage });
    try {
      fetchMock.mockResolvedValue(response(status()));
      readContract
        .mockResolvedValueOnce(wallet)
        .mockResolvedValueOnce(vault)
        .mockResolvedValueOnce(false);
      writeContractAsync.mockResolvedValueOnce(depositHash);

      render(<CukieMasterNftVaultPanel />);
      fireEvent.click(await screen.findByRole('button', { name: /Hacer staking/i }));

      await waitFor(() => expect(writeContractAsync).toHaveBeenCalledTimes(1));
      const locked = await screen.findByRole('button', { name: /Actualizando staking/i });
      expect(locked).toBeDisabled();
      fireEvent.click(locked);
      expect(writeContractAsync).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: persistedStorage });
    }
  });

  it('respeta un clear recibido por storage y retira el pending de la tarjeta', async () => {
    savePendingNftVaultOperation(localStorage, pendingOperation({ phase: 'syncing_projection' }));
    fetchMock.mockResolvedValue(response(status()));
    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByRole('button', { name: /Actualizando staking/i })).toBeDisabled();
    const key = `cukies:nft-vault:pending:v1:97:${wallet}:${vault}`;
    const previous = localStorage.getItem(key);
    act(() => {
      localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', { key, oldValue: previous, newValue: null }));
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /Hacer staking/i })).toBeEnabled());
  });

  it('descarta el mirror de una escritura fallida al llegar una operación nueva por storage', async () => {
    const persistedStorage = window.localStorage;
    const deniedStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => { throw new DOMException('Denied', 'SecurityError'); }),
      removeItem: jest.fn(() => undefined),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: deniedStorage });
    try {
      fetchMock.mockResolvedValue(response(status()));
      readContract
        .mockResolvedValueOnce(wallet)
        .mockResolvedValueOnce(vault)
        .mockResolvedValueOnce(false);
      writeContractAsync.mockResolvedValueOnce(depositHash);
      render(<CukieMasterNftVaultPanel />);

      fireEvent.click(await screen.findByRole('button', { name: /Hacer staking/i }));
      expect(await screen.findByRole('button', { name: /Actualizando staking/i })).toBeDisabled();

      Object.defineProperty(window, 'localStorage', { configurable: true, value: persistedStorage });
      const replacement = pendingOperation({
        phase: 'syncing_projection',
        txHash: approvalHash,
        updatedAt: Date.now(),
      });
      savePendingNftVaultOperation(persistedStorage, replacement);
      const key = `cukies:nft-vault:pending:v1:97:${wallet}:${vault}`;
      act(() => window.dispatchEvent(new StorageEvent('storage', {
        key,
        oldValue: null,
        newValue: persistedStorage.getItem(key),
      })));

      await waitFor(() => expect(screen.getByRole('link', { name: /Ver transacción de esta operación/i }))
        .toHaveAttribute('href', `https://testnet.bscscan.com/tx/${approvalHash}`));
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: persistedStorage });
    }
  });

  it('no firma si la simulación del depósito falla', async () => {
    fetchMock.mockResolvedValue(response(status()));
    readContract
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce(vault)
      .mockResolvedValueOnce(true);
    simulateContract.mockRejectedValueOnce(new Error('ContractFunctionRevertedError: CollectionNotAllowed'));

    render(<CukieMasterNftVaultPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Hacer staking/i }));

    expect(await screen.findByText(/No se pudo simular la operación/i)).toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('oculta los Cukies de Segunda Generación disponibles', async () => {
    const data = status();
    data.nftInventory = Array.from({ length: 12 }, (_, index) => {
      const original = index < 6;
      const tokenId = String(98_000_001 + index);
      return {
        ...data.nftInventory[0],
        assetId: `97:${collection}:${tokenId}`,
        canonicalAssetId: `97:${collection}:${tokenId}`,
        tokenId,
        state: original ? 'available' : 'blocked',
        blockers: original ? [] : ['second_generation'],
        canDeposit: original,
      };
    });
    fetchMock.mockResolvedValueOnce(response(data));

    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByText('6 Cukies Originales en tu colección · 6 con una acción disponible')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Hacer staking/i })).toHaveLength(6);
    expect(screen.queryByText('Cukie #98000007')).not.toBeInTheDocument();
    expect(screen.queryByText('Solo cuentan Cukies Originales')).not.toBeInTheDocument();
  });

  it('mantiene visible una posición Gen2 ya custodiada para retirarla', async () => {
    const data = status();
    data.nftInventory = [{
      ...data.nftInventory[0],
      state: 'staked_master',
      blockers: ['second_generation'],
      custody: 'cukie_master_nft_vault',
      canDeposit: false,
      canWithdraw: true,
    }];
    fetchMock.mockResolvedValueOnce(response(data));

    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByRole('button', { name: /Retirar inmediatamente/i })).toBeEnabled();
    expect(screen.getAllByText('Cukie #98000001')).toHaveLength(2);
  });

  it('reintenta automáticamente mientras el índice está sincronizando', async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(response(status({ indexer: 'syncing' })))
        .mockResolvedValueOnce(response(status()));

      render(<CukieMasterNftVaultPanel />);

      expect(await screen.findByText(/Estamos actualizando tus Cukies/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Hacer staking/i })).toBeDisabled();

      await act(async () => {
        jest.advanceTimersByTime(30_000);
        await Promise.resolve();
      });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText(/Estamos actualizando tus Cukies/i)).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: /Hacer staking/i })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('recupera automáticamente un fallo transitorio de la carga inicial del inventario', async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ status: 'error', code: 'CUKIE_MASTER_UNAVAILABLE' }),
        })
        .mockResolvedValueOnce(response(status()));

      render(<CukieMasterNftVaultPanel />);
      await act(async () => {
        jest.advanceTimersByTime(1);
        await Promise.resolve();
      });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('button', { name: /Hacer staking/i })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancela una consulta de sincronización en vuelo al desmontarse', async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(response(status({ indexer: 'syncing' })))
        .mockReturnValueOnce(new Promise(() => undefined));

      const { unmount } = render(<CukieMasterNftVaultPanel />);
      expect(await screen.findByText(/Estamos actualizando tus Cukies/i)).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const retrySignal = (fetchMock.mock.calls[1][1] as RequestInit).signal;
      expect(retrySignal?.aborted).toBe(false);

      unmount();

      expect(retrySignal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('bloquea depósitos si el indexador no está saludable y mantiene recuperación', async () => {
    fetchMock.mockResolvedValueOnce(response(status({ indexer: 'unavailable' })));
    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByText(/No podemos actualizar tus Cukies ahora/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hacer staking/i })).toBeDisabled();
    expect(screen.getByText('Recuperación on-chain')).toBeInTheDocument();
  });

  it('permite retirar aunque los depósitos estén bloqueados por salud', async () => {
    fetchMock
      .mockResolvedValueOnce(response(status({ indexer: 'unavailable', deposited: true })))
      .mockResolvedValueOnce(response(status({ indexer: 'unavailable' })));
    writeContractAsync.mockResolvedValueOnce(depositHash);

    render(<CukieMasterNftVaultPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Retirar inmediatamente/i }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: vault,
      functionName: 'withdraw',
      args: [collection, BigInt(98000001)],
    })));
  });

  it('pide autenticación sin mostrar un falso conflicto de configuración', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isWaitingForApproval: false,
      walletType: null,
      fetchUser: jest.fn(),
    } as never);
    mockUseAccount.mockReturnValue({ address: undefined, chainId: undefined, isConnected: false } as never);

    render(<CukieMasterNftVaultPanel />);

    expect(screen.getByText(/Conecta tu wallet para consultar tus Cukies/i)).toBeInTheDocument();
    expect(screen.queryByText(/configuración pública y la del servidor no coinciden/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay Cukies Originales/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no renderiza una segunda ruta NFT en modo legacy', () => {
    (ukiNftVaults.mode as { cukieMaster: string }).cukieMaster = 'legacy';
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isWaitingForApproval: false,
      walletType: null,
      fetchUser: jest.fn(),
    } as never);
    const { container } = render(<CukieMasterNftVaultPanel />);
    expect(container).toBeEmptyDOMElement();
    (ukiNftVaults.mode as { cukieMaster: string }).cukieMaster = 'custodial';
  });
});
