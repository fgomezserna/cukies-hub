import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { CukieMasterNftVaultPanel } from '@/components/cukie-master/nft-vault-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
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
      custody: deposited ? 'cukie_master_nft_vault' : 'wallet',
      canDeposit: !deposited,
      canWithdraw: deposited,
    }],
  };
}

function response(data: ReturnType<typeof status>) {
  return { ok: true, json: async () => ({ status: 'ok', data }) };
}

describe('CukieMasterNftVaultPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue({
      user: { walletAddress: wallet },
      isLoading: false,
      isWaitingForApproval: false,
      walletType: 'evm',
      fetchUser: jest.fn(),
    } as never);
    mockUseAccount.mockReturnValue({ address: wallet, chainId: 97, isConnected: true } as never);
    mockUsePublicClient.mockReturnValue({ readContract, waitForTransactionReceipt } as never);
    mockUseWriteContract.mockReturnValue({ writeContractAsync } as never);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
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
