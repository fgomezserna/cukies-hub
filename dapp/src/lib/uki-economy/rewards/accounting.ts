import "server-only";

import { AMBASSADOR_ATTRIBUTION_POLICY } from "../ambassadors/types";
import { DomainConflictError, DomainValidationError } from "../errors";
import { formatRawAmount, mulDiv, parseRawAmount, sumRawAmounts } from "../money";
import { getIsoWeekPeriodId } from "../periods";
import {
  type CukiePoolCandidate,
  type CukiePoolEligibilityResult,
  type DailyAmbassadorSourceSnapshot,
  type DailyRewardAccounting,
  type DailyRewardBuckets,
  type DailyRewardSourceLine,
  type RewardAccountingAllocation,
  type RewardAccountingParticipant,
  type CukieRewardAccountingParticipant,
  type PriorWeeklyPoolTranche,
  type PoolTrancheAccounting,
  type RewardReserveBreakdown,
  type UndistributedDestinations,
  type UndistributedSplit,
  type WeeklyGameResult,
  type WeeklyLotteryEntropy,
  type WeeklyPrizeAccounting,
  type WeeklyPrizeWinner,
} from "./accounting-types";
import {
  apportionRaw,
  assertRewardRule,
  compareRewardText,
  stableRewardHash,
  validRewardDate,
  validRewardText,
  validRewardWallet,
} from "./rules";
import { calculateCukiePoolDistribution } from "./calculation";
import type { RewardRule } from "./types";

const BPS = BigInt(10_000);
const AMBASSADOR_COMMISSION_BPS = BigInt(AMBASSADOR_ATTRIBUTION_POLICY.commissionBps);
const TOKEN = BigInt("1000000000000000000");
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const TOP_10_BPS = [900, 800, 700, 650, 600, 550, 500, 450, 450, 400] as const;

function canonicalRaw(value: string, label: string) {
  try {
    const canonical = formatRawAmount(parseRawAmount(value));
    if (canonical !== value) throw new Error("non-canonical");
    return parseRawAmount(canonical);
  } catch {
    throw new DomainValidationError(`${label} debe ser un monto raw canonico.`);
  }
}

function exactDayId(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainValidationError("dayId debe usar YYYY-MM-DD UTC.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError("dayId no identifica un dia UTC valido.");
  }
  return value;
}

