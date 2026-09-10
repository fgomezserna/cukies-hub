import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithRuntime as render } from '../../test-utils/runtime-test-wrapper';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import { useAuth } from '@/providers/auth-provider';
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
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

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
  poolRecoveryVaults: { chainId: 56 | 97; vaultAddress: `0x${string}` }[];
  poolRecoveryVaultConfigInvalid: boolean;
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

function openRecoveryPanel(kind: 'cukie_master' | 'cukie_pool' = 'cukie_master') {
  const details = document.getElementById(kind === 'cukie_pool' ? 'pool-recovery' : 'master-recovery');
  const summary = details?.querySelector('summary');

  expect(details).not.toBeNull();
  expect(summary).not.toBeNull();
  if (!details?.hasAttribute('open')) fireEvent.click(summary as HTMLElement);
  expect(details).toHaveAttribute('open');

  return details as HTMLDetailsElement;
}

function openPoolLink(
  tokenId = '8',
  collection = collectionAddress,
  recoveryVault = poolVaultAddress,
  chainId: string | null = String(mutableVaultConfig.chainId ?? 97),
) {
  const params = new URLSearchParams({
    tokenId,
    collection,
    recoveryVault,
  });
  if (chainId !== null) params.set('chainId', chainId);
  window.history.replaceState(
    {},
    '',
    `/cukie-hodler/recuperar?${params.toString()}`,
  );
}

