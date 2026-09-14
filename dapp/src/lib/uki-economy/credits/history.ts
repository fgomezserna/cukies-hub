import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';

import { DomainValidationError } from '../errors';
import { assertCreditAmount } from '../money';
import { validCreditWallet } from './rules';
import type {
  CompetitionCreditLedgerEntry,
  CreditBucket,
  CreditLedgerOperation,
  CreditLot,
  CreditRoute,
  CreditRunItem,
} from './types';

export const CREDIT_HISTORY_PAGE_SIZE = 20;
const MAX_CREDIT_HISTORY_PAGE = 100;

type CreditHistoryAggregateRow = {
  _id: {
    operation: CreditLedgerOperation;
    bucket: CreditBucket;
    logicalId: string;
  };
  amountCredits: number;
  occurredAt: Date;
  periodId: string;
  lotIds: Array<string | null>;
  runItemIds: Array<string | null>;
};

type CreditHistoryTotalRow = {
  _id: {
    operation: CreditLedgerOperation;
    bucket: CreditBucket;
  };
  amountCredits: number;
};

export type PublicCreditHistoryEntry = {
  eventId: string;
  operation: CreditLedgerOperation;
  bucket: CreditBucket;
  amountCredits: number;
  route: CreditRoute | 'mixed' | null;
  slotOrdinal: number | null;
  occurredAt: Date;
  expiresAt: Date | null;
  periodId: string;
};

export type PublicCreditHistory = {
  page: number;
  pageSize: typeof CREDIT_HISTORY_PAGE_SIZE;
  hasMore: boolean;
  totals: {
    receivedCredits: number;
    spentCredits: number;
    poolContributedCredits: number;
    expiredCredits: number;
  };
  nextExpiry: {
    credits: number;
    at: Date;
  } | null;
  entries: PublicCreditHistoryEntry[];
};

function validHistoryPage(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CREDIT_HISTORY_PAGE) {
    throw new DomainValidationError('La pagina del historial de creditos no es valida.');
  }
  return value;
}

function exactHistoryCredits(value: unknown, label: string) {
  if (typeof value !== 'number') {
    throw new DomainValidationError(`${label} no es numerico.`);
  }
  return assertCreditAmount(value);
}

function earliestDate(values: Date[]) {
  if (values.length === 0) return null;
  return new Date(Math.min(...values.map((value) => value.getTime())));
}

function routeFromLots(lots: CreditLot[], runItems: CreditRunItem[]) {
  const routes = new Set<CreditRoute>([
    ...lots.map((lot) => lot.route),
    ...runItems.map((item) => item.slotRoute),
  ]);
  if (routes.size === 0) return null;
  if (routes.size > 1) return 'mixed' as const;
  return [...routes][0];
}

function slotOrdinalFromItems(runItems: CreditRunItem[]) {
  const ordinals = new Set(runItems.map((item) => item.slotOrdinal));
  return ordinals.size === 1 ? [...ordinals][0] : null;
}

function totalFor(
  rows: CreditHistoryTotalRow[],
  operation: CreditLedgerOperation,
  bucket?: CreditBucket,
) {
  return rows
    .filter((row) => row._id.operation === operation && (!bucket || row._id.bucket === bucket))
    .reduce((total, row) => total + exactHistoryCredits(row.amountCredits, `${operation}.amountCredits`), 0);
}

