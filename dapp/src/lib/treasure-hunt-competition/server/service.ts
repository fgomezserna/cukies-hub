import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import {
  buildCompetitionRanking,
  displayCompetitionAlias,
  generateCompetitionAlias,
  isCompetitionWalletAddress,
  normalizeCompetitionWallet,
  normalizeCompetitionAlias,
  validateCompetitionAlias,
  type CompetitionConfig,
} from '..';
import {
  validateCompetitionEvidence,
  type CompetitionEvidenceInput,
} from './evidence';
import type {
  CompetitionAttemptRecord,
  CompetitionGameSessionAuthority,
  CompetitionParticipantRecord,
  CompetitionRepository,
  CompetitionReviewDecision,
} from './models';
import {
  createCheckpointReceipt,
  verifyCheckpointReceipt,
  verifyCheckpointReceiptSignature,
} from './proof';
import { getCompetitionProofSecret, resolveCompetitionRuntime } from './runtime';

type CompetitionEnvironment = Partial<Record<string, string | undefined>>;

export type CompetitionServiceErrorCode =
  | 'COMPETITION_NOT_CONFIGURED'
  | 'COMPETITION_NOT_ACTIVE'
  | 'INVALID_WALLET'
  | 'GAME_SESSION_NOT_ELIGIBLE'
  | 'ATTEMPT_NOT_FOUND'
  | 'ATTEMPT_NOT_ACTIVE'
  | 'INVALID_RECEIPT'
  | 'INVALID_EVIDENCE'
  | 'EVIDENCE_CONFLICT'
  | 'INVALID_ALIAS'
  | 'ALIAS_TAKEN'
  | 'ALIAS_LOCKED'
  | 'INVALID_REVIEW'
  | 'REVIEW_CONFLICT';

export class CompetitionServiceError extends Error {
  constructor(
    readonly code: CompetitionServiceErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CompetitionServiceError';
  }
}

interface CompetitionServiceDependencies {
  readonly repository: CompetitionRepository;
  readonly environment?: CompetitionEnvironment;
  readonly proofSecret?: string;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly createSeed?: () => string;
  readonly findGameSession: (
    gameSessionId: string,
  ) => Promise<CompetitionGameSessionAuthority | null>;
  readonly applyReferral?: (
    walletAddress: string,
    referralCode: string,
  ) => Promise<unknown>;
  readonly claimGameSession?: (input: {
    userId: string;
    gameSessionId: string;
    attemptId: string;
  }) => Promise<boolean>;
  readonly finishGameSession?: (input: {
    userId: string;
    gameSessionId: string;
    attemptId: string;
  }) => Promise<boolean>;
  readonly releaseGameSession?: (input: {
    userId: string;
    gameSessionId: string;
    attemptId: string;
  }) => Promise<boolean>;
  readonly attemptLeaseMs?: number;
}

interface AttemptStartInput {
  readonly userId: string;
  readonly walletAddress: string;
  readonly gameSessionId: string;
  readonly referralCode?: string | null;
}

interface AttemptEvidenceRequest {
  readonly walletAddress: string;
  readonly attemptId: string;
  readonly receipt: string;
  readonly sequence: number;
  readonly score: number;
  readonly gameTimeMs: number;
  readonly clientTimestampMs?: number | null;
}

interface AttemptAdjudicationRequest {
  readonly attemptId: string;
  readonly decision: CompetitionReviewDecision;
  readonly reason: string;
  readonly reviewer: string;
}

export interface CompetitionPendingFinishRecoveryResult {
  readonly scanned: number;
  readonly recovered: number;
  readonly alreadyFinalized: number;
  readonly failed: number;
  readonly remainingPending: number;
  readonly complete: boolean;
}

const MAX_INTERNAL_REVIEW_TEXT_LENGTH = 1_000;
const MAX_INTERNAL_REVIEWER_LENGTH = 128;
const MAX_INTERNAL_ATTEMPT_ID_LENGTH = 128;
const FINAL_ATTEMPT_STATUSES = new Set(['review', 'valid', 'invalid']);

function activeCampaign(environment: CompetitionEnvironment, now: Date) {
  const runtime = resolveCompetitionRuntime(environment, now);
  if (!runtime.campaign) {
    throw new CompetitionServiceError(
      'COMPETITION_NOT_CONFIGURED',
      'The competition is not configured',
      503,
    );
  }
  if (runtime.phase !== 'active') {
    throw new CompetitionServiceError(
      'COMPETITION_NOT_ACTIVE',
      'The competition is not active',
      409,
    );
  }
  return runtime.campaign;
}

function configuredCampaign(environment: CompetitionEnvironment, now: Date) {
  const runtime = resolveCompetitionRuntime(environment, now);
  if (!runtime.campaign) {
    throw new CompetitionServiceError(
      'COMPETITION_NOT_CONFIGURED',
      'The competition is not configured',
      503,
    );
  }
  return runtime.campaign;
}

