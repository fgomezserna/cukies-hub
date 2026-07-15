import { formatUnits, parseUnits } from 'viem';

import type { PublicLocale } from '@/lib/public-locale';

export const CUKIE_MASTER_PURCHASE_UKI_DECIMALS = 18;
export const CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW = parseUnits(
  '20000',
  CUKIE_MASTER_PURCHASE_UKI_DECIMALS,
);
export const CUKIE_MASTER_PURCHASE_MAX_SLOTS = 5;

export type CukieMasterPurchaseSlotState = 'achieved' | 'next' | 'locked';

export type CukieMasterPurchaseSlot = {
  ordinal: number;
  thresholdRaw: bigint;
  remainingRaw: bigint;
  state: CukieMasterPurchaseSlotState;
};

export type CukieMasterPurchaseProgressModel = {
  achievedSlots: number;
  maxSlots: number;
  requirementPerSlotRaw: bigint;
  slots: CukieMasterPurchaseSlot[];
};

const masterCopyByLocale = {
  es: {
    eyebrow: 'Progreso Cukie Master',
    title: 'Tus rangos por UKI comprados',
    summary: (achieved: number, maximum: number) => `${achieved}/${maximum} rangos`,
    rank: (ordinal: number) => ordinal === 1 ? '1.er rango' : `${ordinal}º rango`,
    target: (amount: string) => `${amount} UKI`,
    achieved: 'Alcanzado',
    achievedBody: (ordinal: number) => ordinal === 1
      ? '¡Felicitaciones! Primer rango de Cukie Master alcanzado.'
      : `¡Felicitaciones! ${ordinal}º rango de Cukie Master alcanzado.`,
    next: 'En progreso',
    nextBody: (amount: string, ordinal: number) => ordinal === 1
      ? `Te faltan ${amount} UKI para alcanzar el rango de Cukie Master.`
      : `Te faltan ${amount} UKI para alcanzar el ${ordinal}º rango de Cukie Master.`,
    locked: 'Pendiente',
    progressLabel: 'Rangos de Cukie Master alcanzados',
  },
  en: {
    eyebrow: 'Cukie Master progress',
    title: 'Your ranks from purchased UKI',
    summary: (achieved: number, maximum: number) => `${achieved}/${maximum} ranks`,
    rank: (ordinal: number) => `Rank ${ordinal}`,
    target: (amount: string) => `${amount} UKI`,
    achieved: 'Reached',
    achievedBody: (ordinal: number) =>
      `Congratulations! Cukie Master rank ${ordinal} reached.`,
    next: 'In progress',
    nextBody: (amount: string, ordinal: number) =>
      `You need ${amount} more UKI to reach Cukie Master rank ${ordinal}.`,
    locked: 'Pending',
    progressLabel: 'Cukie Master ranks reached',
  },
} as const;

const slotClassByState: Record<CukieMasterPurchaseSlotState, string> = {
  achieved:
    'border-[#e45cff]/38 bg-[#e45cff]/[0.08] text-[var(--uki-cream)]',
  next:
    'border-[#f2c34b]/55 bg-[#f2c34b]/[0.09] text-[var(--uki-cream)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
  locked: 'border-white/[0.07] bg-white/[0.018] text-[var(--uki-muted)]',
};

const dotClassByState: Record<CukieMasterPurchaseSlotState, string> = {
  achieved: 'bg-[var(--uki-cyan)]',
  next: 'bg-[var(--uki-gold)]',
  locked: 'bg-white/15',
};

function normalizePurchasedUkiRaw(totalPurchasedRaw: bigint) {
  return totalPurchasedRaw > BigInt(0) ? totalPurchasedRaw : BigInt(0);
}

export function formatUkiRawAmount(valueRaw: bigint, locale: PublicLocale) {
  const value = Number(formatUnits(valueRaw, CUKIE_MASTER_PURCHASE_UKI_DECIMALS));
  if (valueRaw > BigInt(0) && value < 0.0001) {
    return locale === 'en' ? '<0.0001' : '<0,0001';
  }

  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', {
    maximumFractionDigits: 4,
  }).format(value);
}

