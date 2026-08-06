import "server-only";

import { DomainValidationError } from "../errors";
import { formatRawAmount, parseRawAmount } from "../money";
import {
  apportionRaw,
  assertRewardRule,
  compareRewardText,
  rawByBps,
  validRewardWallet,
} from "./rules";
import type {
  CreditPoolDistributionInput,
  CukiePoolDistributionInput,
  RewardAllocationDraft,
  RewardAccrualDraft,
  RewardCategory,
  RewardRule,
  SettlementRewardInput,
} from "./types";

function positiveRaw(value: string, label: string) {
  const raw = parseRawAmount(value);
  if (raw <= BigInt(0)) throw new DomainValidationError(`${label} debe ser mayor que cero.`);
  return raw;
}

function nonNegativeRaw(value: string, label: string) {
  try {
    return parseRawAmount(value);
  } catch {
    throw new DomainValidationError(`${label} debe ser un raw canonico no negativo.`);
  }
}

function safePositiveInteger(value: unknown, label: string, max = 1_000_000) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new DomainValidationError(`${label} debe ser un entero entre 1 y ${max}.`);
  }
  return value as number;
}

function combineDrafts(drafts: RewardAllocationDraft[]) {
  const combined = new Map<string, RewardAllocationDraft>();
  for (const draft of drafts) {
    const walletNormalized = validRewardWallet(draft.walletNormalized);
    const amount = parseRawAmount(draft.amountRaw);
    if (amount === BigInt(0)) continue;
    const key = `${walletNormalized}:${draft.category}`;
    const current = combined.get(key);
    combined.set(key, {
      walletNormalized,
      category: draft.category,
      amountRaw: formatRawAmount(
        (current ? parseRawAmount(current.amountRaw) : BigInt(0)) + amount
      ),
    });
  }
  return [...combined.values()].sort((left, right) =>
    compareRewardText(
      `${left.walletNormalized}:${left.category}`,
      `${right.walletNormalized}:${right.category}`
    )
  );
}

export function calculateUndistributedRewardAllocations(
  rule: RewardRule,
  totalRaw: string
) {
  assertRewardRule(rule);
  const total = parseRawAmount(totalRaw);
  return {
    allocations: [] as RewardAllocationDraft[],
    accruals: total === BigInt(0)
      ? [] as RewardAccrualDraft[]
      : [{
          category: "undistributed_pending" as const,
          amountRaw: formatRawAmount(total),
        }],
    totalRaw: formatRawAmount(total),
  };
}

/**
 * Materializa todas las obligaciones de una partida: la reserva fija semanal
 * (2.5 UKI) como accrual no claimable y el convertible (0..7.5 UKI) como
 * claims finales y/o accruals intermedios de pools.
 */
