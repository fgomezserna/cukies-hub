const mockParticipantsUpdateOne = jest.fn();
const mockParticipantsFindOne = jest.fn();
const mockCampaignConfigFindOne = jest.fn();
const mockReadOnChainPresalePurchaseTotals = jest.fn();

const mockParticipantsCollection = {
  updateOne: (...args: unknown[]) => mockParticipantsUpdateOne(...args),
  findOne: (...args: unknown[]) => mockParticipantsFindOne(...args),
};

const mockCampaignConfigCollection = {
  findOne: (...args: unknown[]) => mockCampaignConfigFindOne(...args),
};

const mockDb = {
  admin: () => ({ ping: jest.fn().mockResolvedValue(undefined) }),
  collection: jest.fn((name: string) => {
    if (name === 'presale_participants') return mockParticipantsCollection;
    if (name === 'presale_referral_campaign_config') return mockCampaignConfigCollection;
    throw new Error(`Unexpected collection: ${name}`);
  }),
};

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn(() => mockDb),
  })),
}));

jest.mock('@/lib/presale-onchain', () => ({
  readOnChainPresalePurchaseTotals: (...args: unknown[]) => (
    mockReadOnChainPresalePurchaseTotals(...args)
  ),
}));

const buyerAddress = '0x1111111111111111111111111111111111111111';
const sponsorAddress = '0x2222222222222222222222222222222222222222';
const referralCode = 'uki-0123456789';

const buyer = {
  walletAddress: buyerAddress,
  normalizedWalletAddress: buyerAddress,
  referralCode: 'uki-buyer0000',
};

const sponsor = {
  walletAddress: sponsorAddress,
  normalizedWalletAddress: sponsorAddress,
  referralCode,
  referralUnlockedAt: new Date('2026-07-01T00:00:00.000Z'),
  totalUkiPurchased: 1000,
};

describe('applyPresaleReferralCode: fail closed y CAS', () => {
  let applyPresaleReferralCode: typeof import('@/lib/presale-referrals').applyPresaleReferralCode;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'mongodb://referral-test.invalid/cukies';
    ({ applyPresaleReferralCode } = await import('@/lib/presale-referrals'));
  });

  afterAll(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockParticipantsUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockParticipantsFindOne
      .mockResolvedValueOnce(buyer)
      .mockResolvedValueOnce(sponsor);
    mockCampaignConfigFindOne.mockResolvedValue({
      active: true,
      minimumUkiToUnlockLink: 0,
    });
    mockReadOnChainPresalePurchaseTotals.mockResolvedValue({
      asmPurchasedRaw: BigInt(0),
      ukiPurchasedRaw: BigInt(0),
      totalAsmPurchased: 0,
      totalUkiPurchased: 0,
    });
  });

  it('no escribe sponsor si la lectura on-chain devuelve null', async () => {
    mockReadOnChainPresalePurchaseTotals.mockResolvedValue(null);

    const result = await applyPresaleReferralCode(buyerAddress, referralCode);

    expect(result).toEqual({ applied: false, reason: 'purchase_status_unavailable' });
    expect(mockParticipantsUpdateOne).toHaveBeenCalledTimes(2);
  });

  it('no escribe sponsor si el RPC lanza un error', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockReadOnChainPresalePurchaseTotals.mockRejectedValue(new Error('RPC unavailable'));

    const result = await applyPresaleReferralCode(buyerAddress, referralCode);

    expect(result).toEqual({ applied: false, reason: 'purchase_status_unavailable' });
    expect(mockParticipantsUpdateOne).toHaveBeenCalledTimes(2);
    consoleWarn.mockRestore();
  });

  it('usa un CAS y devuelve sponsor_already_locked si pierde la carrera', async () => {
    mockParticipantsUpdateOne
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 0 });

    const result = await applyPresaleReferralCode(buyerAddress, referralCode);

    expect(result).toEqual({ applied: false, reason: 'sponsor_already_locked' });
    expect(mockParticipantsUpdateOne).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        normalizedWalletAddress: buyerAddress,
        $and: [
          {
            $or: [
              { firstPurchaseAt: { $exists: false } },
              { firstPurchaseAt: null },
            ],
          },
          {
            $or: [
              { lockedSponsorWalletAddress: { $exists: false } },
              { lockedSponsorWalletAddress: null },
              { lockedSponsorWalletAddress: '' },
            ],
          },
        ],
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          pendingSponsorWalletNormalized: sponsorAddress,
          pendingSponsorCode: referralCode,
        }),
      }),
    );
  });
});