function canonicalConfigHash(value: string, label = "ruleConfigHash") {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser SHA-256 canonico.`);
  }
  return value;
}

/**
 * Politica operativa vigente para todo UKI que no termina en un beneficiario.
 * Se valida contra la regla completa y su configHash para impedir que una
 * version con pesos historicos (80/5/5/10) vuelva a entrar por error.
 */
export function assertCurrentUndistributedRule(rule: RewardRule) {
  assertRewardRule(rule);
  const weights = rule.undistributedBps;
  if (
    weights.treasury !== 8_000
    || weights.marketing !== 0
    || weights.development !== 0
    || (weights.marketingDevelopment ?? 0) !== 1_000
    || weights.supplyReduction !== 1_000
  ) {
    throw new DomainConflictError(
      "La regla de UKI no distribuido debe ser exactamente 80/10/10 con marketing y desarrollo unificados.",
    );
  }
  if (!rule.destinations.marketingDevelopment) {
    throw new DomainValidationError(
      "La regla 80/10/10 exige un destino unificado de marketing y desarrollo.",
    );
  }
  const destinations = {
    treasury: validRewardWallet(rule.destinations.treasury, "destinations.treasury"),
    marketingDevelopment: validRewardWallet(
      rule.destinations.marketingDevelopment,
      "destinations.marketingDevelopment",
    ),
    supplyReduction: validRewardWallet(
      rule.destinations.supplyReduction,
      "destinations.supplyReduction",
    ),
  };
  if (new Set(Object.values(destinations)).size !== 3) {
    throw new DomainValidationError("Los tres destinos contables deben ser distintos.");
  }
  return {
    ruleVersion: rule.version,
    ruleConfigHash: canonicalConfigHash(rule.configHash),
    destinations,
  };
}

export function splitUndistributed(totalRaw: string): UndistributedSplit {
  const total = canonicalRaw(totalRaw, "undistributedRaw");
  const treasury = mulDiv(total, BigInt(8_000), BPS);
  const marketingDevelopment = mulDiv(total, BigInt(1_000), BPS);
  const supplyReduction = total - treasury - marketingDevelopment;
  return {
    totalRaw: formatRawAmount(total),
    treasuryRaw: formatRawAmount(treasury),
    marketingDevelopmentRaw: formatRawAmount(marketingDevelopment),
    supplyReductionRaw: formatRawAmount(supplyReduction),
  };
}

export function reserveForCredits(credits: number): RewardReserveBreakdown {
  if (!Number.isSafeInteger(credits) || credits < 0 || credits % 10 !== 0) {
    throw new DomainValidationError("credits debe ser un multiplo entero no negativo de 10.");
  }
  const runs = BigInt(credits / 10);
  const performance = runs * TOKEN * BigInt(75) / BigInt(10);
  const weekly = runs * TOKEN * BigInt(2);
  const ambassadorOrdinary = runs * TOKEN * BigInt(4) / BigInt(10);
  const ambassadorWeekly = runs * TOKEN / BigInt(10);
  return {
    credits,
    performanceRaw: formatRawAmount(performance),
    weeklyPrizeRaw: formatRawAmount(weekly),
    ambassadorOrdinaryRaw: formatRawAmount(ambassadorOrdinary),
    ambassadorWeeklyRaw: formatRawAmount(ambassadorWeekly),
    totalRaw: formatRawAmount(performance + weekly + ambassadorOrdinary + ambassadorWeekly),
  };
}

export function sealDailyRewardAccounting(input: {
  dayId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  emissionRaw: string;
  buckets: DailyRewardBuckets;
  sourceIds?: readonly string[];
  sourceReservedRaw?: string;
  capacityMaterializedRaw?: string;
  priorReservedInflowRaw?: string;
  topupRaw?: string;
  priorReservedUndistributedRaw?: string;
  allocations?: RewardAccountingAllocation[];
  destinations: UndistributedDestinations;
  sealedAt: Date;
}): DailyRewardAccounting {
  const dayId = exactDayId(input.dayId);
  const ruleVersion = validRewardText(input.ruleVersion, "ruleVersion");
  const ruleConfigHash = canonicalConfigHash(input.ruleConfigHash);
  const sealedAt = validRewardDate(input.sealedAt, "sealedAt");
  const destinations = {
    treasury: validRewardWallet(input.destinations.treasury, "destinations.treasury"),
    marketingDevelopment: validRewardWallet(
      input.destinations.marketingDevelopment,
      "destinations.marketingDevelopment",
    ),
    supplyReduction: validRewardWallet(
      input.destinations.supplyReduction,
      "destinations.supplyReduction",
    ),
  };
  if (new Set(Object.values(destinations)).size !== 3) {
    throw new DomainValidationError("Los tres destinos contables deben ser distintos.");
  }
  const entries = Object.entries(input.buckets).map(([key, value]) => [
    key,
    canonicalRaw(value, `buckets.${key}`),
  ] as const);
  const accounted = sumRawAmounts(entries.map(([, value]) => value));
  const emissionRaw = formatRawAmount(canonicalRaw(input.emissionRaw, "emissionRaw"));
  const emission = parseRawAmount(emissionRaw);
  if (emission <= BigInt(0)) {
    throw new DomainValidationError("La emision diaria debe ser positiva.");
  }
  if (accounted > emission) {
    throw new DomainConflictError("La contabilidad diaria excede la emision de su regla.");
  }
  const buckets = Object.fromEntries(
    entries.map(([key, value]) => [key, formatRawAmount(value)]),
  ) as DailyRewardBuckets;
  const undistributed = splitUndistributed(formatRawAmount(emission - accounted));
  const sourceIds = (input.sourceIds ?? []).map((sourceId, index) =>
    validRewardText(sourceId, `sourceIds[${index}]`)).sort(compareRewardText);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new DomainConflictError("El cierre diario contiene sources duplicados.");
  }
  const sourceReservedRaw = input.sourceReservedRaw === undefined
    ? formatRawAmount(accounted)
    : formatRawAmount(canonicalRaw(input.sourceReservedRaw, "sourceReservedRaw"));
  const sourceReserved = parseRawAmount(sourceReservedRaw);
  if (sourceReserved > emission) {
    throw new DomainConflictError("Las reservas source exceden la emision diaria de su regla.");
  }
  const capacityMaterializedRaw = input.capacityMaterializedRaw === undefined
    ? formatRawAmount(emission - sourceReserved)
    : formatRawAmount(canonicalRaw(input.capacityMaterializedRaw, "capacityMaterializedRaw"));
  if (sourceReserved + parseRawAmount(capacityMaterializedRaw) !== emission) {
    throw new DomainConflictError("La capacidad materializada no completa la emision de su regla.");
  }
  const topupRaw = formatRawAmount(canonicalRaw(input.topupRaw ?? "0", "topupRaw"));
  if (
    parseRawAmount(topupRaw) > parseRawAmount(capacityMaterializedRaw)
    || accounted > sourceReserved + parseRawAmount(topupRaw)
  ) {
    throw new DomainConflictError("Los buckets diarios exceden sus sources y topups demostrados.");
  }
  const priorReservedInflowRaw = formatRawAmount(canonicalRaw(
    input.priorReservedInflowRaw ?? "0",
    "priorReservedInflowRaw",
  ));
  const priorReservedUndistributed = splitUndistributed(formatRawAmount(canonicalRaw(
    input.priorReservedUndistributedRaw ?? "0",
    "priorReservedUndistributedRaw",
  )));
  const allocations = [...(input.allocations ?? [])].sort((left, right) =>
    compareRewardText(left.allocationId, right.allocationId));
  const sourceSetHash = stableRewardHash({ dayId, sourceIds, sourceReservedRaw });
  const payload = {
    dayId, ruleVersion, ruleConfigHash, sourceIds, sourceSetHash, sourceReservedRaw,
    capacityMaterializedRaw, priorReservedInflowRaw, topupRaw,
    emissionRaw, buckets, undistributed, priorReservedUndistributed,
    destinations, allocations, conservationRaw: emissionRaw,
  };
  return {
    _id: `reward-daily:${dayId}`,
    ...payload,
    payloadHash: stableRewardHash(payload),
    status: "sealed",
    sealedAt,
  };
}

export function dailyBucketsFromSources(lines: readonly DailyRewardSourceLine[]) {
  const totals = {
    playersRaw: BigInt(0),
    creditPoolRaw: BigInt(0),
    cukiePoolRaw: BigInt(0),
    ambassadorOrdinaryRaw: BigInt(0),
    weeklyPrizeRaw: BigInt(0),
    ambassadorWeeklyRaw: BigInt(0),
  };
  let sourceReserved = BigInt(0);
  let ambassadorOrdinaryReserved = BigInt(0);
  const sourceIds = new Set<string>();
  for (const line of lines) {
    const sourceId = validRewardText(line.sourceId, "sourceId");
    if (sourceIds.has(sourceId)) throw new DomainConflictError(`Source diario duplicado: ${sourceId}.`);
    sourceIds.add(sourceId);
    const sourceTotal = canonicalRaw(line.sourceTotalRaw, "sourceTotalRaw");
    const entries = [...line.allocations, ...line.accruals];
    const documentTotal = sumRawAmounts(entries.map((entry) => canonicalRaw(entry.amountRaw, "amountRaw")));
    if (documentTotal !== sourceTotal) {
      throw new DomainConflictError(`El source ${sourceId} no reconcilia con sus documentos.`);
    }
    sourceReserved += sourceTotal;
    for (const entry of entries) {
      const amount = parseRawAmount(entry.amountRaw);
      if (entry.category === "player") totals.playersRaw += amount;
      else if (entry.category === "credit_pool_weekly") totals.creditPoolRaw += amount;
      else if (entry.category.startsWith("cukie_pool_") && entry.category.endsWith("_weekly")) {
        totals.cukiePoolRaw += amount;
      } else if (entry.category === "weekly_prize_pool") totals.weeklyPrizeRaw += amount;
      else if (entry.category === "ambassador_ordinary_pending") {
        ambassadorOrdinaryReserved += amount;
      } else if (entry.category === "ambassador_weekly_pending") {
        totals.ambassadorWeeklyRaw += amount;
      }
      else if (entry.category === "ambassador_program_pending") {
        const ordinary = mulDiv(amount, BigInt(8_000), BPS);
        ambassadorOrdinaryReserved += ordinary;
        totals.ambassadorWeeklyRaw += amount - ordinary;
      }
      // Destinos finales y undistributed_pending permanecen dentro del resto
      // exacto del cap diario versionado; no se vuelven a reservar ni a mintear.
    }
  }
  return {
    buckets: Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, formatRawAmount(value)]),
    ) as DailyRewardBuckets,
    sourceIds: [...sourceIds].sort(compareRewardText),
    sourceReservedRaw: formatRawAmount(sourceReserved),
    ambassadorOrdinaryReservedRaw: formatRawAmount(ambassadorOrdinaryReserved),
  };
}

function apportionedByUnits(
  total: bigint,
  participants: readonly RewardAccountingParticipant[],
) {
  if (total === BigInt(0) || participants.length === 0) return new Map<string, bigint>();
  const units = new Map<string, number>();
  for (const participant of participants) {
    const wallet = validRewardWallet(participant.walletNormalized);
    if (!Number.isSafeInteger(participant.units) || participant.units <= 0) {
      throw new DomainValidationError("Las unidades del participante deben ser positivas.");
    }
    units.set(wallet, (units.get(wallet) ?? 0) + participant.units);
  }
  return new Map(apportionRaw(total, [...units.entries()].map(([wallet, value]) => ({
    key: wallet,
    wallet,
    weight: BigInt(value),
  }))).map((entry) => [entry.wallet, entry.amountRaw]));
}

function zeroPriorWeeklyPoolTranche(): PriorWeeklyPoolTranche {
  return {
    weeklyAccountingId: "weekly:none",
    creditPoolRaw: "0",
    creditPoolAmbassadorRaw: "0",
    cukiePoolOriginalRaw: "0",
    cukiePoolOriginalAmbassadorRaw: "0",
    cukiePoolSecondPlusRaw: "0",
    cukiePoolSecondPlusAmbassadorRaw: "0",
  };
}

export function calculateDailyRewardSettlement(input: {
  dayId: string;
  rule: RewardRule;
  sourceLines: readonly DailyRewardSourceLine[];
  creditContributors: readonly RewardAccountingParticipant[];
  cukieOriginalParticipants: readonly CukieRewardAccountingParticipant[];
  cukieSecondPlusParticipants: readonly CukieRewardAccountingParticipant[];
  ambassadorBySource?: Readonly<Record<string, DailyAmbassadorSourceSnapshot>>;
  priorWeekly?: PriorWeeklyPoolTranche;
  sealedAt: Date;
}) {
  const policy = assertCurrentUndistributedRule(input.rule);
  const source = dailyBucketsFromSources(input.sourceLines);
  const sourceReserved = parseRawAmount(source.sourceReservedRaw);
  const emissionRaw = formatRawAmount(parseRawAmount(input.rule.emissionBudget.dailyCapRaw));
  const emission = parseRawAmount(emissionRaw);
  if (sourceReserved > emission) {
    throw new DomainConflictError("Los sources diarios exceden el cap de la regla.");
  }
  const capacity = emission - sourceReserved;
  const prior = input.priorWeekly ?? zeroPriorWeeklyPoolTranche();
  const sourceIdsByCategory = new Map<string, string[]>();
  for (const line of input.sourceLines) {
    for (const entry of [...line.allocations, ...line.accruals]) {
      sourceIdsByCategory.set(entry.category, [
        ...(sourceIdsByCategory.get(entry.category) ?? []),
        line.sourceId,
      ]);
    }
  }
  const categoryTotal = (category: string) => sumRawAmounts(input.sourceLines.flatMap((line) =>
    [...line.allocations, ...line.accruals]
      .filter((entry) => entry.category === category)
      .map((entry) => parseRawAmount(entry.amountRaw))));
  const ordinaryCredit = categoryTotal("credit_pool_weekly");
  const ordinaryCukieOriginal = categoryTotal("cukie_pool_original_weekly");
  const ordinaryCukieSecond = categoryTotal("cukie_pool_second_plus_weekly");
  const priorCredit = canonicalRaw(prior.creditPoolRaw, "prior.creditPoolRaw");
  const priorCukieOriginal = canonicalRaw(
    prior.cukiePoolOriginalRaw,
    "prior.cukiePoolOriginalRaw",
  );
  const priorCukieSecond = canonicalRaw(
    prior.cukiePoolSecondPlusRaw,
    "prior.cukiePoolSecondPlusRaw",
  );
  const priorAmbassadorCredit = canonicalRaw(
    prior.creditPoolAmbassadorRaw,
    "prior.creditPoolAmbassadorRaw",
  );
  const priorAmbassadorOriginal = canonicalRaw(
    prior.cukiePoolOriginalAmbassadorRaw,
    "prior.cukiePoolOriginalAmbassadorRaw",
  );
  const priorAmbassadorSecond = canonicalRaw(
    prior.cukiePoolSecondPlusAmbassadorRaw,
    "prior.cukiePoolSecondPlusAmbassadorRaw",
  );

  const ambassadorByParticipantWallet = new Map<string, string | null>();
  const addAmbassador = (walletInput: string, ambassadorInput: string | null) => {
    const wallet = validRewardWallet(walletInput);
    const ambassador = ambassadorInput ? validRewardWallet(ambassadorInput) : null;
    if (ambassador === wallet) throw new DomainConflictError("La autorreferencia no genera comision.");
    const current = ambassadorByParticipantWallet.get(wallet);
    if (current !== undefined && current !== ambassador) {
      throw new DomainConflictError(`Snapshot ambassador contradictorio para ${wallet}.`);
    }
    ambassadorByParticipantWallet.set(wallet, ambassador);
  };
  for (const participant of [
    ...input.creditContributors,
    ...input.cukieOriginalParticipants,
    ...input.cukieSecondPlusParticipants,
  ]) addAmbassador(participant.walletNormalized, participant.ambassadorWalletNormalized);

  const ordinaryCreditByWallet = apportionedByUnits(ordinaryCredit, input.creditContributors);
  const priorCreditByWallet = apportionedByUnits(priorCredit, input.creditContributors);
  const floorStep = input.rule.creditPoolDaily.floorCreditsStep;
  let totalCreditUnits = 0;
  for (const contributor of input.creditContributors) {
    if (
      !Number.isSafeInteger(contributor.units)
      || contributor.units <= 0
      || contributor.units % floorStep !== 0
    ) {
      throw new DomainValidationError(
        `Cada aportacion de creditos debe ser multiplo de ${floorStep}.`,
      );
    }
    totalCreditUnits += contributor.units;
    if (!Number.isSafeInteger(totalCreditUnits)) {
      throw new DomainValidationError("La suma de creditos aportados no es segura.");
    }
  }
  const creditFloor = input.rule.creditPoolDaily.floorEnabled
    ? BigInt(totalCreditUnits / floorStep)
      * parseRawAmount(input.rule.creditPoolDaily.floorAmountRaw)
    : BigInt(0);
  const creditBase = ordinaryCredit + priorCredit;
  const creditPayment = input.creditContributors.length === 0
    ? BigInt(0)
    : (creditBase > creditFloor ? creditBase : creditFloor);
  const creditTopup = creditPayment - (input.creditContributors.length === 0 ? BigInt(0) : creditBase);
  const creditTopupByWallet = apportionedByUnits(creditTopup, input.creditContributors);
  if (creditTopup > capacity) {
    throw new DomainConflictError("La capacidad diaria no cubre la garantia del pool de creditos.");
  }

  const distributeCukie = (
    amount: bigint,
    generation: "original" | "second_plus",
    participants: readonly CukieRewardAccountingParticipant[],
  ) => {
    if (amount === BigInt(0) || participants.length === 0) {
      return { byWallet: new Map<string, bigint>(), carried: amount };
    }
    const calculated = calculateCukiePoolDistribution(input.rule, {
      generation,
      sourcePoolRaw: formatRawAmount(amount),
      participants: participants.map((participant) => ({
        walletAddress: participant.walletNormalized,
        rarityLevel: participant.rarityLevel,
        units: participant.units,
      })),
    });
    return {
      byWallet: new Map(calculated.allocations.map((allocation) => [
        allocation.walletNormalized,
        parseRawAmount(allocation.amountRaw),
      ])),
      carried: parseRawAmount(calculated.totals.carriedRaw),
    };
  };
  const ordinaryOriginal = distributeCukie(
    ordinaryCukieOriginal,
    "original",
    input.cukieOriginalParticipants,
  );
  const ordinarySecond = distributeCukie(
    ordinaryCukieSecond,
    "second_plus",
    input.cukieSecondPlusParticipants,
  );
  const priorOriginal = distributeCukie(
    priorCukieOriginal,
    "original",
    input.cukieOriginalParticipants,
  );
  const priorSecond = distributeCukie(
    priorCukieSecond,
    "second_plus",
    input.cukieSecondPlusParticipants,
  );

  type AllocationDraft = Omit<RewardAccountingAllocation, "allocationId">;
  const drafts = new Map<string, AllocationDraft>();
  const append = (draft: AllocationDraft) => {
    const wallet = validRewardWallet(draft.walletNormalized);
    const amount = canonicalRaw(draft.amountRaw, "allocation.amountRaw");
    if (amount === BigInt(0)) return;
    const key = `${draft.fundingMode}:${draft.category}:${wallet}`;
    const current = drafts.get(key);
    drafts.set(key, {
      walletNormalized: wallet,
      category: draft.category,
      amountRaw: formatRawAmount((current ? parseRawAmount(current.amountRaw) : BigInt(0)) + amount),
      fundingMode: draft.fundingMode,
      sourceIds: [...new Set([...(current?.sourceIds ?? []), ...draft.sourceIds])]
        .sort(compareRewardText),
    });
  };
  let ordinaryCommission = BigInt(0);
  for (const line of input.sourceLines) {
    for (const allocation of line.allocations.filter((entry) => entry.category === "player")) {
      const snapshot = input.ambassadorBySource?.[line.sourceId];
      if (!snapshot) {
        throw new DomainConflictError(
          `Falta el snapshot ambassador de la fuente ${line.sourceId}.`,
        );
      }
      const playerWallet = validRewardWallet(allocation.walletNormalized);
      const snapshotWallet = validRewardWallet(
        snapshot.walletNormalized,
        "ambassadorBySource.walletNormalized",
      );
      const ambassador = snapshot.ambassadorWalletNormalized
        ? validRewardWallet(
            snapshot.ambassadorWalletNormalized,
            "ambassadorBySource.ambassadorWalletNormalized",
          )
        : null;
      if (snapshotWallet !== playerWallet) {
        throw new DomainConflictError(
          `El snapshot ambassador de ${line.sourceId} pertenece a otra wallet.`,
        );
      }
      if (ambassador === playerWallet) {
        throw new DomainConflictError("La autorreferencia no genera comision.");
      }
      append({
        walletNormalized: playerWallet,
        category: "player",
        amountRaw: allocation.amountRaw,
        fundingMode: "daily_emission",
        sourceIds: [line.sourceId],
      });
      if (ambassador) {
        const commission = mulDiv(
          canonicalRaw(allocation.amountRaw, "player.amountRaw"),
          AMBASSADOR_COMMISSION_BPS,
          BPS,
        );
        ordinaryCommission += commission;
        append({
          walletNormalized: ambassador,
          category: "ambassador_ordinary",
          amountRaw: formatRawAmount(commission),
          fundingMode: "daily_emission",
          sourceIds: [line.sourceId],
        });
      }
    }
  }
  const appendMap = (
    values: Map<string, bigint>,
    category: RewardAccountingAllocation["category"],
    fundingMode: RewardAccountingAllocation["fundingMode"],
    sourceIds: string[],
  ) => values.forEach((amount, walletNormalized) => append({
    walletNormalized,
    category,
    amountRaw: formatRawAmount(amount),
    fundingMode,
    sourceIds,
  }));
  appendMap(ordinaryCreditByWallet, "credit_pool", "daily_emission", sourceIdsByCategory.get("credit_pool_weekly") ?? []);
  appendMap(creditTopupByWallet, "credit_pool", "daily_emission", [`reward-daily-capacity:${input.dayId}`]);
  appendMap(priorCreditByWallet, "credit_pool", "reserved_no_mint", [prior.weeklyAccountingId]);
  appendMap(ordinaryOriginal.byWallet, "cukie_pool_original", "daily_emission", sourceIdsByCategory.get("cukie_pool_original_weekly") ?? []);
  appendMap(ordinarySecond.byWallet, "cukie_pool_second_plus", "daily_emission", sourceIdsByCategory.get("cukie_pool_second_plus_weekly") ?? []);
  appendMap(priorOriginal.byWallet, "cukie_pool_original", "reserved_no_mint", [prior.weeklyAccountingId]);
  appendMap(priorSecond.byWallet, "cukie_pool_second_plus", "reserved_no_mint", [prior.weeklyAccountingId]);

  const ordinaryBeneficiary = new Map<string, bigint>();
  const priorBeneficiary = new Map<string, bigint>();
  const addBeneficiary = (target: Map<string, bigint>, wallet: string, amount: bigint) =>
    target.set(wallet, (target.get(wallet) ?? BigInt(0)) + amount);
  for (const draft of drafts.values()) {
    if (!["credit_pool", "cukie_pool_original", "cukie_pool_second_plus"].includes(draft.category)) continue;
    addBeneficiary(
      draft.fundingMode === "daily_emission" ? ordinaryBeneficiary : priorBeneficiary,
      draft.walletNormalized,
      parseRawAmount(draft.amountRaw),
    );
  }
  let weeklyCommission = BigInt(0);
  for (const [wallet, amount] of ordinaryBeneficiary) {
    const ambassador = ambassadorByParticipantWallet.get(wallet);
    if (!ambassador) continue;
    const commission = mulDiv(amount, AMBASSADOR_COMMISSION_BPS, BPS);
    ordinaryCommission += commission;
    append({
      walletNormalized: ambassador,
      category: "ambassador_ordinary",
      amountRaw: formatRawAmount(commission),
      fundingMode: "daily_emission",
      sourceIds: source.sourceIds,
    });
  }
  for (const [wallet, amount] of priorBeneficiary) {
    const ambassador = ambassadorByParticipantWallet.get(wallet);
    if (!ambassador) continue;
    const commission = mulDiv(amount, AMBASSADOR_COMMISSION_BPS, BPS);
    weeklyCommission += commission;
    append({
      walletNormalized: ambassador,
      category: "ambassador_weekly",
      amountRaw: formatRawAmount(commission),
      fundingMode: "reserved_no_mint",
      sourceIds: [prior.weeklyAccountingId],
    });
  }
  const ordinaryAmbassadorReserved = parseRawAmount(source.ambassadorOrdinaryReservedRaw);
  const ambassadorTopup = ordinaryCommission > ordinaryAmbassadorReserved
    ? ordinaryCommission - ordinaryAmbassadorReserved
    : BigInt(0);
  const topup = creditTopup + ambassadorTopup;
  if (topup > capacity) {
    throw new DomainConflictError("La capacidad diaria no cubre garantia y comision ambassador.");
  }
  const priorAmbassadorReserved = priorAmbassadorCredit
    + priorAmbassadorOriginal
    + priorAmbassadorSecond;
  if (weeklyCommission > priorAmbassadorReserved) {
    throw new DomainConflictError("La comision weekly excede la reserva trasladada.");
  }

  const currentCukieDistributed = ordinaryCukieOriginal - ordinaryOriginal.carried
    + ordinaryCukieSecond - ordinarySecond.carried;
  const buckets: DailyRewardBuckets = {
    ...source.buckets,
    creditPoolRaw: formatRawAmount(
      (input.creditContributors.length === 0 ? BigInt(0) : ordinaryCredit) + creditTopup,
    ),
    cukiePoolRaw: formatRawAmount(currentCukieDistributed),
    ambassadorOrdinaryRaw: formatRawAmount(ordinaryCommission),
  };
  const accounted = sumRawAmounts(Object.values(buckets).map(parseRawAmount));
  const currentUndistributed = emission - accounted;
  if (currentUndistributed < BigInt(0)) {
    throw new DomainConflictError("El cierre diario excede el cap de la regla tras las garantias.");
  }
  const priorPoolUndistributed = (input.creditContributors.length === 0 ? priorCredit : BigInt(0))
    + priorOriginal.carried
    + priorSecond.carried;
  const priorAmbassadorUndistributed = priorAmbassadorReserved - weeklyCommission;
  const priorUndistributed = priorPoolUndistributed + priorAmbassadorUndistributed;
  const appendDestinationSplit = (
    split: UndistributedSplit,
    fundingMode: RewardAccountingAllocation["fundingMode"],
    sourceIds: string[],
  ) => {
    append({ walletNormalized: policy.destinations.treasury, category: "treasury", amountRaw: split.treasuryRaw, fundingMode, sourceIds });
    append({ walletNormalized: policy.destinations.marketingDevelopment, category: "marketing_development", amountRaw: split.marketingDevelopmentRaw, fundingMode, sourceIds });
    append({ walletNormalized: policy.destinations.supplyReduction, category: "supply_reduction", amountRaw: split.supplyReductionRaw, fundingMode, sourceIds });
  };
  appendDestinationSplit(
    splitUndistributed(formatRawAmount(currentUndistributed)),
    "daily_emission",
    source.sourceIds,
  );
  appendDestinationSplit(
    splitUndistributed(formatRawAmount(priorUndistributed)),
    "reserved_no_mint",
    [prior.weeklyAccountingId],
  );
  const allocations = [...drafts.values()].map((draft) => ({
    allocationId: stableRewardHash({
      kind: "reward-accounting-allocation",
      dayId: input.dayId,
      ...draft,
    }),
    ...draft,
  })).sort((left, right) => compareRewardText(left.allocationId, right.allocationId));
  const priorReservedInflow = priorCredit + priorCukieOriginal + priorCukieSecond
    + priorAmbassadorReserved;
  return sealDailyRewardAccounting({
    dayId: input.dayId,
    ruleVersion: input.rule.version,
    ruleConfigHash: policy.ruleConfigHash,
    emissionRaw,
    buckets,
    sourceIds: source.sourceIds,
    sourceReservedRaw: source.sourceReservedRaw,
    capacityMaterializedRaw: formatRawAmount(capacity),
    priorReservedInflowRaw: formatRawAmount(priorReservedInflow),
    topupRaw: formatRawAmount(topup),
    priorReservedUndistributedRaw: formatRawAmount(priorUndistributed),
    allocations,
    destinations: policy.destinations,
    sealedAt: input.sealedAt,
  });
}

function betterResult(left: WeeklyGameResult, right: WeeklyGameResult) {
  const leftScore = canonicalRaw(left.scoreRaw, "scoreRaw");
  const rightScore = canonicalRaw(right.scoreRaw, "scoreRaw");
  if (leftScore !== rightScore) return leftScore > rightScore ? left : right;
  const delta = validRewardDate(left.playedAt, "playedAt").getTime()
    - validRewardDate(right.playedAt, "playedAt").getTime();
  if (delta !== 0) return delta < 0 ? left : right;
  const game = compareRewardText(left.gameId, right.gameId);
  if (game !== 0) return game < 0 ? left : right;
  return compareRewardText(left.sessionId, right.sessionId) <= 0 ? left : right;
}

function canonicalEvidenceHash(value: string, label: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser SHA-256 canonico.`);
  }
  return value;
}

