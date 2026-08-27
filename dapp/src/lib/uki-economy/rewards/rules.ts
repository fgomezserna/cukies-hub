import "server-only";

import { createHash } from "node:crypto";
import { getAddress, isAddress } from "viem";

import { DomainValidationError } from "../errors";
import { formatRawAmount, mulDiv, parseRawAmount } from "../money";
import {
  REWARD_BPS_DENOMINATOR,
  REWARD_RULE_SCOPE,
  type RewardAccrualDraft,
  type RewardAllocationDraft,
  type RewardRule,
} from "./types";

const MAX_TEXT_LENGTH = 256;
const MAX_TOKEN_DECIMALS = 36;

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareRewardText(left, right))
        .map(([key, child]) => [key.normalize("NFC"), stableValue(child)])
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function compareRewardText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableRewardHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function validRewardText(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} debe ser texto.`);
  }
  const normalized = value.trim().normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TEXT_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(normalized)
  ) {
    throw new DomainValidationError(`${label} no tiene un formato permitido.`);
  }
  return normalized;
}

export function validRewardDate(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError(`${label} debe ser una fecha valida.`);
  }
  return new Date(value.getTime());
}

export function validRewardWallet(value: unknown, label = "wallet") {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new DomainValidationError(`${label} debe ser una direccion EVM valida.`);
  }
  const checksummed = getAddress(value);
  if (/^0x0{40}$/i.test(checksummed)) {
    throw new DomainValidationError(`${label} no puede ser la direccion cero.`);
  }
  return checksummed.toLowerCase();
}

function boundedInteger(value: unknown, label: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new DomainValidationError(`${label} debe ser un entero entre ${min} y ${max}.`);
  }
  return value as number;
}

function exactBpsSum(values: number[], label: string) {
  values.forEach((value, index) =>
    boundedInteger(value, `${label}[${index}]`, 0, REWARD_BPS_DENOMINATOR)
  );
  if (values.reduce((sum, value) => sum + value, 0) !== REWARD_BPS_DENOMINATOR) {
    throw new DomainValidationError(`${label} debe sumar exactamente 10000 bps.`);
  }
}

export function buildRewardRuleConfigHash(rule: RewardRule) {
  return stableRewardHash({
    scope: rule.scope,
    version: rule.version,
    active: rule.active,
    activeFrom: rule.activeFrom,
    activeUntil: rule.activeUntil,
    tokenDecimals: rule.tokenDecimals,
    runCredits: rule.runCredits,
    settlementBps: rule.settlementBps,
    rankingPlayerBps: Object.fromEntries(
      Object.entries(rule.rankingPlayerBps).sort(([left], [right]) =>
        compareRewardText(left, right)
      )
    ),
    creditPoolDaily: rule.creditPoolDaily,
    emissionBudget: rule.emissionBudget,
    cukiePool: rule.cukiePool,
    undistributedBps: rule.undistributedBps,
    destinations: Object.fromEntries(
      Object.entries(rule.destinations)
        .sort(([left], [right]) => compareRewardText(left, right))
        .map(([key, value]) => [key, validRewardWallet(value, `destinations.${key}`)])
    ),
  });
}

export function assertRewardRule(rule: RewardRule, at?: Date) {
  if (!rule || rule.scope !== REWARD_RULE_SCOPE) {
    throw new DomainValidationError("La regla no pertenece a reward_allocations.");
  }
  if (validRewardText(rule._id, "rule._id") !== rule._id) {
    throw new DomainValidationError("rule._id no es canonico.");
  }
  if (validRewardText(rule.version, "rule.version") !== rule.version) {
    throw new DomainValidationError("rule.version no es canonico.");
  }
  if (typeof rule.active !== "boolean") {
    throw new DomainValidationError("rule.active debe ser boolean.");
  }
  validRewardDate(rule.activeFrom, "rule.activeFrom");
  if (rule.activeUntil) {
    validRewardDate(rule.activeUntil, "rule.activeUntil");
    if (rule.activeUntil.getTime() <= rule.activeFrom.getTime()) {
      throw new DomainValidationError("rule.activeUntil debe ser posterior a activeFrom.");
    }
  }
  boundedInteger(rule.tokenDecimals, "rule.tokenDecimals", 0, MAX_TOKEN_DECIMALS);
  if (rule.tokenDecimals !== 18) {
    throw new DomainValidationError("UKI rewards debe usar exactamente 18 decimales.");
  }
  const scale = boundedInteger(rule.runCredits.unitScale, "runCredits.unitScale", 1, 1_000);
  boundedInteger(rule.runCredits.totalUnits, "runCredits.totalUnits", 1, 1_000_000);
  boundedInteger(
    rule.runCredits.weeklyReserveUnits,
    "runCredits.weeklyReserveUnits",
    0,
    rule.runCredits.totalUnits
  );
  boundedInteger(
    rule.runCredits.ambassadorReserveUnits,
    "runCredits.ambassadorReserveUnits",
    0,
    rule.runCredits.totalUnits
  );
  const hasAmbassadorSplit =
    rule.runCredits.ambassadorOrdinaryUnits !== undefined ||
    rule.runCredits.ambassadorWeeklyUnits !== undefined;
  if (hasAmbassadorSplit) {
    boundedInteger(
      rule.runCredits.ambassadorOrdinaryUnits,
      "runCredits.ambassadorOrdinaryUnits",
      0,
      rule.runCredits.totalUnits
    );
    boundedInteger(
      rule.runCredits.ambassadorWeeklyUnits,
      "runCredits.ambassadorWeeklyUnits",
      0,
      rule.runCredits.totalUnits
    );
  }
  boundedInteger(
    rule.runCredits.convertibleUnits,
    "runCredits.convertibleUnits",
    0,
    rule.runCredits.totalUnits
  );
  if (
    rule.runCredits.totalUnits !== 10 * scale ||
    rule.runCredits.weeklyReserveUnits
      + rule.runCredits.ambassadorReserveUnits
      + rule.runCredits.convertibleUnits !==
      rule.runCredits.totalUnits ||
    rule.runCredits.weeklyReserveUnits * 5 !== rule.runCredits.totalUnits ||
    rule.runCredits.ambassadorReserveUnits * 20 !== rule.runCredits.totalUnits ||
    (hasAmbassadorSplit &&
      (rule.runCredits.ambassadorOrdinaryUnits! +
          rule.runCredits.ambassadorWeeklyUnits! !==
        rule.runCredits.ambassadorReserveUnits ||
        rule.runCredits.ambassadorOrdinaryUnits! * 25 !==
          rule.runCredits.totalUnits ||
        rule.runCredits.ambassadorWeeklyUnits! * 100 !==
          rule.runCredits.totalUnits)) ||
    rule.runCredits.convertibleUnits * 4 !== rule.runCredits.totalUnits * 3
  ) {
    throw new DomainValidationError(
      "runCredits debe representar 10 creditos y separar exactamente 2/0.5/7.5; V3 divide 0.5 en 0.4/0.1."
    );
  }
  boundedInteger(rule.settlementBps.poolCredits, "settlementBps.poolCredits", 0, 10_000);
  boundedInteger(
    rule.settlementBps.poolCukieWithOwnCredits,
    "settlementBps.poolCukieWithOwnCredits",
    0,
    10_000
  );
  boundedInteger(
    rule.settlementBps.poolCukieWithPoolCredits,
    "settlementBps.poolCukieWithPoolCredits",
    0,
    10_000
  );
  if (
    rule.settlementBps.poolCredits +
      rule.settlementBps.poolCukieWithPoolCredits >
    REWARD_BPS_DENOMINATOR
  ) {
    throw new DomainValidationError("Los bps de settlement prestado exceden 10000.");
  }
  for (let rank = 1; rank <= 9; rank += 1) {
    boundedInteger(rule.rankingPlayerBps[String(rank)], `rankingPlayerBps.${rank}`, 0, 10_000);
  }
  if (Object.keys(rule.rankingPlayerBps).some((key) => !/^[1-9]$/.test(key))) {
    throw new DomainValidationError("rankingPlayerBps solo admite rankings 1-9.");
  }
  boundedInteger(rule.creditPoolDaily.sourceShareBps, "creditPoolDaily.sourceShareBps", 0, 10_000);
  if (typeof rule.creditPoolDaily.floorEnabled !== "boolean") {
    throw new DomainValidationError("creditPoolDaily.floorEnabled debe ser boolean.");
  }
  boundedInteger(rule.creditPoolDaily.floorCreditsStep, "creditPoolDaily.floorCreditsStep", 1, 10_000);
  parseRawAmount(rule.creditPoolDaily.floorAmountRaw);
  if (
    rule.creditPoolDaily.floorEnabled &&
    parseRawAmount(rule.creditPoolDaily.floorAmountRaw) === BigInt(0)
  ) {
    throw new DomainValidationError("El floor habilitado debe tener un monto positivo.");
  }
  if (!rule.creditPoolDaily.floorEnabled && parseRawAmount(rule.creditPoolDaily.floorAmountRaw) !== BigInt(0)) {
    throw new DomainValidationError("El floor deshabilitado debe tener floorAmountRaw=0.");
  }
  const emissionBudget = rule.emissionBudget;
  if (!emissionBudget || typeof emissionBudget !== "object") {
    throw new DomainValidationError("emissionBudget es obligatorio.");
  }
  validRewardDate(emissionBudget.programStartsAt, "emissionBudget.programStartsAt");
  boundedInteger(
    emissionBudget.dayBoundarySecondUtc,
    "emissionBudget.dayBoundarySecondUtc",
    0,
    86_399,
  );
  boundedInteger(
    emissionBudget.lateReservationGraceSeconds,
    "emissionBudget.lateReservationGraceSeconds",
    0,
    604_800,
  );
  const dailyCapRaw = formatRawAmount(parseRawAmount(emissionBudget.dailyCapRaw));
  const lifetimeCapRaw = formatRawAmount(parseRawAmount(emissionBudget.lifetimeCapRaw));
  if (
    dailyCapRaw !== emissionBudget.dailyCapRaw
    || lifetimeCapRaw !== emissionBudget.lifetimeCapRaw
  ) {
    throw new DomainValidationError("Los caps de emissionBudget deben usar raw canonico.");
  }
  if (
    parseRawAmount(dailyCapRaw) <= BigInt(0)
    || parseRawAmount(lifetimeCapRaw) <= BigInt(0)
    || parseRawAmount(dailyCapRaw) > parseRawAmount(lifetimeCapRaw)
  ) {
    throw new DomainValidationError(
      "emissionBudget exige caps positivos y dailyCapRaw <= lifetimeCapRaw.",
    );
  }
  if (
    emissionBudget.unusedDailyCapacity !== "expires" &&
    emissionBudget.unusedDailyCapacity !== "materialize_undistributed"
  ) {
    throw new DomainValidationError("unusedDailyCapacity no es una politica soportada.");
  }
  if (emissionBudget.overflowPolicy !== "block") {
    throw new DomainValidationError("overflowPolicy debe ser block en rewards v1.");
  }
  if (rule.cukiePool.cumulativeTierCount !== 6) {
    throw new DomainValidationError("El pool de Cukies debe tener seis tramos acumulativos.");
  }
  if (
    !Array.isArray(rule.cukiePool.cumulativeTierBps)
    || rule.cukiePool.cumulativeTierBps.length !== rule.cukiePool.cumulativeTierCount
  ) {
    throw new DomainValidationError("El pool de Cukies debe definir seis pesos acumulativos.");
  }
  exactBpsSum([...rule.cukiePool.cumulativeTierBps], "cukiePool.cumulativeTierBps");
  if (rule.cukiePool.cumulativeTierBps.some((weight) => weight === 0)) {
    throw new DomainValidationError("Los seis pesos acumulativos del Cukie Pool deben ser positivos.");
  }
  exactBpsSum(
    [
      rule.undistributedBps.treasury,
      rule.undistributedBps.marketing,
      rule.undistributedBps.development,
      rule.undistributedBps.marketingDevelopment ?? 0,
      rule.undistributedBps.supplyReduction,
    ],
    "undistributedBps"
  );
  if (
    (rule.undistributedBps.marketingDevelopment ?? 0) > 0 &&
    !rule.destinations.marketingDevelopment
  ) {
    throw new DomainValidationError(
      "destinations.marketingDevelopment es obligatorio cuando su peso es positivo."
    );
  }
  Object.entries(rule.destinations).forEach(([key, value]) =>
    validRewardWallet(value, `destinations.${key}`)
  );
  if (!/^[0-9a-f]{64}$/.test(rule.configHash)) {
    throw new DomainValidationError("rule.configHash no es sha256 canonico.");
  }
  if (buildRewardRuleConfigHash(rule) !== rule.configHash) {
    throw new DomainValidationError("rule.configHash no coincide con la configuracion.");
  }
  if (at) {
    const checkedAt = validRewardDate(at, "at");
    if (
      !rule.active ||
      rule.activeFrom.getTime() > checkedAt.getTime() ||
      (rule.activeUntil && rule.activeUntil.getTime() <= checkedAt.getTime())
    ) {
      throw new DomainValidationError("La regla de rewards no esta activa en la fecha indicada.");
    }
  }
  return rule;
}

export function normalizeRewardDrafts(drafts: RewardAllocationDraft[]) {
  if (!Array.isArray(drafts)) {
    throw new DomainValidationError("allocations debe ser una lista.");
  }
  return drafts
    .map((draft) => ({
      walletNormalized: validRewardWallet(draft.walletNormalized),
      category: draft.category,
      amountRaw: formatRawAmount(parseRawAmount(draft.amountRaw)),
    }))
    .filter((draft) => parseRawAmount(draft.amountRaw) > BigInt(0))
    .sort((left, right) =>
      compareRewardText(
        `${left.walletNormalized}:${left.category}`,
        `${right.walletNormalized}:${right.category}`
      )
    );
}

export function normalizeRewardAccrualDrafts(drafts: RewardAccrualDraft[] = []) {
  if (!Array.isArray(drafts)) {
    throw new DomainValidationError("accruals debe ser una lista.");
  }
  const combined = new Map<RewardAccrualDraft["category"], bigint>();
  for (const draft of drafts) {
    if (
      ![
        "weekly_prize_pool",
        "ambassador_program_pending",
        "ambassador_ordinary_pending",
        "ambassador_weekly_pending",
        "credit_pool_weekly",
        "cukie_pool_original_weekly",
        "cukie_pool_second_plus_weekly",
        "undistributed_pending",
      ].includes(draft.category)
    ) {
      throw new DomainValidationError(
        `Categoria de accrual no permitida: ${String(draft.category)}.`,
      );
    }
    const amount = parseRawAmount(draft.amountRaw);
    if (amount === BigInt(0)) continue;
    combined.set(draft.category, (combined.get(draft.category) ?? BigInt(0)) + amount);
  }
  return [...combined.entries()]
    .map(([category, amount]) => ({
      category,
      amountRaw: formatRawAmount(amount),
    }))
    .sort((left, right) => compareRewardText(left.category, right.category));
}

export function apportionRaw<T extends { key: string; weight: bigint }>(
  totalRaw: bigint,
  entries: readonly T[]
) {
  if (totalRaw < BigInt(0)) throw new DomainValidationError("totalRaw no puede ser negativo.");
  if (entries.length === 0) {
    if (totalRaw === BigInt(0)) return [] as Array<T & { amountRaw: bigint }>;
    throw new DomainValidationError("No hay receptores para repartir un monto positivo.");
  }
  const keys = new Set<string>();
  let totalWeight = BigInt(0);
  for (const entry of entries) {
    if (keys.has(entry.key)) throw new DomainValidationError(`Clave duplicada: ${entry.key}.`);
    keys.add(entry.key);
    if (entry.weight <= BigInt(0)) throw new DomainValidationError("Los pesos deben ser positivos.");
    totalWeight += entry.weight;
  }
  const provisional = entries.map((entry) => {
    const product = totalRaw * entry.weight;
    return {
      ...entry,
      amountRaw: product / totalWeight,
      remainder: product % totalWeight,
    };
  });
  let missing = totalRaw - provisional.reduce(
    (sum, entry) => sum + entry.amountRaw,
    BigInt(0)
  );
  const remainderOrder = [...provisional].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return compareRewardText(left.key, right.key);
  });
  for (
    let index = 0;
    missing > BigInt(0);
    index += 1, missing -= BigInt(1)
  ) {
    remainderOrder[index].amountRaw += BigInt(1);
  }
  return provisional.map(({ remainder: _remainder, ...entry }) => entry);
}

export function rawByBps(amountRaw: bigint, bps: number) {
  boundedInteger(bps, "bps", 0, REWARD_BPS_DENOMINATOR);
  return mulDiv(amountRaw, BigInt(bps), BigInt(REWARD_BPS_DENOMINATOR));
}
