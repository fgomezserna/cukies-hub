import "server-only";

import { displayCompetitionAlias, generateCompetitionAlias } from "@/lib/treasure-hunt-competition";
import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import { formatRawAmount, parseRawAmount } from "@/lib/uki-economy/money";
import { getIsoWeekPeriodId } from "@/lib/uki-economy/periods";
import type {
  RewardAllocation,
  RewardPoolAccrual,
  RewardSourceManifest,
} from "@/lib/uki-economy/rewards/types";

import { getTreasureHuntWeeklyPeriod } from "./treasure-hunt-policy";
import type {
  TreasureHuntEconomyRun,
  TreasureHuntWeeklyBest,
} from "./treasure-hunt-types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ParticipantAlias = {
  walletAddress: string;
  alias: string;
  updatedAt: string;
};

export type TreasureHuntWeeklyRankingEntry = {
  rank: number;
  alias: string;
  scoreRaw: string;
  achievedAt: string;
  cukieSource: "own" | "pool";
  isMe: boolean;
};

export type TreasureHuntWeeklyLatestResult = {
  runId: string;
  status: "settled" | "forfeited";
  scoreRaw: string;
  achievedAt: string;
  creditSource: "own" | "pool";
  cukieSource: "own" | "pool";
  cukieAssetId: string;
  cukieTokenId: string | null;
  cukieGeneration: string;
  cukieRarity: string;
  leaderboardEligible: boolean;
  rewardEligible: boolean;
  jackpotEligible: boolean;
  reward: {
    status: "processing" | "allocated" | "blocked" | "not_applicable";
    amountRaw: string | null;
  };
};

export type TreasureHuntWeeklyOverview = {
  period: {
    periodId: string;
    startsAt: string;
    endsAt: string;
  };
  poolUkiRaw: string;
  totalRankedWallets: number;
  entries: TreasureHuntWeeklyRankingEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalEntries: number;
    totalPages: number;
  };
  participation: null | {
    ownCreditRuns: number;
    poolCreditRuns: number;
    bestPoolScoreRaw: string | null;
  };
  latestResult: TreasureHuntWeeklyLatestResult | null;
};

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  return Number.isSafeInteger(value) && Number(value) >= 1
    ? Math.min(Number(value), maximum)
    : fallback;
}

function weeklyRewardPeriodId(periodStartsAt: Date) {
  return getIsoWeekPeriodId(new Date(periodStartsAt.getTime() + 14 * 60 * 60_000));
}

function publicAlias(wallet: string, alias?: string) {
  return displayCompetitionAlias(alias ?? generateCompetitionAlias(wallet));
}

async function aliasesFor(wallets: string[]) {
  if (wallets.length === 0) return new Map<string, string>();
  const db = await getEconomyDb();
  const participants = await db.collection<ParticipantAlias>("presale_game_participants")
    .find({ walletAddress: { $in: wallets } })
    .sort({ updatedAt: -1 })
    .project<ParticipantAlias>({ _id: 0, walletAddress: 1, alias: 1, updatedAt: 1 })
    .toArray();
  const aliases = new Map<string, string>();
  for (const participant of participants) {
    const wallet = participant.walletAddress.toLowerCase();
    if (!aliases.has(wallet)) aliases.set(wallet, participant.alias);
  }
  return aliases;
}

async function latestResultFor(walletNormalized: string, weeklyPeriodId: string) {
  const db = await getEconomyDb();
  const run = await db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
    .findOne(
      {
        walletNormalized,
        weeklyPeriodId,
        status: { $in: ["settled", "forfeited"] },
      },
      { sort: { achievedAt: -1, updatedAt: -1, _id: -1 } },
    );
  if (!run || (run.status !== "settled" && run.status !== "forfeited")) return null;

  const sourceId = `game-session:${run.gameEconomySessionId}`;
  const [manifest, allocation] = await Promise.all([
    db.collection<RewardSourceManifest>("reward_source_manifests").findOne({ sourceId }),
    db.collection<RewardAllocation>("reward_allocations").findOne({
      sourceId,
      walletNormalized,
      category: "player",
    }),
  ]);
  const rewardStatus = run.status !== "settled"
    ? "not_applicable" as const
    : manifest?.status === "blocked"
      ? "blocked" as const
      : manifest?.status === "allocated"
        ? "allocated" as const
        : "processing" as const;
  const weeklyEligible = run.status === "settled" && run.creditSource === "pool";

  return {
    runId: run.runId,
    status: run.status,
    scoreRaw: run.scoreRaw ?? "0",
    achievedAt: (run.achievedAt ?? run.updatedAt).toISOString(),
    creditSource: run.creditSource,
    cukieSource: run.cukieSource,
    cukieAssetId: run.cukieAssetId,
    cukieTokenId: run.cukieTokenId,
    cukieGeneration: run.cukieGeneration,
    cukieRarity: run.cukieRarity,
    leaderboardEligible: weeklyEligible,
    rewardEligible: run.status === "settled",
    jackpotEligible: weeklyEligible,
    reward: {
      status: rewardStatus,
      amountRaw: rewardStatus === "allocated" ? allocation?.amountRaw ?? "0" : null,
    },
  } satisfies TreasureHuntWeeklyLatestResult;
}

