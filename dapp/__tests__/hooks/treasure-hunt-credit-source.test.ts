import { nextTreasureHuntCreditSource } from '@/hooks/use-treasure-hunt-credit-access';

describe('selección visible de créditos para Treasure Hunt', () => {
  it('prioriza el saldo personal cuando cubre el coste completo', () => {
    expect(nextTreasureHuntCreditSource({
      costCredits: 10,
      ownAvailableCredits: 450,
      poolAvailableCredits: 50,
    })).toBe('own');
  });

  it('habilita el pool cuando el saldo personal no cubre el coste', () => {
    expect(nextTreasureHuntCreditSource({
      costCredits: 10,
      ownAvailableCredits: 0,
      poolAvailableCredits: 50,
    })).toBe('pool');
  });

  it('no mezcla saldos parciales de distintas fuentes', () => {
    expect(nextTreasureHuntCreditSource({
      costCredits: 10,
      ownAvailableCredits: 6,
      poolAvailableCredits: 4,
    })).toBeNull();
  });
});
