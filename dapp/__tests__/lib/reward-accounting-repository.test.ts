import type { ClientSession, Db } from "mongodb";

import { createMongoRewardAccountingRepository } from "@/lib/uki-economy/rewards/accounting-repository";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";
import type {
  RewardEmissionBudgetDay,
  RewardEmissionBudgetState,
} from "@/lib/uki-economy/rewards/types";
import type {
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