function canonicalWeeklyResult(source: WeeklyGameResult): WeeklyGameResult | null {
  if (source.status !== "settled" || source.outcome !== "completed" || source.resultValid !== true) {
    return null;
  }
  if (source.creditSnapshot.source !== "own" && source.creditSnapshot.source !== "pool") {
    throw new DomainValidationError("creditSnapshot.source no es valido.");
  }
  if (!["own", "pool_original", "pool_second_plus", "seiku"].includes(source.cukieSnapshot.source)) {
    throw new DomainValidationError("cukieSnapshot.source no es valido.");
  }
  const wallet = validRewardWallet(source.wallet);
  const periodAnchorAt = validRewardDate(source.periodAnchorAt, "periodAnchorAt");
  const playedAt = validRewardDate(source.playedAt, "playedAt");
  const settledAt = validRewardDate(source.settledAt, "settledAt");
  const ambassadorWallet = source.ambassadorSnapshot.walletNormalized
    ? validRewardWallet(source.ambassadorSnapshot.walletNormalized, "ambassadorSnapshot.walletNormalized")
    : null;
  const ambassadorCapturedAt = validRewardDate(
    source.ambassadorSnapshot.capturedAt,
    "ambassadorSnapshot.capturedAt",
  );
  const arenaRank = source.arenaRankingSnapshot.rank;
  const arenaRewardBps = source.arenaRankingSnapshot.rewardBps;
  const sourceRankingId = source.arenaRankingSnapshot.sourceRankingId;
  if (
    !Number.isSafeInteger(arenaRewardBps)
    || arenaRewardBps < 0
    || arenaRewardBps > 10_000
    || (source.creditSnapshot.source === "pool"
      ? (!Number.isSafeInteger(arenaRank) || (arenaRank as number) < 1 || (arenaRank as number) > 9
        || !sourceRankingId)
      : (arenaRank !== null || sourceRankingId !== null || arenaRewardBps !== 10_000))
  ) {
    throw new DomainConflictError("El snapshot de Arena no corresponde al origen de creditos.");
  }
  if (
    ambassadorWallet === wallet ||
    ambassadorCapturedAt.getTime() > periodAnchorAt.getTime() ||
    playedAt.getTime() < periodAnchorAt.getTime() ||
    settledAt.getTime() < playedAt.getTime()
  ) {
    throw new DomainConflictError("El snapshot ambassador no es valido para el juego liquidado.");
  }
  return {
    sessionId: validRewardText(source.sessionId, "sessionId"),
    wallet,
    gameId: validRewardText(source.gameId, "gameId"),
    scoreRaw: formatRawAmount(canonicalRaw(source.scoreRaw, "scoreRaw")),
    periodAnchorAt,
    playedAt,
    settledAt,
    status: "settled",
    outcome: "completed",
    resultValid: true,
    resultHash: canonicalEvidenceHash(source.resultHash, "resultHash"),
    creditSnapshot: {
      source: source.creditSnapshot.source,
      reservationId: validRewardText(source.creditSnapshot.reservationId, "creditSnapshot.reservationId"),
      evidenceHash: canonicalEvidenceHash(source.creditSnapshot.evidenceHash, "creditSnapshot.evidenceHash"),
    },
    cukieSnapshot: {
      source: source.cukieSnapshot.source,
      assignmentId: validRewardText(source.cukieSnapshot.assignmentId, "cukieSnapshot.assignmentId"),
      generation: validRewardText(source.cukieSnapshot.generation, "cukieSnapshot.generation"),
      evidenceHash: canonicalEvidenceHash(source.cukieSnapshot.evidenceHash, "cukieSnapshot.evidenceHash"),
    },
    ambassadorSnapshot: {
      walletNormalized: ambassadorWallet,
      capturedAt: ambassadorCapturedAt,
      evidenceHash: canonicalEvidenceHash(source.ambassadorSnapshot.evidenceHash, "ambassadorSnapshot.evidenceHash"),
    },
    arenaRankingSnapshot: {
      rank: arenaRank,
      rewardBps: arenaRewardBps,
      sourceRankingId: sourceRankingId
        ? validRewardText(sourceRankingId, "arenaRankingSnapshot.sourceRankingId")
        : null,
      evidenceHash: canonicalEvidenceHash(
        source.arenaRankingSnapshot.evidenceHash,
        "arenaRankingSnapshot.evidenceHash",
      ),
    },
  };
}

