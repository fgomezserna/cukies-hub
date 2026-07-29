import { buildCompetitionRanking, isCompetitionWalletAddress, normalizeCompetitionWallet } from './ranking';
import { multiplyByBps, parseUkiRaw, UINT256_MAX } from './rules';
import type {
  CompetitionAward,
  CompetitionConfig,
  CompetitionPurchase,
  CompetitionSettlement,
  CompetitionSettlementSkip,
  RankedCompetitionAttempt,
} from './types';

interface AggregatedPurchase {
  purchased: bigint;
  sponsorWalletAddress: string | null;
}

interface PendingAggregatedPurchase {
  purchased: bigint;
  sponsorWalletAddresses: Set<string>;
}

function addUkiRaw(left: bigint, right: bigint) {
  const result = left + right;
  if (result > UINT256_MAX) throw new RangeError('Aggregated UKI raw value exceeds uint256');
  return result;
}

function aggregatePurchases(purchases: readonly CompetitionPurchase[]) {
  const pendingByWallet = new Map<string, PendingAggregatedPurchase>();
  let totalPurchased = BigInt(0);

  for (const purchase of purchases) {
    const walletAddress = normalizeCompetitionWallet(purchase.walletAddress);
    if (!isCompetitionWalletAddress(walletAddress)) {
      throw new Error('Purchase wallet address must be a valid EVM address');
    }
    const purchased = parseUkiRaw(purchase.ukiPurchasedRaw);
    totalPurchased = addUkiRaw(totalPurchased, purchased);

    const existing = pendingByWallet.get(walletAddress) ?? {
      purchased: BigInt(0),
      sponsorWalletAddresses: new Set<string>(),
    };
    const sponsorCandidate = purchase.sponsorWalletAddress
      ? normalizeCompetitionWallet(purchase.sponsorWalletAddress)
      : null;
    const sponsorWalletAddress = purchased > BigInt(0) && sponsorCandidate &&
      isCompetitionWalletAddress(sponsorCandidate) &&
      sponsorCandidate !== walletAddress
      ? sponsorCandidate
      : null;
    if (sponsorWalletAddress) existing.sponsorWalletAddresses.add(sponsorWalletAddress);
    existing.purchased = addUkiRaw(existing.purchased, purchased);
    pendingByWallet.set(walletAddress, existing);
  }

  const byWallet = new Map<string, AggregatedPurchase>();
  for (const [walletAddress, purchase] of pendingByWallet) {
    if (purchase.sponsorWalletAddresses.size > 1) {
      throw new Error(`Conflicting sponsor attribution for ${walletAddress}`);
    }
    byWallet.set(walletAddress, {
      purchased: purchase.purchased,
      sponsorWalletAddress: [...purchase.sponsorWalletAddresses][0] ?? null,
    });
  }

  return { byWallet, totalPurchased };
}

export function settleCompetition(input: {
  readonly campaign: CompetitionConfig;
  readonly ranking: readonly RankedCompetitionAttempt[];
  readonly purchases: readonly CompetitionPurchase[];
}): CompetitionSettlement {
  const { byWallet, totalPurchased } = aggregatePurchases(input.purchases);
  const pool = multiplyByBps(totalPurchased, input.campaign.poolBps);
  const rewardRatioDenominator = BigInt(10_000 + input.campaign.sponsorRewardBps);
  const playerPool = (pool * BigInt(10_000)) / rewardRatioDenominator;
  const sponsorPool = pool - playerPool;
  const awardedAttemptsByWallet = new Map<string, number>();
  const awards: CompetitionAward[] = [];
  const skipped: CompetitionSettlementSkip[] = [];
  let playerRewards = BigInt(0);
  let sponsorRewards = BigInt(0);
  let remainingPlayerPool = playerPool;
  let remainingSponsorPool = sponsorPool;
  const roundingDust = BigInt(0);

  const canonicalRanking = buildCompetitionRanking(input.ranking, input.campaign);
  for (const rankedAttempt of canonicalRanking) {
    const walletAddress = normalizeCompetitionWallet(rankedAttempt.walletAddress);
    const skip = (reason: CompetitionSettlementSkip['reason']) => {
      skipped.push({
        attemptId: rankedAttempt.attemptId,
        rank: rankedAttempt.rank,
        walletAddress,
        reason,
      });
    };

    const awardedCount = awardedAttemptsByWallet.get(walletAddress) ?? 0;
    if (awardedCount >= input.campaign.maxWinningAttemptsPerWallet) {
      skip('wallet_limit');
      continue;
    }

    const purchase = byWallet.get(walletAddress);
    if (!purchase || purchase.purchased === BigInt(0)) {
      skip('no_purchase');
      continue;
    }

    const desiredPlayerReward = multiplyByBps(
      purchase.purchased,
      input.campaign.playerRewardBps,
    );
    if (desiredPlayerReward === BigInt(0)) {
      skip('reward_rounds_to_zero');
      continue;
    }
    if (remainingPlayerPool === BigInt(0)) {
      skip('pool_exhausted');
      continue;
    }

    const playerReward = desiredPlayerReward < remainingPlayerPool
      ? desiredPlayerReward
      : remainingPlayerPool;
    if (playerReward === BigInt(0)) {
      skip('pool_exhausted');
      continue;
    }

    const sponsorReward = purchase.sponsorWalletAddress
      ? multiplyByBps(playerReward, input.campaign.sponsorRewardBps)
      : BigInt(0);
    if (sponsorReward > remainingSponsorPool) {
      throw new Error('Competition settlement invariant violated: sponsor pool exceeded');
    }
    const totalReward = playerReward + sponsorReward;

    remainingPlayerPool -= playerReward;
    remainingSponsorPool -= sponsorReward;
    playerRewards += playerReward;
    sponsorRewards += sponsorReward;
    awardedAttemptsByWallet.set(walletAddress, awardedCount + 1);
    awards.push({
      attemptId: rankedAttempt.attemptId,
      rank: rankedAttempt.rank,
      walletRank: rankedAttempt.walletRank,
      walletAddress,
      playerAlias: rankedAttempt.playerAlias,
      purchasedUkiRaw: purchase.purchased.toString(),
      playerRewardUkiRaw: playerReward.toString(),
      sponsorWalletAddress: purchase.sponsorWalletAddress,
      sponsorRewardUkiRaw: sponsorReward.toString(),
      totalRewardUkiRaw: totalReward.toString(),
      partial: playerReward < desiredPlayerReward,
    });
  }

  const spent = playerRewards + sponsorRewards;
  const remainingPool = remainingPlayerPool + remainingSponsorPool;
  if (spent + remainingPool !== pool) {
    throw new Error('Competition settlement invariant violated: accounting mismatch');
  }

  return {
    campaignId: input.campaign.campaignId,
    totalPurchasedUkiRaw: totalPurchased.toString(),
    poolUkiRaw: pool.toString(),
    playerPoolUkiRaw: playerPool.toString(),
    sponsorPoolUkiRaw: sponsorPool.toString(),
    playerRewardsUkiRaw: playerRewards.toString(),
    sponsorRewardsUkiRaw: sponsorRewards.toString(),
    spentUkiRaw: spent.toString(),
    remainingUkiRaw: remainingPool.toString(),
    roundingDustUkiRaw: roundingDust.toString(),
    awards,
    skipped,
  };
}
