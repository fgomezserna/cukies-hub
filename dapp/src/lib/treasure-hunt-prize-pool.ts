export const TREASURE_HUNT_POOL_ASM_THRESHOLD = 3_500;
export const TREASURE_HUNT_FALLBACK_UKI_PER_ASM = 888;
export const TREASURE_HUNT_TOKEN_SCALE = BigInt(10) ** BigInt(18);
export const TREASURE_HUNT_POOL_ASM_THRESHOLD_RAW =
  BigInt(TREASURE_HUNT_POOL_ASM_THRESHOLD) * TREASURE_HUNT_TOKEN_SCALE;

interface TreasureHuntPrizePoolInput {
  readonly totalAsmRaised: number;
  readonly ukiPerAsm?: number | null;
  readonly poolBps?: number | null;
}

export function calculateTreasureHuntPrizePoolUki({
  totalAsmRaised,
  ukiPerAsm = TREASURE_HUNT_FALLBACK_UKI_PER_ASM,
  poolBps = 2_500,
}: TreasureHuntPrizePoolInput) {
  const resolvedUkiPerAsm =
    ukiPerAsm === null ? TREASURE_HUNT_FALLBACK_UKI_PER_ASM : ukiPerAsm;
  const resolvedPoolBps = poolBps === null ? 2_500 : poolBps;

  if (
    !Number.isFinite(totalAsmRaised) ||
    !Number.isFinite(resolvedUkiPerAsm) ||
    !Number.isFinite(resolvedPoolBps) ||
    totalAsmRaised <= TREASURE_HUNT_POOL_ASM_THRESHOLD ||
    resolvedUkiPerAsm <= 0 ||
    resolvedPoolBps <= 0
  ) {
    return 0;
  }

  return (
    (totalAsmRaised - TREASURE_HUNT_POOL_ASM_THRESHOLD) *
    resolvedUkiPerAsm *
    (resolvedPoolBps / 10_000)
  );
}

/**
 * Exact pool calculation for indexed purchases.
 *
 * `totalUkiSoldRaw / totalAsmRaisedRaw` represents the effective presale rate
 * across all purchases, so the first 3,500 ASM can be excluded without using
 * floating point arithmetic. With a fixed rate this is exactly equivalent to
 * `(ASM raised - 3,500) × UKI per ASM × pool percentage`.
 */
export function calculateTreasureHuntPrizePoolRaw(input: {
  readonly totalAsmRaisedRaw: bigint;
  readonly totalUkiSoldRaw: bigint;
  readonly poolBps?: number | null;
}) {
  const poolBps = input.poolBps ?? 2_500;
  if (
    input.totalAsmRaisedRaw <= TREASURE_HUNT_POOL_ASM_THRESHOLD_RAW ||
    input.totalUkiSoldRaw <= BigInt(0) ||
    !Number.isSafeInteger(poolBps) ||
    poolBps <= 0 ||
    poolBps > 10_000
  ) {
    return BigInt(0);
  }

  const eligibleAsmRaw =
    input.totalAsmRaisedRaw - TREASURE_HUNT_POOL_ASM_THRESHOLD_RAW;
  const eligibleUkiRaw =
    (input.totalUkiSoldRaw * eligibleAsmRaw) / input.totalAsmRaisedRaw;

  return (eligibleUkiRaw * BigInt(poolBps)) / BigInt(10_000);
}

export function formatTreasureHuntUkiRaw(
  value: string | bigint | null,
  maximumFractionDigits = 2,
) {
  if (value === null) return '—';

  try {
    const raw = typeof value === 'bigint' ? value : BigInt(value);
    if (raw < BigInt(0)) return '—';
    const fractionDigits = Number.isSafeInteger(maximumFractionDigits)
      ? Math.min(18, Math.max(0, maximumFractionDigits))
      : 2;
    const whole = raw / TREASURE_HUNT_TOKEN_SCALE;
    const remainder = raw % TREASURE_HUNT_TOKEN_SCALE;
    const fractionDivisor =
      BigInt(10) ** BigInt(18 - fractionDigits);
    const displayedFraction =
      fractionDigits > 0 ? remainder / fractionDivisor : BigInt(0);
    const numericValue = Number(whole) + (
      fractionDigits > 0
        ? Number(displayedFraction) / (10 ** fractionDigits)
        : 0
    );
    if (!Number.isFinite(numericValue)) return '—';
    return `${numericValue.toLocaleString('es-ES', {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: 0,
    })} UKI`;
  } catch {
    return '—';
  }
}

export function formatTreasureHuntPrizePoolUki(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';

  return `${value.toLocaleString('es-ES', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} UKI`;
}
