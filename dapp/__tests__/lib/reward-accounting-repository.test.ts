import type { ClientSession, Db } from "mongodb";

import { createMongoRewardAccountingRepository } from "@/lib/uki-economy/rewards/accounting-repository";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";
import type {
  RewardEmissionBudgetDay,
  RewardEmissionBudgetState,
} from "@/lib/uki-economy/rewards/types";
import type {
  DailyRewardAccounting,
  RewardDailyCapacityMaterialization,
} from "@/lib/uki-economy/rewards/accounting-types";

type RewardDayRow = {
  dayId: string;
  ruleVersion: string;
  status: "sealed";
};

function matchesFilter(row: RewardDayRow, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([field, expected]) => {
    const actual = row[field as keyof RewardDayRow];
    if (expected && typeof expected === "object" && "$regex" in expected) {
      const pattern = (expected as { $regex: RegExp }).$regex;
      return pattern.test(String(actual));
    }
    return actual === expected;
  });
}

function createRepository(rows: RewardDayRow[]) {
  const rule = {
    scope: "reward_allocations",
    version: "staging-test-v4",
    activeFrom: new Date("2026-08-20T14:00:00.000Z"),
    emissionBudget: {
      programStartsAt: new Date("2026-08-20T14:00:00.000Z"),
      dayBoundarySecondUtc: 14 * 60 * 60,
      lateReservationGraceSeconds: 86_400,
    },
  };
  const collections = new Map<string, object>();
  collections.set("economy_rule_versions", {
    findOne: jest.fn(async () => rule),
  });
  collections.set("reward_daily_accounting", {
    findOne: jest.fn(async (filter: Record<string, unknown>) => {
      return rows
        .filter((row) => matchesFilter(row, filter))
        .sort((left, right) => right.dayId.localeCompare(left.dayId))[0] ?? null;
    }),
  });
  const db = {
    collection: jest.fn((name: string) => collections.get(name) ?? {}),
  } as unknown as Db;

  return createMongoRewardAccountingRepository(db, {} as ClientSession);
}