describe('NftVaultRecoveryPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue({
      user: { walletAddress } as never,
      isLoading: false,
      isWaitingForApproval: false,
      walletType: 'evm',
      fetchUser: jest.fn(),
    });
    Object.assign(mutableVaultConfig, {
      chainId: 97,
      cukieMasterNftVaultAddress: masterVaultAddress,
      cukiePoolNftVaultAddress: poolVaultAddress,
      collectionAddresses: [collectionAddress],
      collectionConfigInvalid: false,
      recoveryCollectionAddresses: [collectionAddress],
      recoveryCollectionConfigInvalid: false,
      poolRecoveryVaults: [{ chainId: 97, vaultAddress: poolVaultAddress }],
      poolRecoveryVaultConfigInvalid: false,
      explorerBaseUrl: 'https://testnet.bscscan.com',
      ready: { cukieMaster: true, cukiePool: true },
      mode: { cukieMaster: 'custodial', cukiePool: 'custodial' },
    });
    configureConnectedWallet();
    mockUseSwitchChain.mockReturnValue({ switchChainAsync: jest.fn() } as unknown as ReturnType<typeof useSwitchChain>);
    mockUsePathname.mockReturnValue('/cukie-master');
    window.history.replaceState({}, '', '/cukie-hodler/recuperar');
    mockUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('permanece colapsado por defecto y muestra una única colección sin selector', () => {
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract: jest.fn(),
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);

    const title = screen.getByText('Posición existente');
    expect(title.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/comprueba el estado de una posición depositada/i)).toBeInTheDocument();
    expect(screen.getByText(/solicita su salida/i)).toBeInTheDocument();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract,
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValue(transactionHash);

    render(<NftVaultRecoveryPanel kind="cukie_master" />);
    openRecoveryPanel();
    fireEvent.change(screen.getByLabelText('Número del Cukie (Token ID)'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar posición' }));

    const withdrawButton = await screen.findByRole('button', { name: 'Retirar de Cukie Master' });
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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

    expect(await screen.findByRole('button', { name: 'Retirar de Cukie Master' })).toBeEnabled();
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract,
      getBlock,
      waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success' }),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValue(transactionHash);

    openPoolLink('8');
    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar salida del Cukie Pool' }));

    await waitFor(() => expect(screen.getByText(/Salida confirmada en BSC/i)).toBeInTheDocument());
    expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: poolVaultAddress,
      functionName: 'requestExit',
      args: [collectionAddress, BigInt(8)],
    }));
    expect(screen.queryByRole('button', { name: 'Solicitar salida del Cukie Pool' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falla cerrado en el Pool sin un enlace de posición válido', () => {
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');

    expect(screen.getByRole('alert')).toHaveTextContent(/abre esta pantalla desde la ficha del Cukie/i);
    expect(screen.queryByRole('button', { name: 'Comprobar posición' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Colección NFT' })).not.toBeInTheDocument();
  });

  it('falla cerrado si el enlace del Pool contiene una colección o vault no permitidos', () => {
    mockUsePublicClient.mockReturnValue({
      readContract: jest.fn(),
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    openPoolLink('13', historicalCollectionAddress, masterVaultAddress);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');

    expect(screen.getByRole('alert')).toHaveTextContent(/abre esta pantalla desde la ficha del Cukie/i);
    expect(screen.queryByRole('button', { name: 'Comprobar posición' })).not.toBeInTheDocument();
    expect(screen.queryByText(historicalCollectionAddress)).not.toBeInTheDocument();
  });

  it('permite reintentar la lectura automática sin volver al formulario técnico', async () => {
    const readContract = jest.fn()
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(poolPosition());
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract,
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    openPoolLink('16');

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');

    expect(await screen.findByText(/No se pudo cargar esta posición/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar consulta' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Número del Cukie (Token ID)')).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }));

    expect(await screen.findByText(/Propietario verificado/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar consulta' })).not.toBeInTheDocument();
    expect(readContract).toHaveBeenCalledTimes(3);
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('descarta una lectura diferida cuando cambia la wallet durante la consulta', async () => {
    let resolveAllowed: (value: boolean) => void = () => undefined;
    const allowedPromise = new Promise<boolean>((resolve) => {
      resolveAllowed = resolve;
    });
    const readContract = jest.fn().mockReturnValueOnce(allowedPromise);
    mockUsePublicClient.mockReturnValue({
      readContract,
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    openPoolLink('18');

    const view = render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');
    await waitFor(() => expect(readContract).toHaveBeenCalledTimes(1));

    mockUseAccount.mockReturnValue({
      address: otherWallet,
      chainId: 97,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<NftVaultRecoveryPanel kind="cukie_pool" />);
    resolveAllowed(true);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/conecta la wallet/i));
    expect(screen.getByText(/Esperando que conectes la wallet propietaria/i)).toBeInTheDocument();
    expect(screen.queryByText(/Propietario verificado/i)).not.toBeInTheDocument();
    expect(readContract).toHaveBeenCalledTimes(1);
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('consume la colección válida del enlace aunque no sea la primera configurada', async () => {
    mutableVaultConfig.recoveryCollectionAddresses = [
      collectionAddress,
      historicalCollectionAddress,
    ];
    const readContract = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(poolPosition());
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract,
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    openPoolLink('14', historicalCollectionAddress, poolVaultAddress, null);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');
    expect(await screen.findByText(/Propietario verificado/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comprobar posición' })).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
    expect(readContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      functionName: 'collectionAllowed',
      args: [historicalCollectionAddress],
    }));
    expect(readContract).toHaveBeenNthCalledWith(2, expect.objectContaining({
      functionName: 'positionOf',
      args: [historicalCollectionAddress, BigInt(14)],
    }));
  });

  it('bloquea un enlace del Pool con una chainId explícita inválida', () => {
    const readContract = jest.fn();
    mockUsePublicClient.mockReturnValue({
      readContract,
      getBlock: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    openPoolLink('17', collectionAddress, poolVaultAddress, '1');

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');

    expect(screen.getByRole('alert')).toHaveTextContent(/no identifica una red BSC válida/i);
    expect(readContract).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Comprobar posición' })).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('valida un enlace explícito al Pool activo aunque no haya vaults previos configurados', async () => {
    mutableVaultConfig.poolRecoveryVaults = [];
    const readContract = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(poolPosition());
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract,
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(1_775_030_000) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    openPoolLink('15', collectionAddress, poolVaultAddress);

    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');
    expect(await screen.findByText(/Propietario verificado/i)).toBeInTheDocument();
    expect(readContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      address: poolVaultAddress,
      functionName: 'collectionAllowed',
      args: [collectionAddress],
    }));
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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract,
      getBlock,
      waitForTransactionReceipt,
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);
    writeContractAsync.mockResolvedValue(transactionHash);

    openPoolLink('9');
    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar del Cukie Pool' }));

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
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
      readContract: jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(poolPosition({ withdrawableAt: cutoff })),
      getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(cutoff - 10) }),
      waitForTransactionReceipt: jest.fn(),
    } as unknown as NonNullable<ReturnType<typeof usePublicClient>>);

    openPoolLink('10');
    render(<NftVaultRecoveryPanel kind="cukie_pool" />);
    openRecoveryPanel('cukie_pool');
    await screen.findByText(/Retirable desde/i);
    expect(screen.getByText(/El plazo se fijó al solicitar la salida/i)).toBeInTheDocument();
    expect(screen.getByText(/podrás retirarlo desde la fecha indicada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirar del Cukie Pool' })).not.toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('bloquea firmas si beneficialOwner no coincide con la wallet conectada', async () => {
    mockUsePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ request: {} }),
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
    expect(screen.queryByRole('button', { name: 'Retirar de Cukie Master' })).not.toBeInTheDocument();
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

    expect(screen.getByText(/no podemos verificar esta posición/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comprobar posición' })).toBeDisabled();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });
});