export async function getCompetitionCreditWalletHistory(
  walletAddress: string,
  pageInput = 0,
  nowInput = new Date(),
): Promise<PublicCreditHistory> {
  const walletNormalized = validCreditWallet(walletAddress);
  const page = validHistoryPage(pageInput);
  const now = new Date(nowInput.getTime());
  if (Number.isNaN(now.getTime())) {
    throw new DomainValidationError('La fecha del historial de creditos no es valida.');
  }

  const db = await getEconomyDb();
  const ledger = db.collection<CompetitionCreditLedgerEntry>('competition_credit_ledger');
  const ownLots = db.collection<CreditLot>('competition_credit_lots');
  const match = {
    walletNormalized,
    $nor: [{ operation: 'pool_deposit' as const, bucket: 'pool' as const }],
  };

  const [rows, totalRows, expiringLots] = await Promise.all([
    ledger.aggregate<CreditHistoryAggregateRow>([
      { $match: match },
      {
        $set: {
          logicalId: {
            $ifNull: ['$reservationId', { $ifNull: ['$runItemId', '$ledgerId'] }],
          },
        },
      },
      {
        $group: {
          _id: {
            operation: '$operation',
            bucket: '$bucket',
            logicalId: '$logicalId',
          },
          amountCredits: { $sum: '$amountCredits' },
          occurredAt: { $max: '$createdAt' },
          periodId: { $first: '$periodId' },
          lotIds: { $addToSet: '$lotId' },
          runItemIds: { $addToSet: '$runItemId' },
        },
      },
      { $sort: { occurredAt: -1, '_id.logicalId': -1 } },
      { $skip: page * CREDIT_HISTORY_PAGE_SIZE },
      { $limit: CREDIT_HISTORY_PAGE_SIZE + 1 },
    ]).toArray(),
    ledger.aggregate<CreditHistoryTotalRow>([
      { $match: match },
      {
        $group: {
          _id: { operation: '$operation', bucket: '$bucket' },
          amountCredits: { $sum: '$amountCredits' },
        },
      },
    ]).toArray(),
    ownLots.find({
      walletNormalized,
      blocked: false,
      availableCredits: { $gt: 0 },
      expiresAt: { $gt: now },
    }).sort({ expiresAt: 1, createdAt: 1, _id: 1 }).limit(1_001).toArray(),
  ]);

  if (expiringLots.length > 1_000) {
    throw new DomainValidationError('La wallet excede el limite de lotes de creditos activos.');
  }

  const pageRows = rows.slice(0, CREDIT_HISTORY_PAGE_SIZE);
  const lotIds = [...new Set(pageRows.flatMap((row) => row.lotIds).filter(
    (value): value is string => typeof value === 'string',
  ))];
  const runItemIds = [...new Set(pageRows.flatMap((row) => row.runItemIds).filter(
    (value): value is string => typeof value === 'string',
  ))];

  const [pageOwnLots, pagePoolLots, pageRunItems] = await Promise.all([
    lotIds.length > 0
      ? ownLots.find({ lotId: { $in: lotIds } }).limit(lotIds.length + 1).toArray()
      : Promise.resolve([]),
    lotIds.length > 0
      ? db.collection<CreditLot>('competition_credit_pool_lots')
        .find({ lotId: { $in: lotIds } }).limit(lotIds.length + 1).toArray()
      : Promise.resolve([]),
    runItemIds.length > 0
      ? db.collection<CreditRunItem>('competition_credit_run_items')
        .find({ itemId: { $in: runItemIds } }).limit(runItemIds.length + 1).toArray()
      : Promise.resolve([]),
  ]);
  const allPageLots = [...pageOwnLots, ...pagePoolLots];

  const entries = pageRows.map((row): PublicCreditHistoryEntry => {
    const rowLotIds = new Set(row.lotIds.filter((value): value is string => typeof value === 'string'));
    const rowRunItemIds = new Set(row.runItemIds.filter(
      (value): value is string => typeof value === 'string',
    ));
    const lots = allPageLots.filter((lot) => rowLotIds.has(lot.lotId));
    const runItems = pageRunItems.filter((item) => rowRunItemIds.has(item.itemId));
    return {
      eventId: `${row._id.operation}:${row._id.bucket}:${row._id.logicalId}`,
      operation: row._id.operation,
      bucket: row._id.bucket,
      amountCredits: exactHistoryCredits(row.amountCredits, 'history.amountCredits'),
      route: routeFromLots(lots, runItems),
      slotOrdinal: slotOrdinalFromItems(runItems),
      occurredAt: new Date(row.occurredAt.getTime()),
      expiresAt: earliestDate(lots.map((lot) => lot.expiresAt)),
      periodId: row.periodId,
    };
  });

  const nextExpiryAt = expiringLots[0]?.expiresAt ?? null;
  const expiringCredits = nextExpiryAt
    ? expiringLots
      .filter((lot) => lot.expiresAt.getTime() === nextExpiryAt.getTime())
      .reduce(
        (total, lot) => total + exactHistoryCredits(lot.availableCredits, 'lot.availableCredits'),
        0,
      )
    : 0;

  return {
    page,
    pageSize: CREDIT_HISTORY_PAGE_SIZE,
    hasMore: rows.length > CREDIT_HISTORY_PAGE_SIZE,
    totals: {
      receivedCredits: totalFor(totalRows, 'grant') + totalFor(totalRows, 'late_compensation'),
      spentCredits: totalFor(totalRows, 'spend'),
      poolContributedCredits: totalFor(totalRows, 'pool_deposit', 'own'),
      expiredCredits: totalFor(totalRows, 'expire'),
    },
    nextExpiry: expiringCredits > 0 && nextExpiryAt
      ? { credits: expiringCredits, at: new Date(nextExpiryAt.getTime()) }
      : null,
    entries,
  };
}
