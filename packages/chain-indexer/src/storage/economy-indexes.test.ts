import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ECONOMY_COLLECTIONS, ECONOMY_INDEXES } from './economy-indexes.js';
import { CREDIT_ECONOMY_INDEXES } from './credit-economy-indexes.js';

describe('economy indexes', () => {
  it('covers every planned UKI economy collection', () => {
    const indexedCollections = new Set(ECONOMY_INDEXES.map((index) => index.collection));

    for (const collection of ECONOMY_COLLECTIONS) {
      assert.equal(indexedCollections.has(collection), true, `${collection} is missing indexes`);
    }
  });

  it('keeps idempotency indexes unique for critical ledgers', () => {
    const uniqueIndexes = ECONOMY_INDEXES.filter((index) => index.options?.unique)
      .map((index) => `${index.collection}:${JSON.stringify(index.keys)}`);

    const requiredCore = [
        'cukie_pool_positions:{"assetId":1,"status":1}',
        'cukie_pool_positions:{"assetId":1,"lifecycleOpen":1}',
        'cukie_pool_positions:{"idempotencyKey":1}',
        'cukie_pool_positions:{"lockId":1}',
        'cukie_pool_assignments:{"sessionId":1}',
        'cukie_pool_assignments:{"assignmentId":1}',
        'cukie_pool_assignments:{"idempotencyKey":1}',
        'cukie_pool_vault_asset_leases:{"positionId":1}',
        'cukie_pool_vault_asset_leases:{"assignmentId":1}',
        'cukie_pool_vault_asset_leases:{"sessionId":1}',
        'cukie_pool_vault_period_usage:{"assetId":1,"depositEpoch":1,"periodId":1}',
        'cukie_pool_events:{"eventId":1}',
        'cukie_pool_events:{"idempotencyKey":1}',
        'cukie_master_snapshots:{"walletNormalized":1,"periodId":1,"ruleVersion":1}',
        'economy_rule_versions:{"scope":1,"version":1}',
        'cukie_master_slot_events:{"idempotencyKey":1}',
        'cukie_master_route_rounds:{"route":1,"status":1}',
        'cukie_master_route_capacity:{"route":1}',
        'cukie_master_positions:{"walletNormalized":1,"route":1}',
        'cukie_master_slots:{"walletNormalized":1,"route":1,"ordinal":1}',
        'cukie_master_position_events:{"idempotencyKey":1}',
        'game_economy_sessions:{"sessionId":1}',
        'game_economy_sessions:{"createCommand.idempotencyKey":1}',
        'game_economy_sessions:{"validation.evidenceId":1}',
        'game_economy_rules:{"gameId":1,"version":1}',
        'game_economy_rule_state:{"gameId":1}',
        'game_economy_events:{"eventId":1}',
        'game_economy_events:{"sessionId":1,"toRevision":1}',
        'game_economy_resource_bindings:{"sessionId":1,"kind":1}',
        'game_economy_resource_bindings:{"reservationIdempotencyKey":1}',
        'game_owned_cukie_epochs:{"epochId":1}',
        'game_owned_cukie_epochs:{"assetId":1,"ownerNormalized":1,"ownershipEventId":1}',
        'game_owned_cukie_assignments:{"assignmentId":1}',
        'game_owned_cukie_assignments:{"sessionId":1}',
        'game_owned_cukie_assignments:{"idempotencyKey":1}',
        'game_owned_cukie_events:{"eventId":1}',
        'game_owned_cukie_events:{"idempotencyKey":1}',
        'game_result_evidence:{"evidenceReference":1}',
        'game_result_evidence:{"idempotencyKey":1}',
        'nft_asset_locks:{"assetId":1,"status":1}',
        'nft_asset_locks:{"idempotencyKey":1}',
        'nft_asset_locks:{"lockId":1}',
        'nft_asset_lock_events:{"eventId":1}',
        'nft_asset_lock_events:{"idempotencyKey":1}',
        'reward_allocations:{"allocationId":1}',
        'reward_allocations:{"periodId":1,"walletNormalized":1,"category":1,"sourceId":1}',
        'reward_emission_budget_state:{"scope":1,"revision":1}',
        'reward_emission_budget_days:{"dayId":1}',
        'reward_emission_budget_events:{"eventId":1}',
        'reward_emission_budget_events:{"sourceId":1}',
        'reward_pool_accruals:{"accrualId":1}',
        'reward_pool_accruals:{"periodId":1,"sourceId":1,"category":1}',
        'reward_source_manifests:{"sourceId":1}',
        'weekly_ranking_rule_state:{"scope":1,"revision":1}',
        'weekly_ranking_period_states:{"periodId":1}',
        'weekly_ranking_sources:{"sourceId":1}',
        'weekly_ranking_sources:{"sessionId":1}',
        'weekly_ranking_manifests:{"periodId":1}',
        'weekly_ranking_manifests:{"manifestId":1}',
        'weekly_ranking_runs:{"periodId":1}',
        'weekly_ranking_runs:{"runId":1}',
        'weekly_ranking_audit_events:{"eventId":1}',
        'game_weekly_rankings:{"rankingId":1}',
        'game_weekly_rankings:{"periodId":1,"gameId":1,"walletNormalized":1}',
        'reward_rule_state:{"scope":1,"revision":1}',
        'reward_period_states:{"periodId":1}',
        'reward_period_seals:{"periodId":1}',
        'reward_period_seals:{"sealId":1}',
        'reward_claim_proofs:{"proofId":1}',
        'reward_claim_proofs:{"batchId":1,"walletNormalized":1}',
        'reward_claim_batches:{"draftKey":1}',
        'reward_claim_batches:{"batchId":1}',
        'reward_claims:{"batchId":1,"walletNormalized":1}',
        'reward_claims:{"transactionHash":1,"logIndex":1}',
        'uki_staking_positions:{"walletNormalized":1}',
        'uki_staking_state:{"contractAddressNormalized":1}',
        'uki_vesting_events:{"eventId":1}',
        'uki_vesting_positions:{"walletNormalized":1,"scheduleId":1}',
      ];
    const requiredCredits = CREDIT_ECONOMY_INDEXES
      .filter((index) => index.options?.unique)
      .map((index) => `${index.collection}:${JSON.stringify(index.keys)}`);
    for (const required of [...requiredCore, ...requiredCredits]) {
      assert.ok(uniqueIndexes.includes(required), `${required} is not unique`);
    }
    assert.equal(new Set(uniqueIndexes).size, uniqueIndexes.length);
  });

  it('defines the natural lock, expiry and append-only event access paths', () => {
    const indexes = ECONOMY_INDEXES.map((index) => ({
      collection: index.collection,
      keys: JSON.stringify(index.keys),
      unique: index.options?.unique === true,
      partial: index.options?.partialFilterExpression,
    }));

    assert.ok(indexes.some((index) => (
      index.collection === 'nft_asset_locks'
      && index.keys === '{"assetId":1,"status":1}'
      && index.unique
      && JSON.stringify(index.partial) === '{"status":"active"}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'nft_asset_locks'
      && index.keys === '{"ownerNormalized":1,"status":1,"expiresAt":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'nft_asset_lock_events'
      && index.keys === '{"lockId":1,"createdAt":-1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_master_positions'
      && index.keys === '{"route":1,"waitlistedAt":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_pool_positions'
      && index.keys === '{"status":1,"lifecycleOpen":1,"withdrawalRequestedAt":1,"poolPriority":1,"eligibleAt":1,"stakedAt":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_pool_assignments'
      && index.keys === '{"status":1,"expiresAt":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_pool_vault_asset_leases'
      && index.keys === '{"expiresAt":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_pool_vault_period_usage'
      && index.keys === '{"periodId":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_pool_positions'
      && index.keys === '{"ownerNormalized":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_pool_positions'
      && index.keys === '{"lifecycleOpen":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_master_recalculation_jobs'
      && index.keys === '{"status":1,"availableAt":1,"createdAt":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_master_recalculation_jobs'
      && index.keys === '{"status":1,"leaseExpiresAt":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'cukie_master_runtime_runs'
      && index.keys === '{"status":1,"endedAt":-1}'
    )));
    const nonceExpiry = ECONOMY_INDEXES.find((index) => (
      index.collection === 'economy_internal_nonces'
      && JSON.stringify(index.keys) === '{"expiresAt":1}'
    ));
    assert.equal(nonceExpiry?.options?.expireAfterSeconds, 0);
    const runtimeExpiry = ECONOMY_INDEXES.find((index) => (
      index.collection === 'cukie_master_runtime_runs'
      && JSON.stringify(index.keys) === '{"expiresAt":1}'
    ));
    assert.equal(runtimeExpiry?.options?.expireAfterSeconds, 0);
    const creditRuntimeExpiry = ECONOMY_INDEXES.find((index) => (
      index.collection === 'competition_credit_runtime_runs'
      && JSON.stringify(index.keys) === '{"expiresAt":1}'
    ));
    assert.equal(creditRuntimeExpiry?.options?.expireAfterSeconds, 0);
    assert.ok(indexes.some((index) => (
      index.collection === 'game_economy_sessions'
      && index.keys === '{"operation.leaseExpiresAt":1,"status":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'game_economy_sessions'
      && index.keys === '{"status":1,"settledAt":1,"sessionId":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'game_economy_sessions'
      && index.keys === '{"settlementIntent.decidedAt":1,"_id":1}'
    )));
    const pendingSettlement = ECONOMY_INDEXES.find((index) => (
      index.options?.name === 'game_session_pending_settlement_census'
    ));
    assert.deepEqual(pendingSettlement?.options?.partialFilterExpression, {
      'settlementIntent.decidedAt': { $type: 'date' },
    });
    assert.ok(indexes.some((index) => (
      index.collection === 'game_economy_sessions'
      && index.keys === '{"validation.evidenceId":1}'
      && index.unique
      && JSON.stringify(index.partial) === '{"validation.evidenceId":{"$type":"string"}}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_integrity_incidents'
      && index.keys === '{"periodId":1,"sourceId":1,"status":1,"detectedAt":-1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_allocations'
      && index.keys === '{"periodId":1,"status":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_allocations'
      && index.keys === '{"periodId":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_allocations'
      && index.keys === '{"walletNormalized":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_claims'
      && index.keys === '{"walletNormalized":1,"indexedAt":-1,"_id":-1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_claims'
      && index.keys === '{"batchId":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_claim_proofs'
      && index.keys === '{"batchId":1,"_id":1}'
    )));
    assert.ok(indexes.some((index) => (
      index.collection === 'reward_integrity_incidents'
      && index.keys === '{"sourceId":1,"status":1,"detectedAt":-1}'
    )));
    const completedJobExpiry = ECONOMY_INDEXES.find((index) => (
      index.collection === 'cukie_master_recalculation_jobs'
      && JSON.stringify(index.keys) === '{"expiresAt":1}'
    ));
    assert.equal(completedJobExpiry?.options?.expireAfterSeconds, 0);
    assert.deepEqual(completedJobExpiry?.options?.partialFilterExpression, {
      status: 'completed',
    });
  });
});
