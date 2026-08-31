import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UkiMarketplaceOrderView } from '@/lib/uki-marketplace/types';

const buyer = '0x00000000000000000000000000000000000000bb';
const seller = '0x00000000000000000000000000000000000000aa';
const marketplace = '0x1111111111111111111111111111111111111111';
const collection = '0x2222222222222222222222222222222222222222';
const uki = '0x3333333333333333333333333333333333333333';
const router = '0x4444444444444444444444444444444444444444';
const wbnb = '0x5555555555555555555555555555555555555555';
const usdt = '0x6666666666666666666666666666666666666666';
const orderId = `0x${'1'.repeat(64)}` as `0x${string}`;
const txHash = `0x${'a'.repeat(64)}`;
const approvalHash = `0x${'b'.repeat(64)}`;
const price = BigInt('1000000000000000000000');
const expiry = BigInt(1_800_000_000);

let allowance = BigInt(0);
let purchased = false;
let walletAddress = buyer;
let nativePaymentsAllowed = true;

const readContract = jest.fn(async (input: {
  address: string;
  functionName: string;
  args?: readonly unknown[];
}) => {
  switch (input.functionName) {
    case 'orders':
      return [seller, collection, BigInt(73), price, expiry, BigInt(1), 1_000, 1];
    case 'orderState':
      return purchased ? 2 : 1;
    case 'activeOrderIds':
      return orderId;
    case 'collectionAllowed':
      return true;
    case 'paused':
      return false;
    case 'ukiToken':
      return uki;
    case 'router':
      return router;
    case 'wrappedNative':
      return wbnb;
    case 'ownerOf':
      return purchased ? buyer : seller;
    case 'getApproved':
      return marketplace;
    case 'isApprovedForAll':
      return false;
    case 'paymentTokenAllowed':
      return true;
    case 'nativePaymentAllowed':
      return nativePaymentsAllowed;
    case 'getAmountsIn':
      return input.args?.[1] && (input.args[1] as string[])[0] === usdt
        ? [BigInt(2_000_000), price]
        : [BigInt('2000000000000000000'), price];
    case 'decimals':
      return input.address === usdt ? 6 : 18;
    case 'symbol':
      return input.address === usdt ? 'USDT' : 'UKI';
    case 'balanceOf':
      return BigInt('1000000000000000000000000');
    case 'allowance':
      return allowance;
    default:
      throw new Error(`Unexpected read ${input.functionName}`);
  }
});
const waitForTransactionReceipt = jest.fn(async () => ({ status: 'success' }));
const getBlock = jest.fn(async () => ({ timestamp: BigInt(1_700_000_000) }));
const getBalance = jest.fn(async () => BigInt('100000000000000000000'));
const writeContractAsync = jest.fn(async (input: {
  functionName: string;
  args?: readonly unknown[];
}) => {
  if (input.functionName === 'approve') {
    allowance = input.args?.[1] as bigint;
    return approvalHash;
  }
  if (['buyWithUki', 'buyWithToken', 'buyWithNative'].includes(input.functionName)) {
    purchased = true;
    return txHash;
  }
  throw new Error(`Unexpected write ${input.functionName}`);
});
const publicClientMock = {
  readContract,
  waitForTransactionReceipt,
  getBlock,
  getBalance,
};

jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: walletAddress,
    chainId: 97,
    isConnected: true,
  }),
  usePublicClient: () => publicClientMock,
  useSwitchChain: () => ({ switchChain: jest.fn(), isPending: false }),
  useWriteContract: () => ({ writeContractAsync }),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet para comprar</button>,
}));
jest.mock('@/lib/uki-marketplace/public-config', () => ({
  ukiMarketplacePublicConfig: {
    ready: true,
    checkoutReady: true,
    ukiPaymentReady: true,
    bnbPaymentReady: true,
    usdtPaymentReady: true,
    chainId: 97,
    marketplaceAddress: '0x1111111111111111111111111111111111111111',
    collectionAddresses: ['0x2222222222222222222222222222222222222222'],
    ukiTokenAddress: '0x3333333333333333333333333333333333333333',
    routerAddress: '0x4444444444444444444444444444444444444444',
    wrappedNativeAddress: '0x5555555555555555555555555555555555555555',
    usdtTokenAddress: '0x6666666666666666666666666666666666666666',
    bnbPaymentPath: [
      '0x5555555555555555555555555555555555555555',
      '0x3333333333333333333333333333333333333333',
    ],
    usdtPaymentPath: [
      '0x6666666666666666666666666666666666666666',
      '0x3333333333333333333333333333333333333333',
    ],
    explorerBaseUrl: 'https://testnet.bscscan.com',
    issues: [],
    checkoutIssues: [],
  },
}));

import { UkiMarketplaceBuyerCheckout } from '@/components/uki-marketplace/buyer-checkout';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

