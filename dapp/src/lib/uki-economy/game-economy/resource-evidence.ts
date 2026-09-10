import type { GameResourceReservationResult } from './ports';
import { stableGameEconomyHash } from './rules';
import type { CreditReservation } from '../credits/types';
import type { CukiePoolAssignment } from '../cukie-pool/types';
import type { OwnCukieAssignment } from '../own-cukie/types';
import { assertOwnCukieAssignmentIntegrity } from '../own-cukie/rules';

/**
 * Canonical evidence hashes shared by resource ports, recovery and rewards.
 * Keep the payloads immutable: changing one field changes the reservation
 * identity and must be versioned at the game-economy rule level.
 */
export function buildGameCukieAssignmentEvidence(
  assignment: CukiePoolAssignment,
): GameResourceReservationResult {
  return {
    reservationId: assignment.assignmentId,
    evidenceHash: stableGameEconomyHash({
      kind: 'game-cukie-pool-assignment-evidence',
      assignmentId: assignment.assignmentId,
      sessionId: assignment.sessionId,
      assignmentKind: assignment.kind,
      assetId: assignment.assetId,
      tokenId: assignment.tokenId,
      ownerNormalized: assignment.ownerNormalized,
      generation: assignment.generation,
      rarity: assignment.rarity,
      ownerRewardEligible: assignment.ownerRewardEligible,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
      requestHash: assignment.requestHash,
    }),
  };
}

export function buildGameCreditReservationEvidence(
  reservation: CreditReservation,
): GameResourceReservationResult {
  return {
    reservationId: reservation.reservationId,
    evidenceHash: stableGameEconomyHash({
      kind: 'game-credit-reservation-evidence',
      reservationId: reservation.reservationId,
      sessionId: reservation.sessionId,
      walletNormalized: reservation.walletNormalized,
      costCode: reservation.costCode,
      amountCredits: reservation.amountCredits,
      bucket: reservation.bucket,
      expiresAt: reservation.expiresAt,
      payloadHash: reservation.payloadHash,
    }),
  };
}

export function buildGameOwnCukieAssignmentEvidence(
  assignment: OwnCukieAssignment,
): GameResourceReservationResult {
  assertOwnCukieAssignmentIntegrity(assignment);
  return {
    reservationId: assignment.assignmentId,
    evidenceHash: stableGameEconomyHash({
      kind: 'game-cukie-own-assignment-evidence',
      assignmentId: assignment.assignmentId,
      sessionId: assignment.sessionId,
      epochId: assignment.epochId,
      assetId: assignment.assetId,
      tokenId: assignment.tokenId,
      ownerNormalized: assignment.ownerNormalized,
      ownershipEventId: assignment.ownershipEventId,
      generation: assignment.generation,
      rarity: assignment.rarity,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
      requestHash: assignment.requestHash,
    }),
  };
}
