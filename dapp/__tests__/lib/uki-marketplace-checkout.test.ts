import {
  calculateUkiMarketplaceCheckoutBudget,
  ceilMulDiv,
  validateUkiMarketplaceOnchainOrder,
  type UkiMarketplaceOnchainOrder,
} from '@/lib/uki-marketplace/checkout';

const seller = '0x1111111111111111111111111111111111111111';
const collection = '0x2222222222222222222222222222222222222222';
const orderId = `0x${'a'.repeat(64)}` as const;

describe('checkout del marketplace UKI', () => {
  it('redondea comisión y máximo siempre a favor de un presupuesto suficiente', () => {
    expect(ceilMulDiv(BigInt(101), BigInt(333), BigInt(10_000))).toBe(BigInt(4));
    expect(calculateUkiMarketplaceCheckoutBudget({
      quotedPaymentRaw: BigInt(101),
      feeBps: 333,
      slippageBps: 100,
    })).toEqual({
      quotedPaymentRaw: BigInt(101),
      quotedFeeRaw: BigInt(4),
      quotedTotalRaw: BigInt(105),
      maxPaymentRaw: BigInt(103),
      maxFeeRaw: BigInt(4),
      maxTotalRaw: BigInt(107),
      slippageBps: 100,
    });
  });

  it('mantiene un pago UKI exacto cuando no hay slippage', () => {
    expect(calculateUkiMarketplaceCheckoutBudget({
      quotedPaymentRaw: BigInt(1_000),
      feeBps: 1_000,
      slippageBps: 0,
    }).maxTotalRaw).toBe(BigInt(1_100));
  });

  it('rechaza presupuestos o porcentajes inválidos', () => {
    expect(() => calculateUkiMarketplaceCheckoutBudget({
      quotedPaymentRaw: BigInt(0),
      feeBps: 100,
    })).toThrow('mayor que cero');
    expect(() => calculateUkiMarketplaceCheckoutBudget({
      quotedPaymentRaw: BigInt(1),
      feeBps: 10_001,
    })).toThrow('comisión');
  });

  it('acepta solo la misma orden activa, vigente y con condiciones idénticas', () => {
    const onchain = [
      seller,
      collection,
      BigInt(73),
      BigInt(1_000),
      BigInt(1_800_000_000),
      BigInt(4),
      1_000,
      1,
    ] as const satisfies UkiMarketplaceOnchainOrder;
    expect(() => validateUkiMarketplaceOnchainOrder({
      indexed: {
        seller,
        collectionAddress: collection,
        tokenId: '73',
        ukiPriceRaw: '1000',
        expiresAt: '2027-01-15T08:00:00.000Z',
        nonceRaw: '4',
        feeBps: 1_000,
      },
      onchain,
      activeOrderId: orderId,
      expectedOrderId: orderId,
      contractState: 1,
      nowSeconds: BigInt(1_700_000_000),
    })).not.toThrow();

    expect(() => validateUkiMarketplaceOnchainOrder({
      indexed: {
        seller,
        collectionAddress: collection,
        tokenId: '73',
        ukiPriceRaw: '999',
        expiresAt: '2027-01-15T08:00:00.000Z',
        nonceRaw: '4',
        feeBps: 1_000,
      },
      onchain,
      activeOrderId: orderId,
      expectedOrderId: orderId,
      contractState: 1,
      nowSeconds: BigInt(1_700_000_000),
    })).toThrow('condiciones on-chain');
  });
});