function splitWeeklyWinningAmount(
  amount: bigint,
  source: WeeklyGameResult,
) {
  const creditPool = source.creditSnapshot.source === "pool"
    ? mulDiv(amount, BigInt(5_000), BPS)
    : BigInt(0);
  const usesPoolCukie = source.cukieSnapshot.source !== "own";
  const cukieBps = usesPoolCukie
    ? (source.creditSnapshot.source === "pool" ? 2_500 : 5_000)
    : 0;
  const reservedCukie = mulDiv(amount, BigInt(cukieBps), BPS);
  const cukiePool = source.cukieSnapshot.source === "seiku"
    ? BigInt(0)
    : reservedCukie;
  const playerBase = amount - creditPool - reservedCukie;
  const player = mulDiv(
    playerBase,
    BigInt(source.arenaRankingSnapshot.rewardBps),
    BPS,
  );
  return {
    player,
    creditPool,
    cukiePool,
    undistributed: amount - player - creditPool - cukiePool,
  };
}

export function assertEligibleWeeklyGameResult(source: WeeklyGameResult) {
  const canonical = canonicalWeeklyResult(source);
  if (!canonical) {
    throw new DomainConflictError(
      "La fuente weekly debe ser una partida settled, completada y con resultado valido.",
    );
  }
  return canonical;
}