export async function getTreasureHuntWeeklyOverview(input: {
  now?: Date;
  currentWalletAddress?: string;
  page?: number;
  pageSize?: number;
  mineOnly?: boolean;
} = {}): Promise<TreasureHuntWeeklyOverview> {
  const now = input.now ?? new Date();
  const period = getTreasureHuntWeeklyPeriod(now);
  const walletNormalized = input.currentWalletAddress?.toLowerCase() ?? null;
  const pageSize = boundedInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = boundedInteger(input.page, 1, 1_000_000);
  const db = await getEconomyDb();
  const rankingFilter = {
    weeklyPeriodId: period.periodId,
    gameId: "treasure-hunt" as const,
    creditSource: "pool" as const,
    ...(input.mineOnly && walletNormalized ? { walletNormalized } : {}),
    ...(input.mineOnly && !walletNormalized ? { walletNormalized: "__signed_wallet_required__" } : {}),
  };

  const globalRankingFilter = {
    weeklyPeriodId: period.periodId,
    gameId: "treasure-hunt" as const,
    creditSource: "pool" as const,
  };
  const [totalEntries, totalRankedWallets, bests, poolAccruals, participationRows, latestResult] = await Promise.all([
    db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests")
      .countDocuments(rankingFilter),
    db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests")
      .countDocuments(globalRankingFilter),
    db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests")
      .find(rankingFilter)
      .sort({ scoreDigits: -1, scoreRaw: -1, achievedAt: 1, walletNormalized: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    db.collection<RewardPoolAccrual>("reward_pool_accruals")
      .find({
        periodId: weeklyRewardPeriodId(period.startsAt),
        category: "weekly_prize_pool",
        status: "accrued",
      })
      .project<RewardPoolAccrual>({ amountRaw: 1 })
      .toArray(),
    walletNormalized
      ? db.collection<TreasureHuntEconomyRun>("treasure_hunt_economy_runs")
        .aggregate<{ _id: "own" | "pool"; count: number }>([
          {
            $match: {
              walletNormalized,
              weeklyPeriodId: period.periodId,
              status: "settled",
            },
          },
          { $group: { _id: "$creditSource", count: { $sum: 1 } } },
        ])
        .toArray()
      : Promise.resolve([]),
    walletNormalized ? latestResultFor(walletNormalized, period.periodId) : Promise.resolve(null),
  ]);
  const aliasByWallet = await aliasesFor(bests.map((best) => best.walletNormalized));
  const rankingOffset = (page - 1) * pageSize;
  const mineRank = input.mineOnly && bests[0]
    ? await db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests").countDocuments({
        ...globalRankingFilter,
        $or: [
          { scoreDigits: { $gt: bests[0].scoreDigits } },
          { scoreDigits: bests[0].scoreDigits, scoreRaw: { $gt: bests[0].scoreRaw } },
          {
            scoreDigits: bests[0].scoreDigits,
            scoreRaw: bests[0].scoreRaw,
            achievedAt: { $lt: bests[0].achievedAt },
          },
          {
            scoreDigits: bests[0].scoreDigits,
            scoreRaw: bests[0].scoreRaw,
            achievedAt: bests[0].achievedAt,
            walletNormalized: { $lt: bests[0].walletNormalized },
          },
        ],
      }) + 1
    : null;
  const poolUkiRaw = formatRawAmount(poolAccruals.reduce(
    (total, accrual) => total + parseRawAmount(accrual.amountRaw),
    BigInt(0),
  ));
  const bestPool = walletNormalized
    ? await db.collection<TreasureHuntWeeklyBest>("treasure_hunt_weekly_bests").findOne({
      weeklyPeriodId: period.periodId,
      gameId: "treasure-hunt",
      creditSource: "pool",
      walletNormalized,
    })
    : null;
  const counts = new Map(participationRows.map((row) => [row._id, row.count]));

  return {
    period: {
      periodId: period.periodId,
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
    },
    poolUkiRaw,
    totalRankedWallets,
    entries: bests.map((best, index) => ({
      rank: mineRank ?? rankingOffset + index + 1,
      alias: publicAlias(best.walletNormalized, aliasByWallet.get(best.walletNormalized)),
      scoreRaw: best.scoreRaw,
      achievedAt: best.achievedAt.toISOString(),
      cukieSource: best.cukieSource,
      isMe: best.walletNormalized === walletNormalized,
    })),
    pagination: {
      page,
      pageSize,
      totalEntries,
      totalPages: Math.max(1, Math.ceil(totalEntries / pageSize)),
    },
    participation: walletNormalized
      ? {
          ownCreditRuns: counts.get("own") ?? 0,
          poolCreditRuns: counts.get("pool") ?? 0,
          bestPoolScoreRaw: bestPool?.scoreRaw ?? null,
        }
      : null,
    latestResult,
  };
}