describe("Mongo reward accounting repository", () => {
  it("ignora canaries y cierres de otras reglas al elegir el siguiente dia", async () => {
    const repository = createRepository([
      { dayId: "2026-08-20", ruleVersion: "staging-test-v4", status: "sealed" },
      { dayId: "2026-08-28", ruleVersion: "staging-test-v3", status: "sealed" },
      { dayId: "canary", ruleVersion: "staging-test-v4", status: "sealed" },
      { dayId: "canary:0x0000000000000000000000000000000000000001", ruleVersion: "staging-test-v4", status: "sealed" },
    ]);

    await expect(repository.findNextClosableRewardDay(
      "staging-test-v4",
      new Date("2026-08-22T16:00:00.000Z"),
    )).resolves.toEqual({
      dayId: "2026-08-21",
      startsAt: new Date("2026-08-21T14:00:00.000Z"),
    });
  });

  it("empieza en la fecha activa de la regla cuando solo existen canaries", async () => {
    const repository = createRepository([
      { dayId: "canary", ruleVersion: "staging-test-v4", status: "sealed" },
      { dayId: "canary:wallet", ruleVersion: "staging-test-v4", status: "sealed" },
    ]);

    await expect(repository.findNextClosableRewardDay(
      "staging-test-v4",
      new Date("2026-08-21T16:00:00.000Z"),
    )).resolves.toEqual({
      dayId: "2026-08-20",
      startsAt: new Date("2026-08-20T14:00:00.000Z"),
    });
  });

  it("falla de forma visible ante un dayId con forma ISO pero fecha imposible", async () => {
    const repository = createRepository([
      { dayId: "2026-99-99", ruleVersion: "staging-test-v4", status: "sealed" },
    ]);

    await expect(repository.findNextClosableRewardDay(
      "staging-test-v4",
      new Date("2027-01-01T00:00:00.000Z"),
    )).rejects.toThrow(/dayId no canonico/);
  });

  it("conserva al aportante del periodo sin revalidar su estado actual de Cukie Master", async () => {
    const contributor = "0x1111111111111111111111111111111111111111";
    const aggregate = jest.fn((_pipeline: unknown[]) => ({
      toArray: jest.fn(async () => [{ _id: contributor, units: 20 }]),
    }));
    const referralFind = jest.fn(() => ({
      toArray: jest.fn(async () => []),
    }));
    const attributionFind = jest.fn(() => ({ toArray: jest.fn(async () => []) }));
    const db = {
      collection: jest.fn((name: string) => {
        if (name === "credit_pool_positions") return { aggregate };
        if (name === "presale_participants") return { find: referralFind };
        if (name === "ambassador_attributions") return { find: attributionFind };
        return {};
      }),
    } as unknown as Db;
    const repository = createMongoRewardAccountingRepository(db, {} as ClientSession);

    await expect(repository.listCreditContributors(
      new Date("2026-08-20T14:00:00.000Z"),
    )).resolves.toEqual([{
      walletNormalized: contributor,
      units: 20,
      ambassadorWalletNormalized: null,
    }]);

    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline).toEqual(expect.arrayContaining([
      { $match: { status: "open", periodId: { $regex: "2026-08-20T14:00:00\\.000Z$" } } },
      { $group: { _id: "$walletNormalized", units: { $sum: "$credits" } } },
    ]));
    expect(JSON.stringify(pipeline)).not.toMatch(/cukie.?master|entitlement/i);
  });

  it("conserva snapshots ambassador distintos por partida durante el mismo dia", async () => {
    const player = "0x1111111111111111111111111111111111111111";
    const ambassador = "0x2222222222222222222222222222222222222222";
    const toArray = jest.fn(async () => [
      {
        sessionId: "before-attribution",
        wallet: player,
        ambassadorSnapshot: { walletNormalized: null },
      },
      {
        sessionId: "after-attribution",
        wallet: player,
        ambassadorSnapshot: { walletNormalized: ambassador },
      },
    ]);
    const project = jest.fn(() => ({ toArray }));
    const find = jest.fn(() => ({ project }));
    const db = {
      collection: jest.fn((name: string) => (
        name === "reward_weekly_game_sources" ? { find } : {}
      )),
    } as unknown as Db;
    const repository = createMongoRewardAccountingRepository(db, {} as ClientSession);
    const startsAt = new Date("2026-08-20T14:00:00.000Z");
    const endsAt = new Date("2026-08-21T14:00:00.000Z");

    await expect(repository.listDailyAmbassadorSnapshots(startsAt, endsAt))
      .resolves.toEqual({
        "game-session:before-attribution": {
          walletNormalized: player,
          ambassadorWalletNormalized: null,
        },
        "game-session:after-attribution": {
          walletNormalized: player,
          ambassadorWalletNormalized: ambassador,
        },
      });
    expect(find).toHaveBeenCalledWith({
      status: "settled",
      outcome: "completed",
      resultValid: true,
      periodAnchorAt: { $gte: startsAt, $lt: endsAt },
    }, { session: {} });
    expect(project).toHaveBeenCalledWith({
      _id: 0,
      sessionId: 1,
      wallet: 1,
      ambassadorSnapshot: 1,
    });
  });

  it("hace disponible la comision en el mismo cierre diario que el pago referido", async () => {
    const player = "0x1111111111111111111111111111111111111111";
    const ambassador = "0x2222222222222222222222222222222222222222";
    const sealedAt = new Date("2026-08-21T16:00:00.000Z");
    const insertOne = jest.fn(async (_accounting: DailyRewardAccounting) => ({ acknowledged: true }));
    const insertMany = jest.fn(async (_documents: unknown[]) => ({ acknowledged: true }));
    const db = {
      collection: jest.fn((name: string) => {
        if (name === "reward_daily_accounting") return { insertOne };
        if (name === "reward_accounting_allocations") return { insertMany };
        return {};
      }),
    } as unknown as Db;
    const repository = createMongoRewardAccountingRepository(db, {} as ClientSession);
    const accounting = {
      _id: "reward-daily:2026-08-20",
      dayId: "2026-08-20",
      ruleVersion: "rewards-staging-test-v4",
      ruleConfigHash: "a".repeat(64),
      sourceIds: ["game-session:after-attribution"],
      sourceSetHash: "b".repeat(64),
      sourceReservedRaw: "100",
      capacityMaterializedRaw: "0",
      priorReservedInflowRaw: "0",
      topupRaw: "0",
      emissionRaw: "100",
      buckets: {
        playersRaw: "95",
        creditPoolRaw: "0",
        cukiePoolRaw: "0",
        ambassadorOrdinaryRaw: "5",
        weeklyPrizeRaw: "0",
        ambassadorWeeklyRaw: "0",
      },
      undistributed: {
        totalRaw: "0",
        treasuryRaw: "0",
        marketingDevelopmentRaw: "0",
        supplyReductionRaw: "0",
      },
      priorReservedUndistributed: {
        totalRaw: "0",
        treasuryRaw: "0",
        marketingDevelopmentRaw: "0",
        supplyReductionRaw: "0",
      },
      destinations: {
        treasury: "0x9000000000000000000000000000000000000001",
        marketingDevelopment: "0x9000000000000000000000000000000000000002",
        supplyReduction: "0x9000000000000000000000000000000000000003",
      },
      allocations: [
        {
          allocationId: "player-allocation",
          walletNormalized: player,
          category: "player",
          amountRaw: "95",
          fundingMode: "daily_emission",
          sourceIds: ["game-session:after-attribution"],
        },
        {
          allocationId: "ambassador-allocation",
          walletNormalized: ambassador,
          category: "ambassador_ordinary",
          amountRaw: "5",
          fundingMode: "daily_emission",
          sourceIds: ["game-session:after-attribution"],
        },
      ],
      conservationRaw: "100",
      payloadHash: "c".repeat(64),
      status: "sealed",
      sealedAt,
    } satisfies DailyRewardAccounting;

    await repository.insertDaily(accounting);

    expect(insertOne).toHaveBeenCalledWith(accounting, { session: {} });
    const documents = insertMany.mock.calls[0]?.[0];
    expect(documents).toHaveLength(2);
    expect(documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        walletNormalized: player,
        category: "player",
        availableAt: sealedAt,
        createdAt: sealedAt,
      }),
      expect.objectContaining({
        walletNormalized: ambassador,
        category: "ambassador_ordinary",
        availableAt: sealedAt,
        createdAt: sealedAt,
      }),
    ]));
  });

  it("materializa el cap de 600000 de la regla y hace replay sin consumirlo dos veces", async () => {
    let capacity: RewardDailyCapacityMaterialization | null = null;
    let day: RewardEmissionBudgetDay | null = null;
    let state: RewardEmissionBudgetState | null = null;
    const collections = new Map<string, object>([
      ["reward_daily_accounting", {}],
      ["reward_weekly_prize_accounting", {}],
      ["reward_daily_capacity_materializations", {
        findOne: jest.fn(async () => capacity),
        insertOne: jest.fn(async (value: RewardDailyCapacityMaterialization) => {
          capacity = value;
          return { acknowledged: true, insertedId: value._id };
        }),
      }],
      ["reward_emission_budget_days", {
        findOne: jest.fn(async () => day),
        insertOne: jest.fn(async (value: RewardEmissionBudgetDay) => {
          day = value;
          return { acknowledged: true, insertedId: value._id };
        }),
        replaceOne: jest.fn(async () => ({ acknowledged: true, matchedCount: 1 })),
      }],
      ["reward_emission_budget_state", {
        findOne: jest.fn(async () => state),
        insertOne: jest.fn(async (value: RewardEmissionBudgetState) => {
          state = value;
          return { acknowledged: true, insertedId: value._id };
        }),
        replaceOne: jest.fn(async () => ({ acknowledged: true, matchedCount: 1 })),
      }],
    ]);
    const db = {
      collection: jest.fn((name: string) => collections.get(name) ?? {}),
    } as unknown as Db;
    const repository = createMongoRewardAccountingRepository(db, {} as ClientSession);
    const base = testRewardRule();
    const rule = testRewardRule({
      _id: "reward-allocations:v600k",
      version: "rewards-v600k",
      activeFrom: new Date("2026-08-20T14:00:00.000Z"),
      emissionBudget: {
        ...base.emissionBudget,
        programStartsAt: new Date("2026-08-20T14:00:00.000Z"),
        dailyCapRaw: "600000000000000000000000",
        lifetimeCapRaw: "450000000000000000000000000",
        unusedDailyCapacity: "materialize_undistributed",
      },
    });
    const input = {
      dayId: "2026-08-20",
      startsAt: new Date("2026-08-20T14:00:00.000Z"),
      rule,
      now: new Date("2026-08-21T16:00:00.000Z"),
    };

    const first = await repository.materializeDailyCapacity(input);
    const replay = await repository.materializeDailyCapacity(input);

    expect(first).toMatchObject({
      capacityMaterializedRaw: "600000000000000000000000",
      resultingDailyRaw: "600000000000000000000000",
      resultingLifetimeRaw: "600000000000000000000000",
    });
    expect(replay).toEqual(first);
    expect((day as RewardEmissionBudgetDay | null)?.reservedRaw)
      .toBe("600000000000000000000000");
    expect((state as RewardEmissionBudgetState | null)?.reservedLifetimeRaw)
      .toBe("600000000000000000000000");
  });
});