export function selectWeeklyBestResults(results: readonly WeeklyGameResult[]) {
  const byWallet = new Map<string, {
    best: WeeklyGameResult;
    gamesPlayed: number;
    qualifyingLotteryGames: number;
  }>();
  const sessionIds = new Set<string>();
  for (const source of results) {
    const result = canonicalWeeklyResult(source);
    if (!result) continue;
    if (sessionIds.has(result.sessionId)) {
      throw new DomainConflictError(`La session weekly ${result.sessionId} esta duplicada.`);
    }
    sessionIds.add(result.sessionId);
    const wallet = result.wallet;
    const current = byWallet.get(wallet);
    byWallet.set(wallet, {
      best: current ? betterResult(current.best, result) : result,
      gamesPlayed: (current?.gamesPlayed ?? 0) + 1,
      qualifyingLotteryGames: (current?.qualifyingLotteryGames ?? 0)
        + (parseRawAmount(result.scoreRaw) > BigInt(100) ? 1 : 0),
    });
  }
  return [...byWallet.entries()]
    .map(([walletNormalized, value]) => ({ walletNormalized, ...value }))
    .sort((left, right) => {
      const leftScore = parseRawAmount(left.best.scoreRaw);
      const rightScore = parseRawAmount(right.best.scoreRaw);
      if (leftScore !== rightScore) return leftScore > rightScore ? -1 : 1;
      const time = left.best.playedAt.getTime() - right.best.playedAt.getTime();
      return time || compareRewardText(left.walletNormalized, right.walletNormalized);
    });
}

