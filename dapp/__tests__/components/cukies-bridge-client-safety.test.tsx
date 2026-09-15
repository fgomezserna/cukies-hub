import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { BridgeClient } from '@/components/legacy-marketplace/bridge-client';
import { useTronLink } from '@/hooks/use-tronlink';
import {
  buildCukiesBridgeRuntimeConfig,
  type CukiesBridgeRuntimeConfig,
} from '@/lib/legacy-marketplace/bridge-runtime';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';
import {
  readTronContractAt,
  sendTronContractAt,
} from '@/lib/legacy-marketplace/tron';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useReadContract: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('@/hooks/use-tronlink', () => ({ useTronLink: jest.fn() }));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  readTronContractAt: jest.fn(),
  sendTronContractAt: jest.fn(),
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: () => <span />,
  ArrowRightLeft: () => <span />,
  ArrowRight: () => <span />,
  Check: () => <span />,
  CircleCheck: () => <span />,
  Loader2: () => <span />,
  Network: () => <span />,
  RefreshCcw: () => <span />,
  Route: () => <span />,
  ShieldAlert: () => <span />,
  Wallet: () => <span />,
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseReadContract = useReadContract as jest.MockedFunction<
  typeof useReadContract
>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<
  typeof useSwitchChain
>;
const mockUseWriteContract = useWriteContract as jest.MockedFunction<
  typeof useWriteContract
>;
const mockUseTronLink = useTronLink as jest.MockedFunction<typeof useTronLink>;
const mockReadTronContractAt = readTronContractAt as jest.MockedFunction<
  typeof readTronContractAt
>;
const mockSendTronContractAt = sendTronContractAt as jest.MockedFunction<
  typeof sendTronContractAt
>;
const fetchMock = jest.fn();

const TRON_COLLECTION = 'T111111111111111111111111111111111';
const TRON_BRIDGE = 'T222222222222222222222222222222222';
const BSC_MAINNET_COLLECTION =
  '0x0dbDeBCC62f11005BF434ABFad74564E896aC861';
const BSC_MAINNET_BRIDGE =
  '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E';
const TRON_MAINNET_COLLECTION = 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe';
const TRON_MAINNET_BRIDGE = 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ';

function stageRuntime(
  overrides: Parameters<typeof buildCukiesBridgeRuntimeConfig>[0] = {},
) {
  return buildCukiesBridgeRuntimeConfig({
    APP_ENV: 'staging',
    NEXT_PUBLIC_APP_ENV: 'staging',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    NEXT_PUBLIC_CUKIES_BRIDGE_MODE: 'testnet',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID: '97',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS:
      '0x1111111111111111111111111111111111111111',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS:
      '0x2222222222222222222222222222222222222222',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK: 'nile',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL: 'https://nile.trongrid.io',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS: TRON_COLLECTION,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS: TRON_BRIDGE,
    ...overrides,
  });
}

function futureCanonicalIdentityRuntime(): CukiesBridgeRuntimeConfig {
  const config = stageRuntime();
  return {
    ...config,
    enabled: true,
    issues: [],
  };
}

function productionRuntime(
  overrides: Parameters<typeof buildCukiesBridgeRuntimeConfig>[0] = {},
): CukiesBridgeRuntimeConfig {
  return buildCukiesBridgeRuntimeConfig({
    APP_ENV: 'production',
    NEXT_PUBLIC_APP_ENV: 'production',
    NEXT_PUBLIC_UKI_CHAIN_ID: '56',
    NEXT_PUBLIC_CUKIES_BRIDGE_MODE: 'mainnet',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID: '56',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS: BSC_MAINNET_COLLECTION,
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS: BSC_MAINNET_BRIDGE,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK: 'mainnet',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL: 'https://api.trongrid.io',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS: TRON_MAINNET_COLLECTION,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS: TRON_MAINNET_BRIDGE,
    ...overrides,
  });
}

