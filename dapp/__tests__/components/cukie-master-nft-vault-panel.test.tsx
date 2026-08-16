import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { CukieMasterNftVaultPanel } from '@/components/cukie-master/nft-vault-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import {
  savePendingNftVaultOperation,
  type NftVaultPendingOperation,
} from '@/lib/nft-vault/pending-operations';
import { useAuth } from '@/providers/auth-provider';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
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
  cukieMasterNftVaultAbi: [],
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
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const wallet = '0x1111111111111111111111111111111111111111';
const vault = '0x2222222222222222222222222222222222222222';
const collection = '0x3333333333333333333333333333333333333333';
const approvalHash = `0x${'a'.repeat(64)}` as const;
const depositHash = `0x${'b'.repeat(64)}` as const;
const fetchMock = jest.fn();
const readContract = jest.fn();
const getTransactionReceipt = jest.fn();
const waitForTransactionReceipt = jest.fn();
const writeContractAsync = jest.fn();

function status(input: { indexer?: 'ready' | 'unavailable'; deposited?: boolean } = {}) {
  const deposited = input.deposited ?? false;
  return {
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
      canDeposit: !deposited,
      canWithdraw: deposited,
    }],
  };
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

describe('CukieMasterNftVaultPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockUsePublicClient.mockReturnValue({ readContract, getTransactionReceipt, waitForTransactionReceipt } as never);
    mockUseWriteContract.mockReturnValue({ writeContractAsync } as never);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
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
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: approvalHash });
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: depositHash });
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
    await waitFor(() => expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: depositHash }));
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
    getTransactionReceipt.mockResolvedValueOnce({ status: 'success' });

    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByRole('button', { name: /Actualizando staking/i })).toBeDisabled();
    await act(async () => resolveProjection(response(status({ deposited: true }))));
    expect(await screen.findByRole('button', { name: /Retirar inmediatamente/i })).toBeEnabled();
    await waitFor(() => expect(localStorage.length).toBe(0));
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

    expect(await screen.findByText(/rechazó la operación antes de crear una transacción/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hacer staking/i })).toBeEnabled();
    expect(localStorage.length).toBe(0);
  });

  it('muestra los 12 Cukies y explica por qué los 6 de Segunda Generación no son aptos', async () => {
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

    expect(await screen.findByText('12 Cukies detectados · 6 aptos para esta ruta')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Hacer staking/i })).toHaveLength(6);
    expect(screen.getAllByText('Solo cuentan Cukies Originales')).toHaveLength(6);
  });

  it('bloquea depósitos si el indexador no está saludable y mantiene recuperación', async () => {
    fetchMock.mockResolvedValueOnce(response(status({ indexer: 'unavailable' })));
    render(<CukieMasterNftVaultPanel />);

    expect(await screen.findByText(/indexador NFT no está saludable/i)).toBeInTheDocument();
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

    expect(screen.getByText(/Conecta y autentica tu wallet EVM/i)).toBeInTheDocument();
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
