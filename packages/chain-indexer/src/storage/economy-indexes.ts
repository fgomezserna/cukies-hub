import type { CreateIndexesOptions, IndexSpecification } from 'mongodb';

import {
  CREDIT_ECONOMY_COLLECTIONS,
  CREDIT_ECONOMY_INDEXES,
} from './credit-economy-indexes.js';

export const ECONOMY_COLLECTIONS = [
  'economy_schema_metadata',
  'economy_internal_nonces',
  'economy_rule_versions',
  'nft_asset_locks',
  'nft_asset_lock_events',
  'cukie_master_snapshots',
  'cukie_master_slot_events',
  'cukie_master_route_rounds',
  'cukie_master_route_capacity',
  'cukie_master_positions',
  'cukie_master_slots',
  'cukie_master_slot_versions',
  'cukie_master_slot_history_state',
  'cukie_master_position_events',
  'cukie_master_recalculation_jobs',
  'cukie_master_runtime_runs',
  'cukie_master_runtime_state',
  'cukie_master_nft_positions',
  'cukie_pool_nft_vault_positions',
  'nft_vault_collections',
  'cukie_pool_calendar_versions',
  'cukie_pool_vault_asset_leases',
  'cukie_pool_vault_period_usage',
  'nft_vault_recovery_audit',
  'uki_staking_positions',
  'uki_staking_state',
  'uki_vesting_events',
  'uki_vesting_positions',
  'chain_bsc_checkpoints',
  'chain_bsc_canonical_blocks',
  'competition_credit_cutoff_blocks',
  'chain_integrity_incidents',
  ...CREDIT_ECONOMY_COLLECTIONS,
  'competition_credit_runtime_state',
  'competition_credit_runtime_runs',
  'cukie_pool_positions',
  'cukie_pool_assignments',
  'cukie_pool_events',
  'cukie_pool_runtime_state',
  'cukie_pool_runtime_runs',
  'game_economy_rule_state',
  'game_economy_rules',
  'game_economy_sessions',
  'game_economy_events',
  'game_economy_resource_bindings',
  'game_owned_cukie_epochs',
  'game_owned_cukie_assignments',
  'game_owned_cukie_events',
  'game_result_evidence',
  'treasure_hunt_economy_runs',
  'treasure_hunt_pool_daily_usage',
  'treasure_hunt_pool_quota_reservations',
  'treasure_hunt_weekly_bests',
  'game_economy_runtime_state',
  'game_economy_runtime_runs',
  'ambassador_attributions',
  'reward_rule_state',
  'reward_emission_budget_state',
  'reward_emission_budget_days',
  'reward_emission_budget_events',
  'reward_source_manifests',
  'reward_allocations',
  'reward_pool_accruals',
  'reward_daily_capacity_materializations',
  'reward_accounting_allocations',
  'reward_daily_accounting',
  'reward_weekly_prize_accounting',
  'reward_pool_tranche_accounting',
  'reward_weekly_game_sources',
  'reward_accounting_runtime_state',
  'reward_accounting_runtime_runs',
  'weekly_ranking_rule_state',
  'weekly_ranking_period_states',
  'weekly_ranking_sources',
  'weekly_ranking_manifests',
  'weekly_ranking_runs',
  'weekly_ranking_audit_events',
  'weekly_ranking_runtime_state',
  'weekly_ranking_runtime_runs',
  'game_weekly_rankings',
  'reward_period_states',
  'reward_period_seals',
  'reward_claim_batches',
  'reward_claim_proofs',
  'reward_claims',
  'reward_publication_plans',
  'reward_integrity_incidents',
] as const;

export type EconomyCollectionName = (typeof ECONOMY_COLLECTIONS)[number];

export type EconomyIndexDefinition = {
  collection: EconomyCollectionName;
  keys: IndexSpecification;
  options?: CreateIndexesOptions;
};

