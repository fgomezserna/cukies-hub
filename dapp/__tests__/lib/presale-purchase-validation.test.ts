import { isBelowContractMinimumPurchase } from '@/lib/presale-purchase-validation';

describe('presale-purchase-validation', () => {
  it('detecta importes por debajo del minimo leido del contrato', () => {
    expect(isBelowContractMinimumPurchase(BigInt(4), BigInt(5))).toBe(true);
  });

  it('permite importes iguales o superiores al minimo del contrato', () => {
    expect(isBelowContractMinimumPurchase(BigInt(5), BigInt(5))).toBe(false);
    expect(isBelowContractMinimumPurchase(BigInt(6), BigInt(5))).toBe(false);
  });

  it('no bloquea si el contrato no devuelve minimo o el minimo es cero', () => {
    expect(isBelowContractMinimumPurchase(BigInt(4), undefined)).toBe(false);
    expect(isBelowContractMinimumPurchase(BigInt(4), BigInt(0))).toBe(false);
  });
});