export function calculateWeeklyPrize(input: {
  periodId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  potRaw: string;
  ambassadorReserveRaw: string;
  sourceDailyAccountingIds: readonly string[];
  results: readonly WeeklyGameResult[];
  lotteryEntropy?: WeeklyLotteryEntropy;
  destinations: UndistributedDestinations;
  payoutAt: Date;
  sealedAt: Date;
}): WeeklyPrizeAccounting {
  const periodId = validRewardText(input.periodId, "periodId");
  const ruleVersion = validRewardText(input.ruleVersion, "ruleVersion");
  const ruleConfigHash = canonicalConfigHash(input.ruleConfigHash);
  const pot = canonicalRaw(input.potRaw, "potRaw");
  const ambassadorReserve = canonicalRaw(input.ambassadorReserveRaw, "ambassadorReserveRaw");
  const payoutAt = validRewardDate(input.payoutAt, "payoutAt");
  const sealedAt = validRewardDate(input.sealedAt, "sealedAt");
  const payoutMonday = new Date(Date.UTC(
    payoutAt.getUTCFullYear(),
    payoutAt.getUTCMonth(),
    payoutAt.getUTCDate(),
  ));
  if (
    payoutMonday.getUTCDay() !== 1
    || payoutAt.getUTCHours() !== 17
    || payoutAt.getUTCMinutes() !== 0
    || payoutAt.getUTCSeconds() !== 0
    || payoutAt.getUTCMilliseconds() !== 0
  ) {
    throw new DomainConflictError("El payout weekly debe sellarse un lunes a las 17:00:00.000 UTC.");
  }
  const periodMonday = new Date(payoutMonday.getTime() - WEEK_MS);
  if (getIsoWeekPeriodId(periodMonday) !== periodId) {
    throw new DomainConflictError("periodId no coincide con la semana UTC anterior al payout.");
  }
  const expectedDailyAccountingIds = Array.from({ length: 7 }, (_, index) =>
    `reward-daily:${new Date(periodMonday.getTime() + index * DAY_MS).toISOString().slice(0, 10)}`);
  const providedSourceDailyAccountingIds = input.sourceDailyAccountingIds.map((id, index) =>
    validRewardText(id, `sourceDailyAccountingIds[${index}]`));
  const canonicalSourceIds = [...providedSourceDailyAccountingIds].sort(compareRewardText);
  if (
    providedSourceDailyAccountingIds.length !== 7
    || new Set(providedSourceDailyAccountingIds).size !== 7
    || canonicalSourceIds.some((id, index) => id !== expectedDailyAccountingIds[index])
  ) {
    throw new DomainConflictError("Weekly exige los siete cierres diarios canonicos de su periodo.");
  }
  const sourceDailyAccountingIds = expectedDailyAccountingIds;
  const poolTrancheSchedule = Array.from({ length: 7 }, (_, index) =>
    new Date(payoutMonday.getTime() + (index + 1) * DAY_MS + 16 * 60 * 60_000));
  if (ambassadorReserve !== mulDiv(pot, AMBASSADOR_COMMISSION_BPS, BPS)) {
    throw new DomainConflictError("La reserva ambassador weekly debe ser exactamente 5% del bote.");
  }
  if (sealedAt.getTime() < payoutAt.getTime()) {
    throw new DomainConflictError("El weekly no puede sellarse antes de su payout.");
  }
  if (!input.lotteryEntropy) {
    throw new DomainConflictError("pending_entropy: falta el primer bloque BSC seguro posterior al payout.");
  }
  const entropy = input.lotteryEntropy;
  if (
    entropy.chainId !== 97 || entropy.canonical !== true
    || entropy.selectionPolicy !== "first_safe_block_at_or_after_cutoff"
    || !Number.isSafeInteger(entropy.blockNumber) || entropy.blockNumber < 0
    || !/^0x[0-9a-fA-F]{64}$/.test(entropy.blockHash)
    || !Number.isSafeInteger(entropy.previousBlockNumber)
    || entropy.previousBlockNumber !== entropy.blockNumber - 1
    || !/^0x[0-9a-fA-F]{64}$/.test(entropy.previousBlockHash)
  ) {
    throw new DomainValidationError("lotteryEntropy no es evidencia canonica de BSC Testnet.");
  }
  const entropyTimestamp = validRewardDate(entropy.blockTimestamp, "lotteryEntropy.blockTimestamp");
  const previousBlockTimestamp = validRewardDate(
    entropy.previousBlockTimestamp,
    "lotteryEntropy.previousBlockTimestamp",
  );
  const confirmedAt = validRewardDate(entropy.confirmedAt, "lotteryEntropy.confirmedAt");
  if (
    entropyTimestamp.getTime() < payoutAt.getTime()
    || previousBlockTimestamp.getTime() >= payoutAt.getTime()
    || previousBlockTimestamp.getTime() > entropyTimestamp.getTime()
    || confirmedAt.getTime() < entropyTimestamp.getTime()
  ) {
    throw new DomainConflictError(
      "pending_entropy: falta probar el primer bloque posterior al cutoff y su confirmacion.",
    );
  }
  if (sealedAt.getTime() < confirmedAt.getTime()) {
    throw new DomainConflictError("pending_entropy: el weekly no puede sellarse antes de confirmar la entropia.");
  }
  const lotteryEntropy: WeeklyLotteryEntropy = {
    ...entropy,
    blockHash: entropy.blockHash.toLowerCase(),
    blockTimestamp: entropyTimestamp,
    previousBlockHash: entropy.previousBlockHash.toLowerCase(),
    previousBlockTimestamp,
    confirmedAt,
  };
  const gamePeriodStartsAt = new Date(periodMonday.getTime() + 14 * 60 * 60_000);
  const gamePeriodEndsAt = new Date(gamePeriodStartsAt.getTime() + WEEK_MS);
  for (const source of input.results) {
    const canonical = canonicalWeeklyResult(source);
    if (
      canonical
      && (
        canonical.periodAnchorAt.getTime() < gamePeriodStartsAt.getTime()
        || canonical.periodAnchorAt.getTime() >= gamePeriodEndsAt.getTime()
      )
    ) {
      throw new DomainConflictError("La fuente weekly no pertenece al periodo que se esta cerrando.");
    }
  }
  const ranked = selectWeeklyBestResults(input.results);
  const winners: WeeklyPrizeWinner[] = [];
  const append = (
    participant: (typeof ranked)[number],
    kind: WeeklyPrizeWinner["kind"],
    shareBps: number,
    position?: number,
  ) => {
    const amount = mulDiv(pot, BigInt(shareBps), BPS);
    const split = splitWeeklyWinningAmount(amount, participant.best);
    winners.push({
      walletNormalized: participant.walletNormalized,
      winningGameId: participant.best.sessionId,
      winningScoreRaw: participant.best.scoreRaw,
      winningAt: participant.best.playedAt,
      gamesPlayed: participant.gamesPlayed,
      qualifyingLotteryGames: participant.qualifyingLotteryGames,
      sourceSnapshot: {
        sessionId: participant.best.sessionId,
        periodAnchorAt: participant.best.periodAnchorAt,
        settledAt: participant.best.settledAt,
        resultHash: participant.best.resultHash,
        creditSnapshot: participant.best.creditSnapshot,
        cukieSnapshot: participant.best.cukieSnapshot,
        ambassadorSnapshot: participant.best.ambassadorSnapshot,
        arenaRankingSnapshot: participant.best.arenaRankingSnapshot,
      },
      ...(position === undefined ? {} : { position }),
      kind,
      shareBps,
      amountRaw: formatRawAmount(amount),
      playerRaw: formatRawAmount(split.player),
      creditPoolRaw: formatRawAmount(split.creditPool),
      cukiePoolRaw: formatRawAmount(split.cukiePool),
      undistributedRaw: formatRawAmount(split.undistributed),
    });
  };
  ranked.slice(0, 10).forEach((participant, index) =>
    append(participant, "top_10", TOP_10_BPS[index], index + 1));
  ranked.slice(10, 25).forEach((participant, index) =>
    append(participant, "positions_11_25", 200, index + 11));
  const lottery = ranked.slice(25)
    .filter((participant) => participant.qualifyingLotteryGames >= 10)
    .map((participant) => ({
      participant,
      key: stableRewardHash({
        periodId,
        lotteryEntropy,
        wallet: participant.walletNormalized,
        winningGameId: participant.best.sessionId,
      }),
    }))
    .sort((left, right) => compareRewardText(left.key, right.key))
    .slice(0, 10);
  lottery.forEach(({ participant }) => append(participant, "lottery", 100));
  const selectedGross = sumRawAmounts(winners.map((winner) => parseRawAmount(winner.amountRaw)));
  if (selectedGross > pot) throw new DomainConflictError("El reparto weekly excede el bote.");
  const playerAllocated = sumRawAmounts(winners.map((winner) => parseRawAmount(winner.playerRaw)));
  const poolReserved = sumRawAmounts(winners.flatMap((winner) => [
    parseRawAmount(winner.creditPoolRaw),
    parseRawAmount(winner.cukiePoolRaw),
  ]));
  const winnerUndistributed = sumRawAmounts(
    winners.map((winner) => parseRawAmount(winner.undistributedRaw)),
  );
  const undistributed = splitUndistributed(
    formatRawAmount(pot - selectedGross + winnerUndistributed),
  );
  const poolReservationMap = new Map<string, { amount: bigint; sourceWinningGameIds: string[] }>();
  for (const winner of winners) {
    const appendPool = (pool: string, value: string) => {
      const amount = parseRawAmount(value);
      if (amount === BigInt(0)) return;
      const current = poolReservationMap.get(pool) ?? { amount: BigInt(0), sourceWinningGameIds: [] };
      current.amount += amount;
      current.sourceWinningGameIds.push(winner.winningGameId);
      poolReservationMap.set(pool, current);
    };
    appendPool("credit", winner.creditPoolRaw);
    if (parseRawAmount(winner.cukiePoolRaw) > BigInt(0)) {
      appendPool(
        winner.sourceSnapshot.cukieSnapshot.source === "pool_original"
          ? "cukie_original"
          : "cukie_second_plus",
        winner.cukiePoolRaw,
      );
    }
  }
  const poolReservations = [...poolReservationMap.entries()]
    .sort(([left], [right]) => compareRewardText(left, right))
    .map(([pool, value]) => {
      const amountRaw = formatRawAmount(value.amount);
      const ambassadorReserveRaw = formatRawAmount(mulDiv(value.amount, AMBASSADOR_COMMISSION_BPS, BPS));
      const amountTranches = splitIntoSevenTranches(amountRaw);
      const ambassadorTranches = splitIntoSevenTranches(ambassadorReserveRaw);
      return {
        pool: pool as "credit" | "cukie_original" | "cukie_second_plus",
        amountRaw,
        ambassadorReserveRaw,
        sourceWinningGameIds: [...new Set(value.sourceWinningGameIds)].sort(compareRewardText),
        tranches: poolTrancheSchedule.map((scheduledAt, tranche) => ({
          tranche,
          scheduledAt,
          amountRaw: amountTranches[tranche],
          ambassadorReserveRaw: ambassadorTranches[tranche],
        })),
      };
    });
  const ambassadorPayouts = winners.flatMap((winner) => {
    const ambassadorWallet = winner.sourceSnapshot.ambassadorSnapshot.walletNormalized;
    if (!ambassadorWallet || ambassadorWallet === winner.walletNormalized) return [];
    return [{
      ambassadorWallet,
      playerWallet: winner.walletNormalized,
      winningGameId: winner.winningGameId,
      amountRaw: formatRawAmount(mulDiv(parseRawAmount(winner.playerRaw), AMBASSADOR_COMMISSION_BPS, BPS)),
      commissionBps: AMBASSADOR_ATTRIBUTION_POLICY.commissionBps,
      source: "weekly_player_prize" as const,
    }];
  });
  const ambassadorAllocated = sumRawAmounts(
    ambassadorPayouts.map((payout) => parseRawAmount(payout.amountRaw)),
  );
  const ambassadorDeferred = sumRawAmounts(
    poolReservations.map((reservation) => parseRawAmount(reservation.ambassadorReserveRaw)),
  );
  if (ambassadorAllocated + ambassadorDeferred > ambassadorReserve) {
    throw new DomainConflictError("Las comisiones weekly exceden su reserva de 0.1 por partida.");
  }
  const ambassadorUndistributed = splitUndistributed(
    formatRawAmount(ambassadorReserve - ambassadorAllocated - ambassadorDeferred),
  );
  const destinations = {
    treasury: validRewardWallet(input.destinations.treasury, "destinations.treasury"),
    marketingDevelopment: validRewardWallet(
      input.destinations.marketingDevelopment,
      "destinations.marketingDevelopment",
    ),
    supplyReduction: validRewardWallet(
      input.destinations.supplyReduction,
      "destinations.supplyReduction",
    ),
  };
  if (new Set(Object.values(destinations)).size !== 3) {
    throw new DomainValidationError("Los tres destinos contables deben ser distintos.");
  }
  const lotteryEntropyHash = stableRewardHash({ periodId, lotteryEntropy });
  const allocationDrafts = new Map<string, Omit<RewardAccountingAllocation, "allocationId">>();
  const appendAllocation = (draft: Omit<RewardAccountingAllocation, "allocationId">) => {
    if (parseRawAmount(draft.amountRaw) === BigInt(0)) return;
    const key = `${draft.category}:${draft.walletNormalized}`;
    const current = allocationDrafts.get(key);
    allocationDrafts.set(key, {
      ...draft,
      amountRaw: formatRawAmount(
        (current ? parseRawAmount(current.amountRaw) : BigInt(0)) + parseRawAmount(draft.amountRaw),
      ),
      sourceIds: [...new Set([...(current?.sourceIds ?? []), ...draft.sourceIds])]
        .sort(compareRewardText),
    });
  };
  for (const winner of winners) appendAllocation({
    walletNormalized: winner.walletNormalized,
    category: "player",
    amountRaw: winner.playerRaw,
    fundingMode: "reserved_no_mint",
    sourceIds: sourceDailyAccountingIds,
  });
  for (const payout of ambassadorPayouts) appendAllocation({
    walletNormalized: payout.ambassadorWallet,
    category: "ambassador_weekly",
    amountRaw: payout.amountRaw,
    fundingMode: "reserved_no_mint",
    sourceIds: sourceDailyAccountingIds,
  });
  const totalDestination = {
    treasuryRaw: formatRawAmount(
      parseRawAmount(undistributed.treasuryRaw)
        + parseRawAmount(ambassadorUndistributed.treasuryRaw),
    ),
    marketingDevelopmentRaw: formatRawAmount(
      parseRawAmount(undistributed.marketingDevelopmentRaw)
        + parseRawAmount(ambassadorUndistributed.marketingDevelopmentRaw),
    ),
    supplyReductionRaw: formatRawAmount(
      parseRawAmount(undistributed.supplyReductionRaw)
        + parseRawAmount(ambassadorUndistributed.supplyReductionRaw),
    ),
  };
  appendAllocation({ walletNormalized: destinations.treasury, category: "treasury", amountRaw: totalDestination.treasuryRaw, fundingMode: "reserved_no_mint", sourceIds: sourceDailyAccountingIds });
  appendAllocation({ walletNormalized: destinations.marketingDevelopment, category: "marketing_development", amountRaw: totalDestination.marketingDevelopmentRaw, fundingMode: "reserved_no_mint", sourceIds: sourceDailyAccountingIds });
  appendAllocation({ walletNormalized: destinations.supplyReduction, category: "supply_reduction", amountRaw: totalDestination.supplyReductionRaw, fundingMode: "reserved_no_mint", sourceIds: sourceDailyAccountingIds });
  const allocations = [...allocationDrafts.values()].map((draft) => ({
    allocationId: stableRewardHash({ kind: "reward-weekly-allocation", periodId, ...draft }),
    ...draft,
  })).sort((left, right) => compareRewardText(left.allocationId, right.allocationId));
  const payload = {
    periodId,
    ruleVersion,
    ruleConfigHash,
    fundingMode: "reserved_no_mint" as const,
    sourceDailyAccountingIds,
    potRaw: formatRawAmount(pot),
    ambassadorReserveRaw: formatRawAmount(ambassadorReserve),
    winners,
    poolReservations,
    poolTrancheSchedule,
    ambassadorPayouts,
    playerAllocatedRaw: formatRawAmount(playerAllocated),
    poolReservedRaw: formatRawAmount(poolReserved),
    allocatedRaw: formatRawAmount(playerAllocated + poolReserved),
    ambassadorAllocatedRaw: formatRawAmount(ambassadorAllocated),
    ambassadorDeferredRaw: formatRawAmount(ambassadorDeferred),
    undistributed,
    ambassadorUndistributed,
    destinations,
    allocations,
    conservationRaw: formatRawAmount(pot + ambassadorReserve),
    lotteryEntropy,
    lotteryEntropyHash,
    payoutAt,
  };
  return assertWeeklyPrizeAccountingIntegrity({
    _id: `reward-weekly:${periodId}`,
    ...payload,
    payloadHash: stableRewardHash(payload),
    status: "sealed",
    sealedAt,
  });
}

