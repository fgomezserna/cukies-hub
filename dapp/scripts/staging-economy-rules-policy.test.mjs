import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StagingEconomyRulesError,
  buildStagingEconomyRuleSet,
  stableStagingEconomyHash,
} from './staging-economy-rules-policy.mjs';

const SOURCE_ADDRESSES = Object.freeze({
  UKI_STAKING: '0x1111111111111111111111111111111111111111',
  VESTING_VAULT: '0x2222222222222222222222222222222222222222',
  TOKEN: '0x3333333333333333333333333333333333333333',
  MARKETPLACE: '0x4444444444444444444444444444444444444444',
  BRIDGE: '0x5555555555555555555555555555555555555555',
});

function environment(overrides = {}) {
  return {
    APP_ENV: 'staging',
    STAGING_ONLY_GUARD: 'true',
    COOLIFY_BRANCH: '"staging"',
    COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CHAIN_INDEXER_MONGO_URL:
      'mongodb://staging-user:redacted@mongo:27017/cukieshub-new-staging?authSource=admin',
    CHAIN_INDEXER_CONTRACT_ALIASES:
      'PRESALE,UKI_STAKING,VESTING_VAULT,TOKEN,MARKETPLACE,BRIDGE,REWARDS_DISTRIBUTOR',
    CHAIN_INDEXER_CUKIE_MASTER_ENABLED: 'false',
    COMPETITION_CREDITS_RUNTIME_ENABLED: 'false',
    GAME_ECONOMY_RUNTIME_ENABLED: 'false',
    CUKIE_POOL_RUNTIME_ENABLED: 'false',
    WEEKLY_RANKING_RUNTIME_ENABLED: 'false',
    CHAIN_INDEXER_UKI_STAKING_ADDRESS: SOURCE_ADDRESSES.UKI_STAKING,
    CHAIN_INDEXER_VESTING_VAULT_ADDRESS: SOURCE_ADDRESSES.VESTING_VAULT,
    CHAIN_INDEXER_TOKEN_ADDRESS: SOURCE_ADDRESSES.TOKEN,
    CHAIN_INDEXER_MARKETPLACE_ADDRESS: SOURCE_ADDRESSES.MARKETPLACE,
    CHAIN_INDEXER_BRIDGE_ADDRESS: SOURCE_ADDRESSES.BRIDGE,
    ...overrides,
  };
}

function cursors(now = new Date('2026-08-06T12:00:00.000Z')) {
  const events = {
    UKI_STAKING: ['Staked', 'Unstaked'],
    VESTING_VAULT: ['VestingCreated', 'TokensReleased'],
    TOKEN: ['Transfer', 'CukieMetadataConfigured'],
    MARKETPLACE: [
      'TokenOnSale',
      'TokenBought',
      'MarketTokenSaleCancelled',
      'MarketTokenPriceChanged',
    ],
    BRIDGE: ['JumpInBridge', 'JumpOutBridge'],
  };
  return Object.entries(events).flatMap(([alias, eventNames], aliasIndex) =>
    eventNames.map((eventName) => ({
      _id: `${alias}:${eventName}`,
      contractAlias: alias,
      eventName,
      contractAddress: SOURCE_ADDRESSES[alias],
      bootstrapStatus: 'verified',
      bootstrapStartBlock: 100 + aliasIndex,
      bootstrapVerifiedAt: now,
      verifiedChainId: 97,
      contractCodeHash: `0x${String(aliasIndex + 1).repeat(64)}`,
      contractDeploymentBlock: 100 + aliasIndex,
      contractConfigHash: `0x${String(aliasIndex + 5).repeat(64)}`,
      updatedAt: now,
      safeBlock: 1_000,
      nextBlock: 1_001,
    })),
  );
}