export function calculateSettlementRewardAllocations(
  rule: RewardRule,
  input: SettlementRewardInput
) {
  assertRewardRule(rule);
  const grossRaw = nonNegativeRaw(input.grossConvertedRaw, "grossConvertedRaw");
  const maxConvertibleRaw = positiveRaw(
    input.maxConvertibleRaw,
    "maxConvertibleRaw",
  );
  const playerWallet = validRewardWallet(input.playerWallet, "playerWallet");
  if (input.creditSource !== "own" && input.creditSource !== "pool") {
    throw new DomainValidationError("creditSource no es valido.");
  }
  if (
    input.cukieSource !== "own" &&
    input.cukieSource !== "pool_original" &&
    input.cukieSource !== "pool_second_plus"
  ) {
    throw new DomainValidationError("cukieSource no es valido.");
  }
  if (grossRaw > maxConvertibleRaw) {
    throw new DomainValidationError(
      "grossConvertedRaw excede el maximo convertible ligado a GameEconomy.",
    );
  }
  const reserveNumerator =
    maxConvertibleRaw * BigInt(rule.runCredits.weeklyReserveUnits);
  const reserveDenominator = BigInt(rule.runCredits.convertibleUnits);
  if (
    reserveDenominator === BigInt(0)
    || reserveNumerator % reserveDenominator !== BigInt(0)
  ) {
    throw new DomainValidationError(
      "La reserva fija no se puede derivar exactamente del maximo convertible.",
    );
  }
  const weeklyPrizePoolRaw = reserveNumerator / reserveDenominator;
  if (
    input.creditCostUnits !== rule.runCredits.totalUnits ||
    input.weeklyReserveUnits !== rule.runCredits.weeklyReserveUnits
  ) {
    throw new DomainValidationError(
      "La reserva semanal de creditos no coincide con la regla versionada."
    );
  }
  if (input.creditSource === "pool") {
    if (!Number.isSafeInteger(input.ranking) || (input.ranking as number) < 1 || (input.ranking as number) > 9) {
      throw new DomainValidationError("ranking 1-9 es obligatorio con creditos del pool.");
    }
  } else if (input.ranking !== null) {
    throw new DomainValidationError("El ranking no se aplica con creditos propios.");
  }

  const drafts: RewardAllocationDraft[] = [];
  const accruals: RewardAccrualDraft[] = [{
    category: "weekly_prize_pool",
    amountRaw: formatRawAmount(weeklyPrizePoolRaw),
  }];
  const creditPoolRaw =
    input.creditSource === "pool"
      ? rawByBps(grossRaw, rule.settlementBps.poolCredits)
      : BigInt(0);
  if (creditPoolRaw > BigInt(0)) {
    accruals.push({
      category: "credit_pool_weekly",
      amountRaw: formatRawAmount(creditPoolRaw),
    });
  }

  const borrowedCukie = input.cukieSource !== "own";
  const cukiePoolBps = borrowedCukie
    ? input.creditSource === "pool"
      ? rule.settlementBps.poolCukieWithPoolCredits
      : rule.settlementBps.poolCukieWithOwnCredits
    : 0;
  const cukiePoolRaw = rawByBps(grossRaw, cukiePoolBps);
  if (cukiePoolRaw > BigInt(0)) {
    const original = input.cukieSource === "pool_original";
    accruals.push({
      category: original
        ? "cukie_pool_original_weekly"
        : "cukie_pool_second_plus_weekly",
      amountRaw: formatRawAmount(cukiePoolRaw),
    });
  }

  const playerBaseRaw = grossRaw - creditPoolRaw - cukiePoolRaw;
  const rankingBps =
    input.creditSource === "pool"
      ? rule.rankingPlayerBps[String(input.ranking)]
      : 10_000;
  const playerRaw = rawByBps(playerBaseRaw, rankingBps);
  if (playerRaw > BigInt(0)) {
    drafts.push({
      walletNormalized: playerWallet,
      category: "player",
      amountRaw: formatRawAmount(playerRaw),
    });
  }
  const undistributedRaw = grossRaw - creditPoolRaw - cukiePoolRaw - playerRaw;
  if (undistributedRaw > BigInt(0)) {
    accruals.push({
      category: "undistributed_pending",
      amountRaw: formatRawAmount(undistributedRaw),
    });
  }

  return {
    allocations: combineDrafts(drafts),
    accruals,
    totals: {
      sourceTotalRaw: formatRawAmount(weeklyPrizePoolRaw + grossRaw),
      weeklyPrizePoolRaw: formatRawAmount(weeklyPrizePoolRaw),
      grossConvertedRaw: formatRawAmount(grossRaw),
      maxConvertibleRaw: formatRawAmount(maxConvertibleRaw),
      creditPoolRaw: formatRawAmount(creditPoolRaw),
      cukiePoolRaw: formatRawAmount(cukiePoolRaw),
      playerBaseRaw: formatRawAmount(playerBaseRaw),
      playerRaw: formatRawAmount(playerRaw),
      undistributedRaw: formatRawAmount(undistributedRaw),
      weeklyReserveUnits: input.weeklyReserveUnits,
      convertibleUnits: rule.runCredits.convertibleUnits,
    },
  };
}

export function calculateCreditPoolDistribution(
  rule: RewardRule,
  input: CreditPoolDistributionInput
) {
  assertRewardRule(rule);
  const sourcePoolRaw = positiveRaw(input.sourcePoolRaw, "sourcePoolRaw");
  const fundingAvailableRaw = parseRawAmount(input.fundingAvailableRaw);
  if (!Array.isArray(input.contributors) || input.contributors.length === 0) {
    throw new DomainValidationError("Debe existir al menos un aportante de creditos.");
  }
  if (input.contributors.length > 10_000) {
    throw new DomainValidationError("Demasiados aportantes en un reparto de creditos.");
  }
  const creditsByWallet = new Map<string, number>();
  for (const contributor of input.contributors) {
    const wallet = validRewardWallet(contributor.walletAddress);
    const credits = safePositiveInteger(contributor.credits, "contributor.credits");
    if (credits % rule.creditPoolDaily.floorCreditsStep !== 0) {
      throw new DomainValidationError(
        `Los creditos deben ser multiplo de ${rule.creditPoolDaily.floorCreditsStep}.`
      );
    }
    const total = (creditsByWallet.get(wallet) ?? 0) + credits;
    if (!Number.isSafeInteger(total)) throw new DomainValidationError("Suma de creditos no segura.");
    creditsByWallet.set(wallet, total);
  }
  const totalCredits = [...creditsByWallet.values()].reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(next)) {
      throw new DomainValidationError("Suma global de creditos no segura.");
    }
    return next;
  }, 0);
  const proportionalRaw = rawByBps(sourcePoolRaw, rule.creditPoolDaily.sourceShareBps);
  const floorRaw = rule.creditPoolDaily.floorEnabled
    ? (BigInt(totalCredits) / BigInt(rule.creditPoolDaily.floorCreditsStep)) *
      parseRawAmount(rule.creditPoolDaily.floorAmountRaw)
    : BigInt(0);
  const distributionRaw = proportionalRaw > floorRaw ? proportionalRaw : floorRaw;
  if (fundingAvailableRaw < distributionRaw) {
    throw new DomainValidationError(
      "Funding insuficiente para cumplir el reparto proporcional/floor versionado."
    );
  }
  const apportioned = apportionRaw(
    distributionRaw,
    [...creditsByWallet.entries()].map(([wallet, credits]) => ({
      key: wallet,
      wallet,
      weight: BigInt(credits),
    }))
  );
  return {
    allocations: apportioned.map((entry) => ({
      walletNormalized: entry.wallet,
      category: "credit_pool_daily" as const,
      amountRaw: formatRawAmount(entry.amountRaw),
    })),
    totals: {
      sourcePoolRaw: formatRawAmount(sourcePoolRaw),
      proportionalRaw: formatRawAmount(proportionalRaw),
      floorRaw: formatRawAmount(floorRaw),
      distributionRaw: formatRawAmount(distributionRaw),
      unusedFundingRaw: formatRawAmount(fundingAvailableRaw - distributionRaw),
      totalCredits,
      floorApplied: rule.creditPoolDaily.floorEnabled && floorRaw > proportionalRaw,
    },
  };
}

