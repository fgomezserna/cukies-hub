jest.mock("@/lib/indexer-db/mongodb", () => ({ getEconomyDb: jest.fn() }));

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import { treasureHuntResultEligibility } from "@/lib/uki-economy/game-economy/treasure-hunt-policy";
import {
  classifyTreasureHuntWeeklyLeaderboard,
  getTreasureHuntWeeklyOverview,
} from "@/lib/uki-economy/game-economy/treasure-hunt-weekly-public";

const wallet = "0x1111111111111111111111111111111111111111";

function mockPublicDb(weeklyRows: unknown[], participantRows: unknown[] = []) {
  const calls: Array<{ operation: string; filter?: Record<string, unknown> }> = [];
  const db = {
    collection: jest.fn((name: string) => {
      const rowsFor = (filter: Record<string, unknown>) => {
        if (name === "presale_game_participants") {
          const wallets = (filter.walletAddress as { $in?: unknown[] } | undefined)?.$in;
          if (!Array.isArray(wallets)) return [];
          return participantRows.filter((row) => {
            if (!row || typeof row !== "object") return false;
            const walletAddress = (row as { walletAddress?: unknown }).walletAddress;
            return typeof walletAddress === "string" && wallets.includes(walletAddress);
          });
        }
        if (name !== "treasure_hunt_weekly_bests") return [];
        return weeklyRows.filter((row) => {
          if (!row || typeof row !== "object") return false;
          const value = row as Record<string, unknown>;
          if (value.weeklyPeriodId !== filter.weeklyPeriodId || value.gameId !== filter.gameId) return false;
          const sourceFilter = filter.creditSource as { $in?: unknown[] } | undefined;
          return Array.isArray(sourceFilter?.$in) && sourceFilter.$in.includes(value.creditSource);
        });
      };
      const cursorFor = (rows: unknown[]) => ({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(rows),
      });
      return {
        find: jest.fn((filter: Record<string, unknown>) => {
          calls.push({ operation: `${name}.find`, filter });
          return cursorFor(rowsFor(filter));
        }),
        countDocuments: jest.fn((filter: Record<string, unknown>) => {
          calls.push({ operation: `${name}.countDocuments`, filter });
          return Promise.resolve(rowsFor(filter).length);
        }),
        findOne: jest.fn().mockResolvedValue(null),
      };
    }),
  };
  (getEconomyDb as jest.Mock).mockResolvedValue(db);
  return { db, calls };
}

