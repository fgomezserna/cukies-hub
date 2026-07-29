import {
  COMPETITION_ATTEMPT_INDEXES,
  COMPETITION_PARTICIPANT_INDEXES,
} from '@/lib/treasure-hunt-competition/server/mongo-indexes';

describe('Treasure Hunt competition Mongo indexes', () => {
  it('enforces unique wallet and alias identities per campaign', () => {
    expect(COMPETITION_PARTICIPANT_INDEXES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: { campaignId: 1, walletAddress: 1 },
        unique: true,
      }),
      expect.objectContaining({
        key: { campaignId: 1, canonicalAlias: 1 },
        unique: true,
      }),
    ]));
  });

  it('allows one active attempt per wallet and retains all attempts without TTL', () => {
    expect(COMPETITION_ATTEMPT_INDEXES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: { campaignId: 1, walletAddress: 1, status: 1 },
        unique: true,
        partialFilterExpression: { status: 'active' },
      }),
      expect.objectContaining({
        key: {
          campaignId: 1,
          status: 1,
          score: -1,
          gameTimeMs: 1,
          finishedAt: 1,
          attemptId: 1,
        },
      }),
    ]));
    expect(COMPETITION_ATTEMPT_INDEXES.some((index) => 'expireAfterSeconds' in index)).toBe(false);
  });
});
