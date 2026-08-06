import { validateRewardEmissionBudgetEvent } from "@/lib/uki-economy/rewards/emission-budget";
import { RewardAllocationService } from "@/lib/uki-economy/rewards/service";
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from "@/lib/uki-economy/rewards/testing";
import type {
  RewardAllocationSetInput,
  RewardEmissionBudgetConfig,
  RewardRule,
} from "@/lib/uki-economy/rewards/types";

const PLAYER = `0x${"a".repeat(40)}`;

function ruleWithBudget(
  overrides: Partial<RewardEmissionBudgetConfig> = {},
  ruleOverrides: Partial<RewardRule> = {},
) {
  const base = testRewardRule();
  return testRewardRule({
    ...ruleOverrides,
    emissionBudget: {
      ...base.emissionBudget,
      lateReservationGraceSeconds: 0,
      ...overrides,
    },
  });
}

function allocationInput(input: {
  rule: RewardRule;
  sourceId: string;
  amountRaw: string;
  ruleEffectiveAt: Date;
  now?: Date;
  periodId?: string;
}): RewardAllocationSetInput {
  return {
    periodId: input.periodId ?? "2026-W28",
    sourceId: input.sourceId,
    sourceTotalRaw: input.amountRaw,
    expectedRuleVersion: input.rule.version,
    ruleEffectiveAt: input.ruleEffectiveAt,
    allocations: [{
      walletNormalized: PLAYER,
      category: "player",
      amountRaw: input.amountRaw,
    }],
    accruals: [],
    calculation: {
      jobRunId: `budget-job:${input.sourceId}`,
      kind: "system",
      inputHash: "a".repeat(64),
      outputHash: "b".repeat(64),
    },
    now: input.now ?? input.ruleEffectiveAt,
  };
}

function subject(rule: RewardRule) {
  const repository = new MemoryRewardRepository(rule);
  const service = new RewardAllocationService(
    createMemoryRewardTransactionRunner(repository),
  );
  return { repository, service };
}