export function assertWeeklyPrizeAccountingIntegrity(
  accounting: WeeklyPrizeAccounting,
): WeeklyPrizeAccounting {
  const periodId = validRewardText(accounting.periodId, "periodId");
  validRewardText(accounting.ruleVersion, "ruleVersion");
  canonicalEvidenceHash(accounting.ruleConfigHash, "ruleConfigHash");
  const payoutAt = validRewardDate(accounting.payoutAt, "payoutAt");
  const payoutMonday = new Date(Date.UTC(
    payoutAt.getUTCFullYear(), payoutAt.getUTCMonth(), payoutAt.getUTCDate(),
  ));
  if (
    payoutMonday.getUTCDay() !== 1
    || payoutAt.getUTCHours() !== 17
    || payoutAt.getUTCMinutes() !== 0
    || payoutAt.getUTCSeconds() !== 0
    || payoutAt.getUTCMilliseconds() !== 0
  ) {
    throw new DomainConflictError("El accounting weekly no contiene un payout canonico.");
  }
  const periodMonday = new Date(payoutMonday.getTime() - WEEK_MS);
  if (getIsoWeekPeriodId(periodMonday) !== periodId) {
    throw new DomainConflictError("El accounting weekly no coincide con su periodo ISO.");
  }
  const expectedSourceIds = Array.from({ length: 7 }, (_, index) =>
    `reward-daily:${new Date(periodMonday.getTime() + index * DAY_MS).toISOString().slice(0, 10)}`);
  if (
    accounting.sourceDailyAccountingIds.length !== 7
    || accounting.sourceDailyAccountingIds.some((id, index) => id !== expectedSourceIds[index])
  ) {
    throw new DomainConflictError("El accounting weekly no conserva sus siete cierres canonicos.");
  }
  const expectedSchedule = Array.from({ length: 7 }, (_, index) =>
    new Date(payoutMonday.getTime() + (index + 1) * DAY_MS + 16 * 60 * 60_000));
  if (
    accounting.poolTrancheSchedule.length !== 7
    || accounting.poolTrancheSchedule.some((scheduledAt, index) =>
      validRewardDate(scheduledAt, `poolTrancheSchedule[${index}]`).getTime()
        !== expectedSchedule[index].getTime())
  ) {
    throw new DomainConflictError("El accounting weekly no conserva el calendario de siete tramos.");
  }
  const reservationPools = new Set<string>();
  for (const reservation of accounting.poolReservations) {
    if (!["credit", "cukie_original", "cukie_second_plus"].includes(reservation.pool)) {
      throw new DomainConflictError(`El pool weekly ${reservation.pool} no es canonico.`);
    }
    if (reservationPools.has(reservation.pool)) {
      throw new DomainConflictError(`El pool weekly ${reservation.pool} esta duplicado.`);
    }
    reservationPools.add(reservation.pool);
    const amount = canonicalRaw(reservation.amountRaw, `${reservation.pool}.amountRaw`);
    const ambassador = canonicalRaw(
      reservation.ambassadorReserveRaw,
      `${reservation.pool}.ambassadorReserveRaw`,
    );
    if (
      amount === BigInt(0)
      || ambassador !== mulDiv(amount, AMBASSADOR_COMMISSION_BPS, BPS)
      || reservation.sourceWinningGameIds.length === 0
      || new Set(reservation.sourceWinningGameIds).size !== reservation.sourceWinningGameIds.length
      || reservation.sourceWinningGameIds.some((id, index) =>
        validRewardText(id, `${reservation.pool}.sourceWinningGameIds[${index}]`) !== id)
      || [...reservation.sourceWinningGameIds].sort(compareRewardText)
        .some((id, index) => id !== reservation.sourceWinningGameIds[index])
    ) {
      throw new DomainConflictError(`La reserva weekly de ${reservation.pool} no es canonica.`);
    }
    if (reservation.tranches.length !== 7) {
      throw new DomainConflictError(`El pool weekly ${reservation.pool} no contiene siete tramos.`);
    }
    const expectedAmountTranches = splitIntoSevenTranches(reservation.amountRaw);
    const expectedAmbassadorTranches = splitIntoSevenTranches(reservation.ambassadorReserveRaw);
    let trancheAmount = BigInt(0);
    let trancheAmbassador = BigInt(0);
    reservation.tranches.forEach((tranche, index) => {
      if (
        tranche.tranche !== index
        || validRewardDate(tranche.scheduledAt, `${reservation.pool}.tranches[${index}].scheduledAt`)
          .getTime() !== expectedSchedule[index].getTime()
        || tranche.amountRaw !== expectedAmountTranches[index]
        || tranche.ambassadorReserveRaw !== expectedAmbassadorTranches[index]
      ) {
        throw new DomainConflictError(`El tramo ${index} de ${reservation.pool} no es canonico.`);
      }
      trancheAmount += canonicalRaw(tranche.amountRaw, `${reservation.pool}.tranches[${index}].amountRaw`);
      trancheAmbassador += canonicalRaw(
        tranche.ambassadorReserveRaw,
        `${reservation.pool}.tranches[${index}].ambassadorReserveRaw`,
      );
    });
    if (trancheAmount !== amount || trancheAmbassador !== ambassador) {
      throw new DomainConflictError(`Los siete tramos de ${reservation.pool} no conservan su reserva.`);
    }
  }
  const poolReserved = sumRawAmounts(
    accounting.poolReservations.map((reservation) => parseRawAmount(reservation.amountRaw)),
  );
  const ambassadorDeferred = sumRawAmounts(
    accounting.poolReservations.map((reservation) =>
      parseRawAmount(reservation.ambassadorReserveRaw)),
  );
  if (
    poolReserved !== parseRawAmount(accounting.poolReservedRaw)
    || ambassadorDeferred !== parseRawAmount(accounting.ambassadorDeferredRaw)
    || parseRawAmount(accounting.allocatedRaw) + parseRawAmount(accounting.undistributed.totalRaw)
      !== parseRawAmount(accounting.potRaw)
    || parseRawAmount(accounting.ambassadorAllocatedRaw)
      + ambassadorDeferred
      + parseRawAmount(accounting.ambassadorUndistributed.totalRaw)
      !== parseRawAmount(accounting.ambassadorReserveRaw)
    || parseRawAmount(accounting.conservationRaw)
      !== parseRawAmount(accounting.potRaw) + parseRawAmount(accounting.ambassadorReserveRaw)
    || accounting.lotteryEntropyHash
      !== stableRewardHash({ periodId, lotteryEntropy: accounting.lotteryEntropy })
  ) {
    throw new DomainConflictError("El accounting weekly no conserva sus reservas.");
  }
  if (
    accounting._id !== `reward-weekly:${periodId}`
    || accounting.status !== "sealed"
    || accounting.fundingMode !== "reserved_no_mint"
    || validRewardDate(accounting.sealedAt, "sealedAt").getTime()
      < validRewardDate(accounting.lotteryEntropy.confirmedAt, "lotteryEntropy.confirmedAt").getTime()
  ) {
    throw new DomainConflictError("El accounting weekly no esta sellado de forma canonica.");
  }
  const { _id, payloadHash, status, sealedAt, ...payload } = accounting;
  if (stableRewardHash(payload) !== payloadHash) {
    throw new DomainConflictError("El accounting weekly almacenado diverge de su payload sellado.");
  }
  return accounting;
}

