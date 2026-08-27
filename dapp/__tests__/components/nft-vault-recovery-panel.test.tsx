import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  usePublicClient: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/lib/contracts/uki-nft-vaults', () => ({
  cukieMasterNftVaultAbi: [],
  cukiePoolNftVaultAbi: [],
  getNftVaultExplorerTxUrl: (hash: string) => `https://testnet.bscscan.com/tx/${hash}`,
  ukiNftVaults: {
    chainId: 97,
    cukieMasterNftVaultAddress: '0x2222222222222222222222222222222222222222',
    cukiePoolNftVaultAddress: '0x4444444444444444444444444444444444444444',
    collectionAddresses: ['0x3333333333333333333333333333333333333333'],
    collectionConfigInvalid: false,
    recoveryCollectionAddresses: ['0x3333333333333333333333333333333333333333'],
    recoveryCollectionConfigInvalid: false,
    explorerBaseUrl: 'https://testnet.bscscan.com',
    ready: { cukieMaster: true, cukiePool: true },
    mode: { cukieMaster: 'custodial', cukiePool: 'custodial' },
  },
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;

const walletAddress = '0x1111111111111111111111111111111111111111';
const otherWallet = '0x5555555555555555555555555555555555555555';
const collectionAddress = '0x3333333333333333333333333333333333333333';
const historicalCollectionAddress = '0x6666666666666666666666666666666666666666';
const masterVaultAddress = '0x2222222222222222222222222222222222222222';
const poolVaultAddress = '0x4444444444444444444444444444444444444444';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const transactionHash = `0x${'a'.repeat(64)}` as const;
const fetchMock = jest.fn();
const writeContractAsync = jest.fn();

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

function masterPosition(owner = walletAddress) {
  return {
    beneficialOwner: owner,
    depositEpoch: BigInt(3),
    depositedAt: BigInt(1_775_000_000),
  };
}

function emptyMasterPosition() {
  return {
    beneficialOwner: zeroAddress,
    depositEpoch: BigInt(0),
    depositedAt: BigInt(0),
  };
}

function poolPosition(input?: { owner?: string; withdrawableAt?: number }) {
  const withdrawableAt = input?.withdrawableAt ?? 0;
  return {
    beneficialOwner: input?.owner ?? walletAddress,
    depositEpoch: BigInt(2),
    depositedAt: BigInt(1_775_000_000),
    activationAt: BigInt(1_775_010_000),
    exitRequestedAt: withdrawableAt > 0 ? BigInt(1_775_020_000) : BigInt(0),
    withdrawableAt: BigInt(withdrawableAt),
    exitPeriodId: withdrawableAt > 0 ? BigInt(10) : BigInt(0),
    depositCalendarVersion: 1,
    exitCalendarVersion: withdrawableAt > 0 ? 1 : 0,
  };
}

function emptyPoolPosition() {
  return {
    beneficialOwner: zeroAddress,
    depositEpoch: BigInt(0),
    depositedAt: BigInt(0),
    activationAt: BigInt(0),
    exitRequestedAt: BigInt(0),
    withdrawableAt: BigInt(0),
    exitPeriodId: BigInt(0),
    depositCalendarVersion: 0,
    exitCalendarVersion: 0,
  };
}

