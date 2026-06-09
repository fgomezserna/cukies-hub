jest.mock('mongodb', () => ({
  MongoClient: jest.fn(),
}));

import { toPublicPresaleParticipantStatus } from '@/lib/presale-referrals';

const campaignConfig = {
  minimumUkiToUnlockLink: 1000,
  levelOneWeight: 1,
  levelTwoWeight: 0.5,
  levelThreeWeight: 0.25,
};

const referralCounts = {
  level1: 2,
  level2: 1,
  level3: 0,
};

describe('toPublicPresaleParticipantStatus', () => {
  it('oculta el enlace hasta que el indexer marque referralUnlockedAt', () => {
    const status = toPublicPresaleParticipantStatus(
      {
        walletAddress: '0xabc',
        normalizedWalletAddress: '0xabc',
        referralCode: 'uki-test',
        totalUkiPurchased: 1200,
      },
      campaignConfig,
      referralCounts,
      'https://cukiesworld.com',
    );

    expect(status.unlockProgress).toBe(1);
    expect(status.referralCode).toBeNull();
    expect(status.referralLink).toBeNull();
  });

  it('muestra el enlace cuando el indexer confirma el desbloqueo', () => {
    const status = toPublicPresaleParticipantStatus(
      {
        walletAddress: '0xabc',
        normalizedWalletAddress: '0xabc',
        referralCode: 'uki-test',
        referralUnlockedAt: new Date('2026-06-09T10:00:00Z'),
        totalUkiPurchased: 1200,
        referralWeightedScore: 250,
      },
      campaignConfig,
      referralCounts,
      'https://cukiesworld.com',
    );

    expect(status.referralCode).toBe('uki-test');
    expect(status.referralLink).toBe('https://cukiesworld.com/ref/uki-test');
    expect(status.referralLevel1Count).toBe(2);
    expect(status.referralWeightedScore).toBe(250);
  });

  it('no trata un minimo cero como enlace desbloqueado sin evento indexado', () => {
    const status = toPublicPresaleParticipantStatus(
      {
        walletAddress: '0xabc',
        normalizedWalletAddress: '0xabc',
        referralCode: 'uki-test',
        totalUkiPurchased: 0,
      },
      { ...campaignConfig, minimumUkiToUnlockLink: 0 },
      referralCounts,
      'https://cukiesworld.com',
    );

    expect(status.unlockProgress).toBe(0);
    expect(status.referralLink).toBeNull();
  });
});
