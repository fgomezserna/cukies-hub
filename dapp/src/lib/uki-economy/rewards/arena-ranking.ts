import "server-only";

import type { ClientSession, Db } from "mongodb";

import { getIsoWeekPeriod, getIsoWeekPeriodId } from "../periods";
import { DomainConflictError } from "../errors";
import {
  assertWeeklyRankingManifestIntegrity,
} from "../ranking/service";
import { assertWeeklyRankingSnapshotIntegrity } from "../ranking/rules";
import type {
  WeeklyRankingManifest,
  WeeklyRankingSnapshot,
} from "../ranking/types";
import { stableRewardHash, validRewardDate, validRewardWallet } from "./rules";
import type { CreditSourceKind, RewardRule } from "./types";

const RANKING_BOUNDARY_SHIFT_MS = 14 * 60 * 60_000;

export type AppliedArenaRankingSnapshot = {
  rank: number | null;
  rewardBps: number;
  sourceRankingId: string | null;
  evidenceHash: string;
};

export async function resolveAppliedArenaRanking(input: {
  db: Db;
  session?: ClientSession;
  gameId: string;
  walletAddress: string;
  creditSource: CreditSourceKind;
  periodAnchorAt: Date;
  rewardRule: RewardRule;
}): Promise<AppliedArenaRankingSnapshot> {
  const walletNormalized = validRewardWallet(input.walletAddress);
  const periodAnchorAt = validRewardDate(input.periodAnchorAt, "periodAnchorAt");
  if (input.creditSource === "own") {
    const snapshot = {
      rank: null,
      rewardBps: 10_000,
      sourceRankingId: null,
    } as const;
    return {
      ...snapshot,
      evidenceHash: stableRewardHash({
        kind: "arena-ranking-applied",
        gameId: input.gameId,
        walletNormalized,
        periodAnchorAt,
        ...snapshot,
      }),
    };
  }

  const shiftedPeriod = getIsoWeekPeriod(
    new Date(periodAnchorAt.getTime() - RANKING_BOUNDARY_SHIFT_MS),
  );
  const options = input.session ? { session: input.session } : {};
  const previous = await input.db.collection<WeeklyRankingSnapshot>("game_weekly_rankings")
    .findOne({
      gameId: input.gameId,
      walletNormalized,
      status: "sealed",
      periodStart: { $lt: shiftedPeriod.start },
    }, {
      ...options,
      sort: { periodStart: -1, _id: -1 },
    });

  if (!previous) {
    const previousPeriodId = getIsoWeekPeriodId(
      new Date(shiftedPeriod.start.getTime() - 7 * 24 * 60 * 60_000),
    );
    const rank = 5;
    const snapshot = {
      rank,
      rewardBps: input.rewardRule.rankingPlayerBps[String(rank)],
      sourceRankingId: `arena-initial:${input.gameId}:${walletNormalized}:${shiftedPeriod.id}`,
    };
    return {
      ...snapshot,
      evidenceHash: stableRewardHash({
        kind: "arena-ranking-applied",
        gameId: input.gameId,
        walletNormalized,
        periodId: shiftedPeriod.id,
        previousPeriodId,
        ...snapshot,
      }),
    };
  }

  assertWeeklyRankingSnapshotIntegrity(previous);
  const previousPeriodId = previous.periodId;
  const manifest = await input.db.collection<WeeklyRankingManifest>("weekly_ranking_manifests")
    .findOne({ manifestId: previous.manifestId, periodId: previousPeriodId }, options);
  if (!manifest) {
    throw new DomainConflictError(`Falta manifest para el ranking ${previous.rankingId}.`);
  }
  assertWeeklyRankingManifestIntegrity(manifest);
  const rank = previous.nextRank;
  const rewardBps = input.rewardRule.rankingPlayerBps[String(rank)];
  if (
    !Number.isSafeInteger(rewardBps)
    || manifest.sourceSetHash !== previous.sourceSetHash
    || manifest.runId !== previous.runId
    || manifest.ruleVersion !== previous.ruleVersion
    || manifest.ruleConfigHash !== previous.ruleConfigHash
  ) {
    throw new DomainConflictError(
      `El ranking previo ${previous.rankingId} no liga la regla rewards activa.`,
    );
  }
  const snapshot = {
    rank,
    rewardBps,
    sourceRankingId: previous.rankingId,
  };
  return {
    ...snapshot,
    evidenceHash: stableRewardHash({
      kind: "arena-ranking-applied",
      gameId: input.gameId,
      walletNormalized,
      periodId: shiftedPeriod.id,
      previousPeriodId,
      previousPayloadHash: previous.payloadHash,
      manifestPayloadHash: manifest.payloadHash,
      ...snapshot,
    }),
  };
}