function configureConnectedWallet(chainId = 97) {
  mockUseAccount.mockReturnValue({
    address: walletAddress,
    chainId,
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
}

function openRecoveryPanel() {
  const title = screen.getByText('Recuperación de emergencia');
  const summary = title.closest('summary');
  const details = title.closest('details');

  expect(summary).not.toBeNull();
  expect(details).not.toHaveAttribute('open');
  fireEvent.click(summary as HTMLElement);
  expect(details).toHaveAttribute('open');

  return details as HTMLDetailsElement;
}

describe('NftVaultRecoveryPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    Object.assign(mutableVaultConfig, {
      chainId: 97,
      cukieMasterNftVaultAddress: masterVaultAddress,
      cukiePoolNftVaultAddress: poolVaultAddress,
      collectionAddresses: [collectionAddress],
      collectionConfigInvalid: false,
      recoveryCollectionAddresses: [collectionAddress],
      recoveryCollectionConfigInvalid: false,
      explorerBaseUrl: 'https://testnet.bscscan.com',
      ready: { cukieMaster: true, cukiePool: true },
      mode: { cukieMaster: 'custodial', cukiePool: 'custodial' },
    });
    configureConnectedWallet();
    mockUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('permanece colapsado por defecto y muestra una única colección sin selector', () => {
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);

    const title = screen.getByText('Recuperación de emergencia');
    expect(title.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/solo si un NFT que ya depositaste no aparece/i)).toBeInTheDocument();
    expect(screen.getByText(/No sirve para depositar un NFT/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Colección NFT' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Colección NFT')).toHaveTextContent(collectionAddress);

    openRecoveryPanel();
  });

  it('retira desde Cukie Master sin auth, API ni indexador, incluso si la colección fue delistada', async () => {
    const readContract = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(masterPosition())
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(emptyMasterPosition());
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      readContract,
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValue(transactionHash);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);
    openRecoveryPanel();
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));

    const withdrawButton = await screen.findByRole('button', { name: 'Retirar Cukie ahora' });
    expect(withdrawButton).toBeEnabled();
    expect(screen.getByText(/ya no admite depósitos/i)).toBeInTheDocument();
    fireEvent.click(withdrawButton);

    await waitFor(() => expect(screen.getByText(/Retirada confirmada en BSC/i)).toBeInTheDocument());
    expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: masterVaultAddress,
      functionName: 'withdraw',
      args: [collectionAddress, BigInt(7)],
    }));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: transactionHash });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantiene recuperable una colección histórica aunque ya no admita depósitos nuevos', async () => {
    mutableVaultConfig.recoveryCollectionAddresses = [
      collectionAddress,
      historicalCollectionAddress,
    ];
    const readContract = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(masterPosition());
    mockUsePublicClient.mockReturnValue({
      readContract,
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);
    openRecoveryPanel();
    expect(screen.getByRole('combobox', { name: 'Colección NFT' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Colección NFT'), {
      target: { value: historicalCollectionAddress },
    });
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));

    expect(await screen.findByRole('button', { name: 'Retirar Cukie ahora' })).toBeEnabled();
    expect(readContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      functionName: 'collectionAllowed',
      args: [historicalCollectionAddress],
    }));
    expect(readContract).toHaveBeenNthCalledWith(2, expect.objectContaining({
      functionName: 'positionOf',
      args: [historicalCollectionAddress, BigInt(12)],
    }));
  });

  it('solicita la salida del Pool y vuelve a leer withdrawableAt directamente del contrato', async () => {
    const cutoff = 1_775_086_400;
    const readContract = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(poolPosition())
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(poolPosition({ withdrawableAt: cutoff }));
    const getBlock = jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) });
    mockUsePublicClient.mockReturnValue({
      readContract,
      getBlock,
      waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success' }),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValue(transactionHash);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel();
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar salida on-chain' }));

    await waitFor(() => expect(screen.getByText(/Salida confirmada en BSC/i)).toBeInTheDocument());
    expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: poolVaultAddress,
      functionName: 'requestExit',
      args: [collectionAddress, BigInt(8)],
    }));
    expect(screen.queryByRole('button', { name: 'Solicitar salida on-chain' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retira del Pool solo después de revalidar la madurez contra el último bloque', async () => {
    const cutoff = 1_775_086_400;
    const blockAfterCutoff = cutoff + 10;
    const readContract = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(poolPosition({ withdrawableAt: cutoff }))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(emptyPoolPosition());
    const getBlock = jest.fn().mockResolvedValue({ timestamp: BigInt(blockAfterCutoff) });
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
    mockUsePublicClient.mockReturnValue({
      readContract,
      getBlock,
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValue(transactionHash);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel();
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar NFT on-chain' }));

    await waitFor(() => expect(screen.getByText(/Retirada confirmada en BSC/i)).toBeInTheDocument());
    expect(getBlock).toHaveBeenCalledTimes(3);
    expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: poolVaultAddress,
      functionName: 'withdraw',
      args: [collectionAddress, BigInt(9)],
    }));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: transactionHash });
  });

  it('no habilita retirada si el reloj local está adelantado pero el bloque aún no llegó al corte', async () => {
    const cutoff = 1_775_086_400;
    jest.spyOn(Date, 'now').mockReturnValue((cutoff + 3_600) * 1_000);
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(poolPosition({ withdrawableAt: cutoff })),
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(cutoff - 10) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel();
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));

    await screen.findByText(/Retirable desde/i);
    expect(screen.queryByRole('button', { name: 'Retirar NFT on-chain' })).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('bloquea firmas si beneficialOwner no coincide con la wallet conectada', async () => {
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(masterPosition(otherWallet)),
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);
    openRecoveryPanel();
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));

    expect(await screen.findByText(/pertenece a otra wallet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirar Cukie ahora' })).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('falla cerrado ante red o configuración pública inválidas', () => {
    configureConnectedWallet(56);
    mutableVaultConfig.collectionConfigInvalid = true;
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);
    openRecoveryPanel();

    expect(screen.getByText(/identidad pública del vault/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comprobar posición' })).toBeDisabled();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });
});