export function selectStoredWeeklyPoolTranche(
  accounting: WeeklyPrizeAccounting,
  scheduledAt: Date,
): PriorWeeklyPoolTranche | null {
  const sealed = assertWeeklyPrizeAccountingIntegrity(accounting);
  const canonicalScheduledAt = validRewardDate(scheduledAt, "scheduledAt");
  const tranche = sealed.poolTrancheSchedule.findIndex((at) =>
    at.getTime() === canonicalScheduledAt.getTime());
  if (tranche < 0) return null;
  const value = (pool: "credit" | "cukie_original" | "cukie_second_plus") => {
    const row = sealed.poolReservations.find((reservation) => reservation.pool === pool);
    const stored = row?.tranches[tranche];
    return {
      amount: stored?.amountRaw ?? "0",
      ambassador: stored?.ambassadorReserveRaw ?? "0",
    };
  };
  const credit = value("credit");
  const original = value("cukie_original");
  const second = value("cukie_second_plus");
  return {
    weeklyAccountingId: sealed._id,
    creditPoolRaw: credit.amount,
    creditPoolAmbassadorRaw: credit.ambassador,
    cukiePoolOriginalRaw: original.amount,
    cukiePoolOriginalAmbassadorRaw: original.ambassador,
    cukiePoolSecondPlusRaw: second.amount,
    cukiePoolSecondPlusAmbassadorRaw: second.ambassador,
  };
}

export function weeklySettlementSchedule(periodMondayUtc: Date) {
  const monday = validRewardDate(periodMondayUtc, "periodMondayUtc");
  if (
    monday.getUTCDay() !== 1 || monday.getUTCHours() !== 0 || monday.getUTCMinutes() !== 0
    || monday.getUTCSeconds() !== 0 || monday.getUTCMilliseconds() !== 0
  ) {
    throw new DomainValidationError("periodMondayUtc debe ser lunes a las 00:00 UTC.");
  }
  return {
    playerPayoutAt: new Date(monday.getTime() + WEEK_MS + 17 * 60 * 60 * 1_000),
    trancheAt: Array.from({ length: 7 }, (_, index) =>
      new Date(monday.getTime() + (index + 8) * DAY_MS + 16 * 60 * 60 * 1_000)),
  };
}

export function splitIntoSevenTranches(totalRaw: string) {
  const total = canonicalRaw(totalRaw, "totalRaw");
  const quotient = total / BigInt(7);
  const remainder = Number(total % BigInt(7));
  return Array.from({ length: 7 }, (_, index) =>
    formatRawAmount(quotient + (index < remainder ? BigInt(1) : BigInt(0))));
}

export function calculatePoolTranche(input: {
  rule: RewardRule;
  periodId: string;
  tranche: number;
  participantWallet: string;
  ambassadorWallet?: string;
  credits: number;
  ordinaryRaw: string;
  priorPeriodRaw: string;
  ordinarySourceId: string;
  priorPeriodSourceId: string;
  scheduledAt: Date;
  sealedAt: Date;
}): PoolTrancheAccounting {
  assertRewardRule(input.rule);
  if (!Number.isInteger(input.tranche) || input.tranche < 0 || input.tranche > 6) {
    throw new DomainValidationError("tranche debe estar entre 0 y 6.");
  }
  const floorStep = input.rule.creditPoolDaily.floorCreditsStep;
  if (
    !Number.isSafeInteger(input.credits)
    || input.credits < 0
    || input.credits % floorStep !== 0
  ) {
    throw new DomainValidationError(`credits debe ser multiplo de ${floorStep}.`);
  }
  const participantWallet = validRewardWallet(input.participantWallet, "participantWallet");
  const ambassadorWallet = input.ambassadorWallet
    ? validRewardWallet(input.ambassadorWallet, "ambassadorWallet")
    : undefined;
  if (ambassadorWallet === participantWallet) {
    throw new DomainValidationError("La autorreferencia no genera comision.");
  }
  const ordinary = canonicalRaw(input.ordinaryRaw, "ordinaryRaw");
  const priorSeventh = canonicalRaw(splitIntoSevenTranches(input.priorPeriodRaw)[input.tranche], "priorPeriodSeventhRaw");
  const base = ordinary + priorSeventh;
  const guaranteed = input.rule.creditPoolDaily.floorEnabled
    ? BigInt(input.credits / floorStep)
      * parseRawAmount(input.rule.creditPoolDaily.floorAmountRaw)
    : BigInt(0);
  const payment = base > guaranteed ? base : guaranteed;
  const topup = payment - base;
  const commission = ambassadorWallet ? mulDiv(payment, AMBASSADOR_COMMISSION_BPS, BPS) : BigInt(0);
  const payload = {
    periodId: validRewardText(input.periodId, "periodId"),
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    tranche: input.tranche,
    participantWallet,
    fundingMode: "reserved_no_mint" as const,
    ordinarySourceId: validRewardText(input.ordinarySourceId, "ordinarySourceId"),
    priorPeriodSourceId: validRewardText(input.priorPeriodSourceId, "priorPeriodSourceId"),
    credits: input.credits,
    ordinaryRaw: formatRawAmount(ordinary),
    priorPeriodSeventhRaw: formatRawAmount(priorSeventh),
    guaranteedRaw: formatRawAmount(guaranteed),
    paymentRaw: formatRawAmount(payment),
    topupRaw: formatRawAmount(topup),
    ...(ambassadorWallet ? { ambassadorWallet } : {}),
    ambassadorCommissionRaw: formatRawAmount(commission),
    ambassadorCommissionSource: "pool_payment_non_recursive" as const,
    fundingRaw: formatRawAmount(payment + commission),
    scheduledAt: validRewardDate(input.scheduledAt, "scheduledAt"),
  };
  return {
    _id: `reward-pool-tranche:${payload.periodId}:${input.tranche}:${participantWallet}`,
    ...payload,
    payloadHash: stableRewardHash(payload),
    status: "sealed",
    sealedAt: validRewardDate(input.sealedAt, "sealedAt"),
  };
}

export function excludeSeikuFromCukiePool(
  candidates: readonly CukiePoolCandidate[],
): CukiePoolEligibilityResult {
  const eligible: CukiePoolEligibilityResult["eligible"] = [];
  let undistributed = BigInt(0);
  for (const candidate of candidates) {
    const amount = canonicalRaw(candidate.amountRaw, "amountRaw");
    const walletNormalized = validRewardWallet(candidate.wallet);
    if (candidate.isSeiku) undistributed += amount;
    else eligible.push({ walletNormalized, amountRaw: formatRawAmount(amount) });
  }
  return { eligible, undistributedRaw: formatRawAmount(undistributed) };
}
