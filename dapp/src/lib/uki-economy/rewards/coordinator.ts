import "server-only";

import { withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import { validateReservationIntegrity } from "@/lib/uki-economy/credits/service";
import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import {
  assertCukiePoolAssignmentIntegrity,
} from "@/lib/uki-economy/cukie-pool/service";
import type { CukiePoolAssignment } from "@/lib/uki-economy/cukie-pool/types";
import { assertOwnCukieAssignmentIntegrity } from "@/lib/uki-economy/own-cukie/rules";
import type { OwnCukieAssignment } from "@/lib/uki-economy/own-cukie/types";
import {
  assertProductiveGameRewardBinding,
  assertGameSessionIntegrity,
  stableGameEconomyHash,
} from "@/lib/uki-economy/game-economy/rules";
import { buildGameOwnCukieAssignmentEvidence } from "@/lib/uki-economy/game-economy/resource-ports";
import type { GameEconomySession } from "@/lib/uki-economy/game-economy/types";
import { getIsoWeekPeriodId } from "@/lib/uki-economy/periods";
import {
  TREASURE_HUNT_ECONOMY_POLICY,
} from "@/lib/uki-economy/game-economy/treasure-hunt-policy";

import { DomainConflictError, DomainNotFoundError } from "../errors";
import { calculateSettlementRewardAllocations } from "./calculation";
import { resolveAppliedArenaRanking } from "./arena-ranking";
import type { RewardAllocationService } from "./service";
import { rewardAllocationService } from "./service";
import {
  assertRewardRule,
  rewardRuleActiveAtQuery,
  stableRewardHash,
  validRewardText,
  validRewardWallet,
} from "./rules";
import type { RewardRule } from "./types";

export type SettleGameRewardsInput = {
  sessionId: string;
  periodId: string;
  expectedRuleVersion: string;
  now: Date;
};

export function assertSettlementRewardPeriod(periodId: string, settledAt: Date) {
  const canonicalPeriodId = getIsoWeekPeriodId(settledAt);
  if (periodId !== canonicalPeriodId) {
    throw new DomainConflictError(
      `El settlement pertenece a ${canonicalPeriodId}, no a ${periodId}.`,
    );
  }
  return canonicalPeriodId;
}

function settlementRewardAnchor(game: GameEconomySession) {
  return game.gameId === TREASURE_HUNT_ECONOMY_POLICY.gameId &&
    game.rule.version === TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion
    ? {
        effectiveAt: game.createdAt,
        periodId: getIsoWeekPeriodId(new Date(game.createdAt.getTime() - 14 * 60 * 60_000)),
      }
    : {
        effectiveAt: game.settledAt!,
        periodId: getIsoWeekPeriodId(game.settledAt!),
      };
}

function expectedCreditEvidenceHash(reservation: CreditReservation) {
  return stableGameEconomyHash({
    kind: "game-credit-reservation-evidence",
    reservationId: reservation.reservationId,
    sessionId: reservation.sessionId,
    walletNormalized: reservation.walletNormalized,
    costCode: reservation.costCode,
    amountCredits: reservation.amountCredits,
    bucket: reservation.bucket,
    expiresAt: reservation.expiresAt,
    payloadHash: reservation.payloadHash,
  });
}

function expectedCukieEvidenceHash(assignment: CukiePoolAssignment) {
  return stableGameEconomyHash({
    kind: "game-cukie-pool-assignment-evidence",
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
  });
}

/**
 * Cruce fail-closed entre las fuentes canonicas y el receipt que quedo sellado
 * en la session. No acepta coincidencias solo por `sessionId`: tambien liga
 * IDs, wallet, coste y el hash exacto producido por los resource ports.
 */
export function assertSettlementResourceBindings(
  game: GameEconomySession,
  credit: CreditReservation,
  assignment: CukiePoolAssignment | null,
  ownAssignment: OwnCukieAssignment | null = null,
) {
  if (
    game.credit.state !== "consumed"
    || !game.credit.reservationId
    || !game.credit.evidenceHash
    || credit.status !== "consumed"
    || credit.sessionId !== game.sessionId
    || credit.walletNormalized !== game.walletNormalized
    || credit.reservationId !== game.credit.reservationId
    || credit.costCode !== game.rule.credit.costCode
    || credit.ruleVersion !== game.rule.credit.creditRuleVersion
    || credit.ruleConfigHash !== game.rule.credit.creditRuleConfigHash
    || credit.expectedRuleVersion !== game.rule.credit.creditRuleVersion
    || credit.expectedRuleConfigHash !== game.rule.credit.creditRuleConfigHash
    || expectedCreditEvidenceHash(credit) !== game.credit.evidenceHash
  ) {
    throw new DomainConflictError(
      `La reserva de creditos no liga exactamente la session ${game.sessionId}.`,
    );
  }

  const serverSelected =
    game.rule.cukie.role === "pool" || game.rule.cukie.role === "own_or_pool";
  if (serverSelected && ownAssignment) {
    assertOwnCukieAssignmentIntegrity(ownAssignment);
    const ownEvidence = buildGameOwnCukieAssignmentEvidence(ownAssignment);
    if (
      assignment
      || game.rule.cukie.role !== "own_or_pool"
      || game.cukie.state !== "consumed"
      || ownAssignment.status !== "completed"
      || ownAssignment.sessionId !== game.sessionId
      || ownAssignment.ownerNormalized !== game.walletNormalized
      || game.cukie.reservationId !== ownAssignment.assignmentId
      || game.cukie.evidenceHash !== ownEvidence.evidenceHash
    ) {
      throw new DomainConflictError(
        `La asignacion propia no liga exactamente la session ${game.sessionId}.`,
      );
    }
    return "own" as const;
  }
  if (serverSelected) {
    if (
      !assignment
      || ownAssignment
      || game.cukie.state !== "consumed"
      || !game.cukie.reservationId
      || !game.cukie.evidenceHash
      || assignment.status !== "completed"
      || assignment.sessionId !== game.sessionId
      || assignment.assignmentId !== game.cukie.reservationId
      || expectedCukieEvidenceHash(assignment) !== game.cukie.evidenceHash
    ) {
      throw new DomainConflictError(
        `La asignacion del pool no liga exactamente la session ${game.sessionId}.`,
      );
    }
    if (assignment.kind === "seiku") return "seiku" as const;
    return assignment.generation === "original"
      ? "pool_original" as const
      : "pool_second_plus" as const;
  }

  if (
    assignment
    || ownAssignment
    || game.cukie.state !== "consumed"
    || game.cukieAssetIds.length === 0
  ) {
    throw new DomainConflictError(
      `La session ${game.sessionId} no confirma un Cukie propio sin asignacion de pool.`,
    );
  }
  return "own" as const;
}

export async function loadSettlementRewardSnapshot(input: SettleGameRewardsInput) {
  const sessionId = validRewardText(input.sessionId, "sessionId");
  const periodId = validRewardText(input.periodId, "periodId");
  const expectedRuleVersion = validRewardText(
    input.expectedRuleVersion,
    "expectedRuleVersion",
  );
  return withEconomyTransaction(async (db, mongoSession) => {
    const game = await db.collection<GameEconomySession>("game_economy_sessions")
      .findOne({ sessionId }, { session: mongoSession });
    if (!game) throw new DomainNotFoundError(`No existe la session ${sessionId}.`);
    assertGameSessionIntegrity(game);
    if (
      game.status !== "settled"
      || !game.validation
      || !game.settlementCommand
      || !game.settledAt
    ) {
      throw new DomainConflictError(`La session ${sessionId} no esta liquidada.`);
    }
    const rewardAnchor = settlementRewardAnchor(game);
    if (periodId !== rewardAnchor.periodId) {
      throw new DomainConflictError(
        `El settlement pertenece a ${rewardAnchor.periodId}, no a ${periodId}.`,
      );
    }
    const rule = await db.collection<RewardRule>("economy_rule_versions").findOne({
      scope: "reward_allocations",
      version: expectedRuleVersion,
      ...rewardRuleActiveAtQuery(rewardAnchor.effectiveAt),
    }, { session: mongoSession });
    if (!rule) {
      throw new DomainConflictError(
        `La regla ${expectedRuleVersion} no cubre el settlement de ${sessionId}.`,
      );
    }
    assertRewardRule(rule, rewardAnchor.effectiveAt);
    const gameReward = assertProductiveGameRewardBinding(game.rule);
    if (
      gameReward.rewardRuleVersion !== rule.version
      || gameReward.rewardRuleConfigHash !== rule.configHash
    ) {
      throw new DomainConflictError(
        `La session ${sessionId} no liga la regla rewards exacta del settlement.`,
      );
    }
    if (
      BigInt(game.validation.weightRaw) > BigInt(gameReward.maxConvertibleRaw)
    ) {
      throw new DomainConflictError(
        `La session ${sessionId} excede el maximo convertible de rewards.`,
      );
    }

    if (!game.credit.reservationId) {
      throw new DomainConflictError("La session no fija reservationId de creditos.");
    }
    const credit = await db.collection<CreditReservation>("competition_credit_reservations")
      .findOne({ reservationId: game.credit.reservationId }, { session: mongoSession });
    if (!credit) throw new DomainConflictError("La session no tiene reserva de creditos.");
    validateReservationIntegrity(credit);
    if (
      credit.status !== "consumed"
      || credit.amountCredits * rule.runCredits.unitScale !== rule.runCredits.totalUnits
    ) {
      throw new DomainConflictError("La reserva de creditos no confirma el coste exacto.");
    }

    const assignment = await db.collection<CukiePoolAssignment>("cukie_pool_assignments")
      .findOne({ sessionId }, { session: mongoSession });
    if (assignment) {
      assertCukiePoolAssignmentIntegrity(assignment);
    }
    const ownAssignment = await db.collection<OwnCukieAssignment>("game_owned_cukie_assignments")
      .findOne({ sessionId }, { session: mongoSession });
    if (ownAssignment) assertOwnCukieAssignmentIntegrity(ownAssignment);
    const cukieSource = assertSettlementResourceBindings(
      game,
      credit,
      assignment,
      ownAssignment,
    );

    const arenaRanking = await resolveAppliedArenaRanking({
      db,
      session: mongoSession,
      gameId: game.gameId,
      walletAddress: game.walletNormalized,
      creditSource: credit.bucket,
      periodAnchorAt: rewardAnchor.effectiveAt,
      rewardRule: rule,
    });

    return {
      game,
      rule,
      credit,
      assignment,
      ownAssignment,
      arenaRanking,
      periodId,
      rewardEffectiveAt: rewardAnchor.effectiveAt,
      sourceId: `game-session:${sessionId}`,
      creditSource: credit.bucket,
      cukieSource,
    };
  });
}

export class RewardCalculationCoordinator {
  constructor(
    private readonly allocations: RewardAllocationService,
    private readonly loadSnapshot: typeof loadSettlementRewardSnapshot = loadSettlementRewardSnapshot,
  ) {}

  async settleGame(input: SettleGameRewardsInput) {
    const snapshot = await this.loadSnapshot(input);
    const calculatorInput = {
      periodId: snapshot.periodId,
      sourceId: snapshot.sourceId,
      playerWallet: validRewardWallet(snapshot.game.walletNormalized),
      grossConvertedRaw: snapshot.game.validation!.weightRaw,
      maxConvertibleRaw: snapshot.game.rule.reward.maxConvertibleRaw,
      creditSource: snapshot.creditSource,
      cukieSource: snapshot.cukieSource,
      ranking: snapshot.arenaRanking.rank,
      creditCostUnits: snapshot.rule.runCredits.totalUnits,
      weeklyReserveUnits: snapshot.rule.runCredits.weeklyReserveUnits,
    } as const;
    const calculated = calculateSettlementRewardAllocations(snapshot.rule, calculatorInput);
    const calculationInputHash = stableRewardHash({
      kind: "reward-settlement-input",
      gameSessionId: snapshot.game.sessionId,
      gameResultHash: snapshot.game.validation!.resultHash,
      creditReservationId: snapshot.credit.reservationId,
      creditPayloadHash: snapshot.credit.payloadHash,
      cukieAssignmentId:
        snapshot.assignment?.assignmentId ?? snapshot.ownAssignment?.assignmentId ?? null,
      cukieAssignmentRequestHash:
        snapshot.assignment?.requestHash ?? snapshot.ownAssignment?.requestHash ?? null,
      rankingId: snapshot.arenaRanking.sourceRankingId,
      rankingPayloadHash: snapshot.arenaRanking.evidenceHash,
      rewardRuleVersion: snapshot.rule.version,
      rewardRuleConfigHash: snapshot.rule.configHash,
      calculatorInput,
    });
    const calculationOutputHash = stableRewardHash({
      kind: "reward-settlement-output",
      allocations: calculated.allocations,
      accruals: calculated.accruals,
      totals: calculated.totals,
    });
    const jobRunId = `reward-settlement:${snapshot.game.sessionId}`;
    const result = await this.allocations.persistAllocationSet({
      periodId: snapshot.periodId,
      sourceId: snapshot.sourceId,
      sourceTotalRaw: calculated.totals.sourceTotalRaw,
      expectedRuleVersion: snapshot.rule.version,
      ruleEffectiveAt: snapshot.rewardEffectiveAt,
      allocations: calculated.allocations,
      accruals: calculated.accruals,
      calculation: {
        jobRunId,
        kind: "settlement",
        inputHash: calculationInputHash,
        outputHash: calculationOutputHash,
      },
      now: input.now,
    });
    return {
      status: result.status,
      sourceId: snapshot.sourceId,
      jobRunId,
      calculationInputHash,
      calculationOutputHash,
      result,
    };
  }
}

export const rewardCalculationCoordinator = new RewardCalculationCoordinator(
  rewardAllocationService,
);
