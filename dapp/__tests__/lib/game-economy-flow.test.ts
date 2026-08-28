import { createGameEconomyService } from "@/lib/uki-economy/game-economy/service";
import {
  createMemoryGameEconomyPorts,
  createMemoryGameEconomyRunner,
  MemoryGameEconomyRepository,
  testGameEconomyRule,
} from "@/lib/uki-economy/game-economy/testing";
import { buildGameRuleConfigHash } from "@/lib/uki-economy/game-economy/rules";

const WALLET = `0x${"1".repeat(40)}`;
const NOW = new Date("2026-07-10T12:00:00.000Z");
const PAYLOAD_HASH = "a".repeat(64);

function setup() {
  const repository = new MemoryGameEconomyRepository();
  const ports = createMemoryGameEconomyPorts();
  const service = createGameEconomyService(
    createMemoryGameEconomyRunner(repository),
    ports
  );
  return { repository, ports, service };
}

function setupTreasureHunt() {
  const treasureRule = testGameEconomyRule({
    gameId: "treasure-hunt",
    version: "staging-test-v4",
    cukie: {
      required: true,
      consumeOnSettle: true,
      minAssets: 1,
      maxAssets: 1,
      role: "competitor",
      selectionPolicy: "legacy_client_assets_v1",
    },
  });
  const repository = new MemoryGameEconomyRepository({ rules: [treasureRule] });
  const ports = createMemoryGameEconomyPorts();
  const service = createGameEconomyService(
    createMemoryGameEconomyRunner(repository),
    ports,
  );
  return { repository, ports, service };
}

async function createStartedTreasureHunt(
  context: ReturnType<typeof setupTreasureHunt>,
) {
  const ready = await context.service.createSession({
    walletAddress: WALLET,
    gameId: "treasure-hunt",
    cukieAssetIds: ["cukie-1"],
    expectedRuleVersion: "staging-test-v4",
    idempotencyKey: "treasure-create",
    now: NOW,
  });
  return context.service.startSession({
    sessionId: ready.sessionId,
    walletAddress: WALLET,
    idempotencyKey: "treasure-start",
    expectedRevision: ready.revision,
    now: new Date(NOW.getTime() + 1_000),
  });
}

async function createReady(
  context: ReturnType<typeof setup>,
  idempotencyKey = "create-1"
) {
  return context.service.createSession({
    walletAddress: WALLET,
    gameId: "arena",
    cukieAssetIds: ["cukie-1"],
    expectedRuleVersion: "v1",
    idempotencyKey,
    now: NOW,
  });
}

async function createValidated(context: ReturnType<typeof setup>) {
  const ready = await createReady(context);
  const started = await context.service.startSession({
    sessionId: ready.sessionId,
    walletAddress: WALLET,
    idempotencyKey: "start-1",
    expectedRevision: ready.revision,
    now: new Date(NOW.getTime() + 1_000),
  });
  const submitted = await context.service.submitResult({
    sessionId: ready.sessionId,
    walletAddress: WALLET,
    idempotencyKey: "submit-1",
    expectedRevision: started.revision,
    evidenceReference: "run-evidence-1",
    payloadHash: PAYLOAD_HASH,
    now: new Date(NOW.getTime() + 2_000),
  });
  const validated = await context.service.validateResult({
    sessionId: ready.sessionId,
    idempotencyKey: "validate-1",
    expectedRevision: submitted.revision,
    now: new Date(NOW.getTime() + 3_000),
  });
  return { ready, started, submitted, validated };
}