describe("Treasure Hunt weekly public overview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("publica partidas OWN y POOL y excluye fuentes sin origen valido", async () => {
    const base = {
      walletNormalized: wallet,
      weeklyPeriodId: "th-week:2026-08-17T14:00:00.000Z",
      gameId: "treasure-hunt",
      achievedAt: new Date("2026-08-20T10:00:00.000Z"),
      winningGameId: "session-own",
      authorityGameSessionId: "authority-own",
      creditReservationId: "credit-own",
      cukieAssignmentId: "cukie-own",
      cukieAssetId: "asset-own",
      revision: 0,
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
      updatedAt: new Date("2026-08-20T10:00:00.000Z"),
    };
    const { calls } = mockPublicDb([
      { ...base, _id: "weekly-own", scoreRaw: "900", scoreDigits: 3, creditSource: "own", cukieSource: "own" },
      { ...base, _id: "weekly-pool", scoreRaw: "800", scoreDigits: 3, creditSource: "pool", cukieSource: "pool" },
      { ...base, _id: "weekly-legacy", scoreRaw: "9999", scoreDigits: 4, cukieSource: "pool" },
    ]);

    const overview = await getTreasureHuntWeeklyOverview({
      now: new Date("2026-08-20T12:00:00.000Z"),
      pageSize: 20,
    });

    expect(overview.entries.map((entry) => entry.scoreRaw)).toEqual(["900", "800"]);
    const rankingCalls = calls.filter(({ operation }) =>
      operation.startsWith("treasure_hunt_weekly_bests.")
    );
    expect(rankingCalls).toHaveLength(3);
    for (const call of rankingCalls) {
      expect(call.filter?.creditSource).toEqual({ $in: ["own", "pool"] });
    }
  });

  it("mantiene el alias historico hasta que exista un alias semanal explicito", async () => {
    const base = {
      walletNormalized: wallet,
      weeklyPeriodId: "th-week:2026-08-17T14:00:00.000Z",
      gameId: "treasure-hunt",
      scoreRaw: "900",
      scoreDigits: 3,
      creditSource: "own" as const,
      cukieSource: "own" as const,
      achievedAt: new Date("2026-08-20T10:00:00.000Z"),
      winningGameId: "session-own",
      authorityGameSessionId: "authority-own",
      creditReservationId: "credit-own",
      cukieAssignmentId: "cukie-own",
      cukieAssetId: "asset-own",
      revision: 0,
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
      updatedAt: new Date("2026-08-20T10:00:00.000Z"),
    };
    const legacyParticipant = {
      campaignId: "uki-staking-testnet-2026-08",
      walletAddress: wallet,
      alias: "LegacyRunner",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };

    mockPublicDb([base], [legacyParticipant]);
    const fallbackOverview = await getTreasureHuntWeeklyOverview({
      now: new Date("2026-08-20T12:00:00.000Z"),
      pageSize: 20,
    });
    expect(fallbackOverview.entries[0]?.alias).toBe("LegacyRunner");

    mockPublicDb([base], [
      legacyParticipant,
      {
        campaignId: "treasure-hunt-weekly",
        walletAddress: wallet,
        alias: "GeneratedWeekly",
        updatedAt: "2026-08-20T13:00:00.000Z",
      },
    ]);
    const generatedWeeklyOverview = await getTreasureHuntWeeklyOverview({
      now: new Date("2026-08-20T12:00:00.000Z"),
      pageSize: 20,
    });
    expect(generatedWeeklyOverview.entries[0]?.alias).toBe("LegacyRunner");

    mockPublicDb([base], [
      legacyParticipant,
      {
        campaignId: "treasure-hunt-weekly",
        walletAddress: wallet,
        alias: "WeeklyRunner",
        aliasChangedAt: "2026-08-20T12:00:00.000Z",
        updatedAt: "2026-08-20T11:00:00.000Z",
      },
    ]);
    const explicitWeeklyOverview = await getTreasureHuntWeeklyOverview({
      now: new Date("2026-08-20T12:00:00.000Z"),
      pageSize: 20,
    });
    expect(explicitWeeklyOverview.entries[0]?.alias).toBe("WeeklyRunner");
  });

  it("considera cubierta una partida reciente inferior a la mejor marca", () => {
    expect(classifyTreasureHuntWeeklyLeaderboard({
      status: "settled",
      gameEconomySessionId: "session-lower",
      scoreRaw: "800",
      achievedAt: new Date("2026-08-20T11:00:00.000Z"),
      weeklyBest: {
        winningGameId: "session-best",
        scoreRaw: "900",
        achievedAt: new Date("2026-08-20T10:00:00.000Z"),
      },
    })).toBe("covered_by_better");
  });

  it("considera cubierta una partida empatada posterior", () => {
    expect(classifyTreasureHuntWeeklyLeaderboard({
      status: "settled",
      gameEconomySessionId: "session-later-tie",
      scoreRaw: "900",
      achievedAt: new Date("2026-08-20T11:00:00.000Z"),
      weeklyBest: {
        winningGameId: "session-earlier-tie",
        scoreRaw: "900",
        achievedAt: new Date("2026-08-20T10:00:00.000Z"),
      },
    })).toBe("covered_by_better");
  });

  it("deja pendiente una nueva mejor marca sin proyección", () => {
    expect(classifyTreasureHuntWeeklyLeaderboard({
      status: "settled",
      gameEconomySessionId: "session-new-best",
      scoreRaw: "117",
      achievedAt: new Date("2026-09-10T12:00:00.000Z"),
      weeklyBest: null,
    })).toBe("pending");
  });

  it("mantiene pendiente una partida OWN histórica sin weekly best", () => {
    expect(treasureHuntResultEligibility({
      status: "settled",
      creditSource: "own",
    }).leaderboardEligible).toBe(true);
    expect(classifyTreasureHuntWeeklyLeaderboard({
      status: "settled",
      gameEconomySessionId: "session-own-historical",
      scoreRaw: "43",
      achievedAt: new Date("2026-09-08T13:00:00.000Z"),
      weeklyBest: null,
    })).toBe("pending");
  });
});
