/**
 * Definiciones puras para que el owner del schema coordinado las integre sin
 * crear una segunda fuente de verdad dentro del modulo de rewards.
 */
export const REWARD_ECONOMY_COLLECTIONS = [
  "reward_rule_state",
  "reward_source_manifests",
  "reward_allocations",
  "reward_pool_accruals",
  "game_weekly_rankings",
  "reward_period_states",
  "reward_period_seals",
  "reward_claim_batches",
  "reward_claim_proofs",
  "reward_claims",
  "reward_integrity_incidents",
] as const;

export const REWARD_ECONOMY_INDEX_DEFINITIONS = [
  {
    collection: "reward_rule_state",
    keys: { scope: 1, revision: 1 },
    options: { unique: true, name: "reward_rule_scope_fence" },
  },
  {
    collection: "reward_source_manifests",
    keys: { sourceId: 1 },
    options: { unique: true, name: "reward_source_manifest_global_source" },
  },
  {
    collection: "reward_source_manifests",
    keys: { periodId: 1, _id: 1 },
    options: { name: "reward_source_manifest_period_cursor" },
  },
  {
    collection: "game_weekly_rankings",
    keys: { rankingId: 1 },
    options: { unique: true, name: "game_weekly_ranking_id" },
  },
  {
    collection: "game_weekly_rankings",
    keys: { periodId: 1, gameId: 1, walletNormalized: 1 },
    options: { unique: true, name: "game_weekly_ranking_wallet_period" },
  },
  {
    collection: "game_weekly_rankings",
    keys: { periodId: 1, status: 1, rank: 1, _id: 1 },
    options: { name: "game_weekly_ranking_period_cursor" },
  },
  {
    collection: "reward_allocations",
    keys: { periodId: 1, walletNormalized: 1, category: 1, sourceId: 1 },
    options: { unique: true, name: "reward_allocation_immutable_identity" },
  },
  {
    collection: "reward_pool_accruals",
    keys: { accrualId: 1 },
    options: { unique: true, name: "reward_pool_accrual_id" },
  },
  {
    collection: "reward_pool_accruals",
    keys: { periodId: 1, sourceId: 1, category: 1 },
    options: { unique: true, name: "reward_pool_accrual_source_category" },
  },
  {
    collection: "reward_pool_accruals",
    keys: { periodId: 1, _id: 1 },
    options: { name: "reward_pool_accrual_period_cursor" },
  },
  {
    collection: "reward_pool_accruals",
    keys: { periodId: 1, sourceId: 1, _id: 1 },
    options: { name: "reward_pool_accrual_source_reconciliation" },
  },
  {
    collection: "reward_pool_accruals",
    keys: { sourceId: 1, periodId: 1, _id: 1 },
    options: { name: "reward_pool_accrual_global_source_lookup" },
  },
  {
    collection: "reward_allocations",
    keys: { periodId: 1, status: 1, walletNormalized: 1, _id: 1 },
    options: { name: "reward_allocation_claim_materialization" },
  },
  {
    collection: "reward_allocations",
    keys: { periodId: 1, sourceId: 1, _id: 1 },
    options: { name: "reward_allocation_source_reconciliation" },
  },
  {
    collection: "reward_allocations",
    keys: { periodId: 1, status: 1, _id: 1 },
    options: { name: "reward_allocation_period_materialization" },
  },
  {
    collection: "reward_allocations",
    keys: { periodId: 1, _id: 1 },
    options: { name: "reward_allocation_period_cursor" },
  },
  {
    collection: "reward_allocations",
    keys: { sourceId: 1, periodId: 1, _id: 1 },
    options: { name: "reward_allocation_global_source_lookup" },
  },
  {
    collection: "reward_allocations",
    keys: { walletNormalized: 1, _id: 1 },
    options: { name: "reward_allocation_wallet_cursor" },
  },
  {
    collection: "reward_period_states",
    keys: { periodId: 1 },
    options: { unique: true, name: "reward_period_state_period" },
  },
  {
    collection: "reward_period_states",
    keys: { status: 1, updatedAt: -1 },
    options: { name: "reward_period_state_status" },
  },
  {
    collection: "reward_period_seals",
    keys: { periodId: 1 },
    options: { unique: true, name: "reward_period_seal_period" },
  },
  {
    collection: "reward_period_seals",
    keys: { sealId: 1 },
    options: { unique: true, name: "reward_period_seal_id" },
  },
  {
    collection: "reward_claim_batches",
    keys: { draftKey: 1 },
    options: { unique: true, name: "reward_claim_batch_draft_key" },
  },
  {
    collection: "reward_claim_proofs",
    keys: { proofId: 1 },
    options: { unique: true, name: "reward_claim_proof_id" },
  },
  {
    collection: "reward_claim_proofs",
    keys: { batchId: 1, walletNormalized: 1 },
    options: { unique: true, name: "reward_claim_proof_wallet_batch" },
  },
  {
    collection: "reward_claim_proofs",
    keys: { batchId: 1, _id: 1 },
    options: { name: "reward_claim_proof_batch_cursor" },
  },
  {
    collection: "reward_claim_batches",
    keys: { batchId: 1 },
    options: { unique: true, name: "reward_claim_batch_id" },
  },
  {
    collection: "reward_claim_batches",
    keys: { periodId: 1, status: 1, createdAt: -1 },
    options: { name: "reward_claim_batch_period_status" },
  },
  {
    collection: "reward_claims",
    keys: { batchId: 1, walletNormalized: 1 },
    options: { unique: true, name: "reward_claim_wallet_batch" },
  },
  {
    collection: "reward_claims",
    keys: { batchId: 1, _id: 1 },
    options: { name: "reward_claim_batch_cursor" },
  },
  {
    collection: "reward_claims",
    keys: { transactionHash: 1, logIndex: 1 },
    options: { unique: true, name: "reward_claim_chain_event" },
  },
  {
    collection: "reward_claims",
    keys: { walletNormalized: 1, indexedAt: -1, _id: -1 },
    options: { name: "reward_claim_wallet_history" },
  },
  {
    collection: "reward_integrity_incidents",
    keys: { periodId: 1, sourceId: 1, status: 1, detectedAt: -1 },
    options: { name: "reward_integrity_source_status" },
  },
  {
    collection: "reward_integrity_incidents",
    keys: { sourceId: 1, status: 1, detectedAt: -1 },
    options: { name: "reward_integrity_source_lookup" },
  },
] as const;