const order: UkiMarketplaceOrderView = {
  orderId,
  chainId: 97 as const,
  marketplaceAddress: marketplace,
  collectionAddress: collection,
  tokenId: '73',
  seller,
  ukiPriceRaw: price.toString(),
  expiresAt: '2027-01-15T08:00:00.000Z',
  nonceRaw: '1',
  feeBps: 1_000,
  status: 'active' as const,
  attentionReason: null,
  buyer: null,
  paymentToken: null,
  paymentAmountRaw: null,
  feeAmountRaw: null,
  listedAt: '2026-08-30T10:00:00.000Z',
  soldAt: null,
  cancelledAt: null,
  expiredAt: null,
  invalidatedAt: null,
};

describe('checkout comprador marketplace UKI', () => {
  beforeEach(() => {
    allowance = BigInt(0);
    purchased = false;
    walletAddress = buyer;
    nativePaymentsAllowed = true;
    ukiMarketplacePublicConfig.ukiPaymentReady = true;
    ukiMarketplacePublicConfig.bnbPaymentReady = true;
    ukiMarketplacePublicConfig.usdtPaymentReady = true;
    jest.clearAllMocks();
  });

  it('mantiene la compra UKI disponible y oculta BNB/USDT cuando siguen bloqueados', async () => {
    ukiMarketplacePublicConfig.bnbPaymentReady = false;
    ukiMarketplacePublicConfig.usdtPaymentReady = false;

    render(<UkiMarketplaceBuyerCheckout order={order} onPurchased={jest.fn()} />);

    expect(await screen.findByRole('button', { name: 'Autorizar UKI y comprar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'BNB' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'USDT' })).not.toBeInTheDocument();
  });

  it('autoriza el total UKI exacto, compra y verifica la entrega atómica', async () => {
    const onPurchased = jest.fn();
    render(<UkiMarketplaceBuyerCheckout order={order} onPurchased={onPurchased} />);

    const buyButton = await screen.findByRole('button', { name: 'Autorizar UKI y comprar' });
    fireEvent.click(buyButton);

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: uki,
      functionName: 'approve',
      args: [marketplace, BigInt('1100000000000000000000')],
    })));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: marketplace,
      functionName: 'buyWithUki',
      args: [orderId],
    })));
    await waitFor(() => {
      expect(screen.getByText('Compra y entrega verificadas')).toBeInTheDocument();
      expect(onPurchased).toHaveBeenCalledTimes(1);
    });
  });

  it('compra con BNB usando máximo con slippage, fee y deadline', async () => {
    render(<UkiMarketplaceBuyerCheckout order={order} onPurchased={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'BNB' }));
    const buyButton = await screen.findByRole('button', { name: 'Confirmar compra con BNB' });
    await waitFor(() => expect(buyButton).toBeEnabled());
    fireEvent.click(buyButton);

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: marketplace,
      functionName: 'buyWithNative',
      args: [orderId, [wbnb, uki], BigInt(1_700_000_600)],
      value: BigInt('2222000000000000000'),
    })));
    expect(writeContractAsync).not.toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'approve',
    }));
  });

  it('falla cerrado si BNB está configurado pero temporalmente bloqueado', async () => {
    nativePaymentsAllowed = false;
    render(<UkiMarketplaceBuyerCheckout order={order} onPurchased={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'BNB' }));

    expect(await screen.findByText('El pago con BNB no está disponible ahora.'))
      .toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'buyWithNative',
    }));
  });

  it('autoriza USDT y compra con un presupuesto máximo reembolsable', async () => {
    render(<UkiMarketplaceBuyerCheckout order={order} onPurchased={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'USDT' }));
    const buyButton = await screen.findByRole('button', { name: 'Autorizar USDT y comprar' });
    fireEvent.click(buyButton);

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: usdt,
      functionName: 'approve',
      args: [marketplace, BigInt(2_222_000)],
    })));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: marketplace,
      functionName: 'buyWithToken',
    })));
    const purchase = writeContractAsync.mock.calls.find(
      ([input]) => input.functionName === 'buyWithToken',
    )?.[0];
    expect(purchase).toBeDefined();
    if (!purchase) throw new Error('Missing buyWithToken call');
    expect(purchase.args).toEqual([
      orderId,
      usdt,
      BigInt(2_222_000),
      [usdt, uki],
      BigInt(1_700_000_600),
    ]);
  });

  it('bloquea la compra de la propia orden', async () => {
    walletAddress = seller;
    render(<UkiMarketplaceBuyerCheckout order={order} onPurchased={jest.fn()} />);

    const button = await screen.findByRole('button', { name: 'Autorizar UKI y comprar' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Esta orden pertenece a tu wallet/)).toBeInTheDocument();
  });
});
