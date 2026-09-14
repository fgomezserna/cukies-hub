import type { CreditLot } from './types';

/**
 * Estado explícito de las proyecciones derivadas de lotes.
 *
 * `unknown` no debe convertirse en cero: significa que el dato autoritativo
 * no se pudo interpretar de forma segura. `stale` identifica una proyección
 * numéricamente válida que ya no coincide con sus lotes.
 */
export type CreditMaterializationState =
  | 'ready'
  | 'blocked'
  | 'unknown'
  | 'too_large'
  | 'stale';

export type CreditLotAccounting = Pick<
  CreditLot,
  | 'totalCredits'
  | 'poolDepositedCredits'
  | 'availableCredits'
  | 'reservedCredits'
  | 'spentCredits'
  | 'expiredCredits'
>;

export type CreditLotAccountingTotals = CreditLotAccounting;

export type CreditLotAccountingInspection =
  | { state: 'ready'; accounting: CreditLotAccounting }
  | { state: 'blocked'; accounting: CreditLotAccounting }
  | { state: 'unknown' };

const ACCOUNTING_FIELDS: readonly (keyof CreditLotAccounting)[] = [
  'totalCredits',
  'poolDepositedCredits',
  'availableCredits',
  'reservedCredits',
  'spentCredits',
  'expiredCredits',
];

export const EMPTY_CREDIT_LOT_ACCOUNTING: CreditLotAccountingTotals = {
  totalCredits: 0,
  poolDepositedCredits: 0,
  availableCredits: 0,
  reservedCredits: 0,
  spentCredits: 0,
  expiredCredits: 0,
};

function isSafeCredit(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function cloneAccounting(accounting: CreditLotAccounting): CreditLotAccounting {
  return { ...accounting };
}

/**
 * Lee solo los campos económicos que se consideran autoritativos en un lote.
 * Se acepta `unknown` deliberadamente para no confundir documentos antiguos o
 * incompletos con saldos de cero.
 */
export function inspectCreditLotAccounting(value: unknown): CreditLotAccountingInspection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { state: 'unknown' };
  }
  const record = value as Record<string, unknown>;
  if (!ACCOUNTING_FIELDS.every((field) => isSafeCredit(record[field]))) {
    return { state: 'unknown' };
  }
  const accounting = Object.fromEntries(
    ACCOUNTING_FIELDS.map((field) => [field, record[field]]),
  ) as CreditLotAccounting;
  if (record.blocked !== false) {
    return record.blocked === true
      ? { state: 'blocked', accounting }
      : { state: 'unknown' };
  }
  return { state: 'ready', accounting };
}

function mergeIssue(
  current: Exclude<CreditMaterializationState, 'ready' | 'stale' | 'too_large'> | null,
  next: 'blocked' | 'unknown',
) {
  // Any unknown field has priority over an explicit blocked marker. Both are
  // fail-closed, but retaining `unknown` is important for observability.
  if (current === 'unknown' || next === 'unknown') return 'unknown' as const;
  return next;
}

/**
 * Aggrega los lotes de una cuenta o del pool con un límite duro. No lanza por
 * documentos malformados: devuelve un estado que el consumidor puede
 * publicar como no verificable.
 */
export function materializeCreditLots(
  lots: readonly unknown[],
  maxDocuments: number,
): { state: CreditMaterializationState; totals: CreditLotAccountingTotals } {
  if (lots.length > maxDocuments) {
    return { state: 'too_large', totals: { ...EMPTY_CREDIT_LOT_ACCOUNTING } };
  }
  const totals = { ...EMPTY_CREDIT_LOT_ACCOUNTING };
  let issue: 'blocked' | 'unknown' | null = null;
  for (const lot of lots) {
    const inspected = inspectCreditLotAccounting(lot);
    if (inspected.state !== 'ready') {
      issue = mergeIssue(issue, inspected.state);
    }
    if (inspected.state === 'unknown') continue;
    for (const field of ACCOUNTING_FIELDS) {
      const next = totals[field] + inspected.accounting[field];
      if (!Number.isSafeInteger(next)) {
        issue = 'unknown';
        break;
      }
      totals[field] = next;
    }
  }
  return {
    state: issue ?? 'ready',
    totals: cloneAccounting(totals),
  };
}

export function materializationStateRank(state: CreditMaterializationState) {
  switch (state) {
    case 'ready': return 0;
    case 'stale': return 1;
    case 'blocked': return 2;
    case 'unknown': return 3;
    case 'too_large': return 4;
  }
}

export function worseMaterializationState(
  left: CreditMaterializationState,
  right: CreditMaterializationState,
) {
  return materializationStateRank(left) >= materializationStateRank(right)
    ? left
    : right;
}