function cuki(
  id: string,
  tokenId: string,
  cukiNumber: number,
): LegacyMarketplaceCukiItem {
  return {
    id,
    tokenId,
    chainId: null,
    collectionAddress: TRON_MAINNET_COLLECTION,
    cukiNumber,
    owner: 'T111111111111111111111111111111111',
    network: 'TRON',
    origin: 'mint',
    birthNetwork: 'TRON',
    imageUrl: null,
    type: 1,
    state: 'available',
    price: 0,
    priceOriginal: '0',
    skills: {},
    childrenCount: 0,
    childrenCountTron: 0,
    childrenCountBsc: 0,
    parents: [],
    children: [],
    history: [],
    timestamp: null,
  };
}

function installConnectedWallets(
  tronOwner: string,
  approved = true,
  tronRpcUrl = 'https://nile.trongrid.io',
) {
  mockUseAccount.mockReturnValue({
    address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    chainId: 97,
    isConnected: true,
  } as never);
  mockUseReadContract.mockReturnValue({ data: BigInt(0) } as never);
  mockUseSwitchChain.mockReturnValue({
    switchChain: jest.fn(),
    isPending: false,
  } as never);
  mockUseWriteContract.mockReturnValue({
    writeContract: jest.fn(),
    isPending: false,
  } as never);
  mockUseTronLink.mockReturnValue({
    address: tronOwner,
    connect: jest.fn(),
    isConnected: true,
    isInstalled: true,
  } as never);
  mockReadTronContractAt.mockImplementation(async (
    _tronWeb,
    _abi,
    _address,
    functionName,
  ) => {
    if (functionName === 'paused') return false;
    if (functionName === 'isApprovedForAll') return approved;
    return '0';
  });
  mockSendTronContractAt.mockResolvedValue('0xtx');
  window.tronWeb = {
    fullNode: { host: tronRpcUrl },
  };
}