describe("reward emission budget", () => {
  it("serializa dos workers y nunca sobrepasa el maximo diario", async () => {
    const rule = ruleWithBudget({ dailyCapRaw: "100", lifetimeCapRaw: "1000" });
    const { repository, service } = subject(rule);
    const at = new Date("2026-07-10T12:00:00.000Z");

    const [first, second] = await Promise.all([
      service.persistAllocationSet(allocationInput({
        rule,
        sourceId: "game-a:session-1",
        amountRaw: "60",
        ruleEffectiveAt: at,
      })),
      service.persistAllocationSet(allocationInput({
        rule,
        sourceId: "game-b:session-1",
        amountRaw: "50",
        ruleEffectiveAt: at,
      })),
    ]);

    expect(first).toMatchObject({ status: "allocated", replayed: false });
    expect(second).toMatchObject({
      status: "budget_blocked",
      replayed: false,
      emissionBudgetEvent: {
        reason: "DAILY_CAP_EXCEEDED",
        previousDailyRaw: "60",
        resultingDailyRaw: "60",
      },
    });
    expect(repository.state.emissionBudgetDays[0].reservedRaw).toBe("60");
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe("60");
    expect(repository.state.sourceManifests).toHaveLength(1);
    expect(repository.state.emissionBudgetEvents).toHaveLength(2);
    expect(repository.state.emissionBudgetEvents.every(
      validateRewardEmissionBudgetEvent,
    )).toBe(true);
  });

  it("un replay reservado no vuelve a consumir saldo", async () => {
    const rule = ruleWithBudget({ dailyCapRaw: "100", lifetimeCapRaw: "1000" });
    const { repository, service } = subject(rule);
    const input = allocationInput({
      rule,
      sourceId: "game-a:replay",
      amountRaw: "60",
      ruleEffectiveAt: new Date("2026-07-10T12:00:00.000Z"),
    });

    await service.persistAllocationSet(input);
    const replay = await service.persistAllocationSet({
      ...input,
      now: new Date("2026-07-12T12:00:00.000Z"),
    });

    expect(replay).toMatchObject({ status: "allocated", replayed: true });
    expect(repository.state.emissionBudgetEvents).toHaveLength(1);
    expect(repository.state.emissionBudgetDays[0].reservedRaw).toBe("60");
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe("60");
  });

  it("hace replay de un exceso sin reservar ni materializar rewards", async () => {
    const rule = ruleWithBudget({ dailyCapRaw: "50", lifetimeCapRaw: "1000" });
    const { repository, service } = subject(rule);
    const input = allocationInput({
      rule,
      sourceId: "game-a:blocked-replay",
      amountRaw: "60",
      ruleEffectiveAt: new Date("2026-07-10T12:00:00.000Z"),
    });

    const first = await service.persistAllocationSet(input);
    const replay = await service.persistAllocationSet(input);

    expect(first).toMatchObject({ status: "budget_blocked", replayed: false });
    expect(replay).toMatchObject({ status: "budget_blocked", replayed: true });
    expect(repository.state.emissionBudgetEvents).toHaveLength(1);
    expect(repository.state.emissionBudgetDays).toHaveLength(0);
    expect(repository.state.emissionBudgetStates).toHaveLength(0);
    expect(repository.state.allocations).toHaveLength(0);
    expect(repository.state.accruals).toHaveLength(0);
  });

  it("reinicia solo el saldo diario en el rollover UTC", async () => {
    const rule = ruleWithBudget({ dailyCapRaw: "100", lifetimeCapRaw: "1000" });
    const { repository, service } = subject(rule);

    await service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-a:before-midnight",
      amountRaw: "75",
      ruleEffectiveAt: new Date("2026-07-10T23:59:59.000Z"),
    }));
    await service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-b:after-midnight",
      amountRaw: "75",
      ruleEffectiveAt: new Date("2026-07-11T00:00:00.000Z"),
      periodId: "2026-W29",
    }));

    expect(repository.state.emissionBudgetDays.map((day) => ({
      dayId: day.dayId,
      reservedRaw: day.reservedRaw,
    }))).toEqual([
      { dayId: "2026-07-10T00:00:00.000Z", reservedRaw: "75" },
      { dayId: "2026-07-11T00:00:00.000Z", reservedRaw: "75" },
    ]);
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe("150");
  });

  it("bloquea el techo acumulado aunque el nuevo dia tenga capacidad", async () => {
    const rule = ruleWithBudget({ dailyCapRaw: "100", lifetimeCapRaw: "100" });
    const { repository, service } = subject(rule);

    await service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-a:lifetime-1",
      amountRaw: "60",
      ruleEffectiveAt: new Date("2026-07-10T12:00:00.000Z"),
    }));
    const blocked = await service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-b:lifetime-2",
      amountRaw: "50",
      ruleEffectiveAt: new Date("2026-07-11T12:00:00.000Z"),
      periodId: "2026-W29",
    }));

    expect(blocked).toMatchObject({
      status: "budget_blocked",
      emissionBudgetEvent: {
        reason: "LIFETIME_CAP_EXCEEDED",
        previousLifetimeRaw: "60",
        resultingLifetimeRaw: "60",
      },
    });
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe("60");
    expect(repository.state.emissionBudgetDays).toHaveLength(1);
  });

  it("sella implicitamente el dia al vencer la ventana de reserva", async () => {
    const rule = ruleWithBudget({ dailyCapRaw: "100", lifetimeCapRaw: "1000" });
    const { repository, service } = subject(rule);
    const result = await service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-a:late",
      amountRaw: "10",
      ruleEffectiveAt: new Date("2026-07-10T12:00:00.000Z"),
      now: new Date("2026-07-11T00:00:00.000Z"),
    }));

    expect(result).toMatchObject({
      status: "budget_blocked",
      emissionBudgetEvent: { reason: "DAY_CLOSED" },
    });
    expect(repository.state.emissionBudgetStates).toHaveLength(0);
    expect(repository.state.emissionBudgetDays).toHaveLength(0);
  });

  it("bloquea fuentes anteriores al inicio versionado del programa", async () => {
    const rule = ruleWithBudget({
      programStartsAt: new Date("2026-07-15T00:00:00.000Z"),
      dailyCapRaw: "100",
      lifetimeCapRaw: "1000",
    });
    const { repository, service } = subject(rule);
    const result = await service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-a:before-program",
      amountRaw: "10",
      ruleEffectiveAt: new Date("2026-07-14T23:59:59.000Z"),
    }));

    expect(result).toMatchObject({
      status: "budget_blocked",
      emissionBudgetEvent: { reason: "PROGRAM_NOT_STARTED" },
    });
    expect(repository.state.emissionBudgetStates).toHaveLength(0);
    expect(repository.state.emissionBudgetDays).toHaveLength(0);
  });

  it("falla cerrado si falta la configuracion de presupuesto", async () => {
    const rule = testRewardRule({ emissionBudget: undefined as never });
    const { repository, service } = subject(rule);

    await expect(service.persistAllocationSet(allocationInput({
      rule,
      sourceId: "game-a:no-config",
      amountRaw: "10",
      ruleEffectiveAt: new Date("2026-07-10T12:00:00.000Z"),
    }))).rejects.toThrow(/emissionBudget es obligatorio/);
    expect(repository.state.emissionBudgetEvents).toHaveLength(0);
    expect(repository.state.allocations).toHaveLength(0);
  });

  it("acepta nuevos caps versionados pero no permite reiniciar el calendario global", async () => {
    const firstRule = ruleWithBudget(
      { dailyCapRaw: "100", lifetimeCapRaw: "1000" },
      { activeUntil: new Date("2026-07-11T00:00:00.000Z") },
    );
    const { repository, service } = subject(firstRule);
    await service.persistAllocationSet(allocationInput({
      rule: firstRule,
      sourceId: "game-a:rule-v1",
      amountRaw: "50",
      ruleEffectiveAt: new Date("2026-07-10T12:00:00.000Z"),
    }));

    const secondRule = ruleWithBudget(
      { dailyCapRaw: "200", lifetimeCapRaw: "1000" },
      {
        _id: "reward-allocations:v2",
        version: "rewards-v2",
        activeFrom: new Date("2026-07-11T00:00:00.000Z"),
      },
    );
    repository.state.rules.push(secondRule);
    await expect(service.persistAllocationSet(allocationInput({
      rule: secondRule,
      sourceId: "game-b:rule-v2",
      amountRaw: "150",
      ruleEffectiveAt: new Date("2026-07-11T12:00:00.000Z"),
      periodId: "2026-W29",
    }))).resolves.toMatchObject({
      status: "allocated",
      emissionBudgetEvent: { ruleVersion: "rewards-v2", dailyCapRaw: "200" },
    });
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe("200");

    const unsafeCapRule = ruleWithBudget(
      {
        dailyCapRaw: "200",
        lifetimeCapRaw: "1200",
      },
      {
        _id: "reward-allocations:v3",
        version: "rewards-v3",
        activeFrom: new Date("2026-07-12T00:00:00.000Z"),
      },
    );
    repository.state.rules.push(unsafeCapRule);
    await expect(service.persistAllocationSet(allocationInput({
      rule: unsafeCapRule,
      sourceId: "game-c:unsafe-lifetime-cap",
      amountRaw: "10",
      ruleEffectiveAt: new Date("2026-07-12T12:00:00.000Z"),
      periodId: "2026-W29",
    }))).rejects.toThrow(/no pueden cambiar tras iniciar el ledger/);

    const unsafeCalendarRule = ruleWithBudget(
      {
        dailyCapRaw: "200",
        lifetimeCapRaw: "1000",
        dayBoundarySecondUtc: 3_600,
      },
      {
        _id: "reward-allocations:v4",
        version: "rewards-v4",
        activeFrom: new Date("2026-07-12T00:00:00.000Z"),
      },
    );
    repository.state.rules.push(unsafeCalendarRule);
    await expect(service.persistAllocationSet(allocationInput({
      rule: unsafeCalendarRule,
      sourceId: "game-d:unsafe-calendar-reset",
      amountRaw: "10",
      ruleEffectiveAt: new Date("2026-07-12T12:00:00.000Z"),
      periodId: "2026-W29",
    }))).rejects.toThrow(/no pueden cambiar tras iniciar el ledger/);
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe("200");
  });
});
