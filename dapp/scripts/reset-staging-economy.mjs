import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';
import { validateStagingEconomyEnvironment } from './staging-economy-rules-policy.mjs';

// Explicit allowlist: users, ambassadors, presale, inventory, chain balances,
// NFT custody and security nonces are not reset. No database is dropped.
export const RESET_COLLECTIONS = Object.freeze([
  'competition_credit_cutoff_blocks', 'competition_credit_source_watermarks',
  'competition_credit_pool_configs', 'competition_credit_runs', 'competition_credit_run_items',
  'competition_credit_run_holds', 'competition_credit_lots', 'competition_credit_pool_lots',
  'competition_credit_account_periods', 'competition_credit_pool_periods',
  'competition_credit_reservations', 'competition_credit_incidents', 'competition_credit_ledger',
  'credit_pool_positions', 'competition_credit_runtime_state', 'competition_credit_runtime_runs',
  'cukie_pool_vault_asset_leases', 'cukie_pool_vault_period_usage',
  'cukie_pool_positions', 'cukie_pool_assignments', 'cukie_pool_events',
  'cukie_pool_runtime_state', 'cukie_pool_runtime_runs',
  'game_economy_rule_state', 'game_economy_rules', 'game_economy_sessions',
  'game_economy_events', 'game_economy_resource_bindings', 'game_owned_cukie_epochs',
  'game_owned_cukie_assignments', 'game_owned_cukie_events', 'game_result_evidence',
  'treasure_hunt_economy_runs', 'treasure_hunt_pool_daily_usage',
  'treasure_hunt_pool_quota_reservations', 'treasure_hunt_weekly_bests',
  'game_economy_runtime_state', 'game_economy_runtime_runs',
  'reward_rule_state', 'reward_emission_budget_state', 'reward_emission_budget_days',
  'reward_emission_budget_events', 'reward_source_manifests', 'reward_allocations',
  'reward_pool_accruals', 'reward_daily_capacity_materializations', 'reward_accounting_allocations',
  'reward_daily_accounting', 'reward_weekly_prize_accounting', 'reward_pool_tranche_accounting',
  'reward_weekly_game_sources', 'reward_accounting_runtime_state', 'reward_accounting_runtime_runs',
  'weekly_ranking_rule_state', 'weekly_ranking_period_states', 'weekly_ranking_sources',
  'weekly_ranking_manifests', 'weekly_ranking_runs', 'weekly_ranking_audit_events',
  'weekly_ranking_runtime_state', 'weekly_ranking_runtime_runs', 'game_weekly_rankings',
  'reward_period_states', 'reward_period_seals', 'reward_claim_batches', 'reward_claim_proofs',
  'reward_claims', 'reward_publication_plans', 'reward_integrity_incidents',
]);

export function resetTargets(oldPoolAddress) {
  if (!/^0x[0-9a-f]{40}$/.test(oldPoolAddress) || /^0x0{40}$/.test(oldPoolAddress)) {
    throw new Error('An exact non-zero old testnet pool address is required.');
  }
  return [
    ...RESET_COLLECTIONS.map((collection) => ({ collection, filter: {} })),
    { collection: 'economy_rule_versions', filter: { scope: { $in: ['competition_credits', 'reward_allocations', 'weekly_arena_ranking'] } } },
    { collection: 'chain_cursors', filter: { chain: 'BSC', contractAlias: 'CUKIE_POOL_NFT_VAULT', contractAddress: { $regex: `^${oldPoolAddress}$`, $options: 'i' } } },
    { collection: 'cukie_pool_nft_vault_positions', filter: { chainId: 97, vaultAddressNormalized: oldPoolAddress } },
    { collection: 'cukie_pool_calendar_versions', filter: { chainId: 97, vaultAddressNormalized: oldPoolAddress } },
    { collection: 'nft_vault_collections', filter: { chainId: 97, vaultAddressNormalized: oldPoolAddress } },
  ];
}

export function validateResetCalendar(environment, now = new Date()) {
  const seconds = Number(environment.ECONOMY_CYCLE_SECONDS);
  const anchor = new Date(environment.ECONOMY_CYCLE_ANCHOR_AT ?? '');
  if (![1800, 3600].includes(seconds) || Number.isNaN(anchor.getTime())
    || anchor.toISOString() !== environment.ECONOMY_CYCLE_ANCHOR_AT
    || anchor.getTime() % (seconds * 1000) !== 0 || anchor <= now) {
    throw new Error('Reset requires an aligned, future ISO anchor and 1800/3600-second cycles.');
  }
  return anchor.toISOString();
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply === process.argv.includes('--plan')) throw new Error('Choose --plan or --apply.');
  validateStagingEconomyEnvironment(process.env);
  if (apply && (process.env.STAGING_ECONOMY_WRITERS_STOPPED !== 'true'
    || process.argv[process.argv.indexOf('--confirm') + 1] !== 'RESET_TEST_ECONOMY_APP28')) {
    throw new Error('Apply requires stopped writers and --confirm RESET_TEST_ECONOMY_APP28.');
  }
  const anchorAt = validateResetCalendar(process.env);
  if (process.env.STAGING_PREVIOUS_POOL_ADDRESS === process.env.CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS?.toLowerCase()) {
    throw new Error('The old pool and new pool must be distinct.');
  }
  const targets = resetTargets(process.env.STAGING_PREVIOUS_POOL_ADDRESS ?? '');
  const client = new MongoClient(process.env.CHAIN_INDEXER_MONGO_URL);
  try {
    await client.connect();
    const db = client.db('cukieshub-new-staging');
    const marker = await db.collection('economy_schema_metadata').findOne({ _id: 'accelerated-reset' });
    if (marker?.anchorAt === anchorAt) throw new Error('This calendar was already reset; refusing a second destructive reset.');
    const counts = [];
    for (const target of targets) counts.push({ ...target, count: await db.collection(target.collection).countDocuments(target.filter) });
    console.log(JSON.stringify({ apply, database: db.databaseName, anchorAt, targets: counts }, null, 2));
    if (!apply) return;
    // Keep indexes and source-of-truth chain events. Those events are not replayed.
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const target of targets) await db.collection(target.collection).deleteMany(target.filter, { session });
        await db.collection('economy_schema_metadata').updateOne({ _id: 'accelerated-reset' },
          { $set: { anchorAt, cycleSeconds: Number(process.env.ECONOMY_CYCLE_SECONDS), resetAt: new Date() } },
          { upsert: true, session });
      });
    } finally { await session.endSession(); }
    console.log('Staging economic test history reset. User and ambassador records preserved.');
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
