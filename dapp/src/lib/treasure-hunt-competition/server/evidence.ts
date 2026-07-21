import { createHmac } from 'node:crypto';

export type CompetitionEvidenceKind = 'checkpoint' | 'finish';

export interface CompetitionEvidenceState {
  readonly campaignId: string;
  readonly attemptId: string;
  readonly walletAddress: string;
  readonly gameSessionId: string;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly nextSequence: number;
  readonly lastDigest: string;
  readonly lastScore: number;
  readonly lastGameTimeMs: number;
  readonly lastEvidenceAt?: string | null;
}

export interface CompetitionEvidenceInput {
  readonly sequence: number;
  readonly kind: CompetitionEvidenceKind;
  readonly score: number;
  readonly gameTimeMs: number;
  readonly clientTimestampMs?: number | null;
}

export interface CompetitionEvidencePoint extends CompetitionEvidenceInput {
  readonly receivedAt: string;
  readonly previousDigest: string;
  readonly digest: string;
}

export type CompetitionEvidenceRejection =
  | 'attempt_expired'
  | 'sequence_mismatch'
  | 'invalid_score'
  | 'invalid_game_time'
  | 'score_regression'
  | 'game_time_regression'
  | 'game_time_not_advanced'
  | 'game_time_ahead_of_server'
  | 'score_rate_exceeded'
  | 'finish_without_checkpoint'
  | 'game_too_short'
  | 'server_game_too_short'
  | 'checkpoint_too_frequent'
  | 'too_many_evidence_points';

export type CompetitionEvidenceValidation =
  | { readonly valid: true; readonly point: CompetitionEvidencePoint }
  | { readonly valid: false; readonly reason: CompetitionEvidenceRejection };

export interface CompetitionEvidenceRules {
  readonly maxScorePerSecond: number;
  readonly scoreBurstAllowance: number;
  readonly serverTimeToleranceMs: number;
  readonly minimumFinishedGameTimeMs: number;
  readonly minimumCheckpointIntervalMs: number;
  readonly maxEvidencePoints: number;
}

export const MAX_COMPETITION_EVIDENCE_POINTS = 720;

export const DEFAULT_COMPETITION_EVIDENCE_RULES: CompetitionEvidenceRules = {
  maxScorePerSecond: 500,
  scoreBurstAllowance: 250,
  serverTimeToleranceMs: 5_000,
  // Treasure Hunt can end as soon as the player loses all three lives. A
  // minimum duration would reject legitimate short runs after their initial
  // checkpoint had already been persisted, leaving the attempt active and the
  // wallet unable to start another run. Duration is still bounded against
  // server time and score growth below.
  minimumFinishedGameTimeMs: 0,
  minimumCheckpointIntervalMs: 4_000,
  maxEvidencePoints: MAX_COMPETITION_EVIDENCE_POINTS,
};

function invalid(reason: CompetitionEvidenceRejection): CompetitionEvidenceValidation {
  return { valid: false, reason };
}

export function createCompetitionEvidenceDigest(input: {
  readonly state: CompetitionEvidenceState;
  readonly evidence: CompetitionEvidenceInput;
  readonly receivedAt: string;
  readonly secret: string;
}) {
  return createHmac('sha256', input.secret)
    .update(JSON.stringify([
      'cukies-treasure-hunt-evidence-v1',
      input.state.campaignId,
      input.state.attemptId,
      input.state.walletAddress,
      input.state.gameSessionId,
      input.evidence.sequence,
      input.evidence.kind,
      input.evidence.score,
      input.evidence.gameTimeMs,
      input.evidence.clientTimestampMs ?? null,
      input.receivedAt,
      input.state.lastDigest,
    ]))
    .digest('hex');
}

export function validateCompetitionEvidence(input: {
  readonly state: CompetitionEvidenceState;
  readonly evidence: CompetitionEvidenceInput;
  readonly receivedAt?: Date;
  readonly secret: string;
  readonly rules?: CompetitionEvidenceRules;
}): CompetitionEvidenceValidation {
  const receivedAt = input.receivedAt ?? new Date();
  const receivedAtMs = receivedAt.getTime();
  const rules = input.rules ?? DEFAULT_COMPETITION_EVIDENCE_RULES;
  if (receivedAtMs > Date.parse(input.state.expiresAt)) return invalid('attempt_expired');
  if (input.evidence.sequence !== input.state.nextSequence) return invalid('sequence_mismatch');
  if (!Number.isSafeInteger(input.evidence.score) || input.evidence.score < 0) {
    return invalid('invalid_score');
  }
  if (!Number.isSafeInteger(input.evidence.gameTimeMs) || input.evidence.gameTimeMs < 0) {
    return invalid('invalid_game_time');
  }
  if (input.evidence.score < input.state.lastScore) return invalid('score_regression');
  if (input.evidence.gameTimeMs < input.state.lastGameTimeMs) {
    return invalid('game_time_regression');
  }
  if (
    input.evidence.score > input.state.lastScore &&
    input.evidence.gameTimeMs === input.state.lastGameTimeMs
  ) {
    return invalid('game_time_not_advanced');
  }
  if (input.evidence.kind === 'finish' && input.state.nextSequence === 0) {
    return invalid('finish_without_checkpoint');
  }
  if (
    input.evidence.kind === 'finish' &&
    input.evidence.gameTimeMs < rules.minimumFinishedGameTimeMs
  ) {
    return invalid('game_too_short');
  }

  const elapsedServerMs = Math.max(0, receivedAtMs - Date.parse(input.state.startedAt));
  if (
    input.evidence.kind === 'finish' &&
    elapsedServerMs < rules.minimumFinishedGameTimeMs
  ) {
    return invalid('server_game_too_short');
  }
  if (input.evidence.gameTimeMs > elapsedServerMs + rules.serverTimeToleranceMs) {
    return invalid('game_time_ahead_of_server');
  }
  if (input.state.nextSequence >= rules.maxEvidencePoints) {
    return invalid('too_many_evidence_points');
  }
  const lastEvidenceAtMs = input.state.lastEvidenceAt
    ? Date.parse(input.state.lastEvidenceAt)
    : Number.NaN;
  if (
    input.evidence.kind === 'checkpoint' &&
    input.state.nextSequence > 0 &&
    Number.isFinite(lastEvidenceAtMs) &&
    receivedAtMs - lastEvidenceAtMs < rules.minimumCheckpointIntervalMs &&
    input.evidence.gameTimeMs - input.state.lastGameTimeMs < rules.minimumCheckpointIntervalMs
  ) {
    return invalid('checkpoint_too_frequent');
  }

  // The burst is granted once for the whole attempt, not once per checkpoint.
  // This cumulative cap prevents an attacker from minting a fresh allowance by
  // submitting many zero-time checkpoints.
  const allowedCumulativeScore = Math.ceil(
    (input.evidence.gameTimeMs / 1_000) * rules.maxScorePerSecond,
  ) + rules.scoreBurstAllowance;
  if (input.evidence.score > allowedCumulativeScore) return invalid('score_rate_exceeded');

  const receivedAtIso = receivedAt.toISOString();
  return {
    valid: true,
    point: {
      ...input.evidence,
      clientTimestampMs: input.evidence.clientTimestampMs ?? null,
      receivedAt: receivedAtIso,
      previousDigest: input.state.lastDigest,
      digest: createCompetitionEvidenceDigest({
        state: input.state,
        evidence: input.evidence,
        receivedAt: receivedAtIso,
        secret: input.secret,
      }),
    },
  };
}
