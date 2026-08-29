import { DomainConflictError } from "../errors";
import type {
  CompetitionCreditRepository,
  CompetitionCreditTransactionRunner,
  FinishCreditReservationInput,
  ReserveCreditLotsInput,
} from "./repository";
import {
  buildCompetitionCreditRuleConfigHash,
  buildCreditSourceSlotsHash,
  compareCreditText,
  safeCompetitionCreditPeriodScopeId,
  safeCompetitionCreditSettlementPeriodScopeId,
  stableCreditHash,
} from "./rules";
import {
  CREDIT_RULE_SCOPE,
  CREDIT_SOURCE_WATERMARK_ID,
  type CompetitionCreditLedgerEntry,
  type CompetitionCreditRule,
  type CompetitionCreditRun,
  type CreditAccountPeriod,
  type CreditCanonicalBlockEvidence,
  type CreditIntegrityIncident,
  type CreditLot,
  type CreditLotFifoCursor,
  type CreditPoolConfiguration,
  type CreditPoolPeriod,
  type CreditPoolPosition,
  type CreditReconciliationSnapshot,
  type CreditReservation,
  type CreditRunItem,
  type CreditRunHold,
  type CreditSnapshotGate,
  type CreditSnapshotSlot,
  type CreditSourceHealth,
  type CreditSourceWatermark,
} from "./types";

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        clone(child),
      ])
    ) as T;
  }
  return value;
}

function accountId(walletNormalized: string, periodId: string, route: "uki" | "nft") {
  return `${walletNormalized}:${periodId}:${route}`;
}

function poolPeriodId(periodId: string, route: "uki" | "nft") {
  return `pool:${periodId}:${route}`;
}

function lotIsAfterCursor(lot: CreditLot, after?: CreditLotFifoCursor) {
  if (!after) return true;
  return (
    lot.expiresAt.getTime() > after.expiresAt.getTime() ||
    (lot.expiresAt.getTime() === after.expiresAt.getTime() &&
      (lot.createdAt.getTime() > after.createdAt.getTime() ||
        (lot.createdAt.getTime() === after.createdAt.getTime() &&
          compareCreditText(lot._id, after.lotId) > 0)))
  );
}

