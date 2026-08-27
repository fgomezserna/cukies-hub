import type { CreateIndexesOptions, Db, IndexSpecification } from "mongodb";

export type CreditEconomyIndexDefinition = {
  collection: string;
  keys: IndexSpecification;
  options?: CreateIndexesOptions;
};

export const CREDIT_ECONOMY_COLLECTIONS = [
  "competition_credit_source_watermarks",
  "competition_credit_pool_configs",
  "competition_credit_runs",
  "competition_credit_run_items",
  "competition_credit_run_holds",
  "competition_credit_lots",
  "competition_credit_pool_lots",
  "competition_credit_account_periods",
  "competition_credit_pool_periods",
  "competition_credit_reservations",
  "competition_credit_incidents",
  "competition_credit_ledger",
  "credit_pool_positions",
] as const;

export const CREDIT_ECONOMY_INDEXES: CreditEconomyIndexDefinition[] = [
  {
    collection: "competition_credit_source_watermarks",
    keys: { status: 1, observedThrough: -1 },
  },
  {
    collection: "competition_credit_pool_configs",
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_pool_configs",
    keys: { configId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_pool_configs",
    keys: {
      walletNormalized: 1,
      slotId: 1,
      eligibilityEpoch: 1,
      ruleVersion: 1,
      ruleConfigHash: 1,
      effectiveCutoff: -1,
      requestedAt: -1,
    },
  },
  {
    collection: "competition_credit_runs",
    keys: { "period.periodId": 1, route: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_runs",
    keys: { runId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_runs",
    keys: { route: 1, "period.cutoff": 1, status: 1, leaseExpiresAt: 1, _id: 1 },
  },
  {
    collection: "competition_credit_run_items",
    keys: { runId: 1, status: 1, _id: 1 },
  },
  {
    collection: "competition_credit_run_holds",
    keys: { runId: 1, status: 1, _id: 1 },
    options: { name: "competition_credit_run_holds_status" },
  },
  {
    collection: "competition_credit_run_holds",
    keys: { holdId: 1 },
    options: { unique: true, name: "competition_credit_run_holds_identity" },
  },
  {
    collection: "competition_credit_run_items",
    keys: { earnedPeriodId: 1, slotRoute: 1, slotId: 1, eligibilityEpoch: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_run_items",
    keys: { itemId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_lots",
    keys: { lotId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_lots",
    keys: { periodId: 1, route: 1, runId: 1, sourceSlotId: 1, eligibilityEpoch: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_lots",
    keys: {
      walletNormalized: 1,
      periodId: 1,
      runId: 1,
      blocked: 1,
      expiresAt: 1,
      createdAt: 1,
      _id: 1,
    },
    options: { partialFilterExpression: { availableCredits: { $gt: 0 } } },
  },
  {
    collection: "competition_credit_lots",
    keys: { blocked: 1, expiresAt: 1, availableCredits: 1, _id: 1 },
  },
  {
    collection: "competition_credit_pool_lots",
    keys: { lotId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_pool_lots",
    keys: { periodId: 1, route: 1, runId: 1, sourceSlotId: 1, eligibilityEpoch: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_pool_lots",
    keys: {
      periodId: 1,
      runId: 1,
      blocked: 1,
      expiresAt: 1,
      createdAt: 1,
      _id: 1,
    },
    options: { partialFilterExpression: { availableCredits: { $gt: 0 } } },
  },
  {
    collection: "competition_credit_account_periods",
    keys: { walletNormalized: 1, periodId: 1, route: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_account_periods",
    keys: { blocked: 1, periodId: 1 },
  },
  {
    collection: "competition_credit_pool_periods",
    keys: { periodId: 1, route: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_reservations",
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_reservations",
    keys: { sessionId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_reservations",
    keys: { terminalIdempotencyKey: 1 },
    options: {
      unique: true,
      partialFilterExpression: { terminalIdempotencyKey: { $type: "string" } },
    },
  },
  {
    collection: "competition_credit_reservations",
    keys: { status: 1, expiresAt: 1, _id: 1 },
  },
  {
    collection: "competition_credit_reservations",
    keys: { periodId: 1, _id: 1 },
  },
  {
    collection: "competition_credit_reservations",
    keys: { "allocations.runId": 1, periodId: 1, _id: 1 },
    options: { name: "competition_credit_reservations_run_scope" },
  },
  {
    collection: "competition_credit_incidents",
    keys: { incidentId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_incidents",
    keys: { route: 1, status: 1, walletNormalized: 1, detectedAt: -1 },
  },
  {
    collection: "competition_credit_incidents",
    keys: { route: 1, runId: 1, status: 1 },
  },
  {
    collection: "competition_credit_ledger",
    keys: { ledgerId: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_ledger",
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: "competition_credit_ledger",
    keys: { runId: 1, runItemId: 1, operation: 1, bucket: 1 },
  },
  {
    collection: "competition_credit_ledger",
    keys: { reservationId: 1, lotId: 1, operation: 1 },
  },
  {
    collection: "competition_credit_ledger",
    keys: { walletNormalized: 1, periodId: 1, createdAt: -1 },
  },
  {
    collection: "credit_pool_positions",
    keys: { runItemId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { runItemId: { $type: "string" } },
    },
  },
];

export async function ensureCreditEconomyIndexes(db: Db) {
  for (const definition of CREDIT_ECONOMY_INDEXES) {
    await db
      .collection(definition.collection)
      .createIndex(definition.keys, definition.options);
  }
}
