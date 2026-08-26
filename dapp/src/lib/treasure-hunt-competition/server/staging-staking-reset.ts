import type { Document, Filter } from 'mongodb';

import type { CompetitionConfig } from '..';

export const STAGING_STAKING_RESETS_COLLECTION = 'competition_staking_qa_resets';
export const STAGING_STAKING_RESET_AUDITS_COLLECTION = 'competition_staking_qa_reset_audits';
export const STAGING_ECONOMY_DATABASE = 'cukieshub-new-staging';

export type StagingStakingResetBoundary = {
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly eventId: string;
};

type StagingResetEnvironment = Partial<Record<string, string | undefined>>;

export function stagingStakingResetsEnabled(environment: StagingResetEnvironment) {
  return environment.APP_ENV === 'staging'
    && environment.STAGING_ONLY_GUARD === 'true'
    && environment.CHAIN_INDEXER_DB_NAME === STAGING_ECONOMY_DATABASE;
}

export function stagingStakingResetId(campaignId: string, walletAddress: string) {
  return `${campaignId}:${walletAddress.toLowerCase()}`;
}

export function parseStagingStakingReset(
  document: Document | null,
  campaign: CompetitionConfig,
  walletAddress: string,
): StagingStakingResetBoundary | null {
  if (!document) return null;
  const normalizedWallet = walletAddress.toLowerCase();
  if (
    document._id !== stagingStakingResetId(campaign.campaignId, normalizedWallet)
    || document.campaignId !== campaign.campaignId
    || document.walletAddress !== normalizedWallet
    || !Number.isSafeInteger(document.ignoreUnstakesThroughBlock)
    || document.ignoreUnstakesThroughBlock < 0
    || !Number.isSafeInteger(document.ignoreUnstakesThroughLogIndex)
    || document.ignoreUnstakesThroughLogIndex < 0
    || typeof document.ignoreUnstakesThroughEventId !== 'string'
    || document.ignoreUnstakesThroughEventId.length === 0
  ) return null;
  return {
    blockNumber: Number(document.ignoreUnstakesThroughBlock),
    logIndex: Number(document.ignoreUnstakesThroughLogIndex),
    eventId: document.ignoreUnstakesThroughEventId,
  };
}

export function afterStagingResetFilter(
  boundary: StagingStakingResetBoundary | null,
): Filter<Document> {
  if (!boundary) return {};
  return {
    $or: [
      { blockNumber: { $gt: boundary.blockNumber } },
      {
        blockNumber: boundary.blockNumber,
        logIndex: { $gt: boundary.logIndex },
      },
    ],
  };
}