export function getCukieMasterPurchaseProgress(
  totalPurchasedRaw: bigint,
): CukieMasterPurchaseProgressModel {
  const purchasedRaw = normalizePurchasedUkiRaw(totalPurchasedRaw);
  const achievedSlots = Math.min(
    Number(purchasedRaw / CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW),
    CUKIE_MASTER_PURCHASE_MAX_SLOTS,
  );
  const nextOrdinal = achievedSlots < CUKIE_MASTER_PURCHASE_MAX_SLOTS
    ? achievedSlots + 1
    : null;

  return {
    achievedSlots,
    maxSlots: CUKIE_MASTER_PURCHASE_MAX_SLOTS,
    requirementPerSlotRaw: CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW,
    slots: Array.from({ length: CUKIE_MASTER_PURCHASE_MAX_SLOTS }, (_, index) => {
      const ordinal = index + 1;
      const thresholdRaw = BigInt(ordinal) * CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW;
      const state: CukieMasterPurchaseSlotState = purchasedRaw >= thresholdRaw
        ? 'achieved'
        : ordinal === nextOrdinal
          ? 'next'
          : 'locked';

      return {
        ordinal,
        thresholdRaw,
        state,
        remainingRaw: state === 'next' ? thresholdRaw - purchasedRaw : BigInt(0),
      };
    }),
  };
}

type CukieMasterPurchaseProgressProps = {
  totalPurchasedRaw: bigint;
  locale: PublicLocale;
};

export function CukieMasterPurchaseProgress({
  totalPurchasedRaw,
  locale,
}: CukieMasterPurchaseProgressProps) {
  const copy = masterCopyByLocale[locale];
  const progress = getCukieMasterPurchaseProgress(totalPurchasedRaw);

  return (
    <section className="mt-4 border-t border-white/[0.08] pt-4" aria-labelledby="cukie-master-progress-title">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
            {copy.eyebrow}
          </p>
          <h3
            id="cukie-master-progress-title"
            className="mt-0.5 font-headline text-base font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-lg"
          >
            {copy.title}
          </h3>
        </div>
        <p
          role="progressbar"
          aria-label={copy.progressLabel}
          aria-valuemin={0}
          aria-valuemax={progress.maxSlots}
          aria-valuenow={progress.achievedSlots}
          className="shrink-0 rounded-[6px] border border-white/10 bg-white/[0.035] px-2.5 py-1 font-headline text-xs font-black uppercase text-[var(--uki-gold)]"
        >
          {copy.summary(progress.achievedSlots, progress.maxSlots)}
        </p>
      </div>

      <ol className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-5 md:gap-2">
        {progress.slots.map((slot) => {
          const stateLabel = slot.state === 'achieved'
            ? copy.achieved
            : slot.state === 'next'
              ? copy.next
              : copy.locked;
          const body = slot.state === 'achieved'
            ? copy.achievedBody(slot.ordinal)
            : slot.state === 'next'
              ? copy.nextBody(formatUkiRawAmount(slot.remainingRaw, locale), slot.ordinal)
              : null;

          return (
            <li
              key={slot.ordinal}
              data-state={slot.state}
              aria-current={slot.state === 'next' ? 'step' : undefined}
              className={`min-w-0 rounded-[8px] border px-3 transition-[border-color,background-color,opacity] duration-300 md:min-h-[132px] md:py-3 ${slotClassByState[slot.state]} ${
                slot.state === 'locked' ? 'py-2 opacity-60' : 'py-3'
              } motion-reduce:transition-none`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-headline text-sm font-black uppercase leading-none">
                  {copy.rank(slot.ordinal)}
                </p>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.56rem] font-black uppercase tracking-[0.06em]">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClassByState[slot.state]}`} />
                  {stateLabel}
                </span>
              </div>
              <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                {copy.target(formatUkiRawAmount(slot.thresholdRaw, locale))}
              </p>
              {body ? (
                <p className="mt-2 text-[0.72rem] font-semibold leading-snug sm:text-xs">
                  {body}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
