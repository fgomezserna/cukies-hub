import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const wallet = '0x2222222222222222222222222222222222222222';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const approvalHash = `0x${'a'.repeat(64)}`;
const listingHash = `0x${'b'.repeat(64)}`;

let approved = false;
let listed = false;
let deactivateListingAfterBroadcast = false;
let failListingRefreshReads = false;
let listingReadActiveOverride: boolean | null = null;
let accountAddress: string | undefined = wallet;
let accountChainId: number | undefined = 56;
let accountConnected = true;
const readContract = jest.fn(async (input: { functionName: string }) => {
  switch (input.functionName) {
    case 'paused':
      return false;
    case 'ownerOf':
      return wallet;
    case 'marketTokens':
      if (failListingRefreshReads && listed) throw new Error('RPC refresh failed');
      {
        const activeListing = listingReadActiveOverride ?? listed;
        return [wallet, activeListing ? BigInt('195000000000000000') : BigInt(0), BigInt(0), activeListing, BigInt(0), BigInt(0)];
      }
    case 'getApproved':
      return approved ? '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91' : zeroAddress;
    case 'isApprovedForAll':
      return false;
    case 'marketFeePercentage':
      return BigInt(1_000);
    default:
      throw new Error(`Unexpected read ${input.functionName}`);
  }
});
const waitForTransactionReceipt = jest.fn(async () => ({ status: 'success' }));
const writeContractAsync = jest.fn(async (input: { functionName: string }) => {
  if (input.functionName === 'approve') {
    approved = true;
    return approvalHash;
  }
  if (input.functionName === 'putTokenOnSale') {
    listed = true;
    if (deactivateListingAfterBroadcast) listingReadActiveOverride = false;
    return listingHash;
  }
  throw new Error(`Unexpected write ${input.functionName}`);
});
const requestWallet = jest.fn(async () => {
  accountAddress = wallet;
  accountChainId = 56;
  accountConnected = true;
  return { kind: 'evm' as const, address: wallet, chainId: 56 };
});
const publicClient = { readContract, waitForTransactionReceipt };
const wagmiConfig = { account: { address: wallet }, chainId: 56 };

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: accountAddress, chainId: accountChainId, isConnected: accountConnected }),
  useConfig: () => wagmiConfig,
  usePublicClient: () => publicClient,
  useWriteContract: () => ({ writeContractAsync }),
}));
jest.mock('wagmi/actions', () => ({
  getAccount: () => ({ address: accountAddress }),
  getChainId: () => accountChainId,
}));
jest.mock('@/providers/wallet-coordinator-context', () => ({
  useWalletCoordinator: () => ({ requestWallet }),
}));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: () => ({ address: null, isConnected: false }),
}));
jest.mock('@/lib/legacy-marketplace/tron', () => ({
  getLegacyTronWeb: () => null,
  getLegacyTronReadWeb: () => null,
  readLegacyTronContract: jest.fn(),
  sendLegacyTronContract: jest.fn(),
}));
jest.mock('@/lib/legacy-marketplace/action-safety', () => ({
  assertEvmActionContext: jest.fn(),
  assertTronActionContext: jest.fn(),
  captureTronActionContext: jest.fn(),
  isSameEvmWallet: (left: string | null | undefined, right: string | null | undefined) => (
    Boolean(left && right && left.toLowerCase() === right.toLowerCase())
  ),
  isSameTronWallet: jest.fn(() => false),
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
jest.mock('lucide-react', () => {
  const Icon = () => null;
  return {
    Check: Icon,
    CheckCircle2: Icon,
    CircleAlert: Icon,
    Loader2: Icon,
    Network: Icon,
    ShieldCheck: Icon,
    Store: Icon,
    X: Icon,
  };
});

import { CukieSaleDialog } from '@/components/cukies/cukie-sale-dialog';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import type { MyCukieCollectionItem } from '@/lib/cukies-data/my-collection-types';

const cuki: MyCukieCollectionItem = {
  assetId: `56:${legacyMarketplaceContracts.bsc.contracts.token}:4314`,
  tokenId: '4314',
  imageUrl: '/cuki/4314.png',
  network: 'BSC',
  origin: 'original',
  generation: 'original',
  rarity: 'rare',
  state: 'available',
  custody: 'wallet',
  poolStatus: null,
  chainId: 56,
  collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
  saleKind: null,
  marketplaceSurface: 'legacy',
  sellSurfaces: ['legacy'],
  availableActions: ['sell'],
};

const onOpenChange = jest.fn();

function renderDialog() {
  return render(
    <CukieSaleDialog
      cuki={cuki}
      open
      onOpenChange={onOpenChange}
    />,
  );
}

describe('CukieSaleDialog', () => {
  beforeEach(() => {
    approved = false;
    listed = false;
    deactivateListingAfterBroadcast = false;
    failListingRefreshReads = false;
    listingReadActiveOverride = null;
    accountAddress = wallet;
    accountChainId = 56;
    accountConnected = true;
    jest.clearAllMocks();
  });

  it('devuelve el foco al botón de venta al cerrar el sheet', async () => {
    function SaleFlow() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Vender este Cukie</button><CukieSaleDialog cuki={cuki} open={open} onOpenChange={setOpen} /></>;
    }
    render(<SaleFlow />);
    const trigger = screen.getByRole('button', { name: 'Vender este Cukie' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Vender Cukie #4314' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('muestra identidad, valida precio y mantiene la publicación bloqueada hasta aprobar', async () => {
    renderDialog();

    expect(screen.getByRole('heading', { name: 'Vender Cukie #4314' })).toBeInTheDocument();
    expect(screen.getByText('Legacy · BNB')).toBeInTheDocument();
    expect(screen.getByText(legacyMarketplaceContracts.bsc.contracts.token)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprobar Cukie' })).toBeEnabled());

    const price = screen.getByLabelText('Precio de venta en BNB');
    fireEvent.change(price, { target: { value: '0' } });
    expect(screen.getByText('Introduce un precio válido mayor que cero.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poner en la tienda' })).not.toBeInTheDocument();

    fireEvent.change(price, { target: { value: '0,195' } });
    expect(screen.queryByRole('button', { name: 'Poner en la tienda' })).not.toBeInTheDocument();
  });

  it('separa approve y listing, espera recibos y reconcilia el anuncio', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprobar Cukie' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Precio de venta en BNB'), { target: { value: '0,195' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar Cukie' }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'approve',
      args: [legacyMarketplaceContracts.bsc.contracts.marketplace, BigInt(4314)],
    })));
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar Cukie' })).not.toBeInTheDocument());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Poner en la tienda' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Poner en la tienda' }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'putTokenOnSale',
      args: [BigInt(4314), BigInt('195000000000000000')],
      value: BigInt(0),
    })));
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText(/Venta publicada en BNB Smart Chain/)).toBeInTheDocument());
  });

  it('marca una aprobación existente sin pedir una firma innecesaria', async () => {
    approved = true;
    renderDialog();

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar Cukie' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Poner en la tienda' })).toBeDisabled();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('conserva el precio cuando la wallet rechaza la aprobación', async () => {
    writeContractAsync.mockRejectedValueOnce(new Error('User rejected the request'));
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprobar Cukie' })).toBeEnabled());
    const price = screen.getByLabelText('Precio de venta en BNB');
    fireEvent.change(price, { target: { value: '0,2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar Cukie' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('rechazó la firma'));
    expect(price).toHaveValue('0,2');
    expect(screen.getByRole('button', { name: 'Aprobar Cukie' })).toBeEnabled();
  });

  it('relee la cuenta después de que el coordinador conecta la wallet', async () => {
    accountAddress = undefined;
    accountChainId = undefined;
    accountConnected = false;
    renderDialog();
    expect(screen.getByRole('status')).toHaveTextContent('Conecta o cambia la wallet');
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar Cukie' }));

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'approve',
      args: [legacyMarketplaceContracts.bsc.contracts.marketplace, BigInt(4314)],
    })));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar Cukie' })).not.toBeInTheDocument());
  });

  it('bloquea un Cukie depositado y no permite publicar', async () => {
    const lockedCuki: MyCukieCollectionItem = {
      ...cuki,
      state: 'in_pool',
      custody: 'cukie_pool',
      poolStatus: 'active',
    };
    render(
      <CukieSaleDialog
        cuki={lockedCuki}
        open
        onOpenChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('bloqueado');
    expect(screen.getByRole('button', { name: 'Aprobar Cukie' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Poner en la tienda' })).not.toBeInTheDocument();
  });

  it('mantiene bloqueada la publicación tras un timeout y permite reconsultarla', async () => {
    approved = true;
    publicClient.waitForTransactionReceipt.mockRejectedValueOnce(new Error('Timed out while waiting for receipt'));
    renderDialog();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar Cukie' })).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Precio de venta en BNB'), { target: { value: '0,195' } });
    fireEvent.click(screen.getByRole('button', { name: 'Poner en la tienda' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Publicación pendiente/ })).toBeDisabled());
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar publicación' }));

    await waitFor(() => expect(screen.getByText(/Venta publicada en BNB Smart Chain/)).toBeInTheDocument());
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it('libera el cierre tras un recibo exitoso aunque el anuncio ya no esté activo', async () => {
    approved = true;
    deactivateListingAfterBroadcast = true;
    renderDialog();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar Cukie' })).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Precio de venta en BNB'), { target: { value: '0,195' } });
    fireEvent.click(screen.getByRole('button', { name: 'Poner en la tienda' }));

    await waitFor(() => expect(screen.getByText(/Publicación confirmada en BNB Smart Chain/)).toBeInTheDocument(), { timeout: 6_000 });
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeEnabled();
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  }, 8_000);

  it('confirma el anuncio y permite cerrar si falla la relectura RPC tras el recibo', async () => {
    approved = true;
    failListingRefreshReads = true;
    renderDialog();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar Cukie' })).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Precio de venta en BNB'), { target: { value: '0,195' } });
    fireEvent.click(screen.getByRole('button', { name: 'Poner en la tienda' }));

    await waitFor(() => expect(screen.getByText(/Publicación confirmada en BNB Smart Chain/)).toBeInTheDocument(), { timeout: 6_000 });
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeEnabled();
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  }, 8_000);
});