test('builds the immutable staging-test-v1 ruleset with the approved caps', () => {
  const now = new Date('2026-08-06T12:00:00.000Z');
  const rules = buildStagingEconomyRuleSet({ environment: environment(), cursors: cursors(now), now });

  assert.equal(rules.reward.version, 'rewards-staging-test-v1');
  assert.equal(rules.reward.activeFrom.toISOString(), '2026-08-10T00:00:00.000Z');
  assert.equal(rules.reward.emissionBudget.programStartsAt.toISOString(), '2026-08-10T00:00:00.000Z');
  assert.equal(rules.reward.emissionBudget.dayBoundarySecondUtc, 0);
  assert.equal(rules.reward.emissionBudget.lateReservationGraceSeconds, 86_400);
  assert.equal(rules.reward.emissionBudget.dailyCapRaw, '500000000000000000000000');
  assert.equal(rules.reward.emissionBudget.lifetimeCapRaw, '450000000000000000000000000');
  assert.deepEqual(rules.reward.undistributedBps, {
    treasury: 8_000,
    marketing: 500,
    development: 500,
    supplyReduction: 1_000,
  });
  assert.equal(rules.credit.expectedBscChainId, 97);
  assert.equal(rules.credit.creditsPerSlot, 100);
  assert.equal(rules.game.gameId, 'treasure-hunt');
  assert.equal(rules.game.reward.maxConvertibleRaw, '7500000000000000000');
  assert.equal(rules.game.calculation.scoreCapRaw, '3000');
  assert.equal(rules.ranking.initialRank, 5);
  assert.match(rules.reward.configHash, /^[0-9a-f]{64}$/);
  assert.match(rules.credit.configHash, /^[0-9a-f]{64}$/);
  assert.match(rules.game.configHash, /^[0-9a-f]{64}$/);
  assert.match(rules.ranking.configHash, /^[0-9a-f]{64}$/);
  assert.notEqual(stableStagingEconomyHash(rules.reward), rules.reward.configHash);
});

for (const [name, override, message] of [
  ['mainnet public chain', { NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, 'must equal 97'],
  ['mainnet indexer chain', { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56' }, 'must equal 97'],
  ['production branch', { COOLIFY_BRANCH: 'main' }, 'must equal staging'],
  ['production resource', { COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok' }, 'must equal u4s804'],
  [
    'production database',
    { CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new' },
    'must target cukieshub-new-staging',
  ],
  ['enabled credits gate', { COMPETITION_CREDITS_RUNTIME_ENABLED: 'true' }, 'must equal false'],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => buildStagingEconomyRuleSet({ environment: environment(override), cursors: cursors() }),
      (error) => error instanceof StagingEconomyRulesError && error.message.includes(message),
    );
  });
}

test('does not expose Mongo credentials when rejecting the production database', () => {
  const secret = 'never-print-this-password';
  assert.throws(
    () => buildStagingEconomyRuleSet({
      environment: environment({
        CHAIN_INDEXER_MONGO_URL: `mongodb://user:${secret}@mongo:27017/cukieshub-new`,
      }),
      cursors: cursors(),
    }),
    (error) => error instanceof StagingEconomyRulesError && !error.message.includes(secret),
  );
});

test('rejects an incomplete or unverified NFT cursor set before creating rules', () => {
  const missingMetadata = cursors().filter(
    (cursor) => !(cursor.contractAlias === 'TOKEN' && cursor.eventName === 'CukieMetadataConfigured'),
  );
  assert.throws(
    () => buildStagingEconomyRuleSet({ environment: environment(), cursors: missingMetadata }),
    /TOKEN cursor set is incomplete or duplicated/,
  );

  const unverified = cursors();
  unverified.find((cursor) => cursor.contractAlias === 'BRIDGE').bootstrapStatus = 'pending';
  assert.throws(
    () => buildStagingEconomyRuleSet({ environment: environment(), cursors: unverified }),
    /BRIDGE:JumpInBridge is not a fresh verified chain-97 cursor/,
  );
});
