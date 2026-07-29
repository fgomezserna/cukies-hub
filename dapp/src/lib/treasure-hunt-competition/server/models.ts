import type {
  CompetitionAttempt,
  CompetitionConfig,
} from '..';
import type { CompetitionEvidencePoint } from './evidence';

export type CompetitionStoredEvidencePoint = CompetitionEvidencePoint;
export type CompetitionReviewDecision = 'valid' | 'invalid';

export interface CompetitionParticipantRecord {
  readonly campaignId: string;
  readonly walletAddress: string;
  readonly alias: string;
  readonly canonicalAlias: string;
  readonly aliasChangedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompetitionAttemptRecord extends CompetitionAttempt {
  readonly userId: string;
  readonly rulesVersion: string;
  readonly gameSessionId: string;
  readonly seed: string;
  readonly genesisDigest: string;
  readonly expiresAt: string;
  readonly nextSequence: number;
  readonly lastDigest: string;
  readonly lastScore: number;
  readonly lastGameTimeMs: number;
  readonly lastEvidenceAt: string | null;
  /** Final evidence is durable, but GameSession authority has not been confirmed closed yet. */
  readonly finishPendingAuthority?: boolean;
  /** Timestamp at which authoritative finish moved the attempt into the review queue. */
  readonly reviewQueuedAt?: string | null;
  /** Immutable manual/server adjudication audit, populated when review is decided. */
  readonly reviewDecision?: CompetitionReviewDecision | null;
  readonly reviewReason?: string | null;
  readonly reviewedAt?: string | null;
  readonly reviewer?: string | null;
  readonly evidence: readonly CompetitionStoredEvidencePoint[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompetitionRepository {
  assertReadyForParticipantWrites?(): Promise<void> | void;
  ensureIndexes(): Promise<void>;
  syncCampaign(campaign: CompetitionConfig, now: string): Promise<void>;
  getOrCreateParticipant(input: {
    campaignId: string;
    walletAddress: string;
    generatedAlias: string;
    now: string;
  }): Promise<CompetitionParticipantRecord>;
  findParticipant(
    campaignId: string,
    walletAddress: string,
  ): Promise<CompetitionParticipantRecord | null>;
  updateParticipantAlias(input: {
    campaignId: string;
    walletAddress: string;
    alias: string;
    canonicalAlias: string;
    now: string;
  }): Promise<CompetitionParticipantRecord | null>;
  updateAttemptsAlias(input: {
    campaignId: string;
    walletAddress: string;
    alias: string;
    now: string;
  }): Promise<void>;
  findActiveAttempt(
    campaignId: string,
    walletAddress: string,
  ): Promise<CompetitionAttemptRecord | null>;
  abandonActiveAttempts(
    campaignId: string,
    walletAddress: string,
    now: string,
  ): Promise<void>;
  listPendingFinishAttempts(
    campaignId: string,
    limit: number,
  ): Promise<CompetitionAttemptRecord[]>;
  createAttempt(attempt: CompetitionAttemptRecord): Promise<CompetitionAttemptRecord>;
  findAttempt(attemptId: string): Promise<CompetitionAttemptRecord | null>;
  appendEvidence(input: {
    attemptId: string;
    walletAddress: string;
    expectedSequence: number;
    expectedPreviousDigest: string;
    point: CompetitionStoredEvidencePoint;
    finishPendingAuthority?: true;
  }): Promise<CompetitionAttemptRecord | null>;
  finalizeAttemptForReview(input: {
    attemptId: string;
    walletAddress: string;
    expectedSequence: number;
    expectedPreviousDigest: string;
    now: string;
  }): Promise<CompetitionAttemptRecord | null>;
  listReviewAttempts(
    campaignId: string,
    limit: number,
  ): Promise<CompetitionAttemptRecord[]>;
  adjudicateAttempt(input: {
    campaignId: string;
    attemptId: string;
    decision: CompetitionReviewDecision;
    reason: string;
    reviewer: string;
    reviewedAt: string;
  }): Promise<CompetitionAttemptRecord | null>;
  listAttempts(
    campaignId: string,
    walletAddress: string,
    limit: number,
  ): Promise<CompetitionAttemptRecord[]>;
  listValidAttempts(campaignId: string, limit: number): Promise<CompetitionAttemptRecord[]>;
}

export interface CompetitionGameSessionAuthority {
  readonly gameSessionId: string;
  readonly userId: string;
  readonly gameId: string;
  readonly isActive: boolean;
  readonly mode: string;
  readonly rewardEligible: boolean;
  readonly competitionAttemptId?: string | null;
}
