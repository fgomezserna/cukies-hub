import {
  assertDisplayedPriceUnchanged,
  assertEvmActionContext,
  isSameEvmWallet,
  isSameTronWallet,
  reconcileConfirmedMarketplaceAction,
} from '@/lib/legacy-marketplace/action-safety';
import { buildLegacyMarketplaceReconciliation } from '@/lib/legacy-marketplace/reconciliation';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

const baseItem: LegacyMarketplaceCukiItem = {
  id: '1000000000029',
  tokenId: '1000000000029',
  chainId: 56,
  collectionAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  cukiNumber: 29,
  owner: '0x00000000000000000000000000000000000000aa',
  network: 'BSC',
  origin: 'original',
  birthNetwork: 'BSC',
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

describe('seguridad de acciones Legacy', () => {
  it('rechaza pagar si el precio cambió después de mostrar la ficha', () => {
    expect(() => assertDisplayedPriceUnchanged('100', BigInt(101))).toThrow(
      'LISTING_PRICE_CHANGED',
    );
    expect(() => assertDisplayedPriceUnchanged('100', BigInt(100))).not.toThrow();
  });

  it('rechaza un cambio de cuenta o red EVM durante la validación', () => {
    expect(() => assertEvmActionContext({
      expectedAddress: '0x00000000000000000000000000000000000000aa',
      expectedChainId: 56,
      currentAddress: '0x00000000000000000000000000000000000000bb',
      currentChainId: 56,
    })).toThrow('WALLET_CONTEXT_CHANGED');
    expect(() => assertEvmActionContext({
      expectedAddress: '0x00000000000000000000000000000000000000aa',
      expectedChainId: 56,
      currentAddress: '0x00000000000000000000000000000000000000AA',
      currentChainId: 97,
    })).toThrow('WALLET_CONTEXT_CHANGED');
    expect(isSameEvmWallet(
      '0x00000000000000000000000000000000000000aa',
      '0x00000000000000000000000000000000000000AA',
    )).toBe(true);
  });

  it('no compara direcciones base58 TRON ignorando mayúsculas', () => {
    const tronWeb = {
      address: { toHex: () => { throw new Error('invalid base58'); } },
      contract: jest.fn(),
    };
    expect(isSameTronWallet(tronWeb, 'TAbCdEf', 'TAbCdEf')).toBe(true);
    expect(isSameTronWallet(tronWeb, 'TAbCdEf', 'Tabcdef')).toBe(false);
  });

  it('genera una reconciliación determinista e idempotente para alta y baja', () => {
    const first = buildLegacyMarketplaceReconciliation(baseItem, {
      owner: baseItem.owner!,
      isOnSale: true,
      price: 1950,
      priceOriginal: '195000000000000000',
    });
    const repeated = buildLegacyMarketplaceReconciliation(first.item, {
      owner: baseItem.owner!,
      isOnSale: true,
      price: 1950,
      priceOriginal: '195000000000000000',
    });
    expect(first.fingerprint).toBe(repeated.fingerprint);
    expect(first.item.state).toBe('onSale');
    expect(first.item.priceOriginal).toBe('195000000000000000');

    const inactive = buildLegacyMarketplaceReconciliation(first.item, {
      owner: baseItem.owner!,
      isOnSale: false,
      price: 0,
      priceOriginal: '0',
    });
    expect(inactive.item.state).toBe('available');
    expect(inactive.item.priceOriginal).toBe('0');
  });

  it('reconcilia una sola vez y solo después de confirmar la transacción', async () => {
    let releaseConfirmation: ((value: string) => void) | undefined;
    const confirm = jest.fn(() => new Promise<string>((resolve) => {
      releaseConfirmation = resolve;
    }));
    const reconcile = jest.fn().mockResolvedValue(undefined);

    const completion = reconcileConfirmedMarketplaceAction(confirm, reconcile);
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(reconcile).not.toHaveBeenCalled();

    releaseConfirmation?.('0xconfirmed');
    await expect(completion).resolves.toEqual({
      result: '0xconfirmed',
      reconciled: true,
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});
