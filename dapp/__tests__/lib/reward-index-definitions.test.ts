import {
  REWARD_ECONOMY_COLLECTIONS,
  REWARD_ECONOMY_INDEX_DEFINITIONS,
} from '@/lib/uki-economy/rewards/index-definitions';

describe('reward index definitions', () => {
  it('protege sourceId global y pagina el periodo por el indice exacto', () => {
    expect(REWARD_ECONOMY_COLLECTIONS).toContain('reward_source_manifests');
    expect(REWARD_ECONOMY_COLLECTIONS).toContain('game_weekly_rankings');
    expect(REWARD_ECONOMY_COLLECTIONS).toContain('reward_pool_accruals');
    expect(REWARD_ECONOMY_COLLECTIONS).toEqual(expect.arrayContaining([
      'reward_emission_budget_state',
      'reward_emission_budget_days',
      'reward_emission_budget_events',
    ]));
    expect(REWARD_ECONOMY_INDEX_DEFINITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'reward_source_manifests',
        keys: { sourceId: 1 },
        options: expect.objectContaining({ unique: true }),
      }),
      expect.objectContaining({
        collection: 'reward_emission_budget_state',
        keys: { scope: 1, revision: 1 },
        options: expect.objectContaining({ unique: true }),
      }),
      expect.objectContaining({
        collection: 'reward_emission_budget_events',
        keys: { sourceId: 1 },
        options: expect.objectContaining({ unique: true }),
      }),
      expect.objectContaining({
        collection: 'reward_emission_budget_events',
        keys: { periodId: 1, _id: 1 },
      }),
      expect.objectContaining({
        collection: 'reward_allocations',
        keys: { periodId: 1, _id: 1 },
      }),
      expect.objectContaining({
        collection: 'reward_pool_accruals',
        keys: { periodId: 1, sourceId: 1, category: 1 },
        options: expect.objectContaining({ unique: true }),
      }),
      expect.objectContaining({
        collection: 'game_weekly_rankings',
        keys: { periodId: 1, gameId: 1, walletNormalized: 1 },
        options: expect.objectContaining({ unique: true }),
      }),
    ]));
  });
});