export function testCompetitionCreditRule(
  overrides: Partial<CompetitionCreditRule> = {}
): CompetitionCreditRule {
  const now = new Date("2026-07-01T00:00:00.000Z");
  const rule: CompetitionCreditRule = {
    _id: "competition-credits:v1",
    scope: CREDIT_RULE_SCOPE,
    version: "credits-v1",
    active: true,
    activeFrom: now,
    cutoffHourUtc: 12,
    cutoffMinuteUtc: 0,
    settlementHourUtc: 16,
    settlementMinuteUtc: 0,
    maxSnapshotLatenessMs: 30 * 60 * 1000,
    sourceFreshnessMs: 15 * 60 * 1000,
    expectedBscChainId: 56,
    sourceContractAddresses: {
      UKI_STAKING: `0x${"1".repeat(40)}`,
      VESTING_VAULT: `0x${"2".repeat(40)}`,
      TOKEN_V2: `0x${"3".repeat(40)}`,
      CUKIE_MASTER_NFT_VAULT: `0x${"4".repeat(40)}`,
    },
    verifiedSourceIdentities: {
      UKI_STAKING: {
        runtimeCodeHash: `0x${"a".repeat(64)}`,
        configHash: `0x${"b".repeat(64)}`,
        deploymentBlock: 100,
      },
      VESTING_VAULT: {
        runtimeCodeHash: `0x${"c".repeat(64)}`,
        configHash: `0x${"d".repeat(64)}`,
        deploymentBlock: 200,
      },
    },
    creditsPerSlot: 100,
    maxSnapshotSlots: 1_000,
    maxBatchSize: 50,
    leaseDurationMs: 5 * 60 * 1000,
    reservationTtlMs: 10 * 60 * 1000,
    costs: [{ costCode: "treasure-hunt:start", credits: 10, active: true }],
    configHash: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  rule.configHash =
    overrides.configHash ?? buildCompetitionCreditRuleConfigHash(rule);
  return rule;
}

export function testCreditSourceWatermark(
  overrides: Partial<CreditSourceWatermark> = {}
): CreditSourceWatermark {
  const observedThrough = new Date("2026-07-10T12:00:00.000Z");
  return {
    _id: `${CREDIT_SOURCE_WATERMARK_ID}:uki`,
    route: "uki",
    status: "healthy",
    observedThrough,
    sourceRuleVersions: { uki: "cukie-master-v1", nft: "cukie-master-v1" },
    sourceHash: "b".repeat(64),
    slotCount: 0,
    healthEvidenceHash: "e".repeat(64),
    canonicalSafeBlock: 1_000,
    canonicalSafeBlockHash: `0x${"f".repeat(64)}`,
    updatedAt: observedThrough,
    ...overrides,
  };
}

type MemoryCreditState = {
  rules: CompetitionCreditRule[];
  watermark: CreditSourceWatermark | null;
  schemaReady: boolean;
  activeRuleMatches: boolean;
  openIntegrityIncidents: number;
  slots: CreditSnapshotSlot[];
  slotVersions: Array<{
    _id: string;
    slotId: string;
    route: "uki" | "nft";
    effectiveBlockNumber: number;
    effectiveBlockHash: string;
    effectiveBlockTimestamp: Date;
    observedAt: Date;
    slot: CreditSnapshotSlot;
  }>;
  historyCompleteFromBlock: Record<"uki" | "nft", number>;
  configs: CreditPoolConfiguration[];
  runs: CompetitionCreditRun[];
  items: CreditRunItem[];
  holds: CreditRunHold[];
  ledger: CompetitionCreditLedgerEntry[];
  ownLots: CreditLot[];
  poolLots: CreditLot[];
  poolPositions: CreditPoolPosition[];
  accounts: CreditAccountPeriod[];
  poolPeriods: CreditPoolPeriod[];
  reservations: CreditReservation[];
  incidents: CreditIntegrityIncident[];
  sourceHealth: CreditSourceHealth;
};

export class MemoryCompetitionCreditRepository
  implements CompetitionCreditRepository
{
  state: MemoryCreditState;
  readonly gameEconomySessionIds = new Set<string>();

  constructor(
    input: {
      rule?: CompetitionCreditRule;
      watermark?: CreditSourceWatermark | null;
      slots?: CreditSnapshotSlot[];
      slotVersions?: MemoryCreditState["slotVersions"];
    } = {}
  ) {
    const slots = clone(input.slots ?? []).map((slot) => ({
      ...slot,
      sourceBlockNumber: slot.sourceBlockNumber ?? 998,
      sourceBlockHash: slot.sourceBlockHash ?? `0x${"d".repeat(64)}`,
      sourceBlockTimestamp: slot.sourceBlockTimestamp ?? slot.updatedAt,
    }));
    const defaultWatermark = testCreditSourceWatermark({
      sourceHash: buildCreditSourceSlotsHash(
        slots.filter((slot) => slot.route === "uki")
      ),
      slotCount: slots.filter((slot) => slot.route === "uki").length,
    });
    const watermark =
      input.watermark === undefined ? defaultWatermark : input.watermark;
    this.state = {
      rules: [input.rule ?? testCompetitionCreditRule()],
      watermark,
      schemaReady: true,
      activeRuleMatches: true,
      openIntegrityIncidents: 0,
      slots,
      slotVersions: clone(input.slotVersions ?? slots.map((slot) => ({
        _id: `${slot._id}:${slot.revision}`,
        slotId: slot._id,
        route: slot.route,
        effectiveBlockNumber: slot.sourceBlockNumber!,
        effectiveBlockHash: slot.sourceBlockHash!,
        effectiveBlockTimestamp: slot.sourceBlockTimestamp!,
        observedAt: slot.updatedAt,
        slot,
      }))),
      historyCompleteFromBlock: {
        uki: 0,
        nft: 0,
      },
      configs: [],
      runs: [],
      items: [],
      holds: [],
      ledger: [],
      ownLots: [],
      poolLots: [],
      poolPositions: [],
      accounts: [],
      poolPeriods: [],
      reservations: [],
      incidents: [],
      sourceHealth: {
        healthy: true,
        warnings: [],
        observedThrough: clone(watermark?.observedThrough ?? null),
        sourceRuleVersions: clone(
          watermark?.sourceRuleVersions ?? {
            uki: "cukie-master-v1",
            nft: "cukie-master-v1",
          }
        ),
        evidenceHash: watermark?.healthEvidenceHash ?? "e".repeat(64),
        canonicalSafeBlock: watermark?.canonicalSafeBlock ?? 1_000,
        canonicalSafeBlockHash:
          watermark?.canonicalSafeBlockHash ?? `0x${"f".repeat(64)}`,
        checkedAt: new Date("2026-07-10T12:00:00.000Z"),
      },
    };
  }

  snapshot() {
    return clone(this.state);
  }

  restore(snapshot: MemoryCreditState) {
    this.state = clone(snapshot);
  }

  async findRuleAt(at: Date, expectedVersion?: string) {
    const found = this.state.rules
      .filter(
        (rule) =>
          rule.activeFrom.getTime() <= at.getTime() &&
          (!rule.activeUntil || rule.activeUntil.getTime() > at.getTime())
      )
      .sort(
        (left, right) => right.activeFrom.getTime() - left.activeFrom.getTime()
      );
    if (found.length > 1)
      throw new DomainConflictError("Reglas de creditos activas solapadas.");
    if (expectedVersion && found[0]?.version !== expectedVersion) return null;
    return found[0] ? clone(found[0]) : null;
  }

  async findRuleByVersion(version: string) {
    return clone(this.state.rules.find((rule) => rule.version === version) ?? null);
  }

  async findOldestRule() {
    return clone(
      this.state.rules
        .filter((rule) => rule.supersededReason !== "unrecoverable_pre_migration")
        .sort((left, right) => left.activeFrom.getTime() - right.activeFrom.getTime())[0] ?? null
    );
  }

  async readSnapshotGate(
    _rule: CompetitionCreditRule,
    cutoff: Date,
    route: "uki" | "nft" = "uki"
  ): Promise<CreditSnapshotGate> {
    return {
      schemaReady: this.state.schemaReady,
      activeRuleMatches: this.state.activeRuleMatches,
      sourceWatermark:
        this.state.watermark?.route === route
          ? clone(this.state.watermark)
          : null,
      openIntegrityIncidents:
        this.state.openIntegrityIncidents +
        this.state.incidents.filter(
          (item) => item.status === "open" && item.route === route
        ).length,
      maturedQualifyingSlots: this.state.slots.filter(
        (slot) =>
          slot.route === route &&
          slot.status === "qualifying" &&
          slot.creditEligibleFrom.getTime() <= cutoff.getTime()
      ).length,
    };
  }

  async listSourceSlots(limit: number, route?: "uki" | "nft") {
    return clone(
      this.state.slots
        .filter((slot) => !route || slot.route === route)
        .sort((left, right) => compareCreditText(left._id, right._id))
        .slice(0, limit)
    );
  }

  async ensureVerifiedHistoryCoverage(route: "uki" | "nft") {
    return {
      completeFrom: new Date(0),
      completeFromBlockNumber: this.state.historyCompleteFromBlock[route],
      verifiedSlotCount: this.state.slots.filter((slot) => slot.route === route)
        .length,
    };
  }

  async listSourceSlotsAtCutoff(
    cutoffBlock: CreditCanonicalBlockEvidence,
    route: "uki" | "nft",
    limit: number
  ) {
    if (this.state.historyCompleteFromBlock[route] > cutoffBlock.blockNumber) {
      throw new DomainConflictError("historial temporal no cubre el cutoff");
    }
    const latest = new Map<string, MemoryCreditState["slotVersions"][number]>();
    for (const version of this.state.slotVersions) {
      if (version.route !== route || version.effectiveBlockNumber > cutoffBlock.blockNumber) continue;
      const current = latest.get(version.slotId);
      if (
        !current ||
        version.effectiveBlockNumber > current.effectiveBlockNumber ||
        (version.effectiveBlockNumber === current.effectiveBlockNumber &&
          version.slot.revision > current.slot.revision)
      ) latest.set(version.slotId, version);
    }
    return clone(
      [...latest.values()]
        .map((version) => version.slot)
        .sort((left, right) => compareCreditText(left._id, right._id))
        .slice(0, limit)
    );
  }

  async readSourceHealth(
    now: Date,
    _rule: CompetitionCreditRule,
    _route: "uki" | "nft" = "uki"
  ) {
    return clone({ ...this.state.sourceHealth, checkedAt: now });
  }

  async findCanonicalCutoffBlock(cutoff: Date) {
    return {
      blockNumber: 999,
      blockHash: `0x${"e".repeat(64)}`,
      blockTimestamp: new Date(cutoff.getTime() - 1),
    };
  }

  async upsertSourceWatermark(watermark: CreditSourceWatermark) {
    if (
      this.state.watermark &&
      this.state.watermark.observedThrough.getTime() >
        watermark.observedThrough.getTime()
    ) {
      return clone(this.state.watermark);
    }
    this.state.watermark = clone(watermark);
    return clone(watermark);
  }

  async findSlot(slotId: string) {
    return clone(this.state.slots.find((slot) => slot._id === slotId) ?? null);
  }

  async findPoolConfiguration(
    walletNormalized: string,
    slotId: string,
    eligibilityEpoch: number,
    cutoff: Date,
    ruleVersion: string,
    ruleConfigHash: string
  ) {
    const found = this.state.configs
      .filter(
        (config) =>
          config.walletNormalized === walletNormalized &&
          config.slotId === slotId &&
          config.eligibilityEpoch === eligibilityEpoch &&
          config.ruleVersion === ruleVersion &&
          config.ruleConfigHash === ruleConfigHash &&
          config.effectiveCutoff.getTime() <= cutoff.getTime()
      )
      .sort(
        (left, right) =>
          right.effectiveCutoff.getTime() - left.effectiveCutoff.getTime() ||
          right.requestedAt.getTime() - left.requestedAt.getTime()
      )[0];
    return clone(found ?? null);
  }

  async findPoolConfigurationByIdempotencyKey(idempotencyKey: string) {
    return clone(
      this.state.configs.find(
        (item) => item.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  async insertPoolConfiguration(config: CreditPoolConfiguration) {
    if (
      this.state.configs.some(
        (item) => item.idempotencyKey === config.idempotencyKey
      )
    ) {
      throw Object.assign(new Error("duplicate config"), { code: 11000 });
    }
    this.state.configs.push(clone(config));
  }

  async findRun(runId: string) {
    return clone(
      this.state.runs.find((run) => run._id === runId || run.runId === runId) ??
        null
    );
  }

  async findRunByPeriod(periodId: string, route: "uki" | "nft" = "uki") {
    return clone(
      this.state.runs.find(
        (run) =>
          safeCompetitionCreditPeriodScopeId(run, run._id) === periodId &&
          run.route === route
      ) ?? null
    );
  }

  async findLatestRunByRoute(route: "uki" | "nft") {
    return clone(
      [...this.state.runs]
        .filter((run) => run.route === route)
        .sort(
          (left, right) =>
            right.period.cutoff.getTime() - left.period.cutoff.getTime()
        )[0] ?? null
    );
  }

  async insertRunAndItems(
    run: CompetitionCreditRun,
    items: CreditRunItem[],
    holds: CreditRunHold[]
  ) {
    if (
      this.state.runs.some(
        (item) =>
          item.period.periodId === run.period.periodId &&
          item.route === run.route
      )
    ) {
      throw Object.assign(new Error("duplicate run"), { code: 11000 });
    }
    this.state.runs.push(clone(run));
    this.state.items.push(...clone(items));
    this.state.holds.push(...clone(holds));
  }

  async claimRunLease(
    runId: string,
    workerId: string,
    now: Date,
    leaseExpiresAt: Date
  ) {
    const run = this.state.runs.find(
      (item) => item._id === runId || item.runId === runId
    );
    if (!run || !["snapshotted", "processing"].includes(run.status))
      return null;
    if (
      run.leaseOwner &&
      run.leaseOwner !== workerId &&
      run.leaseExpiresAt &&
      run.leaseExpiresAt.getTime() > now.getTime()
    )
      return null;
    run.status = "processing";
    run.leaseOwner = workerId;
    run.leaseExpiresAt = clone(leaseExpiresAt);
    run.fenceToken += 1;
    run.updatedAt = clone(now);
    return clone(run);
  }

  async findPendingRunItems(runId: string, limit: number) {
    return clone(
      this.state.items
        .filter((item) => item.runId === runId && item.status === "pending")
        .sort((left, right) => compareCreditText(left._id, right._id))
        .slice(0, limit)
    );
  }

  private incrementAccount(
    walletNormalized: string,
    periodId: string,
    route: "uki" | "nft",
    increments: Partial<
      Record<
        | "grantedCredits"
        | "poolDepositedCredits"
        | "availableCredits"
        | "reservedCredits"
        | "spentCredits"
        | "expiredCredits",
        number
      >
    >,
    now: Date
  ) {
    const id = accountId(walletNormalized, periodId, route);
    let account = this.state.accounts.find((item) => item._id === id);
    if (!account) {
      account = {
        _id: id,
        walletNormalized,
        periodId,
        route,
        grantedCredits: 0,
        poolDepositedCredits: 0,
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        revision: 0,
        createdAt: clone(now),
        updatedAt: clone(now),
      };
      this.state.accounts.push(account);
    }
    for (const [key, value] of Object.entries(increments)) {
      (account as unknown as Record<string, number>)[key] += value ?? 0;
    }
    account.revision += 1;
    account.updatedAt = clone(now);
  }

  private incrementPoolPeriod(
    periodId: string,
    route: "uki" | "nft",
    increments: Partial<
      Record<
        | "contributedCredits"
        | "availableCredits"
        | "reservedCredits"
        | "spentCredits"
        | "expiredCredits",
        number
      >
    >,
    now: Date
  ) {
    const id = poolPeriodId(periodId, route);
    let pool = this.state.poolPeriods.find((item) => item._id === id);
    if (!pool) {
      pool = {
        _id: id,
        periodId,
        route,
        contributedCredits: 0,
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        blocked: false,
        revision: 0,
        createdAt: clone(now),
        updatedAt: clone(now),
      };
      this.state.poolPeriods.push(pool);
    }
    for (const [key, value] of Object.entries(increments)) {
      (pool as unknown as Record<string, number>)[key] += value ?? 0;
    }
    pool.revision += 1;
    pool.updatedAt = clone(now);
  }

  private addLedger(
    input: Omit<CompetitionCreditLedgerEntry, "_id" | "ledgerId">
  ) {
    if (
      this.state.ledger.some(
        (item) => item.idempotencyKey === input.idempotencyKey
      )
    ) {
      throw Object.assign(new Error("duplicate ledger"), { code: 11000 });
    }
    const ledgerId = stableCreditHash({
      idempotencyKey: input.idempotencyKey,
      operation: input.operation,
      bucket: input.bucket,
      lotId: input.lotId,
    });
    this.state.ledger.push({ ...clone(input), _id: ledgerId, ledgerId });
  }

  async applyRunItem(
    runId: string,
    workerId: string,
    fenceToken: number,
    supplied: CreditRunItem,
    now: Date
  ) {
    const run = this.state.runs.find((item) => item.runId === runId);
    if (
      !run ||
      run.status !== "processing" ||
      run.leaseOwner !== workerId ||
      run.fenceToken !== fenceToken ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      throw new DomainConflictError("stale lease");
    }
    const item = this.state.items.find(
      (candidate) => candidate._id === supplied._id
    );
    if (!item || item.payloadHash !== supplied.payloadHash)
      throw new DomainConflictError("item mismatch");
    if (item.status === "applied") return false;
    const ownLotId = stableCreditHash({ kind: "own-lot", itemId: item.itemId });
    const ownLot: CreditLot = {
      _id: ownLotId,
      lotId: ownLotId,
      bucket: "own",
      route: run.route,
      walletNormalized: item.walletNormalized,
      periodId: item.periodId,
      runId,
      runItemId: item.itemId,
      sourceSlotId: item.slotId,
      eligibilityEpoch: item.eligibilityEpoch,
      totalCredits: item.grantCredits,
      poolDepositedCredits: item.poolCredits,
      availableCredits: item.ownCredits,
      reservedCredits: 0,
      spentCredits: 0,
      expiredCredits: 0,
      expiresAt: clone(run.settlementPeriod.nextCutoff),
      revision: 0,
      blocked: false,
      createdAt: clone(now),
      updatedAt: clone(now),
    };
    this.state.ownLots.push(ownLot);
    this.addLedger({
      idempotencyKey: `daily-credit:${item.itemId}`,
      payloadHash: item.payloadHash,
      operation: "grant",
      bucket: "own",
      amountCredits: item.baseGrantCredits,
      walletNormalized: item.walletNormalized,
      periodId: item.periodId,
      runId,
      runItemId: item.itemId,
      lotId: ownLotId,
      reservationId: null,
      sessionId: null,
      fromState: null,
      toState: "available",
      effectiveBlockNumber: run.cutoffBlock.blockNumber,
      effectiveBlockHash: run.cutoffBlock.blockHash,
      effectiveBlockTimestamp: clone(run.cutoffBlock.blockTimestamp),
      createdAt: clone(now),
    });
    if (item.compensationCredits > 0) {
      this.addLedger({
        idempotencyKey: `late-compensation:${item.earnedPeriodId}:${run.route}:${item.slotId}:${item.eligibilityEpoch}`,
        payloadHash: item.payloadHash,
        operation: "late_compensation",
        bucket: "own",
        amountCredits: item.compensationCredits,
        walletNormalized: item.walletNormalized,
        periodId: item.periodId,
        runId,
        runItemId: item.itemId,
        lotId: ownLotId,
        reservationId: null,
        sessionId: null,
        fromState: null,
        toState: "available",
        effectiveBlockNumber: run.cutoffBlock.blockNumber,
        effectiveBlockHash: run.cutoffBlock.blockHash,
        effectiveBlockTimestamp: clone(run.cutoffBlock.blockTimestamp),
        createdAt: clone(now),
      });
    }
    if (item.poolCredits > 0) {
      const poolLotId = stableCreditHash({
        kind: "pool-lot",
        itemId: item.itemId,
      });
      this.state.poolLots.push({
        _id: poolLotId,
        lotId: poolLotId,
        bucket: "pool",
        route: run.route,
        walletNormalized: null,
        periodId: item.periodId,
        runId,
        runItemId: item.itemId,
        sourceSlotId: item.slotId,
        eligibilityEpoch: item.eligibilityEpoch,
        totalCredits: item.poolCredits,
        poolDepositedCredits: 0,
        availableCredits: item.poolCredits,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        expiresAt: clone(run.settlementPeriod.nextCutoff),
        revision: 0,
        blocked: false,
        createdAt: clone(now),
        updatedAt: clone(now),
      });
      const positionId = stableCreditHash({
        kind: "pool-position",
        itemId: item.itemId,
      });
      this.state.poolPositions.push({
        _id: positionId,
        positionId,
        route: run.route,
        walletNormalized: item.walletNormalized,
        periodId: item.periodId,
        runId,
        runItemId: item.itemId,
        sourceSlotId: item.slotId,
        eligibilityEpoch: item.eligibilityEpoch,
        credits: item.poolCredits,
        status: "pending_run",
        createdAt: clone(now),
        updatedAt: clone(now),
      });
      this.addLedger({
        idempotencyKey: `pool-deposit:own:${item.itemId}`,
        payloadHash: item.payloadHash,
        operation: "pool_deposit",
        bucket: "own",
        amountCredits: item.poolCredits,
        walletNormalized: item.walletNormalized,
        periodId: item.periodId,
        runId,
        runItemId: item.itemId,
        lotId: ownLotId,
        reservationId: null,
        sessionId: null,
        fromState: "available",
        toState: null,
        effectiveBlockNumber: run.cutoffBlock.blockNumber,
        effectiveBlockHash: run.cutoffBlock.blockHash,
        effectiveBlockTimestamp: clone(run.cutoffBlock.blockTimestamp),
        createdAt: clone(now),
      });
      this.addLedger({
        idempotencyKey: `pool-deposit:pool:${item.itemId}`,
        payloadHash: item.payloadHash,
        operation: "pool_deposit",
        bucket: "pool",
        amountCredits: item.poolCredits,
        walletNormalized: item.walletNormalized,
        periodId: item.periodId,
        runId,
        runItemId: item.itemId,
        lotId: poolLotId,
        reservationId: null,
        sessionId: null,
        fromState: null,
        toState: "available",
        effectiveBlockNumber: run.cutoffBlock.blockNumber,
        effectiveBlockHash: run.cutoffBlock.blockHash,
        effectiveBlockTimestamp: clone(run.cutoffBlock.blockTimestamp),
        createdAt: clone(now),
      });
      this.incrementPoolPeriod(
        item.periodId,
        run.route,
        {
          contributedCredits: item.poolCredits,
          availableCredits: item.poolCredits,
        },
        now
      );
    }
    this.incrementAccount(
      item.walletNormalized,
      item.periodId,
      run.route,
      {
        grantedCredits: item.grantCredits,
        poolDepositedCredits: item.poolCredits,
        availableCredits: item.ownCredits,
      },
      now
    );
    item.status = "applied";
    item.appliedAt = clone(now);
    return true;
  }

  async countPendingRunItems(runId: string) {
    return this.state.items.filter(
      (item) => item.runId === runId && item.status === "pending"
    ).length;
  }

  async openRun(
    runId: string,
    workerId: string,
    fenceToken: number,
    now: Date
  ) {
    const run = this.state.runs.find((item) => item.runId === runId);
    if (
      !run ||
      run.status !== "processing" ||
      run.leaseOwner !== workerId ||
      run.fenceToken !== fenceToken ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt.getTime() <= now.getTime() ||
      this.state.items.some(
        (item) => item.runId === runId && item.status === "pending"
      )
    )
      return null;
    run.status = this.state.holds.some(
      (hold) => hold.runId === runId && hold.status === "held"
    )
      ? "open_with_holds"
      : "open";
    run.openedAt = clone(now);
    run.updatedAt = clone(now);
    delete run.leaseOwner;
    delete run.leaseExpiresAt;
    for (const position of this.state.poolPositions.filter(
      (item) => item.runId === runId
    )) {
      position.status = "open";
      position.updatedAt = clone(now);
    }
    return clone(run);
  }

  async findReservationByIdempotencyKey(idempotencyKey: string) {
    return clone(
      this.state.reservations.find(
        (item) => item.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  async findReservation(reservationId: string) {
    return clone(
      this.state.reservations.find(
        (item) => item.reservationId === reservationId
      ) ?? null
    );
  }

  async findReservationBySessionId(sessionId: string) {
    return clone(
      this.state.reservations.find((item) => item.sessionId === sessionId) ??
        null
    );
  }

  async listExpiredActiveReservations(now: Date, limit: number) {
    return clone(
      this.state.reservations
        .filter(
          (item) =>
            item.status === "active" &&
            item.expiresAt.getTime() <= now.getTime()
        )
        .sort(
          (left, right) =>
            left.expiresAt.getTime() - right.expiresAt.getTime() ||
            compareCreditText(left._id, right._id)
        )
        .slice(0, limit)
    );
  }

  async findGameSessionLifecycle(sessionId: string) {
    return this.gameEconomySessionIds.has(sessionId)
      ? { status: "active" }
      : null;
  }

  async findLedgerByIdempotencyKey(idempotencyKey: string) {
    return clone(
      this.state.ledger.find(
        (item) => item.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  async hasOpenCreditBlock(walletNormalized: string) {
    return (
      this.state.incidents.some(
        (item) =>
          item.status === "open" &&
          (item.walletNormalized === null ||
            item.walletNormalized === walletNormalized)
      ) ||
      this.state.accounts.some(
        (item) => item.walletNormalized === walletNormalized && item.blocked
      )
    );
  }

  private openRunIds(periodId: string, now: Date) {
    return new Set(
      this.state.runs
        .filter(
          (run) =>
            run.status === "open" &&
            run.settlementPeriod.periodId === periodId &&
            run.settlementPeriod.cutoff.getTime() <= now.getTime() &&
            run.settlementPeriod.nextCutoff.getTime() > now.getTime()
        )
        .map((run) => run.runId)
    );
  }

  async listAvailableOwnLots(
    walletNormalized: string,
    periodId: string,
    now: Date,
    limit: number,
    after?: CreditLotFifoCursor
  ) {
    const runIds = this.openRunIds(periodId, now);
    return clone(
      this.state.ownLots
        .filter(
          (lot) =>
            lot.walletNormalized === walletNormalized &&
            lot.periodId === periodId &&
            runIds.has(lot.runId) &&
            lotIsAfterCursor(lot, after) &&
            !lot.blocked &&
            lot.availableCredits > 0 &&
            lot.expiresAt.getTime() > now.getTime()
        )
        .sort(
          (left, right) =>
            left.expiresAt.getTime() - right.expiresAt.getTime() ||
            left.createdAt.getTime() - right.createdAt.getTime() ||
            compareCreditText(left._id, right._id)
        )
        .slice(0, limit)
    );
  }

  async listAvailablePoolLots(
    periodId: string,
    now: Date,
    limit: number,
    after?: CreditLotFifoCursor
  ) {
    const runIds = this.openRunIds(periodId, now);
    return clone(
      this.state.poolLots
        .filter(
          (lot) =>
            lot.periodId === periodId &&
            runIds.has(lot.runId) &&
            lotIsAfterCursor(lot, after) &&
            !lot.blocked &&
            lot.availableCredits > 0 &&
            lot.expiresAt.getTime() > now.getTime()
        )
        .sort(
          (left, right) =>
            left.expiresAt.getTime() - right.expiresAt.getTime() ||
            left.createdAt.getTime() - right.createdAt.getTime() ||
            compareCreditText(left._id, right._id)
        )
        .slice(0, limit)
    );
  }

  async reserveLots({ reservation, now }: ReserveCreditLotsInput) {
    const lots =
      reservation.bucket === "own" ? this.state.ownLots : this.state.poolLots;
    for (const allocation of reservation.allocations) {
      const lot = lots.find((item) => item.lotId === allocation.lotId);
      if (
        !lot ||
        lot.revision !== allocation.lotRevision ||
        lot.availableCredits < allocation.amountCredits ||
        lot.periodId !== reservation.periodId ||
        lot.blocked ||
        lot.expiresAt.getTime() <= now.getTime() ||
        !this.openRunIds(reservation.periodId, now).has(lot.runId)
      ) {
        throw new DomainConflictError("lot CAS failed");
      }
    }
    for (const [index, allocation] of reservation.allocations.entries()) {
      const lot = lots.find((item) => item.lotId === allocation.lotId)!;
      lot.availableCredits -= allocation.amountCredits;
      lot.reservedCredits += allocation.amountCredits;
      lot.revision += 1;
      lot.updatedAt = clone(now);
      this.addLedger({
        idempotencyKey: `${reservation.idempotencyKey}:allocation:${index}`,
        payloadHash: reservation.payloadHash,
        operation: "reserve",
        bucket: reservation.bucket,
        amountCredits: allocation.amountCredits,
        walletNormalized: reservation.walletNormalized,
        periodId: lot.periodId,
        runId: lot.runId,
        runItemId: lot.runItemId,
        lotId: lot.lotId,
        reservationId: reservation.reservationId,
        sessionId: reservation.sessionId,
        fromState: "available",
        toState: "reserved",
        createdAt: clone(now),
      });
      if (reservation.bucket === "own") {
        this.incrementAccount(
          reservation.walletNormalized,
          lot.periodId,
          lot.route,
          {
            availableCredits: -allocation.amountCredits,
            reservedCredits: allocation.amountCredits,
          },
          now
        );
      } else {
        this.incrementPoolPeriod(
          lot.periodId,
          lot.route,
          {
            availableCredits: -allocation.amountCredits,
            reservedCredits: allocation.amountCredits,
          },
          now
        );
      }
    }
    this.state.reservations.push(clone(reservation));
  }

  async finishReservation(input: FinishCreditReservationInput) {
    const reservation = this.state.reservations.find(
      (item) => item._id === input.reservation._id
    );
    if (
      !reservation ||
      reservation.status !== "active" ||
      reservation.revision !== input.reservation.revision ||
      (input.operation === "consume" &&
        reservation.expiresAt.getTime() <= input.now.getTime() &&
        (!input.committedAt || input.committedAt.getTime() > reservation.expiresAt.getTime()))
    )
      return null;
    reservation.status =
      input.operation === "consume"
        ? "consumed"
        : reservation.expiresAt.getTime() <= input.now.getTime()
        ? "expired"
        : "released";
    reservation.terminalAt = clone(input.now);
    if (input.committedAt) reservation.terminalCommittedAt = clone(input.committedAt);
    reservation.terminalIdempotencyKey = input.idempotencyKey;
    reservation.terminalPayloadHash = input.payloadHash;
    reservation.updatedAt = clone(input.now);
    reservation.revision += 1;
    const lots =
      reservation.bucket === "own" ? this.state.ownLots : this.state.poolLots;
    for (const [index, allocation] of reservation.allocations.entries()) {
      const lot = lots.find((item) => item.lotId === allocation.lotId);
      if (!lot || lot.reservedCredits < allocation.amountCredits) {
        throw new DomainConflictError("reserved lot mismatch");
      }
      const expires =
        input.operation === "release" &&
        lot.expiresAt.getTime() <= input.now.getTime();
      lot.reservedCredits -= allocation.amountCredits;
      if (input.operation === "consume")
        lot.spentCredits += allocation.amountCredits;
      else if (expires) lot.expiredCredits += allocation.amountCredits;
      else lot.availableCredits += allocation.amountCredits;
      lot.revision += 1;
      lot.updatedAt = clone(input.now);
      const increments =
        input.operation === "consume"
          ? {
              reservedCredits: -allocation.amountCredits,
              spentCredits: allocation.amountCredits,
            }
          : expires
          ? {
              reservedCredits: -allocation.amountCredits,
              expiredCredits: allocation.amountCredits,
            }
          : {
              reservedCredits: -allocation.amountCredits,
              availableCredits: allocation.amountCredits,
            };
      if (reservation.bucket === "own") {
        this.incrementAccount(
          reservation.walletNormalized,
          lot.periodId,
          lot.route,
          increments,
          input.now
        );
      } else this.incrementPoolPeriod(lot.periodId, lot.route, increments, input.now);
      this.addLedger({
        idempotencyKey: `${input.idempotencyKey}:allocation:${index}`,
        payloadHash: input.payloadHash,
        operation:
          input.operation === "consume"
            ? "spend"
            : expires
            ? "expire"
            : "release",
        bucket: reservation.bucket,
        amountCredits: allocation.amountCredits,
        walletNormalized: reservation.walletNormalized,
        periodId: lot.periodId,
        runId: lot.runId,
        runItemId: lot.runItemId,
        lotId: lot.lotId,
        reservationId: reservation.reservationId,
        sessionId: reservation.sessionId,
        fromState: "reserved",
        toState:
          input.operation === "consume"
            ? "spent"
            : expires
            ? "expired"
            : "available",
        createdAt: clone(input.now),
      });
    }
    return clone(reservation);
  }

  async listExpiredAvailableLots(now: Date, limit: number) {
    return clone(
      [...this.state.ownLots, ...this.state.poolLots]
        .filter(
          (lot) =>
            !lot.blocked &&
            lot.availableCredits > 0 &&
            lot.expiresAt.getTime() <= now.getTime()
        )
        .sort(
          (left, right) =>
            left.expiresAt.getTime() - right.expiresAt.getTime() ||
            compareCreditText(left._id, right._id)
        )
        .slice(0, limit)
    );
  }

  async expireAvailableLot(supplied: CreditLot, now: Date) {
    const lots =
      supplied.bucket === "own" ? this.state.ownLots : this.state.poolLots;
    const lot = lots.find((item) => item.lotId === supplied.lotId);
    if (
      !lot ||
      lot.blocked ||
      lot.availableCredits <= 0 ||
      lot.expiresAt.getTime() > now.getTime() ||
      lot.revision !== supplied.revision ||
      lot.availableCredits !== supplied.availableCredits
    )
      return false;
    const idempotencyKey = `credit-lot-expire:${
      lot.lotId
    }:${lot.expiresAt.toISOString()}`;
    const payloadHash = stableCreditHash({
      operation: "expire",
      lotId: lot.lotId,
      expiresAt: lot.expiresAt,
    });
    const replay = this.state.ledger.find(
      (entry) => entry.idempotencyKey === idempotencyKey
    );
    if (replay) {
      if (replay.payloadHash !== payloadHash)
        throw new DomainConflictError("expire payload mismatch");
      return false;
    }
    const amount = lot.availableCredits;
    lot.availableCredits = 0;
    lot.expiredCredits += amount;
    lot.revision += 1;
    lot.updatedAt = clone(now);
    this.addLedger({
      idempotencyKey,
      payloadHash,
      operation: "expire",
      bucket: lot.bucket,
      amountCredits: amount,
      walletNormalized: lot.walletNormalized,
      periodId: lot.periodId,
      runId: lot.runId,
      runItemId: lot.runItemId,
      lotId: lot.lotId,
      reservationId: null,
      sessionId: null,
      fromState: "available",
      toState: "expired",
      createdAt: clone(now),
    });
    if (lot.bucket === "own") {
      if (!lot.walletNormalized)
        throw new DomainConflictError("own lot without wallet");
      this.incrementAccount(
        lot.walletNormalized,
        lot.periodId,
        lot.route,
        {
          availableCredits: -amount,
          expiredCredits: amount,
        },
        now
      );
    } else
      this.incrementPoolPeriod(
        lot.periodId,
        lot.route,
        {
          availableCredits: -amount,
          expiredCredits: amount,
        },
        now
      );
    return true;
  }

  async readReconciliationSnapshot(
    runId: string
  ): Promise<CreditReconciliationSnapshot | null> {
    const run = this.state.runs.find((item) => item.runId === runId);
    if (!run) return null;
    const periodId = safeCompetitionCreditSettlementPeriodScopeId(run, runId);
    const result = {
      run,
      items: this.state.items.filter((item) => item.runId === runId),
      holds: this.state.holds.filter((item) => item.runId === runId),
      ownLots: this.state.ownLots.filter((item) => item.runId === runId),
      poolLots: this.state.poolLots.filter((item) => item.runId === runId),
      accountLots: this.state.ownLots.filter(
        (item) => item.periodId === periodId && item.route === run.route
      ),
      poolPeriodLots: this.state.poolLots.filter(
        (item) => item.periodId === periodId && item.route === run.route
      ),
      poolPositions: this.state.poolPositions.filter(
        (item) => item.runId === runId
      ),
      reservations: this.state.reservations.filter(
        (item) =>
          item.periodId === run.settlementPeriod.periodId &&
          (!Array.isArray(item.allocations) ||
            item.allocations.some((allocation) => allocation.runId === runId))
      ),
      ledger: this.state.ledger.filter((item) => item.runId === runId),
      accounts: this.state.accounts.filter(
        (item) => item.periodId === periodId && item.route === run.route
      ),
      poolPeriod:
        this.state.poolPeriods.find(
          (item) => item.periodId === periodId && item.route === run.route
        ) ??
        null,
    };
    return clone({
      ...result,
      collectionCounts: {
        items: result.items.length,
        holds: result.holds.length,
        ownLots: result.ownLots.length,
        poolLots: result.poolLots.length,
        accountLots: result.accountLots.length,
        poolPeriodLots: result.poolPeriodLots.length,
        poolPositions: result.poolPositions.length,
        reservations: result.reservations.length,
        ledger: result.ledger.length,
        accounts: result.accounts.length,
      },
    });
  }

  async blockRunAndOpenIncident(incident: CreditIntegrityIncident) {
    if (!this.state.incidents.some((item) => item._id === incident._id)) {
      this.state.incidents.push(clone(incident));
    }
    const run = this.state.runs.find(
      (item) => item._id === incident.runId || item.runId === incident.runId
    );
    if (run) {
      run.status = "blocked";
      run.blockedReason = incident.reasonCodes.join(",");
      run.updatedAt = clone(incident.detectedAt);
    }
    for (const lot of [...this.state.ownLots, ...this.state.poolLots]) {
      if (lot.runId === incident.runId) lot.blocked = true;
    }
    for (const position of this.state.poolPositions) {
      if (position.runId === incident.runId) position.status = "blocked";
    }
    for (const account of this.state.accounts) {
      if (account.periodId === incident.periodId && account.route === incident.route)
        account.blocked = true;
    }
    for (const pool of this.state.poolPeriods) {
      if (pool.periodId === incident.periodId && pool.route === incident.route)
        pool.blocked = true;
    }
  }
}

export function createMemoryCompetitionCreditRunner(
  repository: MemoryCompetitionCreditRepository
) {
  let failuresAfterWork = 0;
  let duplicatesAfterCommit = 0;
  const runner: CompetitionCreditTransactionRunner & {
    failAfterNextWork(): void;
    duplicateAfterNextCommit(): void;
  } = Object.assign(
    async <T>(work: (repo: CompetitionCreditRepository) => Promise<T>) => {
      const before = repository.snapshot();
      try {
        const result = await work(repository);
        if (failuresAfterWork > 0) {
          failuresAfterWork -= 1;
          throw new Error("simulated transaction commit failure");
        }
        if (duplicatesAfterCommit > 0) {
          duplicatesAfterCommit -= 1;
          throw Object.assign(
            new Error("simulated duplicate after concurrent commit"),
            {
              code: 11000,
              committedWinner: true,
            }
          );
        }
        return result;
      } catch (error) {
        if (
          !(error && typeof error === "object" && "committedWinner" in error)
        ) {
          repository.restore(before);
        }
        throw error;
      }
    },
    {
      failAfterNextWork: () => {
        failuresAfterWork += 1;
      },
      duplicateAfterNextCommit: () => {
        duplicatesAfterCommit += 1;
      },
    }
  );
  return runner;
}
