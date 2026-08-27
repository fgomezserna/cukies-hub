import {
  WEEKLY_RANKING_COLLECTIONS,
  WEEKLY_RANKING_INDEX_DEFINITIONS,
} from "@/lib/uki-economy/ranking/index-definitions";

describe("weekly ranking indexes", () => {
  it("covers immutable sources/manifests/audit and previous-rank lookup", () => {
    const indexed = new Set(WEEKLY_RANKING_INDEX_DEFINITIONS.map((index) => index.collection));
    for (const collection of WEEKLY_RANKING_COLLECTIONS) expect(indexed.has(collection)).toBe(true);
    expect(WEEKLY_RANKING_INDEX_DEFINITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ collection: "weekly_ranking_sources", keys: { sessionId: 1 }, options: expect.objectContaining({ unique: true }) }),
      expect.objectContaining({ collection: "weekly_ranking_manifests", keys: { periodId: 1 }, options: expect.objectContaining({ unique: true }) }),
      expect.objectContaining({ collection: "weekly_ranking_audit_events", keys: { eventId: 1 }, options: expect.objectContaining({ unique: true }) }),
      expect.objectContaining({ collection: "game_weekly_rankings", keys: { gameId: 1, walletNormalized: 1, periodStart: -1, _id: -1 } }),
      expect.objectContaining({ collection: "weekly_ranking_runtime_runs", keys: { expiresAt: 1 }, options: expect.objectContaining({ expireAfterSeconds: 0 }) }),
    ]));
  });
});