describe('Cukies bridge client safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as never;
  });

  it('no monta ninguna operacion on-chain cuando el runtime bridge esta desactivado', () => {
    const config = buildCukiesBridgeRuntimeConfig({
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: 'staging',
      NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    });

    render(<BridgeClient config={config} />);

    expect(screen.getByTestId('cukies-bridge-disabled')).toBeInTheDocument();
    expect(screen.getByText('Bridge TRON → BSC no disponible')).toBeInTheDocument();
    expect(screen.getByText(/solo se habilita en produccion/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar TRON/i })).not.toBeInTheDocument();
    expect(mockUseAccount).not.toHaveBeenCalled();
    expect(mockUseReadContract).not.toHaveBeenCalled();
    expect(mockUseSwitchChain).not.toHaveBeenCalled();
    expect(mockUseWriteContract).not.toHaveBeenCalled();
    expect(mockUseTronLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantiene Testnet sin hooks hasta que el productor acredite identidad TRON', () => {
    const config = stageRuntime();

    expect(config.enabled).toBe(false);
    expect(config.issues).toContain(
      'Bridge Testnet desactivado hasta materializar _id y coleccion canonicos para Cukies TRON',
    );
    render(<BridgeClient config={config} />);

    expect(screen.getByTestId('cukies-bridge-disabled')).toBeInTheDocument();
    expect(screen.getByText(/materializar _id y coleccion canonicos/i))
      .toBeInTheDocument();
    expect(mockUseAccount).not.toHaveBeenCalled();
    expect(mockUseReadContract).not.toHaveBeenCalled();
    expect(mockUseTronLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no lee contratos TRON fuera de Nile y refresca al cambiar al origen correcto', async () => {
    const runtime = futureCanonicalIdentityRuntime();
    const owner = 'T111111111111111111111111111111111';
    installConnectedWallets(owner);
    window.tronWeb = {
      fullNode: { host: 'https://api.trongrid.io' },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const { rerender } = render(<BridgeClient config={runtime} />);

    expect(mockReadTronContractAt).not.toHaveBeenCalled();
    expect(screen.getByText(/Conecta TronLink en TRON Nile Testnet/i))
      .toBeInTheDocument();

    window.tronWeb = {
      fullNode: { host: 'https://nile.trongrid.io' },
    };
    rerender(<BridgeClient config={runtime} />);

    await waitFor(() => expect(mockReadTronContractAt).toHaveBeenCalledTimes(3));
    expect(mockReadTronContractAt).toHaveBeenCalledWith(
      window.tronWeb,
      expect.anything(),
      TRON_BRIDGE,
      'bridgePrice',
    );
  });

  it('falla cerrado sin hooks ni fetch si entorno o chains declarados se contradicen', () => {
    const config = stageRuntime({
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID: '56',
    });

    expect(config.enabled).toBe(false);
    expect(config.issues).toEqual(expect.arrayContaining([
      'APP_ENV y NEXT_PUBLIC_APP_ENV deben coincidir',
      'NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID y NEXT_PUBLIC_UKI_CHAIN_ID deben coincidir',
    ]));

    render(<BridgeClient config={config} />);

    expect(screen.getByTestId('cukies-bridge-disabled')).toBeInTheDocument();
    expect(mockUseAccount).not.toHaveBeenCalled();
    expect(mockUseReadContract).not.toHaveBeenCalled();
    expect(mockUseSwitchChain).not.toHaveBeenCalled();
    expect(mockUseWriteContract).not.toHaveBeenCalled();
    expect(mockUseTronLink).not.toHaveBeenCalled();
    expect(mockReadTronContractAt).not.toHaveBeenCalled();
    expect(mockSendTronContractAt).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falla cerrado si la chain server del indexer contradice bridge y dapp', () => {
    const config = stageRuntime({
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
    });

    expect(config.enabled).toBe(false);
    expect(config.issues).toContain(
      'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID debe coincidir con la chain del bridge y la dapp',
    );

    render(<BridgeClient config={config} />);

    expect(screen.getByTestId('cukies-bridge-disabled')).toBeInTheDocument();
    expect(mockUseAccount).not.toHaveBeenCalled();
    expect(mockUseReadContract).not.toHaveBeenCalled();
    expect(mockUseWriteContract).not.toHaveBeenCalled();
    expect(mockUseTronLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('excluye otra coleccion con el mismo tokenId y opera solo la identidad exacta', async () => {
    const otherCollection = 'T333333333333333333333333333333333';
    const runtime = productionRuntime();
    const valid = cuki(`TRON:${TRON_MAINNET_COLLECTION}:42`, '42', 142);
    const wrongCollection = cuki(`TRON:${otherCollection}:42`, '42', 242);
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(`/api/cukies/${encodeURIComponent(valid.tokenId)}?`)) {
        return {
          ok: true,
          json: async () => ({ item: valid }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: url.includes('state=inBridge') ? [] : [valid, wrongCollection],
        }),
      };
    });
    installConnectedWallets(valid.owner!, true, 'https://api.trongrid.io');

    render(<BridgeClient config={runtime} />);

    const validCard = await screen.findByRole('button', { name: /Cukie #142/i });
    expect(screen.queryByText('Cukie #242')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => {
      const url = String(input);
      return url.startsWith('/api/cukies?')
        && url.includes('network=TRON')
        && url.includes(`collectionAddress=${TRON_MAINNET_COLLECTION}`);
    })).toBe(true);
    fireEvent.click(validCard);

    const destinationInput = screen.getByRole('textbox', {
      name: 'Dirección EVM destino',
    });
    fireEvent.change(destinationInput, {
      target: { value: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    });
    fireEvent.click(screen.getByRole('checkbox', {
      name: /burn\/custodia es irreversible/i,
    }));
    const startButton = screen.getByRole('button', { name: /Iniciar TRON/i });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() => expect(mockSendTronContractAt).toHaveBeenCalledWith(
      window.tronWeb,
      expect.anything(),
      TRON_MAINNET_BRIDGE,
      'jumpInBridge',
      ['42', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1],
      expect.objectContaining({ callValue: 0 }),
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/cukies/${encodeURIComponent(valid.tokenId)}?network=TRON&collectionAddress=${encodeURIComponent(TRON_MAINNET_COLLECTION)}`,
      { cache: 'no-store' },
    );
  });

  it('descarta candidatos de owner o state distintos aunque la API los devuelva', async () => {
    const runtime = productionRuntime();
    const valid = cuki(`TRON:${TRON_MAINNET_COLLECTION}:42`, '42', 142);
    const wrongOwner = {
      ...cuki(`TRON:${TRON_MAINNET_COLLECTION}:43`, '43', 143),
      owner: 'T333333333333333333333333333333333',
    };
    const wrongState = {
      ...cuki(`TRON:${TRON_MAINNET_COLLECTION}:44`, '44', 144),
      state: 'inBridge',
    };
    fetchMock.mockImplementation(async (input: string | URL | Request) => ({
      ok: true,
      json: async () => ({
        items: String(input).includes('state=inBridge')
          ? []
          : [valid, wrongOwner, wrongState],
      }),
    }));
    installConnectedWallets(valid.owner!, true, 'https://api.trongrid.io');

    render(<BridgeClient config={runtime} />);

    expect(await screen.findByRole('button', { name: /Cukie #142/i }))
      .toBeInTheDocument();
    expect(screen.queryByText('Cukie #143')).not.toBeInTheDocument();
    expect(screen.queryByText('Cukie #144')).not.toBeInTheDocument();
  });

  it.each([
    ['owner', { owner: 'T333333333333333333333333333333333' }],
    ['state', { state: 'inBridge' }],
  ])('cancela jumpInBridge si el refetch exacto cambia %s', async (_field, change) => {
    const runtime = productionRuntime();
    const valid = cuki(`TRON:${TRON_MAINNET_COLLECTION}:42`, '42', 142);
    const stale = { ...valid, ...change } as LegacyMarketplaceCukiItem;
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(`/api/cukies/${encodeURIComponent(valid.tokenId)}?`)) {
        return {
          ok: true,
          json: async () => ({ item: stale }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: url.includes('state=inBridge') ? [] : [valid],
        }),
      };
    });
    installConnectedWallets(valid.owner!, true, 'https://api.trongrid.io');

    render(<BridgeClient config={runtime} />);

    fireEvent.click(await screen.findByRole('button', { name: /Cukie #142/i }));
    const destinationInput = screen.getByRole('textbox', {
      name: 'Dirección EVM destino',
    });
    fireEvent.change(destinationInput, {
      target: { value: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    });
    fireEvent.click(screen.getByRole('checkbox', {
      name: /burn\/custodia es irreversible/i,
    }));
    const startButton = screen.getByRole('button', { name: /Iniciar TRON/i });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    expect(await screen.findByText(/ya no coincide con la identidad, owner o estado/i))
      .toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/cukies/${encodeURIComponent(valid.tokenId)}?network=TRON&collectionAddress=${encodeURIComponent(TRON_MAINNET_COLLECTION)}`,
      { cache: 'no-store' },
    );
    expect(mockSendTronContractAt).not.toHaveBeenCalled();
  });

  it('cancela approval si el refetch exacto ya no confirma owner disponible', async () => {
    const runtime = productionRuntime();
    const valid = cuki(`TRON:${TRON_MAINNET_COLLECTION}:42`, '42', 142);
    const stale = {
      ...valid,
      owner: 'T333333333333333333333333333333333',
    };
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(`/api/cukies/${encodeURIComponent(valid.tokenId)}?`)) {
        return {
          ok: true,
          json: async () => ({ item: stale }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: url.includes('state=inBridge') ? [] : [valid],
        }),
      };
    });
    installConnectedWallets(valid.owner!, false, 'https://api.trongrid.io');

    render(<BridgeClient config={runtime} />);

    fireEvent.click(await screen.findByRole('button', { name: /Cukie #142/i }));
    const approveButton = screen.getByRole('button', { name: /Aprobar bridge en TRON/i });
    await waitFor(() => expect(approveButton).toBeEnabled());
    fireEvent.click(approveButton);

    expect(await screen.findByText(/ya no coincide con la identidad, owner o estado/i))
      .toBeInTheDocument();
    expect(mockSendTronContractAt).not.toHaveBeenCalled();
  });
});