export function calculateCukiePoolDistribution(
  rule: RewardRule,
  input: CukiePoolDistributionInput
) {
  assertRewardRule(rule);
  const sourcePoolRaw = positiveRaw(input.sourcePoolRaw, "sourcePoolRaw");
  const carryWallet = validRewardWallet(input.carryWallet, "carryWallet");
  if (input.generation !== "original" && input.generation !== "second_plus") {
    throw new DomainValidationError("generation debe ser original o second_plus.");
  }
  if (!Array.isArray(input.participants)) {
    throw new DomainValidationError("participants debe ser un array.");
  }
  if (input.participants.length > 10_000) {
    throw new DomainValidationError("Demasiados participantes en un reparto de Cukies.");
  }
  const participants = new Map<
    string,
    { wallet: string; rarityLevel: number; units: number }
  >();
  for (const participant of input.participants) {
    const wallet = validRewardWallet(participant.walletAddress);
    if (
      !Number.isSafeInteger(participant.rarityLevel) ||
      participant.rarityLevel < 0 ||
      participant.rarityLevel > 5
    ) {
      throw new DomainValidationError("rarityLevel debe estar entre 0 y 5.");
    }
    const units = safePositiveInteger(participant.units, "participant.units");
    const key = `${wallet}:${participant.rarityLevel}`;
    const current = participants.get(key);
    const aggregateUnits = (current?.units ?? 0) + units;
    if (!Number.isSafeInteger(aggregateUnits)) {
      throw new DomainValidationError("Suma de units no segura.");
    }
    participants.set(key, {
      wallet,
      rarityLevel: participant.rarityLevel,
      units: aggregateUnits,
    });
  }
  const tierAmounts = apportionRaw(
    sourcePoolRaw,
    Array.from({ length: rule.cukiePool.cumulativeTierCount }, (_, tier) => ({
      key: `tier:${tier}`,
      tier,
      weight: BigInt(1),
    }))
  );
  const category: RewardCategory =
    input.generation === "original"
      ? "cukie_pool_original_distribution"
      : "cukie_pool_second_plus_distribution";
  const carryCategory: RewardCategory =
    input.generation === "original"
      ? "cukie_pool_original_carry"
      : "cukie_pool_second_plus_carry";
  const drafts: RewardAllocationDraft[] = [];
  let carriedRaw = BigInt(0);
  for (const tranche of tierAmounts) {
    const eligible = [...participants.values()]
      .filter((participant) => participant.rarityLevel >= tranche.tier)
      .map((participant) => ({
        key: `${participant.wallet}:${participant.rarityLevel}`,
        ...participant,
        weight: BigInt(participant.units),
      }));
    if (eligible.length === 0) {
      carriedRaw += tranche.amountRaw;
      continue;
    }
    drafts.push(
      ...apportionRaw(tranche.amountRaw, eligible).map((entry) => ({
        walletNormalized: entry.wallet,
        category,
        amountRaw: formatRawAmount(entry.amountRaw),
      }))
    );
  }
  if (carriedRaw > BigInt(0)) {
    drafts.push({
      walletNormalized: carryWallet,
      category: carryCategory,
      amountRaw: formatRawAmount(carriedRaw),
    });
  }
  return {
    allocations: combineDrafts(drafts),
    totals: {
      sourcePoolRaw: formatRawAmount(sourcePoolRaw),
      distributedRaw: formatRawAmount(sourcePoolRaw - carriedRaw),
      carriedRaw: formatRawAmount(carriedRaw),
      tierAmountsRaw: tierAmounts.map((tier) => formatRawAmount(tier.amountRaw)),
    },
  };
}
