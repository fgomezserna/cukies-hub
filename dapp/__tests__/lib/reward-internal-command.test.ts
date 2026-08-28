import { parseRewardInternalCommand } from "@/lib/uki-economy/rewards/internal-command";
import { buildRewardRuleConfigHash } from "@/lib/uki-economy/rewards/rules";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";

function persistRuleCommand() {
  const rule = testRewardRule();
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = rule;
  return {
    rule,
    rawBody: Buffer.from(JSON.stringify({ command: "persist_rule", payload })),
  };
}

describe("reward internal command", () => {
  it("parsea sin perdida el presupuesto, el 75/20/5 y los seis tramos acumulativos", () => {
    const { rule, rawBody } = persistRuleCommand();
    const command = parseRewardInternalCommand(rawBody);

    expect(command.command).toBe("persist_rule");
    if (command.command !== "persist_rule") throw new Error("expected persist_rule");
    expect(command.payload.runCredits).toEqual({
      unitScale: 10,
      totalUnits: 100,
      weeklyReserveUnits: 20,
      ambassadorReserveUnits: 5,
      convertibleUnits: 75,
    });
    expect(command.payload.cukiePool.cumulativeTierBps).toEqual([
      4_500,
      2_000,
      1_500,
      1_200,
      700,
      100,
    ]);
    expect(command.payload.emissionBudget).toMatchObject({
      programStartsAt: rule.emissionBudget.programStartsAt,
      dayBoundarySecondUtc: 14 * 60 * 60,
      lateReservationGraceSeconds: 86_400,
      unusedDailyCapacity: "expires",
      overflowPolicy: "block",
    });
  });

  it("incluye los nuevos campos anidados en el configHash", () => {
    const rule = testRewardRule();
    const baseline = buildRewardRuleConfigHash(rule);

    expect(buildRewardRuleConfigHash({
      ...rule,
      runCredits: { ...rule.runCredits, ambassadorReserveUnits: 6 },
    })).not.toBe(baseline);
    expect(buildRewardRuleConfigHash({
      ...rule,
      cukiePool: {
        ...rule.cukiePool,
        cumulativeTierBps: [4_400, 2_100, 1_500, 1_200, 700, 100],
      },
    })).not.toBe(baseline);
    expect(buildRewardRuleConfigHash({
      ...rule,
      emissionBudget: { ...rule.emissionBudget, dailyCapRaw: "999" },
    })).not.toBe(baseline);
  });

  it("rechaza campos legacy no permitidos en la configuracion", () => {
    const { rawBody } = persistRuleCommand();
    const envelope = JSON.parse(rawBody.toString("utf8"));
    envelope.payload.destinations.undistributedCarry = `0x${"f".repeat(40)}`;

    expect(() => parseRewardInternalCommand(Buffer.from(JSON.stringify(envelope))))
      .toThrow(/campos no permitidos: undistributedCarry/);
  });

  it("rechaza una regla interna sin presupuesto de emision", () => {
    const { rawBody } = persistRuleCommand();
    const envelope = JSON.parse(rawBody.toString("utf8"));
    delete envelope.payload.emissionBudget;

    expect(() => parseRewardInternalCommand(Buffer.from(JSON.stringify(envelope))))
      .toThrow(/emissionBudget debe ser un objeto/);
  });
});