async function createSubmitted(
  context: ReturnType<typeof setup>,
  suffix: string,
  assetId: string
) {
  const ready = await context.service.createSession({
    walletAddress: WALLET,
    gameId: "arena",
    cukieAssetIds: [assetId],
    expectedRuleVersion: "v1",
    idempotencyKey: `create-${suffix}`,
    now: NOW,
  });
  const started = await context.service.startSession({
    sessionId: ready.sessionId,
    walletAddress: WALLET,
    idempotencyKey: `start-${suffix}`,
    expectedRevision: ready.revision,
    now: new Date(NOW.getTime() + 1_000),
  });
  return context.service.submitResult({
    sessionId: ready.sessionId,
    walletAddress: WALLET,
    idempotencyKey: `submit-${suffix}`,
    expectedRevision: started.revision,
    evidenceReference: `evidence-${suffix}`,
    payloadHash: PAYLOAD_HASH,
    now: new Date(NOW.getTime() + 2_000),
  });
}

describe("multi-game economy session saga", () => {
  it("consumes both Treasure Hunt resources on a completed settlement", async () => {
    const context = setupTreasureHunt();
    const started = await createStartedTreasureHunt(context);
    const submitted = await context.service.submitResult({
      sessionId: started.sessionId,
      walletAddress: WALLET,
      evidenceReference: "treasure-evidence-completed",
      payloadHash: "1".repeat(64),
      idempotencyKey: "treasure-submit-completed",
      expectedRevision: started.revision,
      now: new Date(NOW.getTime() + 2_000),
    });
    context.ports.evidence.result = {
      authorization: "server_authorized",
      evidenceId: "treasure-evidence-completed",
      evidenceHash: "e".repeat(64),
      scoreRaw: "100",
    };
    const validated = await context.service.validateResult({
      sessionId: submitted.sessionId,
      idempotencyKey: "treasure-validate-completed",
      expectedRevision: submitted.revision,
      now: new Date(NOW.getTime() + 3_000),
    });
    const settled = await context.service.settleSession({
      sessionId: validated.sessionId,
      idempotencyKey: "treasure-settle-completed",
      expectedRevision: validated.revision,
      now: new Date(NOW.getTime() + 4_000),
    });

    expect(settled).toMatchObject({
      status: "settled",
      settlementIntent: {
        resourceActions: { credit: "consume", cukie: "consume" },
      },
      credit: { state: "consumed" },
      cukie: { state: "consumed" },
    });
  });

  it("consumes both Treasure Hunt resources on voluntary forfeit without entering settled censuses", async () => {
    const context = setupTreasureHunt();
    const started = await createStartedTreasureHunt(context);
    const forfeited = await context.service.forfeitSession({
      sessionId: started.sessionId,
      idempotencyKey: "treasure-forfeit-1",
      reasonCode: "voluntary_exit",
      expectedRevision: started.revision,
      now: new Date(NOW.getTime() + 2_000),
    });

    expect(forfeited).toMatchObject({
      status: "forfeited",
      credit: { state: "consumed" },
      cukie: { state: "consumed" },
      terminal: { reasonCode: "voluntary_exit" },
    });
    expect(forfeited.validation).toBeUndefined();
    expect(forfeited.settlementCommand).toBeUndefined();
    expect(forfeited.settledAt).toBeUndefined();
    expect(context.repository.state.rewardPeriodStates).toEqual([]);
    expect(context.ports.resources.consumed).toEqual(new Set([
      forfeited.credit.reservationId!,
      forfeited.cukie.reservationId!,
    ]));
  });

  it("replays a voluntary forfeit exactly once and rejects a reused key with another reason", async () => {
    const context = setupTreasureHunt();
    const started = await createStartedTreasureHunt(context);
    const first = await context.service.forfeitSession({
      sessionId: started.sessionId,
      idempotencyKey: "treasure-forfeit-replay",
      reasonCode: "voluntary_exit",
      expectedRevision: started.revision,
      now: new Date(NOW.getTime() + 2_000),
    });
    const replay = await context.service.forfeitSession({
      sessionId: started.sessionId,
      idempotencyKey: "treasure-forfeit-replay",
      reasonCode: "voluntary_exit",
      expectedRevision: started.revision,
      now: new Date(NOW.getTime() + 20_000),
    });
    expect(replay).toEqual(first);
    expect(
      context.ports.resources.calls.filter((call) => call.action === "consume"),
    ).toHaveLength(2);
    await expect(context.service.forfeitSession({
      sessionId: started.sessionId,
      idempotencyKey: "treasure-forfeit-replay",
      reasonCode: "different_reason",
      expectedRevision: started.revision,
      now: new Date(NOW.getTime() + 21_000),
    })).rejects.toThrow(/otro payload/);
  });

  it("keeps the Treasure Hunt reward guard on the reservation week across Monday 14:00", async () => {
    const context = setupTreasureHunt();
    const reservedAt = new Date("2026-08-17T13:59:00.000Z");
    const ready = await context.service.createSession({
      walletAddress: WALLET,
      gameId: "treasure-hunt",
      cukieAssetIds: ["cukie-cross-cutoff"],
      expectedRuleVersion: "staging-test-v4",
      idempotencyKey: "treasure-cross-cutoff-create",
      now: reservedAt,
    });
    const started = await context.service.startSession({
      sessionId: ready.sessionId,
      walletAddress: WALLET,
      idempotencyKey: "treasure-cross-cutoff-start",
      expectedRevision: ready.revision,
      now: new Date("2026-08-17T13:59:01.000Z"),
    });
    const submitted = await context.service.submitResult({
      sessionId: ready.sessionId,
      walletAddress: WALLET,
      idempotencyKey: "treasure-cross-cutoff-submit",
      expectedRevision: started.revision,
      evidenceReference: "treasure-cross-cutoff-evidence",
      payloadHash: PAYLOAD_HASH,
      now: new Date("2026-08-17T14:01:00.000Z"),
    });
    const validated = await context.service.validateResult({
      sessionId: ready.sessionId,
      idempotencyKey: "treasure-cross-cutoff-validate",
      expectedRevision: submitted.revision,
      now: new Date("2026-08-17T14:01:01.000Z"),
    });
    await context.service.settleSession({
      sessionId: ready.sessionId,
      idempotencyKey: "treasure-cross-cutoff-settle",
      expectedRevision: validated.revision,
      now: new Date("2026-08-17T14:01:02.000Z"),
    });

    expect(context.repository.state.rewardPeriodStates).toEqual([
      expect.objectContaining({
        periodId: "2026-W33",
        status: "open",
      }),
    ]);
  });

  it("recovers a partial voluntary forfeit without releasing its consumed credit", async () => {
    const context = setupTreasureHunt();
    const started = await createStartedTreasureHunt(context);
    context.ports.resources.fail("cukie", "consume");
    await expect(context.service.forfeitSession({
      sessionId: started.sessionId,
      idempotencyKey: "treasure-forfeit-partial",
      reasonCode: "voluntary_exit",
      expectedRevision: started.revision,
      now: new Date(NOW.getTime() + 2_000),
    })).rejects.toThrow(/port failure/);
    expect(context.repository.state.sessions[0]).toMatchObject({
      status: "started",
      credit: { state: "consumed" },
      cukie: { state: "active" },
      terminalIntent: { status: "forfeited" },
      operation: { kind: "release" },
    });

    const recovered = await context.service.recoverBatch({
      now: new Date(NOW.getTime() + 40_000),
      limit: 10,
    });
    expect(recovered.failures).toEqual([]);
    expect(recovered.sessions).toEqual([
      expect.objectContaining({
        sessionId: started.sessionId,
        status: "forfeited",
        credit: expect.objectContaining({ state: "consumed" }),
        cukie: expect.objectContaining({ state: "consumed" }),
      }),
    ]);
    expect(context.ports.resources.released).toEqual(new Set());
  });

  it("runs the exact state machine and replays every completed request", async () => {
    const context = setup();
    const ready = await createReady(context);
    expect(ready.status).toBe("resources_reserved");
    expect(ready.credit.state).toBe("active");
    expect(ready.cukie.state).toBe("active");

    const replayedCreate = await createReady(context);
    expect(replayedCreate).toEqual(ready);
    expect(
      context.ports.resources.calls.filter((call) => call.action === "reserve")
    ).toHaveLength(2);

    const { started, submitted, validated } = await createValidated({
      ...context,
      service: context.service,
    });
    expect(started.status).toBe("started");
    expect(submitted.status).toBe("submitted");
    expect(validated).toMatchObject({
      status: "validated",
      validation: {
        verifier: "server_authorized",
        scoreRaw: "500",
        cappedScoreRaw: "500",
        weightRaw: "750",
      },
    });

    const settled = await context.service.settleSession({
      sessionId: ready.sessionId,
      idempotencyKey: "settle-1",
      expectedRevision: validated.revision,
      now: new Date(NOW.getTime() + 4_000),
    });
    expect(settled).toMatchObject({
      status: "settled",
      credit: { state: "consumed" },
      cukie: { state: "released" },
    });
    expect(context.repository.state.rewardPeriodStates).toEqual([
      expect.objectContaining({ periodId: "2026-W28", status: "open" }),
    ]);
    const replayedSettle = await context.service.settleSession({
      sessionId: ready.sessionId,
      idempotencyKey: "settle-1",
      expectedRevision: validated.revision,
      now: new Date(NOW.getTime() + 40_000),
    });
    expect(replayedSettle).toEqual(settled);
  });

  it("falla antes de consumir recursos si el periodo rewards ya esta sellado", async () => {
    const context = setup();
    const { validated } = await createValidated(context);
    context.repository.state.rewardPeriodStates.push({
      periodId: "2026-W28",
      status: "sealed",
      revision: 1,
    });
    await expect(context.service.settleSession({
      sessionId: validated.sessionId,
      idempotencyKey: "settle-after-seal",
      expectedRevision: validated.revision,
      now: new Date(NOW.getTime() + 4_000),
    })).rejects.toThrow(/ya esta sellado/);
    expect(context.repository.state.sessions[0]).toMatchObject({
      status: "validated",
      credit: { state: "active" },
      cukie: { state: "active" },
    });
  });

  it("compensates the first reservation when the second resource fails", async () => {
    const context = setup();
    context.ports.resources.fail("cukie", "reserve");
    await expect(createReady(context)).rejects.toThrow(/port failure/);
    const persisted = context.repository.state.sessions[0];
    expect(persisted).toMatchObject({
      status: "rejected",
      reservationPhase: "compensating",
      credit: { state: "released" },
      cukie: { state: "released" },
      terminal: { reasonCode: "resource_reservation_failed" },
    });
    expect(context.ports.resources.released.has(persisted.credit.reservationId!)).toBe(true);
  });

  it("resolves and releases an external reservation not yet persisted in Mongo", async () => {
    const context = setup();
    context.repository.failNextReplaceWhen(
      (previous, next) =>
        previous.credit.state === "pending" && next.credit.state === "active"
    );
    await expect(createReady(context, "orphan-window")).rejects.toThrow(
      /cambio durante la operacion/
    );
    const persisted = context.repository.state.sessions[0];
    expect(persisted).toMatchObject({
      status: "rejected",
      credit: {
        state: "released",
        reservationId: expect.any(String),
        reservationResultHash: expect.any(String),
      },
    });
    expect(
      context.ports.resources.terminalOutcomes.get(
        persisted.credit.reservationId!
      )
    ).toBe("released");
  });

  it("rejects a replay key reused with another session request", async () => {
    const context = setup();
    await createReady(context);
    await expect(
      context.service.createSession({
        walletAddress: WALLET,
        gameId: "arena",
        cukieAssetIds: ["cukie-2"],
        expectedRuleVersion: "v1",
        idempotencyKey: "create-1",
        now: new Date(NOW.getTime() + 1_000),
      })
    ).rejects.toThrow(/otro payload/);
    expect(context.repository.state.sessions).toHaveLength(1);
  });

  it("resumes an idempotent partial settlement without orphaning resources", async () => {
    const context = setup();
    const { validated } = await createValidated(context);
    context.ports.resources.fail("cukie", "release");
    await expect(
      context.service.settleSession({
        sessionId: validated.sessionId,
        idempotencyKey: "settle-resume",
        expectedRevision: validated.revision,
        now: new Date(NOW.getTime() + 4_000),
      })
    ).rejects.toThrow(/port failure/);
    expect(context.repository.state.sessions[0]).toMatchObject({
      status: "validated",
      credit: { state: "consumed" },
      cukie: { state: "active" },
      operation: { kind: "settle" },
    });
    const settled = await context.service.settleSession({
      sessionId: validated.sessionId,
      idempotencyKey: "settle-resume",
      expectedRevision: validated.revision,
      now: new Date(NOW.getTime() + 40_000),
    });
    expect(settled.status).toBe("settled");
    expect(settled.credit.state).toBe("consumed");
    expect(settled.cukie.state).toBe("released");
  });

  it("persists one terminal decision before ports and prevents consume/release split-brain", async () => {
    const context = setup();
    const { validated } = await createValidated(context);
    context.repository.failNextReplaceWhen(
      (previous, next) =>
        previous.credit.state === "active" && next.credit.state === "consumed"
    );
    await expect(
      context.service.settleSession({
        sessionId: validated.sessionId,
        idempotencyKey: "settle-fenced",
        expectedRevision: validated.revision,
        now: new Date(NOW.getTime() + 4_000),
      })
    ).rejects.toThrow(/cambio durante la operacion/);
    const afterExternalConsume = context.repository.state.sessions[0];
    expect(afterExternalConsume).toMatchObject({
      status: "validated",
      credit: { state: "active" },
      settlementIntent: { idempotencyKey: "settle-fenced" },
      operation: { kind: "settle" },
    });
    expect(
      context.ports.resources.terminalOutcomes.get(
        afterExternalConsume.credit.reservationId!
      )
    ).toBe("consumed");
    await expect(
      context.service.rejectSession({
        sessionId: validated.sessionId,
        idempotencyKey: "reject-after-consume",
        reasonCode: "timeout",
        expectedRevision: afterExternalConsume.revision,
        now: new Date(NOW.getTime() + 40_000),
      })
    ).rejects.toThrow(/liquidacion ya comenzo/);
    const settled = await context.service.settleSession({
      sessionId: validated.sessionId,
      idempotencyKey: "settle-fenced",
      expectedRevision: validated.revision,
      now: new Date(NOW.getTime() + 40_000),
    });
    expect(settled.status).toBe("settled");
    expect(
      context.ports.resources.released.has(settled.credit.reservationId!)
    ).toBe(false);
    expect(
      context.ports.resources.terminalOutcomes.get(settled.credit.reservationId!)
    ).toBe("consumed");
  });

  it("expires timed-out sessions and releases both reservations", async () => {
    const context = setup();
    const ready = await createReady(context);
    const expired = await context.service.expireSession({
      sessionId: ready.sessionId,
      idempotencyKey: `expire:${ready.sessionId}`,
      expectedRevision: ready.revision,
      now: new Date(ready.expiresAt.getTime()),
    });
    expect(expired).toMatchObject({
      status: "expired",
      credit: { state: "released" },
      cukie: { state: "released" },
      terminal: { reasonCode: "timeout" },
    });
  });

  it("binds the session to its game/version and fails closed on config drift", async () => {
    const context = setup();
    const ready = await createReady(context);
    const persistedRule = context.repository.state.rules[0];
    persistedRule.calculation.scoreCapRaw = "999";
    persistedRule.configHash = buildGameRuleConfigHash(persistedRule);
    await expect(
      context.service.startSession({
        sessionId: ready.sessionId,
        walletAddress: WALLET,
        idempotencyKey: "start-after-drift",
        expectedRevision: ready.revision,
        now: new Date(NOW.getTime() + 1_000),
      })
    ).rejects.toThrow(/ha cambiado/);
    expect(context.repository.state.sessions[0].status).toBe(
      "resources_reserved"
    );
    context.repository.state.rules = [];
    const expired = await context.service.expireSession({
      sessionId: ready.sessionId,
      idempotencyKey: `expire:${ready.sessionId}`,
      expectedRevision: ready.revision,
      now: new Date(ready.expiresAt.getTime()),
    });
    expect(expired).toMatchObject({
      status: "expired",
      credit: { state: "released" },
      cukie: { state: "released" },
    });
  });

  it("recalculates request/resource bindings and rejects valid-looking Mongo tampering", async () => {
    const context = setup();
    const ready = await createReady(context);
    context.repository.state.sessions[0].walletNormalized = `0x${"2".repeat(40)}`;
    await expect(
      context.service.startSession({
        sessionId: ready.sessionId,
        walletAddress: `0x${"2".repeat(40)}`,
        idempotencyKey: "tampered-wallet",
        expectedRevision: ready.revision,
        now: new Date(NOW.getTime() + 1_000),
      })
    ).rejects.toThrow(/Identidad de sesion|requestHash|no coincide/);

    context.repository.state.sessions[0].walletNormalized = WALLET;
    context.repository.state.sessions[0].credit.reservationId =
      "credit:another-reservation";
    await expect(
      context.service.startSession({
        sessionId: ready.sessionId,
        walletAddress: WALLET,
        idempotencyKey: "tampered-reservation",
        expectedRevision: ready.revision,
        now: new Date(NOW.getTime() + 1_000),
      })
    ).rejects.toThrow(/Recurso credit incoherente/);
  });

  it("recalculates post-create command and validation-result hashes", async () => {
    const submissionContext = setup();
    const submitted = await createSubmitted(
      submissionContext,
      "tampered-submission",
      "cukie-1"
    );
    submissionContext.repository.state.sessions[0].submission!.evidenceReference =
      "different-evidence";
    await expect(
      submissionContext.service.validateResult({
        sessionId: submitted.sessionId,
        idempotencyKey: "validate-tampered-submission",
        expectedRevision: submitted.revision,
        now: new Date(NOW.getTime() + 3_000),
      })
    ).rejects.toThrow(/payloadHash de submission manipulado/);
    expect(submissionContext.ports.evidence.calls).toBe(0);

    const validationContext = setup();
    const { validated } = await createValidated(validationContext);
    validationContext.repository.state.sessions[0].validation!.evidenceHash =
      "f".repeat(64);
    await expect(
      validationContext.service.settleSession({
        sessionId: validated.sessionId,
        idempotencyKey: "settle-tampered-validation",
        expectedRevision: validated.revision,
        now: new Date(NOW.getTime() + 4_000),
      })
    ).rejects.toThrow(/Validacion de resultado manipulada/);
  });

  it("never accepts a client score and fails closed without server authorization", async () => {
    const context = setup();
    const ready = await createReady(context);
    const started = await context.service.startSession({
      sessionId: ready.sessionId,
      walletAddress: WALLET,
      idempotencyKey: "start-fail-closed",
      expectedRevision: ready.revision,
      now: new Date(NOW.getTime() + 1_000),
    });
    const submitted = await context.service.submitResult({
      sessionId: ready.sessionId,
      walletAddress: WALLET,
      idempotencyKey: "submit-fail-closed",
      expectedRevision: started.revision,
      evidenceReference: "client-opaque-evidence",
      payloadHash: PAYLOAD_HASH,
      now: new Date(NOW.getTime() + 2_000),
    });
    context.ports.evidence.result = {
      authorization: "client_asserted",
      evidenceId: "fake",
      evidenceHash: "f".repeat(64),
      scoreRaw: "999999999",
    } as never;
    await expect(
      context.service.validateResult({
        sessionId: ready.sessionId,
        idempotencyKey: "validate-fail-closed",
        expectedRevision: submitted.revision,
        now: new Date(NOW.getTime() + 3_000),
      })
    ).rejects.toThrow(/no fue autorizada/);
    expect(context.repository.state.sessions[0].validation).toBeUndefined();
    expect(context.repository.state.sessions[0].status).toBe("submitted");
  });

  it("allows only one terminal winner for the same revision", async () => {
    const context = setup();
    const { validated } = await createValidated(context);
    const results = await Promise.allSettled([
      context.service.settleSession({
        sessionId: validated.sessionId,
        idempotencyKey: "terminal-settle",
        expectedRevision: validated.revision,
        now: new Date(NOW.getTime() + 4_000),
      }),
      context.service.rejectSession({
        sessionId: validated.sessionId,
        idempotencyKey: "terminal-reject",
        reasonCode: "fraud",
        expectedRevision: validated.revision,
        now: new Date(NOW.getTime() + 4_000),
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(["settled", "rejected"]).toContain(
      context.repository.state.sessions[0].status
    );
    for (const session of context.repository.state.sessions) {
      if (session.credit.reservationId) {
        expect(
          context.ports.resources.consumed.has(session.credit.reservationId) &&
            context.ports.resources.released.has(session.credit.reservationId)
        ).toBe(false);
      }
    }
  });

  it("consumes one external evidence id at most once across sessions", async () => {
    const context = setup();
    const first = await createSubmitted(context, "evidence-a", "cukie-1");
    const second = await createSubmitted(context, "evidence-b", "cukie-2");
    await context.service.validateResult({
      sessionId: first.sessionId,
      idempotencyKey: "validate-evidence-a",
      expectedRevision: first.revision,
      now: new Date(NOW.getTime() + 3_000),
    });
    await expect(
      context.service.validateResult({
        sessionId: second.sessionId,
        idempotencyKey: "validate-evidence-b",
        expectedRevision: second.revision,
        now: new Date(NOW.getTime() + 3_000),
      })
    ).rejects.toThrow(/unicidad|idempotencia/);
    expect(
      context.repository.state.sessions.filter((session) => session.validation)
    ).toHaveLength(1);
  });

  it("continues expiring later sessions when the first cleanup fails", async () => {
    const context = setup();
    const first = await createReady(context, "batch-first");
    const second = await context.service.createSession({
      walletAddress: WALLET,
      gameId: "arena",
      cukieAssetIds: ["cukie-2"],
      expectedRuleVersion: "v1",
      idempotencyKey: "batch-second",
      now: new Date(NOW.getTime() + 1_000),
    });
    context.ports.resources.fail("credit", "release");
    const result = await context.service.expireBatch({
      now: new Date(second.expiresAt.getTime()),
      limit: 10,
    });
    expect(result.failures).toEqual([
      expect.objectContaining({ sessionId: first.sessionId }),
    ]);
    expect(result.sessions).toEqual([
      expect.objectContaining({ sessionId: second.sessionId, status: "expired" }),
    ]);
    const retried = await context.service.expireBatch({
      now: new Date(second.expiresAt.getTime() + 1_000),
      limit: 10,
    });
    expect(retried.failures).toEqual([]);
    expect(retried.sessions).toEqual([
      expect.objectContaining({ sessionId: first.sessionId, status: "expired" }),
    ]);
  });

  it("turns an expired partial settlement into settled instead of releasing consumed value", async () => {
    const context = setup();
    const { validated } = await createValidated(context);
    context.ports.resources.fail("cukie", "release");
    await expect(
      context.service.settleSession({
        sessionId: validated.sessionId,
        idempotencyKey: "settle-before-timeout",
        expectedRevision: validated.revision,
        now: new Date(NOW.getTime() + 4_000),
      })
    ).rejects.toThrow(/port failure/);
    context.repository.state.rules = [];
    const result = await context.service.expireBatch({
      now: new Date(validated.expiresAt.getTime()),
      limit: 10,
    });
    expect(result.failures).toEqual([]);
    expect(result.sessions).toEqual([
      expect.objectContaining({
        sessionId: validated.sessionId,
        status: "settled",
        credit: expect.objectContaining({ state: "consumed" }),
      }),
    ]);
    expect(
      context.ports.resources.released.has(
        result.sessions[0].credit.reservationId!
      )
    ).toBe(false);
  });

  it("rejects a new settlement at the exact expiry boundary", async () => {
    const context = setup();
    const { validated } = await createValidated(context);
    await expect(
      context.service.settleSession({
        sessionId: validated.sessionId,
        idempotencyKey: "settle-too-late",
        expectedRevision: validated.revision,
        now: new Date(validated.expiresAt.getTime()),
      })
    ).rejects.toThrow(/expiro antes/);
    const expired = await context.service.expireSession({
      sessionId: validated.sessionId,
      idempotencyKey: `expire:${validated.sessionId}`,
      expectedRevision: validated.revision,
      now: new Date(validated.expiresAt.getTime()),
    });
    expect(expired.status).toBe("expired");
  });

  it("rejects timestamps that move backwards before persistence", async () => {
    const context = setup();
    const ready = await createReady(context);
    await expect(
      context.service.startSession({
        sessionId: ready.sessionId,
        walletAddress: WALLET,
        idempotencyKey: "backwards-start",
        expectedRevision: ready.revision,
        now: new Date(NOW.getTime() - 1),
      })
    ).rejects.toThrow(/cronologia|Invariantes/);
    expect(context.repository.state.sessions[0].status).toBe(
      "resources_reserved"
    );
  });

  it("uses independent rule scopes for multiple games", async () => {
    const duel = testGameEconomyRule({
      gameId: "duel",
      version: "duel-v7",
      credit: {
        required: true,
        consumeOnSettle: true,
        costCode: "duel:entry",
        creditRuleVersion: "credits-v1",
        creditRuleConfigHash: "c".repeat(64),
      },
      cukie: {
        required: false,
        consumeOnSettle: false,
        minAssets: 0,
        maxAssets: 0,
        role: "none",
        selectionPolicy: "legacy_client_assets_v1",
      },
    });
    const repository = new MemoryGameEconomyRepository({
      rules: [testGameEconomyRule(), duel],
    });
    const ports = createMemoryGameEconomyPorts();
    const service = createGameEconomyService(
      createMemoryGameEconomyRunner(repository),
      ports
    );
    const session = await service.createSession({
      walletAddress: WALLET,
      gameId: "duel",
      cukieAssetIds: [],
      expectedRuleVersion: "duel-v7",
      idempotencyKey: "duel-create",
      now: NOW,
    });
    expect(session).toMatchObject({
      gameId: "duel",
      status: "resources_reserved",
      rule: { version: "duel-v7", credit: { costCode: "duel:entry" } },
      cukie: { state: "not_required" },
    });
  });

  it("fails closed when effective-date windows overlap", async () => {
    const overlapping = testGameEconomyRule({
      version: "v2",
      activeFrom: new Date("2026-07-05T00:00:00.000Z"),
    });
    const repository = new MemoryGameEconomyRepository({
      rules: [testGameEconomyRule(), overlapping],
    });
    const ports = createMemoryGameEconomyPorts();
    const service = createGameEconomyService(
      createMemoryGameEconomyRunner(repository),
      ports
    );
    await expect(
      service.createSession({
        walletAddress: WALLET,
        gameId: "arena",
        cukieAssetIds: ["cukie-1"],
        expectedRuleVersion: "v2",
        idempotencyKey: "overlap-create",
        now: NOW,
      })
    ).rejects.toThrow(/solapadas/);
    expect(repository.state.sessions).toHaveLength(0);
    expect(ports.resources.calls).toHaveLength(0);
  });
});
