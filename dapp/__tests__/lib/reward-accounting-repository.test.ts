import type { ClientSession, Db } from "mongodb";

import { createMongoRewardAccountingRepository } from "@/lib/uki-economy/rewards/accounting-repository";

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
    )).resolves.toBe("2026-08-21");
  });

  it("empieza en la fecha activa de la regla cuando solo existen canaries", async () => {
    const repository = createRepository([
      { dayId: "canary", ruleVersion: "staging-test-v4", status: "sealed" },
      { dayId: "canary:wallet", ruleVersion: "staging-test-v4", status: "sealed" },
    ]);

    await expect(repository.findNextClosableRewardDay(
      "staging-test-v4",
      new Date("2026-08-21T16:00:00.000Z"),
    )).resolves.toBe("2026-08-20");
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
      project: jest.fn(() => ({ toArray: jest.fn(async () => []) })),
    }));
    const db = {
      collection: jest.fn((name: string) => {
        if (name === "credit_pool_positions") return { aggregate };
        if (name === "presale_participants") return { find: referralFind };
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
});