function isFinalAttemptStatus(status: CompetitionAttemptRecord['status']) {
  return FINAL_ATTEMPT_STATUSES.has(status);
}

function durableFinishPoint(attempt: CompetitionAttemptRecord) {
  if (attempt.nextSequence < 1) return null;
  const point = attempt.evidence.find(
    (candidate) => candidate.sequence === attempt.nextSequence - 1,
  );
  if (
    !point ||
    point.kind !== 'finish' ||
    point.digest !== attempt.lastDigest ||
    point.score !== attempt.score ||
    point.gameTimeMs !== attempt.gameTimeMs ||
    point.receivedAt !== attempt.finishedAt
  ) {
    return null;
  }
  return point;
}

function isExactDurableFinishReplay(input: {
  attempt: CompetitionAttemptRecord;
  request: AttemptEvidenceRequest;
  previousDigest: string;
}) {
  const point = durableFinishPoint(input.attempt);
  return Boolean(
    point &&
    point.sequence === input.request.sequence &&
    point.score === input.request.score &&
    point.gameTimeMs === input.request.gameTimeMs &&
    (point.clientTimestampMs ?? null) === (input.request.clientTimestampMs ?? null) &&
    point.previousDigest === input.previousDigest
  );
}

function normalizeRequiredReviewText(value: unknown, field: string, maxLength: number) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maxLength) {
    throw new CompetitionServiceError(
      'INVALID_REVIEW',
      `${field} is required and must not exceed ${maxLength} characters`,
      400,
    );
  }
  return normalized;
}

function matchesStoredAdjudication(
  attempt: CompetitionAttemptRecord,
  input: Pick<AttemptAdjudicationRequest, 'decision' | 'reason' | 'reviewer'>,
) {
  return (
    attempt.status === input.decision &&
    attempt.reviewDecision === input.decision &&
    attempt.reviewReason === input.reason &&
    attempt.reviewer === input.reviewer &&
    typeof attempt.reviewedAt === 'string' &&
    Number.isFinite(Date.parse(attempt.reviewedAt))
  );
}

function createGenesisDigest(input: {
  campaignId: string;
  attemptId: string;
  walletAddress: string;
  gameSessionId: string;
  seed: string;
  secret: string;
}) {
  return createHmac('sha256', input.secret)
    .update(JSON.stringify([
      'cukies-treasure-hunt-genesis-v1',
      input.campaignId,
      input.attemptId,
      input.walletAddress,
      input.gameSessionId,
      input.seed,
    ]))
    .digest('hex');
}

function receiptFor(attempt: CompetitionAttemptRecord, secret: string) {
  return createCheckpointReceipt({
    version: 1,
    campaignId: attempt.campaignId,
    attemptId: attempt.attemptId,
    walletAddress: attempt.walletAddress,
    gameSessionId: attempt.gameSessionId,
    nextSequence: attempt.nextSequence,
    previousDigest: attempt.lastDigest,
    expiresAt: attempt.expiresAt,
  }, secret);
}

function publicParticipant(participant: CompetitionParticipantRecord) {
  const alias = displayCompetitionAlias(participant.alias);
  return {
    alias,
    canonicalAlias: normalizeCompetitionAlias(alias),
    aliasChangedAt: participant.aliasChangedAt ?? null,
    createdAt: participant.createdAt,
  };
}

function publicAttempt(attempt: CompetitionAttemptRecord, secret: string) {
  return {
    attemptId: attempt.attemptId,
    gameSessionId: attempt.gameSessionId,
    campaignId: attempt.campaignId,
    gameId: attempt.gameId,
    mode: attempt.mode,
    rulesVersion: attempt.rulesVersion,
    alias: displayCompetitionAlias(attempt.playerAlias),
    seed: attempt.seed,
    status: attempt.status,
    score: attempt.score,
    gameTimeMs: attempt.gameTimeMs,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    expiresAt: attempt.expiresAt,
    nextSequence: attempt.nextSequence,
    receipt: attempt.status === 'active' && attempt.finishPendingAuthority !== true
      ? receiptFor(attempt, secret)
      : null,
  };
}

function activePublicAttempt(attempt: CompetitionAttemptRecord, secret: string) {
  if (attempt.status !== 'active' || attempt.finishPendingAuthority === true) {
    throw new CompetitionServiceError(
      'ATTEMPT_NOT_ACTIVE',
      'Competition attempt is awaiting final authority',
      409,
    );
  }
  const result = publicAttempt(attempt, secret);
  return { ...result, receipt: receiptFor(attempt, secret), status: 'active' as const };
}

