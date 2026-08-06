import { DomainConflictError } from "../errors";
import { buildRewardRuleConfigHash } from "./rules";
import type {
  RewardAllocation,
  RewardClaimBatch,
  RewardClaimProof,
  RewardIntegrityIncident,
  RewardPeriodSeal,
  RewardPeriodState,
  RewardPoolAccrual,
  RewardRule,
  RewardRuleState,
  RewardSourceManifest,
} from "./types";
import type { RewardRepository, RewardTransactionRunner } from "./repository";

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

const ADDRESS = {
  creditPool: `0x${"1".repeat(40)}`,
  cukiePoolOriginal: `0x${"2".repeat(40)}`,
  cukiePoolSecondPlus: `0x${"3".repeat(40)}`,
  treasury: `0x${"4".repeat(40)}`,
  marketing: `0x${"5".repeat(40)}`,
  development: `0x${"6".repeat(40)}`,
  supplyReduction: `0x${"d".repeat(39)}e`,
};

export function testRewardRule(overrides: Partial<RewardRule> = {}): RewardRule {
  const now = new Date("2026-07-01T00:00:00.000Z");
  const rule: RewardRule = {
    _id: "reward-allocations:v1",
    scope: "reward_allocations",
    version: "rewards-v1",
    active: true,
    activeFrom: now,
    tokenDecimals: 18,
    runCredits: {
      unitScale: 10,
      totalUnits: 100,
      weeklyReserveUnits: 25,
      convertibleUnits: 75,
    },
    settlementBps: {
      poolCredits: 5_000,
      poolCukieWithOwnCredits: 5_000,
      poolCukieWithPoolCredits: 2_500,
    },
    rankingPlayerBps: {
      "1": 10_000,
      "2": 9_000,
      "3": 8_000,
      "4": 7_000,
      "5": 6_000,
      "6": 5_000,
      "7": 4_000,
      "8": 3_000,
      "9": 2_000,
    },
    creditPoolDaily: {
      sourceShareBps: 2_000,
      floorEnabled: true,
      floorCreditsStep: 10,
      floorAmountRaw: "750000000000000000",
    },
    cukiePool: { cumulativeTierCount: 6 },
    undistributedBps: {
      treasury: 8_000,
      marketing: 500,
      development: 500,
      supplyReduction: 1_000,
    },
    destinations: ADDRESS,
    configHash: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  rule.configHash = overrides.configHash ?? buildRewardRuleConfigHash(rule);
  return rule;
}

type MemoryState = {
  rules: RewardRule[];
  allocations: RewardAllocation[];
  incidents: RewardIntegrityIncident[];
  batches: RewardClaimBatch[];
  periodSeals: RewardPeriodSeal[];
  periodStates: RewardPeriodState[];
  proofs: RewardClaimProof[];
  ruleStates: RewardRuleState[];
  sourceManifests: RewardSourceManifest[];
  accruals: RewardPoolAccrual[];
  settledGameSessions: Array<{ sessionId: string; settledAt: Date }>;
  pendingGameSettlements: Array<{ sessionId: string; decidedAt: Date }>;
};

export class MemoryRewardRepository implements RewardRepository {
  state: MemoryState;

  constructor(rule: RewardRule | null = testRewardRule()) {
    this.state = {
      rules: rule ? [clone(rule)] : [],
      allocations: [],
      incidents: [],
      batches: [],
      periodSeals: [],
      periodStates: [],
      proofs: [],
      ruleStates: [],
      sourceManifests: [],
      accruals: [],
      settledGameSessions: [],
      pendingGameSettlements: [],
    };
  }

  snapshot() {
    return clone(this.state);
  }

  restore(state: MemoryState) {
    this.state = clone(state);
  }

  async findRuleAt(at: Date, expectedVersion: string) {
    return (
      clone(
        this.state.rules.find(
          (rule) =>
            rule.version === expectedVersion &&
            rule.active &&
            rule.activeFrom.getTime() <= at.getTime() &&
            (!rule.activeUntil || rule.activeUntil.getTime() > at.getTime())
        )
      ) ?? null
    );
  }

  async findRuleByVersion(version: string) {
    return clone(this.state.rules.find((rule) => rule.version === version) ?? null);
  }

  async findOverlappingActiveRule(activeFrom: Date, activeUntil?: Date) {
    return clone(this.state.rules.find((rule) => (
      rule.active
      && (!activeUntil || rule.activeFrom.getTime() < activeUntil.getTime())
      && (!rule.activeUntil || rule.activeUntil.getTime() > activeFrom.getTime())
    )) ?? null);
  }

  async insertRule(rule: RewardRule) {
    if (this.state.rules.some((item) => item.version === rule.version || item._id === rule._id)) {
      throw new DomainConflictError(`Regla duplicada: ${rule.version}.`);
    }
    this.state.rules.push(clone(rule));
  }

  async advanceRuleScope(now: Date) {
    const current = this.state.ruleStates[0];
    if (!current) {
      const created: RewardRuleState = {
        _id: "reward_allocations",
        scope: "reward_allocations",
        revision: 0,
        createdAt: clone(now),
        updatedAt: clone(now),
      };
      this.state.ruleStates.push(created);
      return clone(created);
    }
    current.revision += 1;
    current.updatedAt = clone(now);
    return clone(current);
  }

  async listSourceAllocations(periodId: string, sourceId: string) {
    return clone(
      this.state.allocations
        .filter((item) => item.periodId === periodId && item.sourceId === sourceId)
        .sort((left, right) => left._id.localeCompare(right._id))
    );
  }

  async findSourceManifest(sourceId: string) {
    return clone(this.state.sourceManifests.find((item) => item.sourceId === sourceId) ?? null);
  }

  async findAnyAllocationBySourceId(sourceId: string) {
    return clone(this.state.allocations.find((item) => item.sourceId === sourceId) ?? null);
  }

  async findAnyAccrualBySourceId(sourceId: string) {
    return clone(this.state.accruals.find((item) => item.sourceId === sourceId) ?? null);
  }

  async insertSourceManifest(manifest: RewardSourceManifest) {
    if (this.state.sourceManifests.some((item) => (
      item._id === manifest._id || item.sourceId === manifest.sourceId
    ))) {
      throw Object.assign(new Error(`Manifest duplicado: ${manifest.sourceId}.`), { code: 11000 });
    }
    this.state.sourceManifests.push(clone(manifest));
  }

  async insertAllocations(allocations: RewardAllocation[]) {
    for (const allocation of allocations) {
      if (this.state.allocations.some((item) => item._id === allocation._id)) {
        throw new DomainConflictError(`Allocation duplicada: ${allocation._id}.`);
      }
    }
    this.state.allocations.push(...clone(allocations));
  }

  async listSourceAccruals(periodId: string, sourceId: string) {
    return clone(this.state.accruals
      .filter((item) => item.periodId === periodId && item.sourceId === sourceId)
      .sort((left, right) => left._id.localeCompare(right._id)));
  }

  async insertAccruals(accruals: RewardPoolAccrual[]) {
    for (const accrual of accruals) {
      if (this.state.accruals.some((item) => item._id === accrual._id)) {
        throw new DomainConflictError(`Accrual duplicado: ${accrual._id}.`);
      }
    }
    this.state.accruals.push(...clone(accruals));
  }

  async blockSourceAndOpenIncident(incident: RewardIntegrityIncident) {
    if (!this.state.incidents.some((item) => item._id === incident._id)) {
      this.state.incidents.push(clone(incident));
    }
    this.state.allocations = this.state.allocations.map((allocation) =>
      allocation.periodId === incident.periodId && allocation.sourceId === incident.sourceId
        ? { ...allocation, status: "blocked", updatedAt: clone(incident.detectedAt) }
        : allocation
    );
    this.state.accruals = this.state.accruals.map((accrual) =>
      accrual.periodId === incident.periodId && accrual.sourceId === incident.sourceId
        ? { ...accrual, status: "blocked", updatedAt: clone(incident.detectedAt) }
        : accrual
    );
    this.state.sourceManifests = this.state.sourceManifests.map((manifest) =>
      manifest.sourceId === incident.sourceId && manifest.periodId === incident.periodId
        ? { ...manifest, status: "blocked", updatedAt: clone(incident.detectedAt) }
        : manifest
    );
  }

  async listPeriodAllocationsPage(
    periodId: string,
    afterAllocationId: string | null,
    limit: number,
  ) {
    return clone(
      this.state.allocations
        .filter((item) => (
          item.periodId === periodId
          && (!afterAllocationId || item._id > afterAllocationId)
        ))
        .sort((left, right) => left._id.localeCompare(right._id))
        .slice(0, limit)
    );
  }

  async listPeriodSourceManifestsPage(
    periodId: string,
    afterSourceId: string | null,
    limit: number,
  ) {
    return clone(
      this.state.sourceManifests
        .filter((item) => (
          item.periodId === periodId
          && (!afterSourceId || item._id > afterSourceId)
        ))
        .sort((left, right) => left._id.localeCompare(right._id))
        .slice(0, limit)
    );
  }

  async listPeriodAccrualsPage(
    periodId: string,
    afterAccrualId: string | null,
    limit: number,
  ) {
    return clone(this.state.accruals
      .filter((item) => item.periodId === periodId && (!afterAccrualId || item._id > afterAccrualId))
      .sort((left, right) => left._id.localeCompare(right._id))
      .slice(0, limit));
  }

  async listSettledGameSessionsPage(
    periodStart: Date,
    periodEndExclusive: Date,
    afterSessionId: string | null,
    limit: number,
  ) {
    return clone(this.state.settledGameSessions
      .filter((item) => (
        item.settledAt.getTime() >= periodStart.getTime()
        && item.settledAt.getTime() < periodEndExclusive.getTime()
        && (!afterSessionId || item.sessionId > afterSessionId)
      ))
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
      .slice(0, limit));
  }

  async countPendingGameSettlements(
    periodStart: Date,
    periodEndExclusive: Date,
  ) {
    return this.state.pendingGameSettlements.filter((item) => (
      item.decidedAt.getTime() >= periodStart.getTime()
      && item.decidedAt.getTime() < periodEndExclusive.getTime()
    )).length;
  }

  async countOpenPeriodIncidents(periodId: string) {
    return this.state.incidents.filter((incident) => (
      incident.periodId === periodId && incident.status === "open"
    )).length;
  }

  async findPeriodState(periodId: string) {
    return clone(this.state.periodStates.find((state) => state.periodId === periodId) ?? null);
  }

  async advanceOpenPeriod(periodId: string, now: Date) {
    const current = this.state.periodStates.find((state) => state.periodId === periodId);
    if (current?.status === "sealed") {
      throw new DomainConflictError(`El periodo ${periodId} ya esta sellado.`);
    }
    if (!current) {
      const created: RewardPeriodState = {
        _id: periodId,
        periodId,
        status: "open",
        allocationRevision: 1,
        revision: 0,
        createdAt: clone(now),
        updatedAt: clone(now),
      };
      this.state.periodStates.push(created);
      return clone(created);
    }
    current.allocationRevision += 1;
    current.revision += 1;
    current.updatedAt = clone(now);
    return clone(current);
  }

  async sealPeriodState(periodId: string, sealId: string, now: Date) {
    const current = this.state.periodStates.find((state) => state.periodId === periodId);
    if (current?.status === "sealed") {
      if (current.sealId !== sealId) {
        throw new DomainConflictError(`El periodo ${periodId} ya tiene otro sello.`);
      }
      return clone(current);
    }
    if (!current) {
      const sealed: RewardPeriodState = {
        _id: periodId,
        periodId,
        status: "sealed",
        allocationRevision: 0,
        revision: 0,
        sealId,
        createdAt: clone(now),
        updatedAt: clone(now),
      };
      this.state.periodStates.push(sealed);
      return clone(sealed);
    }
    current.status = "sealed";
    current.sealId = sealId;
    current.revision += 1;
    current.updatedAt = clone(now);
    return clone(current);
  }

  async findPeriodSeal(periodId: string) {
    return clone(this.state.periodSeals.find((seal) => seal.periodId === periodId) ?? null);
  }

  async insertPeriodSeal(seal: RewardPeriodSeal) {
    if (this.state.periodSeals.some((item) => (
      item._id === seal._id || item.periodId === seal.periodId
    ))) {
      throw new DomainConflictError(`Periodo ya sellado: ${seal.periodId}.`);
    }
    this.state.periodSeals.push(clone(seal));
  }

  async findDraftBatch(draftKey: string) {
    return clone(this.state.batches.find((batch) => batch.draftKey === draftKey) ?? null);
  }

  async listDraftProofsPage(
    batchId: RewardClaimProof["batchId"],
    afterProofId: string | null,
    limit: number,
  ) {
    return clone(this.state.proofs
      .filter((proof) => proof.batchId === batchId && (!afterProofId || proof._id > afterProofId))
      .sort((left, right) => left._id.localeCompare(right._id))
      .slice(0, limit));
  }

  async insertDraftProofs(proofs: RewardClaimProof[]) {
    for (const proof of proofs) {
      if (this.state.proofs.some((item) => (
        item._id === proof._id
        || (item.batchId === proof.batchId && item.walletNormalized === proof.walletNormalized)
      ))) {
        throw new DomainConflictError(`Proof duplicado: ${proof.proofId}.`);
      }
    }
    this.state.proofs.push(...clone(proofs));
  }

  async insertDraftBatch(batch: RewardClaimBatch) {
    if (this.state.batches.some((item) => item._id === batch._id || item.draftKey === batch.draftKey)) {
      throw new DomainConflictError(`Draft batch duplicado: ${batch.draftKey}.`);
    }
    this.state.batches.push(clone(batch));
  }
}

export function createMemoryRewardTransactionRunner(repository: MemoryRewardRepository) {
  const runner: RewardTransactionRunner = async (work) => {
    const snapshot = repository.snapshot();
    try {
      return await work(repository);
    } catch (error) {
      repository.restore(snapshot);
      throw error;
    }
  };
  return runner;
}
