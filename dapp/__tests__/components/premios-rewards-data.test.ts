import {
  purchaseRewardDisplay,
  purchaseRewards,
  rarityRewardDisplay,
  rarityRewards,
} from '@/components/premios/rewards-data';

jest.mock('lucide-react', () => ({
  Crown: () => null,
  Gift: () => null,
  Sparkles: () => null,
  Star: () => null,
  Trophy: () => null,
  Users: () => null,
}));

describe('premios rewards data', () => {
  it('usa los nuevos tramos de premios por compra', () => {
    expect(purchaseRewards.map((reward) => reward.amountStr)).toEqual([
      '5.000 UKI',
      '20.000 UKI',
      '35.000 UKI',
      '60.000 UKI',
      '100.000 UKI',
      '150.000 UKI',
    ]);
    expect(purchaseRewards[0].tier).toBe('Madera');
  });

  it('usa los nuevos requisitos de la competicion de referidos', () => {
    expect(rarityRewards.map((reward) => `${reward.name}:${reward.threshold}`)).toEqual([
      'Goat:2.500.000 UKI',
      'Legendario:1.000.000 UKI',
      'Épico:500.000 UKI',
      'Raro:300.000 UKI',
      'No Común:150.000 UKI',
      'Común:<150.000 UKI',
    ]);
  });

  it('expone display localizado para premios por compra y rarezas', () => {
    expect(purchaseRewardDisplay(purchaseRewards[0], 'en')).toMatchObject({
      amountStr: '5,000 UKI',
      tier: 'Wood',
      prize: 'Raffle for 10 2nd Generation Cukies',
    });
    expect(rarityRewardDisplay(rarityRewards[1], 'en')).toEqual({
      name: 'Legendary',
      threshold: '1,000,000 UKI',
    });
    expect(rarityRewardDisplay(rarityRewards[5], 'en')).toEqual({
      name: 'Common',
      threshold: '<150,000 UKI',
    });
  });
});
