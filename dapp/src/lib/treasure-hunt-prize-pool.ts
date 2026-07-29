export const TREASURE_HUNT_POOL_ASM_THRESHOLD = 3_500;
export const TREASURE_HUNT_FALLBACK_UKI_PER_ASM = 888;

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

export function formatTreasureHuntPrizePoolUki(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';

  return `${value.toLocaleString('es-ES', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} UKI`;
}
