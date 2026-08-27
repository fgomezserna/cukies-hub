jest.mock("server-only", () => ({}), { virtual: true });

import { assertCompetitionCreditRule } from "@/lib/uki-economy/credits/rules";
import type { CompetitionCreditRule } from "@/lib/uki-economy/credits/types";
import { assertGameEconomyRule } from "@/lib/uki-economy/game-economy/rules";
import type { GameEconomyRule } from "@/lib/uki-economy/game-economy/types";
import { assertWeeklyRankingRule } from "@/lib/uki-economy/ranking/rules";
import type { WeeklyRankingRule } from "@/lib/uki-economy/ranking/types";
import { assertRewardRule } from "@/lib/uki-economy/rewards/rules";
import type { RewardRule } from "@/lib/uki-economy/rewards/types";

const SOURCE_ADDRESSES = {
  UKI_STAKING: "0x1111111111111111111111111111111111111111",
  VESTING_VAULT: "0x2222222222222222222222222222222222222222",
  TOKEN: "0x3333333333333333333333333333333333333333",
  TOKEN_V2: "0x6666666666666666666666666666666666666666",
  MARKETPLACE: "0x4444444444444444444444444444444444444444",
  BRIDGE: "0x5555555555555555555555555555555555555555",
  CUKIE_MASTER_NFT_VAULT: "0x7777777777777777777777777777777777777777",
  CUKIE_POOL_NFT_VAULT: "0x8888888888888888888888888888888888888888",
} as const;

function stagingEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    APP_ENV: "staging",
    STAGING_ONLY_GUARD: "true",
    COOLIFY_BRANCH: "staging",
    COOLIFY_RESOURCE_UUID: "u4s804o4wwcckowgk0woo4wg",
    NEXT_PUBLIC_UKI_CHAIN_ID: "97",
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: "97",
    CHAIN_INDEXER_DB_NAME: "cukieshub-new-staging",
    CHAIN_INDEXER_MONGO_URL: "mongodb://mongo:27017/cukieshub-new-staging",
    CHAIN_INDEXER_CONTRACT_ALIASES:
      "PRESALE,UKI_STAKING,VESTING_VAULT,TOKEN,TOKEN_V2,MARKETPLACE,BRIDGE,CUKIE_MASTER_NFT_VAULT,CUKIE_POOL_NFT_VAULT,REWARDS_DISTRIBUTOR",
    CHAIN_INDEXER_CUKIE_MASTER_ENABLED: "false",
    COMPETITION_CREDITS_RUNTIME_ENABLED: "false",
    GAME_ECONOMY_RUNTIME_ENABLED: "false",
    CUKIE_POOL_RUNTIME_ENABLED: "false",
    WEEKLY_RANKING_RUNTIME_ENABLED: "false",
    REWARD_ACCOUNTING_RUNTIME_ENABLED: "false",
    REWARD_DAILY_ACCOUNTING_ENABLED: "false",
    REWARD_WEEKLY_PAYOUT_ENABLED: "false",
    REWARD_POOL_TRANCHES_ENABLED: "false",
    REWARD_BATCH_PUBLISHER_ENABLED: "false",
    CHAIN_INDEXER_UKI_STAKING_ADDRESS: SOURCE_ADDRESSES.UKI_STAKING,
    CHAIN_INDEXER_VESTING_VAULT_ADDRESS: SOURCE_ADDRESSES.VESTING_VAULT,
    CHAIN_INDEXER_TOKEN_ADDRESS: SOURCE_ADDRESSES.TOKEN,
    CHAIN_INDEXER_TOKEN_V2_ADDRESS: SOURCE_ADDRESSES.TOKEN_V2,
    CHAIN_INDEXER_MARKETPLACE_ADDRESS: SOURCE_ADDRESSES.MARKETPLACE,
    CHAIN_INDEXER_BRIDGE_ADDRESS: SOURCE_ADDRESSES.BRIDGE,
    CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS: SOURCE_ADDRESSES.CUKIE_MASTER_NFT_VAULT,
    CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS: SOURCE_ADDRESSES.CUKIE_POOL_NFT_VAULT,
  };
}

function verifiedCursors(now: Date) {
  const events = {
    UKI_STAKING: ["Staked", "Unstaked"],
    VESTING_VAULT: ["VestingCreated", "TokensReleased"],
    TOKEN: ["Transfer", "CukieMetadataConfigured"],
    TOKEN_V2: ["Transfer", "CukieMetadataConfigured"],
    MARKETPLACE: [
      "TokenOnSale",
      "TokenBought",
      "MarketTokenSaleCancelled",
      "MarketTokenPriceChanged",
    ],
    BRIDGE: ["JumpInBridge", "JumpOutBridge"],
    CUKIE_MASTER_NFT_VAULT: [
      "CukieMasterCollectionAllowedUpdated",
      "CukieMasterDeposited",
      "CukieMasterWithdrawn",
      "CukieMasterUntrackedERC721Recovered",
    ],
    CUKIE_POOL_NFT_VAULT: [
      "CukiePoolCollectionAllowedUpdated",
      "CukiePoolCalendarVersionScheduled",
      "CukiePoolDeposited",
      "CukiePoolExitRequested",
      "CukiePoolWithdrawableAtAdvanced",
      "CukiePoolWithdrawn",
      "CukiePoolUntrackedERC721Recovered",
    ],
  } as const;
  return Object.entries(events).flatMap(([alias, eventNames], aliasIndex) =>
    eventNames.map((eventName) => ({
      _id: `${alias}:${eventName}`,
      contractAlias: alias,
      eventName,
      contractAddress: SOURCE_ADDRESSES[alias as keyof typeof SOURCE_ADDRESSES],
      bootstrapStatus: "verified",
      bootstrapStartBlock: 100 + aliasIndex,
      bootstrapVerifiedAt: now,
      verifiedChainId: 97,
      contractCodeHash: `0x${String(aliasIndex + 1).repeat(64)}`,
      contractDeploymentBlock: 100 + aliasIndex,
      contractDeploymentTxHash: `0x${"a".repeat(64)}`,
      contractConfigHash: `0x${(aliasIndex + 5).toString(16).slice(-1).repeat(64)}`,
      updatedAt: now,
      safeBlock: 1_000,
      nextBlock: 1_001,
    })),
  );
}

test("the staging bootstrap documents pass the production domain validators", async () => {
  // El modulo operacional es ESM puro y se valida aqui a traves de su API publica.
  const { buildStagingEconomyRuleSet } = await import(
    "../../scripts/staging-economy-rules-policy.mjs"
  );
  const now = new Date("2026-08-06T12:00:00.000Z");
  const rules = buildStagingEconomyRuleSet({
    environment: stagingEnvironment(),
    cursors: verifiedCursors(now),
    now,
  });

  expect(assertRewardRule(rules.reward as RewardRule)).toBe(rules.reward);
  expect(assertCompetitionCreditRule(rules.credit as CompetitionCreditRule)).toBe(rules.credit);
  expect(assertGameEconomyRule(rules.game as GameEconomyRule)).toBe(rules.game);
  expect(assertWeeklyRankingRule(rules.ranking as WeeklyRankingRule)).toBe(rules.ranking);
});