export function createCompetitionService(dependencies: CompetitionServiceDependencies) {
  const environment = dependencies.environment ?? process.env;
  let cachedProofSecret = dependencies.proofSecret;
  const proofSecret = () => {
    cachedProofSecret ??= getCompetitionProofSecret(environment);
    return cachedProofSecret;
  };
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? randomUUID;
  const createSeed = dependencies.createSeed ?? (() => randomBytes(32).toString('base64url'));
  const attemptLeaseMs = dependencies.attemptLeaseMs ?? 2 * 60 * 60 * 1_000;

  async function prepareCampaign(requireActive: boolean) {
    const current = now();
    const campaign = requireActive
      ? activeCampaign(environment, current)
      : configuredCampaign(environment, current);
    if (requireActive) {
      try {
        proofSecret();
      } catch {
        throw new CompetitionServiceError(
          'COMPETITION_NOT_CONFIGURED',
          'The competition proof secret is not configured',
          503,
        );
      }
    }
    await dependencies.repository.ensureIndexes();
    await dependencies.repository.syncCampaign(campaign, current.toISOString());
    return { campaign, current };
  }

  async function assertParticipantWritesConfigured() {
    try {
      await dependencies.repository.assertReadyForParticipantWrites?.();
    } catch {
      throw new CompetitionServiceError(
        'COMPETITION_NOT_CONFIGURED',
        'The competition alias secret is not configured',
        503,
      );
    }
  }

  async function finalizePendingFinishForReview(
    attempt: CompetitionAttemptRecord,
    current: Date,
  ) {
    if (
      attempt.status !== 'active' ||
      attempt.finishPendingAuthority !== true ||
      !durableFinishPoint(attempt)
    ) {
      throw new CompetitionServiceError(
        'EVIDENCE_CONFLICT',
        'Competition finish is not durably pending authority',
        409,
      );
    }

    const finished = await (dependencies.finishGameSession?.({
      userId: attempt.userId,
      gameSessionId: attempt.gameSessionId,
      attemptId: attempt.attemptId,
    }) ?? Promise.resolve(true));
    if (!finished) {
      throw new CompetitionServiceError(
        'EVIDENCE_CONFLICT',
        'Competition finish authority is not confirmed',
        409,
      );
    }

    const finalized = await dependencies.repository.finalizeAttemptForReview({
      attemptId: attempt.attemptId,
      walletAddress: attempt.walletAddress,
      expectedSequence: attempt.nextSequence,
      expectedPreviousDigest: attempt.lastDigest,
      now: current.toISOString(),
    });
    if (finalized) return finalized;

    const currentAttempt = await dependencies.repository.findAttempt(attempt.attemptId);
    if (
      currentAttempt &&
      currentAttempt.campaignId === attempt.campaignId &&
      currentAttempt.walletAddress === attempt.walletAddress &&
      currentAttempt.finishPendingAuthority !== true &&
      isFinalAttemptStatus(currentAttempt.status)
    ) {
      return currentAttempt;
    }
    throw new CompetitionServiceError(
      'EVIDENCE_CONFLICT',
      'Competition finish could not enter review',
      409,
    );
  }

  async function getParticipant(walletAddress: string) {
    const { campaign, current } = await prepareCampaign(false);
    const wallet = normalizeCompetitionWallet(walletAddress);
    if (!isCompetitionWalletAddress(wallet)) {
      throw new CompetitionServiceError('INVALID_WALLET', 'A valid EVM wallet is required', 400);
    }
    await assertParticipantWritesConfigured();
    const participant = await dependencies.repository.getOrCreateParticipant({
      campaignId: campaign.campaignId,
      walletAddress: wallet,
      generatedAlias: generateCompetitionAlias(wallet),
      now: current.toISOString(),
    });
    return publicParticipant(participant);
  }

  async function updateAlias(walletAddress: string, alias: string) {
    const aliasRuntime = resolveCompetitionRuntime(environment, now());
    if (aliasRuntime.phase === 'closed') {
      throw new CompetitionServiceError(
        'ALIAS_LOCKED',
        'Competition aliases are locked after the campaign closes',
        409,
      );
    }
    const { campaign, current } = await prepareCampaign(false);
    const wallet = normalizeCompetitionWallet(walletAddress);
    if (!isCompetitionWalletAddress(wallet)) {
      throw new CompetitionServiceError('INVALID_WALLET', 'A valid EVM wallet is required', 400);
    }
    await assertParticipantWritesConfigured();
    const validation = validateCompetitionAlias(alias);
    if (!validation.valid) {
      throw new CompetitionServiceError('INVALID_ALIAS', `Invalid alias: ${validation.reason}`, 400);
    }
    await dependencies.repository.getOrCreateParticipant({
      campaignId: campaign.campaignId,
      walletAddress: wallet,
      generatedAlias: generateCompetitionAlias(wallet),
      now: current.toISOString(),
    });
    const participant = await dependencies.repository.updateParticipantAlias({
      campaignId: campaign.campaignId,
      walletAddress: wallet,
      alias: validation.alias,
      canonicalAlias: normalizeCompetitionAlias(validation.alias),
      now: current.toISOString(),
    });
    if (!participant) {
      throw new CompetitionServiceError('ALIAS_TAKEN', 'This alias is already in use', 409);
    }
    await dependencies.repository.updateAttemptsAlias({
      campaignId: campaign.campaignId,
      walletAddress: wallet,
      alias: participant.alias,
      now: current.toISOString(),
    });
    return publicParticipant(participant);
  }

  async function startAttempt(input: AttemptStartInput) {
    const { campaign, current } = await prepareCampaign(true);
    const walletAddress = normalizeCompetitionWallet(input.walletAddress);
    if (!isCompetitionWalletAddress(walletAddress)) {
      throw new CompetitionServiceError('INVALID_WALLET', 'A valid EVM wallet is required', 400);
    }

    const gameSession = await dependencies.findGameSession(input.gameSessionId);
    const existing = await dependencies.repository.findActiveAttempt(
      campaign.campaignId,
      walletAddress,
    );
    if (existing?.finishPendingAuthority === true) {
      throw new CompetitionServiceError(
        'ATTEMPT_NOT_ACTIVE',
        'Competition attempt is awaiting final authority',
        409,
      );
    }
    const sessionOwned = Boolean(
      gameSession &&
      gameSession.gameSessionId === input.gameSessionId &&
      gameSession.userId === input.userId &&
      gameSession.gameId === 'sybil-slayer' &&
      gameSession.isActive,
    );
    const existingMatchesSession = Boolean(
      existing &&
      existing.userId === input.userId &&
      existing.gameSessionId === input.gameSessionId &&
      current.getTime() <= Date.parse(existing.expiresAt) &&
      sessionOwned,
    );
    if (existing && existingMatchesSession) {
      if (
        gameSession?.mode === 'presale_competition' &&
        gameSession.rewardEligible === false &&
        gameSession.competitionAttemptId === existing.attemptId
      ) {
        return activePublicAttempt(existing, proofSecret());
      }
      if (
        gameSession?.mode === 'standard' &&
        gameSession.rewardEligible === true &&
        gameSession.competitionAttemptId == null
      ) {
        const reclaimed = await (dependencies.claimGameSession?.({
          userId: input.userId,
          gameSessionId: input.gameSessionId,
          attemptId: existing.attemptId,
        }) ?? Promise.resolve(true));
        if (!reclaimed) {
          throw new CompetitionServiceError(
            'GAME_SESSION_NOT_ELIGIBLE',
            'The existing competition attempt could not reclaim the game session',
            409,
          );
        }
        return activePublicAttempt(existing, proofSecret());
      }
    }
    if (!gameSession || !sessionOwned) {
      throw new CompetitionServiceError(
        'GAME_SESSION_NOT_ELIGIBLE',
        'The game session is not eligible for the presale competition',
        403,
      );
    }

    if (existing) {
      const expiresAtMs = Date.parse(existing.expiresAt);
      if (!Number.isFinite(expiresAtMs) || current.getTime() <= expiresAtMs) {
        throw new CompetitionServiceError(
          'GAME_SESSION_NOT_ELIGIBLE',
          'Another competition attempt is still active for this wallet',
          409,
        );
      }

      // Expired attempts can be superseded, but their authority must be closed
      // before the database row is abandoned. Otherwise a failed claim for the
      // new session would strand an abandoned attempt behind a still-open
      // competition GameSession.
      const expiredAuthorityClosed = await (dependencies.finishGameSession?.({
        userId: existing.userId,
        gameSessionId: existing.gameSessionId,
        attemptId: existing.attemptId,
      }) ?? Promise.resolve(false));
      if (!expiredAuthorityClosed) {
        throw new CompetitionServiceError(
          'GAME_SESSION_NOT_ELIGIBLE',
          'The expired competition attempt could not release its authority',
          409,
        );
      }
      await dependencies.repository.abandonActiveAttempts(
        campaign.campaignId,
        walletAddress,
        current.toISOString(),
      );
    }

    if (
      gameSession.mode !== 'standard' ||
      gameSession.rewardEligible !== true ||
      gameSession.competitionAttemptId != null
    ) {
      throw new CompetitionServiceError(
        'GAME_SESSION_NOT_ELIGIBLE',
        'The game session is not eligible for the presale competition',
        403,
      );
    }

    await assertParticipantWritesConfigured();
    const participant = await dependencies.repository.getOrCreateParticipant({
      campaignId: campaign.campaignId,
      walletAddress,
      generatedAlias: generateCompetitionAlias(walletAddress),
      now: current.toISOString(),
    });

    const cleanReferralCode = input.referralCode?.trim();
    if (cleanReferralCode && dependencies.applyReferral) {
      try {
        await dependencies.applyReferral(walletAddress, cleanReferralCode);
      } catch {
        // Referral attribution is best-effort here. The presale indexer remains authoritative.
      }
    }

    const attemptId = createId();
    const seed = createSeed();
    const expiresAt = new Date(Math.min(
      current.getTime() + attemptLeaseMs,
      Date.parse(campaign.endsAt),
    )).toISOString();
    const genesisDigest = createGenesisDigest({
      campaignId: campaign.campaignId,
      attemptId,
      walletAddress,
      gameSessionId: input.gameSessionId,
      seed,
      secret: proofSecret(),
    });
    const attempt: CompetitionAttemptRecord = {
      attemptId,
      campaignId: campaign.campaignId,
      gameId: campaign.gameId,
      mode: campaign.mode,
      walletAddress,
      playerAlias: participant.alias,
      userId: input.userId,
      rulesVersion: campaign.rulesVersion,
      gameSessionId: input.gameSessionId,
      seed,
      genesisDigest,
      expiresAt,
      score: 0,
      gameTimeMs: 0,
      startedAt: current.toISOString(),
      finishedAt: null,
      status: 'active',
      nextSequence: 0,
      lastDigest: genesisDigest,
      lastScore: 0,
      lastGameTimeMs: 0,
      lastEvidenceAt: null,
      finishPendingAuthority: false,
      reviewQueuedAt: null,
      reviewDecision: null,
      reviewReason: null,
      reviewedAt: null,
      reviewer: null,
      evidence: [],
      createdAt: current.toISOString(),
      updatedAt: current.toISOString(),
    };
    const claimed = await (dependencies.claimGameSession?.({
      userId: input.userId,
      gameSessionId: input.gameSessionId,
      attemptId,
    }) ?? Promise.resolve(true));
    if (!claimed) {
      throw new CompetitionServiceError(
        'GAME_SESSION_NOT_ELIGIBLE',
        'The game session could not be claimed for the competition',
        409,
      );
    }

    let created: CompetitionAttemptRecord;
    try {
      created = await dependencies.repository.createAttempt(attempt);
    } catch (error) {
      let recovered: CompetitionAttemptRecord | null;
      try {
        recovered = await dependencies.repository.findAttempt(attemptId);
      } catch {
        // An ambiguous insert plus an unavailable read must remain claimed. Releasing
        // here could reopen a GameSession whose attempt is already durable.
        throw error;
      }
      if (recovered) {
        if (
          recovered.attemptId === attemptId &&
          recovered.campaignId === campaign.campaignId &&
          recovered.walletAddress === walletAddress &&
          recovered.userId === input.userId &&
          recovered.gameSessionId === input.gameSessionId
        ) {
          return activePublicAttempt(recovered, proofSecret());
        }
        // A record exists but does not match the authority tuple. Fail closed and do
        // not release a potentially valid claim.
        throw error;
      }
      try {
        await dependencies.releaseGameSession?.({
          userId: input.userId,
          gameSessionId: input.gameSessionId,
          attemptId,
        });
      } catch {
        // Preserve the insert failure. A failed release leaves the session closed to
        // legacy rewards, which is the safe side of the boundary.
      }
      throw error;
    }
    return activePublicAttempt(created, proofSecret());
  }

  async function appendEvidence(
    request: AttemptEvidenceRequest,
    kind: CompetitionEvidenceInput['kind'],
  ) {
    const { campaign, current } = await prepareCampaign(false);
    const walletAddress = normalizeCompetitionWallet(request.walletAddress);
    if (!isCompetitionWalletAddress(walletAddress)) {
      throw new CompetitionServiceError('INVALID_WALLET', 'A valid EVM wallet is required', 400);
    }
    const signedReceipt = verifyCheckpointReceiptSignature(request.receipt, proofSecret());
    if (
      !signedReceipt ||
      signedReceipt.campaignId !== campaign.campaignId ||
      signedReceipt.attemptId !== request.attemptId ||
      signedReceipt.walletAddress !== walletAddress ||
      signedReceipt.nextSequence !== request.sequence
    ) {
      throw new CompetitionServiceError('INVALID_RECEIPT', 'Invalid checkpoint receipt', 403);
    }

    const attempt = await dependencies.repository.findAttempt(request.attemptId);
    if (
      !attempt ||
      attempt.campaignId !== campaign.campaignId ||
      attempt.walletAddress !== walletAddress
    ) {
      throw new CompetitionServiceError('ATTEMPT_NOT_FOUND', 'Competition attempt not found', 404);
    }
    if (
      attempt.gameSessionId !== signedReceipt.gameSessionId
    ) {
      throw new CompetitionServiceError('INVALID_RECEIPT', 'Invalid checkpoint receipt', 403);
    }

    // A finish that was already committed to the evidence chain is recoverable from
    // server state even after the public window and receipt lease expire. No other
    // evidence path bypasses the active campaign/lease checks below.
    if (
      kind === 'finish' &&
      isExactDurableFinishReplay({
        attempt,
        request,
        previousDigest: signedReceipt.previousDigest,
      })
    ) {
      let replayedAttempt = attempt;
      if (attempt.status === 'active' && attempt.finishPendingAuthority === true) {
        replayedAttempt = await finalizePendingFinishForReview(attempt, current);
      } else if (
        attempt.finishPendingAuthority === true ||
        !isFinalAttemptStatus(attempt.status)
      ) {
        throw new CompetitionServiceError(
          'ATTEMPT_NOT_ACTIVE',
          'Competition attempt is closed',
          409,
        );
      }
      return {
        accepted: true,
        replayed: true,
        status: replayedAttempt.status,
        score: replayedAttempt.score,
        gameTimeMs: replayedAttempt.gameTimeMs,
        nextSequence: replayedAttempt.nextSequence,
        receipt: replayedAttempt.status === 'active' &&
          replayedAttempt.finishPendingAuthority !== true
          ? receiptFor(replayedAttempt, proofSecret())
          : null,
      };
    }

    // From this point onward the request would add or replay non-final evidence,
    // so the normal public campaign and receipt expiry gates remain mandatory.
    activeCampaign(environment, current);
    const receipt = verifyCheckpointReceipt(request.receipt, proofSecret(), current);
    if (!receipt) {
      throw new CompetitionServiceError('INVALID_RECEIPT', 'Invalid checkpoint receipt', 403);
    }

    const replayedPoint = attempt.evidence.find((point) => point.sequence === request.sequence);
    if (
      kind === 'checkpoint' &&
      attempt.status === 'active' &&
      attempt.finishPendingAuthority !== true &&
      replayedPoint &&
      replayedPoint.kind === kind &&
      replayedPoint.score === request.score &&
      replayedPoint.gameTimeMs === request.gameTimeMs &&
      (replayedPoint.clientTimestampMs ?? null) === (request.clientTimestampMs ?? null) &&
      replayedPoint.previousDigest === receipt.previousDigest
    ) {
      return {
        accepted: true,
        replayed: true,
        status: attempt.status,
        score: attempt.score,
        gameTimeMs: attempt.gameTimeMs,
        nextSequence: attempt.nextSequence,
        receipt: receiptFor(attempt, proofSecret()),
      };
    }
    if (attempt.status !== 'active' || attempt.finishPendingAuthority === true) {
      throw new CompetitionServiceError('ATTEMPT_NOT_ACTIVE', 'Competition attempt is closed', 409);
    }
    if (
      attempt.gameSessionId !== receipt.gameSessionId ||
      attempt.nextSequence !== receipt.nextSequence ||
      attempt.lastDigest !== receipt.previousDigest
    ) {
      throw new CompetitionServiceError('INVALID_RECEIPT', 'Stale checkpoint receipt', 403);
    }

    const evidence: CompetitionEvidenceInput = {
      sequence: request.sequence,
      kind,
      score: request.score,
      gameTimeMs: request.gameTimeMs,
      clientTimestampMs: request.clientTimestampMs ?? null,
    };
    const validation = validateCompetitionEvidence({
      state: {
        campaignId: attempt.campaignId,
        attemptId: attempt.attemptId,
        walletAddress: attempt.walletAddress,
        gameSessionId: attempt.gameSessionId,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        nextSequence: attempt.nextSequence,
        lastDigest: attempt.lastDigest,
        lastScore: attempt.lastScore,
        lastGameTimeMs: attempt.lastGameTimeMs,
        lastEvidenceAt: attempt.lastEvidenceAt,
      },
      evidence,
      receivedAt: current,
      secret: proofSecret(),
    });
    if (!validation.valid) {
      throw new CompetitionServiceError(
        'INVALID_EVIDENCE',
        `Competition evidence rejected: ${validation.reason}`,
        422,
      );
    }

    const updated = await dependencies.repository.appendEvidence({
      attemptId: attempt.attemptId,
      walletAddress,
      expectedSequence: attempt.nextSequence,
      expectedPreviousDigest: attempt.lastDigest,
      point: validation.point,
      finishPendingAuthority: kind === 'finish' ? true : undefined,
    });
    if (!updated) {
      throw new CompetitionServiceError(
        'EVIDENCE_CONFLICT',
        'Concurrent competition evidence update',
        409,
      );
    }

    let completed = updated;
    if (kind === 'finish') {
      completed = await finalizePendingFinishForReview(updated, current);
    }

    return {
      accepted: true,
      replayed: false,
      status: completed.status,
      score: completed.score,
      gameTimeMs: completed.gameTimeMs,
      nextSequence: completed.nextSequence,
      receipt: completed.status === 'active' && completed.finishPendingAuthority !== true
        ? receiptFor(completed, proofSecret())
        : null,
    };
  }

  async function finishAttempt(request: AttemptEvidenceRequest) {
    if (request.sequence !== 0) return appendEvidence(request, 'finish');

    let checkpoint;
    try {
      checkpoint = await appendEvidence(request, 'checkpoint');
    } catch (error) {
      if (!(error instanceof CompetitionServiceError) || error.code !== 'ATTEMPT_NOT_ACTIVE') {
        throw error;
      }

      // The same initial finish may be retried after both points were committed but
      // before the response reached the browser. Rebuild the intermediate receipt
      // only when the durable checkpoint and finish exactly match this request.
      const attempt = await dependencies.repository.findAttempt(request.attemptId);
      const signedReceipt = verifyCheckpointReceiptSignature(request.receipt, proofSecret());
      const storedCheckpoint = attempt?.evidence.find((point) => point.sequence === 0);
      const storedFinish = attempt ? durableFinishPoint(attempt) : null;
      const matchesInitialFinish = Boolean(
        attempt &&
        signedReceipt &&
        signedReceipt.campaignId === attempt.campaignId &&
        signedReceipt.attemptId === attempt.attemptId &&
        signedReceipt.walletAddress === attempt.walletAddress &&
        signedReceipt.gameSessionId === attempt.gameSessionId &&
        signedReceipt.nextSequence === 0 &&
        signedReceipt.previousDigest === storedCheckpoint?.previousDigest &&
        storedCheckpoint?.kind === 'checkpoint' &&
        storedCheckpoint.score === request.score &&
        storedCheckpoint.gameTimeMs === request.gameTimeMs &&
        (storedCheckpoint.clientTimestampMs ?? null) === (request.clientTimestampMs ?? null) &&
        storedFinish?.sequence === 1 &&
        storedFinish.previousDigest === storedCheckpoint.digest &&
        storedFinish.score === request.score &&
        storedFinish.gameTimeMs === request.gameTimeMs &&
        (storedFinish.clientTimestampMs ?? null) === (request.clientTimestampMs ?? null)
      );
      if (!matchesInitialFinish || !attempt || !storedCheckpoint) throw error;

      checkpoint = {
        nextSequence: 1,
        receipt: createCheckpointReceipt({
          version: 1,
          campaignId: attempt.campaignId,
          attemptId: attempt.attemptId,
          walletAddress: attempt.walletAddress,
          gameSessionId: attempt.gameSessionId,
          nextSequence: 1,
          previousDigest: storedCheckpoint.digest,
          expiresAt: attempt.expiresAt,
        }, proofSecret()),
      };
    }

    if (!checkpoint.receipt) {
      throw new CompetitionServiceError(
        'ATTEMPT_NOT_ACTIVE',
        'Checkpoint unexpectedly closed the attempt',
        409,
      );
    }
    return appendEvidence({
      ...request,
      receipt: checkpoint.receipt,
      sequence: checkpoint.nextSequence,
    }, 'finish');
  }

  async function recoverPendingFinishes(limit = 500): Promise<CompetitionPendingFinishRecoveryResult> {
    const { campaign, current } = await prepareCampaign(false);
    const safeLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 500, 1), 500);
    const pending = await dependencies.repository.listPendingFinishAttempts(
      campaign.campaignId,
      safeLimit,
    );
    let recovered = 0;
    let alreadyFinalized = 0;
    let failed = 0;

    for (const attempt of pending) {
      if (attempt.campaignId !== campaign.campaignId || !durableFinishPoint(attempt)) {
        failed += 1;
        continue;
      }
      try {
        const finalized = await finalizePendingFinishForReview(attempt, current);
        if (
          finalized.status !== 'review' ||
          finalized.reviewQueuedAt !== current.toISOString()
        ) {
          alreadyFinalized += 1;
        } else {
          recovered += 1;
        }
      } catch {
        failed += 1;
      }
    }

    const remainingPending = (
      await dependencies.repository.listPendingFinishAttempts(campaign.campaignId, 1)
    ).length;
    return {
      scanned: pending.length,
      recovered,
      alreadyFinalized,
      failed,
      remainingPending,
      complete: remainingPending === 0 && failed === 0,
    };
  }

  async function listReviewAttempts(limit = 100) {
    const { campaign } = await prepareCampaign(false);
    const safeLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 100, 1), 500);
    return dependencies.repository.listReviewAttempts(campaign.campaignId, safeLimit);
  }

  async function getAttemptForReview(attemptId: string) {
    const { campaign } = await prepareCampaign(false);
    const normalizedAttemptId = normalizeRequiredReviewText(
      attemptId,
      'attemptId',
      MAX_INTERNAL_ATTEMPT_ID_LENGTH,
    );
    const attempt = await dependencies.repository.findAttempt(normalizedAttemptId);
    if (!attempt || attempt.campaignId !== campaign.campaignId) {
      throw new CompetitionServiceError('ATTEMPT_NOT_FOUND', 'Competition attempt not found', 404);
    }
    if (!isFinalAttemptStatus(attempt.status)) {
      throw new CompetitionServiceError(
        'REVIEW_CONFLICT',
        'Competition attempt is not available for review',
        409,
      );
    }
    return attempt;
  }

  async function adjudicateAttempt(input: AttemptAdjudicationRequest) {
    const { campaign, current } = await prepareCampaign(false);
    const attemptId = normalizeRequiredReviewText(
      input.attemptId,
      'attemptId',
      MAX_INTERNAL_ATTEMPT_ID_LENGTH,
    );
    if (input.decision !== 'valid' && input.decision !== 'invalid') {
      throw new CompetitionServiceError(
        'INVALID_REVIEW',
        'Review decision must be valid or invalid',
        400,
      );
    }
    const reason = normalizeRequiredReviewText(
      input.reason,
      'reason',
      MAX_INTERNAL_REVIEW_TEXT_LENGTH,
    );
    const reviewer = normalizeRequiredReviewText(
      input.reviewer,
      'reviewer',
      MAX_INTERNAL_REVIEWER_LENGTH,
    );
    const normalized = { decision: input.decision, reason, reviewer };
    const attempt = await dependencies.repository.findAttempt(attemptId);
    if (!attempt || attempt.campaignId !== campaign.campaignId) {
      throw new CompetitionServiceError('ATTEMPT_NOT_FOUND', 'Competition attempt not found', 404);
    }
    if (matchesStoredAdjudication(attempt, normalized)) {
      return { attempt, idempotent: true };
    }
    if (attempt.status !== 'review') {
      throw new CompetitionServiceError(
        'REVIEW_CONFLICT',
        'Competition attempt review has already been decided or is not reviewable',
        409,
      );
    }

    const reviewedAt = current.toISOString();
    const adjudicated = await dependencies.repository.adjudicateAttempt({
      campaignId: campaign.campaignId,
      attemptId,
      ...normalized,
      reviewedAt,
    });
    if (adjudicated) return { attempt: adjudicated, idempotent: false };

    const currentAttempt = await dependencies.repository.findAttempt(attemptId);
    if (currentAttempt && matchesStoredAdjudication(currentAttempt, normalized)) {
      return { attempt: currentAttempt, idempotent: true };
    }
    throw new CompetitionServiceError(
      'REVIEW_CONFLICT',
      'Competition attempt review changed concurrently',
      409,
    );
  }

  async function listMyAttempts(walletAddress: string, limit = 100) {
    const { campaign } = await prepareCampaign(false);
    const wallet = normalizeCompetitionWallet(walletAddress);
    if (!isCompetitionWalletAddress(wallet)) {
      throw new CompetitionServiceError('INVALID_WALLET', 'A valid EVM wallet is required', 400);
    }
    const attempts = await dependencies.repository.listAttempts(
      campaign.campaignId,
      wallet,
      Math.min(Math.max(limit, 1), 500),
    );
    return attempts.map((attempt) => publicAttempt(attempt, proofSecret()));
  }

  async function getLeaderboard(walletAddress?: string | null, limit = 100) {
    const { campaign } = await prepareCampaign(false);
    const safeLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 100, 1), 500);
    const attempts = await dependencies.repository.listValidAttempts(
      campaign.campaignId,
      safeLimit,
    );
    const reviewStatusByAttemptId = new Map(
      attempts.map((attempt) => [attempt.attemptId, attempt.status] as const),
    );
    const ranking = buildCompetitionRanking(
      attempts.map((attempt) => attempt.status === 'review'
        ? { ...attempt, status: 'valid' as const }
        : attempt),
      campaign,
    ).slice(0, safeLimit);
    const currentWallet = walletAddress ? normalizeCompetitionWallet(walletAddress) : null;
    return {
      campaignId: campaign.campaignId,
      entries: ranking.map((attempt) => ({
        rank: attempt.rank,
        walletRank: attempt.walletRank,
        attemptId: attempt.attemptId,
        alias: displayCompetitionAlias(attempt.playerAlias),
        score: attempt.score,
        gameTimeMs: attempt.gameTimeMs,
        finishedAt: attempt.finishedAt,
        reviewStatus: reviewStatusByAttemptId.get(attempt.attemptId) === 'review'
          ? 'pending' as const
          : 'approved' as const,
        isMe: currentWallet === attempt.walletAddress,
      })),
    };
  }

  return {
    getRuntime: () => resolveCompetitionRuntime(environment, now()),
    getParticipant,
    updateAlias,
    startAttempt,
    recordCheckpoint: async (request: AttemptEvidenceRequest) => {
      const result = await appendEvidence(request, 'checkpoint');
      if (!result.receipt) {
        throw new CompetitionServiceError(
          'ATTEMPT_NOT_ACTIVE',
          'Checkpoint unexpectedly closed the attempt',
          409,
        );
      }
      return { ...result, receipt: result.receipt, status: 'active' as const };
    },
    finishAttempt,
    recoverPendingFinishes,
    listReviewAttempts,
    getAttemptForReview,
    adjudicateAttempt,
    listMyAttempts,
    getLeaderboard,
  };
}