const CORE_ECONOMY_INDEXES: EconomyIndexDefinition[] = [
  {
    collection: 'economy_schema_metadata',
    keys: { dbName: 1, schemaVersion: 1 },
  },
  {
    collection: 'economy_internal_nonces',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'economy_internal_nonce_expiry' },
  },
  {
    collection: 'economy_internal_nonces',
    keys: { keyId: 1, consumedAt: -1 },
    options: { name: 'economy_internal_nonce_audit' },
  },
  {
    collection: 'economy_rule_versions',
    keys: { scope: 1, version: 1 },
    options: { unique: true },
  },
  {
    collection: 'economy_rule_versions',
    keys: { scope: 1, active: 1, activeFrom: -1, activeUntil: 1 },
  },
  {
    collection: 'nft_asset_locks',
    keys: { assetId: 1, status: 1 },
    options: { unique: true, partialFilterExpression: { status: 'active' } },
  },
  {
    collection: 'nft_asset_locks',
    keys: { lockId: 1 },
    options: { unique: true },
  },
  {
    collection: 'nft_asset_locks',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'nft_asset_locks',
    keys: { ownerNormalized: 1, status: 1, expiresAt: 1 },
  },
  {
    collection: 'nft_asset_locks',
    keys: { status: 1, expiresAt: 1 },
  },
  {
    collection: 'nft_asset_locks',
    keys: { status: 1, _id: 1 },
  },
  {
    collection: 'nft_asset_locks',
    keys: { status: 1, ownerNormalized: 1, _id: 1 },
  },
  {
    collection: 'nft_asset_lock_events',
    keys: { eventId: 1 },
    options: { unique: true },
  },
  {
    collection: 'nft_asset_lock_events',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'nft_asset_lock_events',
    keys: { lockId: 1, createdAt: -1 },
  },
  {
    collection: 'nft_asset_lock_events',
    keys: { assetId: 1, createdAt: -1 },
  },
  {
    collection: 'nft_asset_locks',
    keys: { ownerNormalized: 1, status: 1, updatedAt: -1 },
  },
  {
    collection: 'cukie_master_snapshots',
    keys: { walletNormalized: 1, periodId: 1, ruleVersion: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_snapshots',
    keys: { periodId: 1, totalSlots: -1 },
  },
  {
    collection: 'cukie_master_slot_events',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_route_rounds',
    keys: { route: 1, status: 1 },
    options: { unique: true, partialFilterExpression: { status: 'active' } },
  },
  {
    collection: 'cukie_master_route_rounds',
    keys: { route: 1, updatedAt: -1 },
  },
  {
    collection: 'cukie_master_route_rounds',
    keys: { status: 1, graceEndsAt: 1 },
  },
  {
    collection: 'cukie_master_route_capacity',
    keys: { route: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_positions',
    keys: { walletNormalized: 1, route: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_slots',
    keys: { walletNormalized: 1, route: 1, ordinal: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_slot_versions',
    keys: { slotId: 1, route: 1, effectiveBlockNumber: -1, 'slot.revision': -1 },
    options: { name: 'cukie_master_slot_versions_temporal' },
  },
  {
    collection: 'cukie_master_slot_versions',
    keys: { route: 1, effectiveBlockNumber: -1, slotId: 1, _id: 1 },
    options: { name: 'cukie_master_slot_versions_cutoff' },
  },
  {
    collection: 'cukie_master_slot_history_state',
    keys: { completeFromBlockNumber: 1, completeFrom: 1, observedThrough: 1 },
    options: { name: 'cukie_master_slot_history_coverage' },
  },
  {
    collection: 'cukie_master_slots',
    keys: { status: 1, creditEligibleFrom: 1, _id: 1 },
  },
  {
    collection: 'cukie_master_positions',
    keys: { route: 1, waitlistedAt: 1, _id: 1 },
  },
  {
    collection: 'cukie_master_positions',
    keys: { route: 1, allocatedSlots: 1, _id: 1 },
  },
  {
    collection: 'cukie_master_positions',
    keys: { walletNormalized: 1, _id: 1 },
  },
  {
    collection: 'cukie_master_positions',
    keys: { status: 1, activeFrom: 1, allocatedSlots: 1 },
  },
  {
    collection: 'cukie_master_position_events',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_recalculation_jobs',
    keys: { status: 1, availableAt: 1, createdAt: 1, _id: 1 },
  },
  {
    collection: 'cukie_master_recalculation_jobs',
    keys: { status: 1, leaseExpiresAt: 1, _id: 1 },
  },
  {
    collection: 'cukie_master_recalculation_jobs',
    keys: { walletNormalized: 1, status: 1, createdAt: -1 },
  },
  {
    collection: 'cukie_master_recalculation_jobs',
    keys: { expiresAt: 1 },
    options: {
      expireAfterSeconds: 0,
      name: 'cukie_master_completed_job_expiry',
      partialFilterExpression: { status: 'completed' },
    },
  },
  {
    collection: 'cukie_master_runtime_runs',
    keys: { status: 1, endedAt: -1 },
  },
  {
    collection: 'cukie_master_runtime_runs',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'cukie_master_runtime_run_expiry' },
  },
  {
    collection: 'cukie_master_runtime_state',
    keys: { updatedAt: -1 },
  },
  {
    collection: 'cukie_master_position_events',
    keys: { walletNormalized: 1, route: 1, createdAt: -1 },
  },
  {
    collection: 'uki_staking_positions',
    keys: { walletNormalized: 1 },
    options: { unique: true },
  },
  {
    collection: 'uki_staking_positions',
    keys: { updatedAt: -1, lastEventId: 1 },
  },
  {
    collection: 'uki_staking_positions',
    keys: { walletNormalized: 1, _id: 1 },
  },
  {
    collection: 'uki_staking_state',
    keys: { contractAddressNormalized: 1 },
    options: { unique: true },
  },
  {
    collection: 'uki_vesting_events',
    keys: { eventId: 1 },
    options: { unique: true },
  },
  {
    collection: 'uki_vesting_events',
    keys: { beneficiaryNormalized: 1, scheduleId: 1, blockNumber: 1, logIndex: 1 },
  },
  {
    collection: 'uki_vesting_positions',
    keys: { walletNormalized: 1, scheduleId: 1 },
    options: { unique: true },
  },
  {
    collection: 'uki_vesting_positions',
    keys: { updatedAt: -1, lastEventId: 1 },
  },
  {
    collection: 'uki_vesting_positions',
    keys: { walletNormalized: 1, _id: 1 },
  },
  {
    collection: 'chain_bsc_checkpoints',
    keys: { safeBlockNumber: -1 },
  },
  {
    collection: 'chain_bsc_canonical_blocks',
    keys: { blockTimestamp: -1, blockNumber: -1 },
    options: { unique: true },
  },
  {
    collection: 'competition_credit_cutoff_blocks',
    keys: { cutoff: 1, blockNumber: 1 },
    options: { unique: true },
  },
  {
    collection: 'chain_integrity_incidents',
    keys: { status: 1, chain: 1, detectedAt: -1 },
  },
  {
    collection: 'uki_staking_state',
    keys: { updatedAt: -1, lastEventId: 1 },
  },
  {
    collection: 'cukie_master_slot_events',
    keys: { walletNormalized: 1, createdAt: -1 },
  },
  {
    collection: 'cukie_master_nft_positions',
    keys: { assetId: 1, depositEpoch: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_master_nft_positions',
    keys: { assetId: 1, lifecycleOpen: 1 },
    options: { unique: true, partialFilterExpression: { lifecycleOpen: true } },
  },
  {
    collection: 'cukie_master_nft_positions',
    keys: { beneficiaryNormalized: 1, lifecycleOpen: 1, updatedAt: -1 },
  },
  {
    collection: 'cukie_pool_nft_vault_positions',
    keys: { assetId: 1, depositEpoch: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_nft_vault_positions',
    keys: { assetId: 1, lifecycleOpen: 1 },
    options: { unique: true, partialFilterExpression: { lifecycleOpen: true } },
  },
  {
    collection: 'cukie_pool_nft_vault_positions',
    keys: { beneficiaryNormalized: 1, lifecycleOpen: 1, updatedAt: -1 },
  },
  {
    collection: 'cukie_pool_nft_vault_positions',
    keys: { lifecycleOpen: 1, activationAt: 1 },
  },
  {
    collection: 'cukie_pool_nft_vault_positions',
    keys: { lifecycleOpen: 1, withdrawableAt: 1 },
  },
  {
    collection: 'cukie_pool_nft_vault_positions',
    keys: {
      chainId: 1,
      vaultAddressNormalized: 1,
      collectionAddressNormalized: 1,
      activationAt: 1,
      exitRequestedAt: 1,
    },
    options: { name: 'cukie_pool_reward_census' },
  },
  {
    collection: 'nft_vault_collections',
    keys: { vaultAlias: 1, vaultAddressNormalized: 1, collectionAddressNormalized: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_calendar_versions',
    keys: { chainId: 1, vaultAddressNormalized: 1, calendarVersion: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_vault_asset_leases',
    keys: { positionId: 1 },
    options: { unique: true, name: 'cukie_pool_vault_lease_position_unique' },
  },
  {
    collection: 'cukie_pool_vault_asset_leases',
    keys: { assignmentId: 1 },
    options: { unique: true, name: 'cukie_pool_vault_lease_assignment_unique' },
  },
  {
    collection: 'cukie_pool_vault_asset_leases',
    keys: { sessionId: 1 },
    options: { unique: true, name: 'cukie_pool_vault_lease_session_unique' },
  },
  {
    collection: 'cukie_pool_vault_asset_leases',
    keys: { expiresAt: 1, _id: 1 },
    options: { name: 'cukie_pool_vault_lease_expiry_audit' },
  },
  {
    collection: 'cukie_pool_vault_period_usage',
    keys: { assetId: 1, depositEpoch: 1, periodId: 1 },
    options: { unique: true, name: 'cukie_pool_vault_usage_epoch_period_unique' },
  },
  {
    collection: 'cukie_pool_vault_period_usage',
    keys: { periodId: 1, _id: 1 },
    options: { name: 'cukie_pool_vault_usage_period_audit' },
  },
  {
    collection: 'nft_vault_recovery_audit',
    keys: { assetId: 1, 'evidence.blockNumber': -1 },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { assetId: 1, status: 1 },
    options: { unique: true, partialFilterExpression: { status: 'active' } },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { assetId: 1, lifecycleOpen: 1 },
    options: { unique: true, partialFilterExpression: { lifecycleOpen: true } },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { lockId: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { ownerNormalized: 1, status: 1, updatedAt: -1 },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { ownerNormalized: 1, _id: 1 },
    options: { name: 'cukie_pool_wallet_cursor' },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { lifecycleOpen: 1, _id: 1 },
    options: { name: 'cukie_pool_open_reconciliation' },
  },
  {
    collection: 'cukie_pool_positions',
    keys: { poolType: 1, status: 1, rarity: 1 },
  },
  {
    collection: 'cukie_pool_positions',
    keys: {
      status: 1,
      lifecycleOpen: 1,
      withdrawalRequestedAt: 1,
      poolPriority: 1,
      eligibleAt: 1,
      stakedAt: 1,
      _id: 1,
    },
  },
  {
    collection: 'cukie_pool_assignments',
    keys: { sessionId: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_assignments',
    keys: { assignmentId: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_assignments',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_assignments',
    keys: { status: 1, expiresAt: 1, _id: 1 },
  },
  {
    collection: 'cukie_pool_assignments',
    keys: { assetId: 1, status: 1, assignedAt: -1 },
  },
  {
    collection: 'cukie_pool_events',
    keys: { eventId: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_events',
    keys: { idempotencyKey: 1 },
    options: { unique: true },
  },
  {
    collection: 'cukie_pool_events',
    keys: { positionId: 1, createdAt: -1 },
  },
  {
    collection: 'cukie_pool_events',
    keys: { assignmentId: 1, createdAt: -1 },
  },
  {
    collection: 'competition_credit_runtime_state',
    keys: { updatedAt: -1 },
  },
  {
    collection: 'competition_credit_runtime_state',
    keys: { schedulerId: 1, lastAttemptAt: -1 },
  },
  {
    collection: 'competition_credit_runtime_runs',
    keys: { status: 1, endedAt: -1 },
  },
  {
    collection: 'competition_credit_runtime_runs',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'competition_credit_runtime_run_expiry' },
  },
  {
    collection: 'cukie_pool_runtime_state',
    keys: { updatedAt: -1 },
    options: { name: 'cukie_pool_runtime_state_health' },
  },
  {
    collection: 'cukie_pool_runtime_state',
    keys: { schedulerId: 1, lastAttemptAt: -1 },
    options: { name: 'cukie_pool_scheduler_heartbeat' },
  },
  {
    collection: 'cukie_pool_runtime_runs',
    keys: { status: 1, endedAt: -1 },
    options: { name: 'cukie_pool_runtime_run_health' },
  },
  {
    collection: 'cukie_pool_runtime_runs',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'cukie_pool_runtime_run_expiry' },
  },
  {
    collection: 'game_economy_rule_state',
    keys: { gameId: 1 },
    options: { unique: true, name: 'game_rule_state_game_unique' },
  },
  {
    collection: 'game_economy_rules',
    keys: { gameId: 1, version: 1 },
    options: { unique: true, name: 'game_rule_version_unique' },
  },
  {
    collection: 'game_economy_rules',
    keys: { gameId: 1, active: 1, activeFrom: -1, activeUntil: 1 },
    options: { name: 'game_rule_active_window' },
  },
  {
    collection: 'game_economy_rules',
    keys: { gameId: 1, configHash: 1 },
    options: { name: 'game_rule_config_integrity' },
  },
  {
    collection: 'game_economy_sessions',
    keys: { sessionId: 1 },
    options: { unique: true, name: 'game_session_id_unique' },
  },
  {
    collection: 'game_economy_sessions',
    keys: { 'createCommand.idempotencyKey': 1 },
    options: { unique: true, name: 'game_session_create_idempotency_unique' },
  },
  {
    collection: 'game_economy_sessions',
    keys: { 'validation.evidenceId': 1 },
    options: {
      unique: true,
      name: 'game_session_evidence_once',
      partialFilterExpression: { 'validation.evidenceId': { $type: 'string' } },
    },
  },
  {
    collection: 'game_economy_sessions',
    keys: { walletNormalized: 1, gameId: 1, createdAt: -1 },
    options: { name: 'game_session_wallet_history' },
  },
  {
    collection: 'game_economy_sessions',
    keys: { status: 1, expiresAt: 1, _id: 1 },
    options: { name: 'game_session_expiry_scan' },
  },
  {
    collection: 'game_economy_sessions',
    keys: { status: 1, settledAt: 1, sessionId: 1 },
    options: { name: 'game_session_reward_census' },
  },
  {
    collection: 'game_economy_sessions',
    keys: { 'settlementIntent.decidedAt': 1, _id: 1 },
    options: {
      name: 'game_session_pending_settlement_census',
      partialFilterExpression: {
        'settlementIntent.decidedAt': { $type: 'date' },
      },
    },
  },
  {
    collection: 'game_economy_sessions',
    keys: { 'operation.leaseExpiresAt': 1, status: 1, _id: 1 },
    options: { name: 'game_session_stale_operation_scan' },
  },
  {
    collection: 'treasure_hunt_economy_runs',
    keys: { authorityGameSessionId: 1 },
    options: { unique: true, name: 'treasure_run_authority_session_unique' },
  },
  {
    collection: 'treasure_hunt_economy_runs',
    keys: { gameEconomySessionId: 1 },
    options: { unique: true, name: 'treasure_run_economy_session_unique' },
  },
  {
    collection: 'treasure_hunt_economy_runs',
    keys: { walletNormalized: 1, dailyPeriodId: 1, reservedAt: 1 },
    options: { name: 'treasure_run_wallet_daily_period' },
  },
  {
    collection: 'treasure_hunt_economy_runs',
    keys: { status: 1, updatedAt: 1, _id: 1 },
    options: { name: 'treasure_run_recovery_scan' },
  },
  {
    collection: 'treasure_hunt_pool_daily_usage',
    keys: { walletNormalized: 1, dailyPeriodId: 1 },
    options: { unique: true, name: 'treasure_pool_usage_wallet_period_unique' },
  },
  {
    collection: 'treasure_hunt_pool_quota_reservations',
    keys: { runId: 1 },
    options: { unique: true, name: 'treasure_pool_quota_run_unique' },
  },
  {
    collection: 'treasure_hunt_pool_quota_reservations',
    keys: { walletNormalized: 1, dailyPeriodId: 1, status: 1 },
    options: { name: 'treasure_pool_quota_wallet_period_status' },
  },
  {
    collection: 'treasure_hunt_weekly_bests',
    keys: { walletNormalized: 1, weeklyPeriodId: 1, gameId: 1 },
    options: { unique: true, name: 'treasure_weekly_best_wallet_unique' },
  },
  {
    collection: 'treasure_hunt_weekly_bests',
    keys: { weeklyPeriodId: 1, scoreDigits: -1, scoreRaw: -1, achievedAt: 1 },
    options: { name: 'treasure_weekly_best_score_order' },
  },
  {
    collection: 'ambassador_attributions',
    keys: { referredWalletNormalized: 1 },
    options: { unique: true, name: 'ambassador_referred_wallet_unique' },
  },
  {
    collection: 'ambassador_attributions',
    keys: { ambassadorWalletNormalized: 1, acceptedAt: -1, _id: 1 },
    options: { name: 'ambassador_direct_referrals' },
  },
  {
    collection: 'ambassador_attributions',
    keys: { source: 1, policyVersion: 1, acceptedAt: -1 },
    options: { name: 'ambassador_policy_audit' },
  },
  {
    collection: 'game_economy_events',
    keys: { eventId: 1 },
    options: { unique: true, name: 'game_event_id_unique' },
  },
  {
    collection: 'game_economy_events',
    keys: { sessionId: 1, toRevision: 1 },
    options: { unique: true, name: 'game_event_session_revision_unique' },
  },
  {
    collection: 'game_economy_events',
    keys: { sessionId: 1, createdAt: 1, _id: 1 },
    options: { name: 'game_event_session_history' },
  },
  {
    collection: 'game_economy_resource_bindings',
    keys: { sessionId: 1, kind: 1 },
    options: { unique: true, name: 'game_resource_session_kind_unique' },
  },
  {
    collection: 'game_economy_resource_bindings',
    keys: { reservationIdempotencyKey: 1 },
    options: { unique: true, name: 'game_resource_idempotency_unique' },
  },
  {
    collection: 'game_economy_resource_bindings',
    keys: { kind: 1, reservationId: 1 },
    options: {
      unique: true,
      name: 'game_resource_external_reservation_unique',
      partialFilterExpression: { reservationId: { $type: 'string' } },
    },
  },
  {
    collection: 'game_economy_resource_bindings',
    keys: { status: 1, updatedAt: 1, _id: 1 },
    options: { name: 'game_resource_reconciliation_scan' },
  },
  {
    collection: 'game_owned_cukie_epochs',
    keys: { epochId: 1 },
    options: { unique: true, name: 'game_owned_cukie_epoch_unique' },
  },
  {
    collection: 'game_owned_cukie_epochs',
    keys: { assetId: 1, ownerNormalized: 1, ownershipEventId: 1 },
    options: { unique: true, name: 'game_owned_cukie_ownership_epoch_unique' },
  },
  {
    collection: 'game_owned_cukie_epochs',
    keys: { ownerNormalized: 1, status: 1, gamesRemaining: -1, _id: 1 },
    options: { name: 'game_owned_cukie_wallet_quota' },
  },
  {
    collection: 'game_owned_cukie_assignments',
    keys: { assignmentId: 1 },
    options: { unique: true, name: 'game_owned_cukie_assignment_unique' },
  },
  {
    collection: 'game_owned_cukie_assignments',
    keys: { sessionId: 1 },
    options: { unique: true, name: 'game_owned_cukie_session_unique' },
  },
  {
    collection: 'game_owned_cukie_assignments',
    keys: { idempotencyKey: 1 },
    options: { unique: true, name: 'game_owned_cukie_idempotency_unique' },
  },
  {
    collection: 'game_owned_cukie_assignments',
    keys: { epochId: 1, status: 1 },
    options: {
      unique: true,
      name: 'game_owned_cukie_active_epoch_unique',
      partialFilterExpression: { status: 'active' },
    },
  },
  {
    collection: 'game_owned_cukie_assignments',
    keys: { status: 1, expiresAt: 1, _id: 1 },
    options: { name: 'game_owned_cukie_expiry_scan' },
  },
  {
    collection: 'game_owned_cukie_events',
    keys: { eventId: 1 },
    options: { unique: true, name: 'game_owned_cukie_event_unique' },
  },
  {
    collection: 'game_owned_cukie_events',
    keys: { idempotencyKey: 1 },
    options: { unique: true, name: 'game_owned_cukie_event_idempotency_unique' },
  },
  {
    collection: 'game_owned_cukie_events',
    keys: { assignmentId: 1, createdAt: 1, _id: 1 },
    options: { name: 'game_owned_cukie_assignment_history' },
  },
  {
    collection: 'game_result_evidence',
    keys: { evidenceId: 1 },
    options: { unique: true, name: 'game_evidence_id_unique' },
  },
  {
    collection: 'game_result_evidence',
    keys: { evidenceReference: 1 },
    options: { unique: true, name: 'game_evidence_reference_unique' },
  },
  {
    collection: 'game_result_evidence',
    keys: { idempotencyKey: 1 },
    options: { unique: true, name: 'game_evidence_idempotency_unique' },
  },
  {
    collection: 'game_result_evidence',
    keys: { sessionId: 1, status: 1 },
    options: { name: 'game_evidence_session_status' },
  },
  {
    collection: 'game_economy_runtime_state',
    keys: { updatedAt: -1 },
    options: { name: 'game_runtime_state_health' },
  },
  {
    collection: 'game_economy_runtime_state',
    keys: { schedulerId: 1, lastAttemptAt: -1 },
    options: { name: 'game_runtime_scheduler_heartbeat' },
  },
  {
    collection: 'game_economy_runtime_runs',
    keys: { status: 1, endedAt: -1 },
    options: { name: 'game_runtime_run_health' },
  },
  {
    collection: 'game_economy_runtime_runs',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'game_runtime_run_expiry' },
  },
  {
    collection: 'reward_rule_state',
    keys: { scope: 1, revision: 1 },
    options: { unique: true, name: 'reward_rule_scope_fence' },
  },
  {
    collection: 'reward_emission_budget_state',
    keys: { scope: 1, revision: 1 },
    options: { unique: true, name: 'reward_emission_budget_global_fence' },
  },
  {
    collection: 'reward_emission_budget_days',
    keys: { dayId: 1 },
    options: { unique: true, name: 'reward_emission_budget_day' },
  },
  {
    collection: 'reward_emission_budget_days',
    keys: { startsAt: 1, _id: 1 },
    options: { name: 'reward_emission_budget_day_cursor' },
  },
  {
    collection: 'reward_emission_budget_events',
    keys: { eventId: 1 },
    options: { unique: true, name: 'reward_emission_budget_event' },
  },
  {
    collection: 'reward_emission_budget_events',
    keys: { sourceId: 1 },
    options: { unique: true, name: 'reward_emission_budget_source_fence' },
  },
  {
    collection: 'reward_emission_budget_events',
    keys: { dayId: 1, status: 1, createdAt: 1, _id: 1 },
    options: { name: 'reward_emission_budget_audit_cursor' },
  },
  {
    collection: 'reward_emission_budget_events',
    keys: { periodId: 1, _id: 1 },
    options: { name: 'reward_emission_budget_period_cursor' },
  },
  {
    collection: 'reward_source_manifests',
    keys: { sourceId: 1 },
    options: { unique: true, name: 'reward_source_manifest_global_source' },
  },
  {
    collection: 'reward_source_manifests',
    keys: { periodId: 1, _id: 1 },
    options: { name: 'reward_source_manifest_period_cursor' },
  },
  {
    collection: 'weekly_ranking_rule_state',
    keys: { scope: 1, revision: 1 },
    options: { unique: true, name: 'weekly_ranking_rule_fence' },
  },
  {
    collection: 'weekly_ranking_period_states',
    keys: { periodId: 1 },
    options: { unique: true, name: 'weekly_ranking_period_state' },
  },
  {
    collection: 'weekly_ranking_sources',
    keys: { sourceId: 1 },
    options: { unique: true, name: 'weekly_ranking_source_id' },
  },
  {
    collection: 'weekly_ranking_sources',
    keys: { periodId: 1, _id: 1 },
    options: { name: 'weekly_ranking_source_period_cursor' },
  },
  {
    collection: 'weekly_ranking_sources',
    keys: { periodId: 1, gameId: 1, walletNormalized: 1, _id: 1 },
    options: { name: 'weekly_ranking_source_participant_cursor' },
  },
  {
    collection: 'weekly_ranking_sources',
    keys: { sessionId: 1 },
    options: { unique: true, name: 'weekly_ranking_source_session' },
  },
  {
    collection: 'weekly_ranking_manifests',
    keys: { periodId: 1 },
    options: { unique: true, name: 'weekly_ranking_manifest_period' },
  },
  {
    collection: 'weekly_ranking_manifests',
    keys: { manifestId: 1 },
    options: { unique: true, name: 'weekly_ranking_manifest_id' },
  },
  {
    collection: 'weekly_ranking_runs',
    keys: { periodId: 1 },
    options: { unique: true, name: 'weekly_ranking_run_period' },
  },
  {
    collection: 'weekly_ranking_runs',
    keys: { runId: 1 },
    options: { unique: true, name: 'weekly_ranking_run_id' },
  },
  {
    collection: 'weekly_ranking_audit_events',
    keys: { eventId: 1 },
    options: { unique: true, name: 'weekly_ranking_audit_event_id' },
  },
  {
    collection: 'weekly_ranking_audit_events',
    keys: { periodId: 1, createdAt: 1, _id: 1 },
    options: { name: 'weekly_ranking_audit_period_cursor' },
  },
  {
    collection: 'weekly_ranking_runtime_state',
    keys: { updatedAt: -1 },
    options: { name: 'weekly_ranking_runtime_health' },
  },
  {
    collection: 'weekly_ranking_runtime_state',
    keys: { schedulerId: 1, lastAttemptAt: -1 },
    options: { name: 'weekly_ranking_scheduler_heartbeat' },
  },
  {
    collection: 'weekly_ranking_runtime_runs',
    keys: { status: 1, endedAt: -1 },
    options: { name: 'weekly_ranking_runtime_run_health' },
  },
  {
    collection: 'weekly_ranking_runtime_runs',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'weekly_ranking_runtime_run_expiry' },
  },
  {
    collection: 'game_weekly_rankings',
    keys: { rankingId: 1 },
    options: { unique: true, name: 'game_weekly_ranking_id' },
  },
  {
    collection: 'game_weekly_rankings',
    keys: { periodId: 1, gameId: 1, walletNormalized: 1 },
    options: { unique: true, name: 'game_weekly_ranking_wallet_period' },
  },
  {
    collection: 'game_weekly_rankings',
    keys: { gameId: 1, walletNormalized: 1, periodStart: -1, _id: -1 },
    options: { name: 'game_weekly_ranking_previous' },
  },
  {
    collection: 'game_weekly_rankings',
    keys: { periodId: 1, status: 1, rank: 1, _id: 1 },
    options: { name: 'game_weekly_ranking_period_cursor' },
  },
  {
    collection: 'reward_allocations',
    keys: { allocationId: 1 },
    options: { unique: true, name: 'reward_allocation_id' },
  },
  {
    collection: 'reward_allocations',
    keys: { periodId: 1, walletNormalized: 1, category: 1, sourceId: 1 },
    options: { unique: true, name: 'reward_allocation_immutable_identity' },
  },
  {
    collection: 'reward_allocations',
    keys: { periodId: 1, status: 1, walletNormalized: 1, _id: 1 },
    options: { name: 'reward_allocation_claim_materialization' },
  },
  {
    collection: 'reward_allocations',
    keys: { periodId: 1, sourceId: 1, _id: 1 },
    options: { name: 'reward_allocation_source_reconciliation' },
  },
  {
    collection: 'reward_allocations',
    keys: { periodId: 1, status: 1, _id: 1 },
    options: { name: 'reward_allocation_period_materialization' },
  },
  {
    collection: 'reward_allocations',
    keys: { periodId: 1, _id: 1 },
    options: { name: 'reward_allocation_period_cursor' },
  },
  {
    collection: 'reward_allocations',
    keys: { sourceId: 1, periodId: 1, _id: 1 },
    options: { name: 'reward_allocation_global_source_lookup' },
  },
  {
    collection: 'reward_allocations',
    keys: { walletNormalized: 1, _id: 1 },
    options: { name: 'reward_allocation_wallet_cursor' },
  },
  {
    collection: 'reward_pool_accruals',
    keys: { accrualId: 1 },
    options: { unique: true, name: 'reward_pool_accrual_id' },
  },
  {
    collection: 'reward_pool_accruals',
    keys: { periodId: 1, sourceId: 1, category: 1 },
    options: { unique: true, name: 'reward_pool_accrual_source_category' },
  },
  {
    collection: 'reward_pool_accruals',
    keys: { periodId: 1, _id: 1 },
    options: { name: 'reward_pool_accrual_period_cursor' },
  },
  {
    collection: 'reward_pool_accruals',
    keys: { periodId: 1, sourceId: 1, _id: 1 },
    options: { name: 'reward_pool_accrual_source_reconciliation' },
  },
  {
    collection: 'reward_pool_accruals',
    keys: { sourceId: 1, periodId: 1, _id: 1 },
    options: { name: 'reward_pool_accrual_global_source_lookup' },
  },
  {
    collection: 'reward_daily_capacity_materializations',
    keys: { dayId: 1 },
    options: { unique: true, name: 'reward_daily_capacity_day' },
  },
  {
    collection: 'reward_daily_capacity_materializations',
    keys: { status: 1, sealedAt: 1, _id: 1 },
    options: { name: 'reward_daily_capacity_audit_cursor' },
  },
  {
    collection: 'reward_accounting_allocations',
    keys: { allocationId: 1 },
    options: { unique: true, name: 'reward_accounting_allocation_identity' },
  },
  {
    collection: 'reward_accounting_allocations',
    keys: { accountingId: 1, allocationId: 1 },
    options: { name: 'reward_accounting_allocation_source' },
  },
  {
    collection: 'reward_accounting_allocations',
    keys: { status: 1, availableAt: 1, accountingId: 1, _id: 1 },
    options: { name: 'reward_accounting_allocation_publication_scan' },
  },
  {
    collection: 'reward_accounting_allocations',
    keys: { walletNormalized: 1, status: 1, availableAt: 1, allocationId: 1 },
    options: { name: 'reward_accounting_allocation_wallet' },
  },
  {
    collection: 'reward_accounting_allocations',
    keys: { periodId: 1, category: 1, allocationId: 1 },
    options: { name: 'reward_accounting_allocation_period' },
  },
  {
    collection: 'reward_daily_accounting',
    keys: { dayId: 1 },
    options: { unique: true, name: 'reward_daily_accounting_day' },
  },
  {
    collection: 'reward_daily_accounting',
    keys: { status: 1, sealedAt: 1, _id: 1 },
    options: { name: 'reward_daily_accounting_audit_cursor' },
  },
  {
    collection: 'reward_weekly_prize_accounting',
    keys: { periodId: 1 },
    options: { unique: true, name: 'reward_weekly_prize_period' },
  },
  {
    collection: 'reward_weekly_prize_accounting',
    keys: { status: 1, payoutAt: 1, _id: 1 },
    options: { name: 'reward_weekly_prize_payout_cursor' },
  },
  {
    collection: 'reward_weekly_prize_accounting',
    keys: { poolTrancheSchedule: 1, status: 1, _id: 1 },
    options: { name: 'reward_weekly_pool_tranche_lookup' },
  },
  {
    collection: 'reward_weekly_prize_accounting',
    keys: { 'lotteryEntropy.blockNumber': 1, 'lotteryEntropy.blockHash': 1 },
    options: { unique: true, name: 'reward_weekly_lottery_entropy_fence' },
  },
  {
    collection: 'reward_pool_tranche_accounting',
    keys: { periodId: 1, tranche: 1, participantWallet: 1 },
    options: { unique: true, name: 'reward_pool_tranche_identity' },
  },
  {
    collection: 'reward_weekly_game_sources',
    keys: { sessionId: 1 },
    options: { unique: true, name: 'reward_weekly_game_source_session' },
  },
  {
    collection: 'reward_weekly_game_sources',
    keys: { status: 1, outcome: 1, resultValid: 1, periodAnchorAt: 1, playedAt: 1, _id: 1 },
    options: { name: 'reward_weekly_game_source_eligible_cursor' },
  },
  {
    collection: 'reward_pool_tranche_accounting',
    keys: { status: 1, scheduledAt: 1, _id: 1 },
    options: { name: 'reward_pool_tranche_schedule_cursor' },
  },
  {
    collection: 'reward_accounting_runtime_state',
    keys: { schedulerId: 1 },
    options: { unique: true, name: 'reward_accounting_runtime_scheduler' },
  },
  {
    collection: 'reward_accounting_runtime_runs',
    keys: { status: 1, endedAt: -1 },
    options: { name: 'reward_accounting_runtime_run_health' },
  },
  {
    collection: 'reward_accounting_runtime_runs',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: 'reward_accounting_runtime_run_expiry' },
  },
  {
    collection: 'reward_period_states',
    keys: { periodId: 1 },
    options: { unique: true, name: 'reward_period_state_period' },
  },
  {
    collection: 'reward_period_states',
    keys: { status: 1, updatedAt: -1 },
    options: { name: 'reward_period_state_status' },
  },
  {
    collection: 'reward_period_seals',
    keys: { periodId: 1 },
    options: { unique: true, name: 'reward_period_seal_period' },
  },
  {
    collection: 'reward_period_seals',
    keys: { sealId: 1 },
    options: { unique: true, name: 'reward_period_seal_id' },
  },
  {
    collection: 'reward_claim_batches',
    keys: { draftKey: 1 },
    options: { unique: true, name: 'reward_claim_batch_draft_key' },
  },
  {
    collection: 'reward_claim_proofs',
    keys: { proofId: 1 },
    options: { unique: true, name: 'reward_claim_proof_id' },
  },
  {
    collection: 'reward_claim_proofs',
    keys: { batchId: 1, walletNormalized: 1 },
    options: { unique: true, name: 'reward_claim_proof_wallet_batch' },
  },
  {
    collection: 'reward_claim_proofs',
    keys: { batchId: 1, _id: 1 },
    options: { name: 'reward_claim_proof_batch_cursor' },
  },
  {
    collection: 'reward_claim_batches',
    keys: { batchId: 1 },
    options: { unique: true },
  },
  {
    collection: 'reward_claim_batches',
    keys: { periodId: 1, status: 1, createdAt: -1 },
    options: { name: 'reward_claim_batch_period_status' },
  },
  {
    collection: 'reward_publication_plans',
    keys: { accountingId: 1 },
    options: { unique: true, name: 'reward_publication_plan_accounting' },
  },
  {
    collection: 'reward_publication_plans',
    keys: { status: 1, leaseExpiresAt: 1, createdAt: 1, _id: 1 },
    options: { name: 'reward_publication_plan_runtime' },
  },
  {
    collection: 'reward_publication_plans',
    keys: { 'operations.transactionHash': 1 },
    options: { name: 'reward_publication_plan_transaction' },
  },
  {
    collection: 'reward_claims',
    keys: { batchId: 1, walletNormalized: 1 },
    options: { unique: true },
  },
  {
    collection: 'reward_claims',
    keys: { batchId: 1, _id: 1 },
    options: { name: 'reward_claim_batch_cursor' },
  },
  {
    collection: 'reward_claims',
    keys: { transactionHash: 1, logIndex: 1 },
    options: { unique: true },
  },
  {
    collection: 'reward_claims',
    keys: { walletNormalized: 1, indexedAt: -1, _id: -1 },
    options: { name: 'reward_claim_wallet_history' },
  },
  {
    collection: 'reward_integrity_incidents',
    keys: { periodId: 1, sourceId: 1, status: 1, detectedAt: -1 },
    options: { name: 'reward_integrity_source_status' },
  },
  {
    collection: 'reward_integrity_incidents',
    keys: { sourceId: 1, status: 1, detectedAt: -1 },
    options: { name: 'reward_integrity_source_lookup' },
  },
];

export const ECONOMY_INDEXES: EconomyIndexDefinition[] = [
  ...CORE_ECONOMY_INDEXES,
  ...CREDIT_ECONOMY_INDEXES.map((index) => ({
    ...index,
    collection: index.collection as EconomyCollectionName,
  })),
];
