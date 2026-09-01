import {
  compareCodePoints,
  MAX_CELL_LENGTH,
  MAX_CSV_ROWS,
  normalizeNfc,
} from './canonical.js';
import { clonePlainData } from './plain-data.js';
import type { LegacySnapshotResult } from './types.js';

function normalizeStableValue(value: unknown): unknown {
  if (typeof value === 'string') return normalizeNfc(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map((item) => normalizeStableValue(item));
  if (value && typeof value === 'object') {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [normalizeNfc(key), item] as const);
    const normalizedKeys = normalizedEntries.map(([key]) => key);
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      throw new Error('Deterministic JSON contains colliding Unicode-normalized keys.');
    }
    return Object.fromEntries(
      normalizedEntries
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, item]) => [key, normalizeStableValue(item)]),
    );
  }
  return value;
}

export function stableJsonStringify(value: unknown) {
  value = clonePlainData(value, 'Deterministic JSON input', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 16 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024,
  });
  const serialized = JSON.stringify(normalizeStableValue(value));
  if (serialized === undefined) {
    throw new Error('Value cannot be represented as deterministic JSON.');
  }
  return serialized;
}

export function serializeJsonLines(rows: unknown[]) {
  rows = clonePlainData(rows, 'JSONL rows', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: MAX_CSV_ROWS,
    maxStringBytes: MAX_CELL_LENGTH, maxTotalBytes: 32 * 1024 * 1024,
  });
  if (rows.length > MAX_CSV_ROWS) throw new Error('JSONL row limit exceeded.');
  if (rows.length === 0) return '';
  return `${rows.map((row) => stableJsonStringify(row)).join('\n')}\n`;
}

function protectSpreadsheetFormula(value: string) {
  const normalized = normalizeNfc(value);
  const unsafePrefix = /^[\u0000-\u0020\u007f\u00a0\u200b-\u200f\u2028\u2029\u2060\ufeff]*[=+\-@]/u;
  const leadingControl = /^[\t\r\n\ufeff\u200b-\u200f\u2060]/u;
  return unsafePrefix.test(normalized) || leadingControl.test(normalized)
    ? `'${normalized}`
    : normalized;
}

function csvCell(value: unknown) {
  const stringValue =
    value === null || value === undefined
      ? ''
      : typeof value === 'bigint'
        ? value.toString()
        : String(value);
  if (stringValue.length > MAX_CELL_LENGTH) throw new Error('CSV cell length limit exceeded.');
  const protectedValue = protectSpreadsheetFormula(stringValue);
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function serializeCsv(
  rows: Array<Record<string, unknown>>,
  columns: readonly string[],
) {
  const parsed = clonePlainData({ rows, columns }, 'CSV input', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: MAX_CSV_ROWS,
    maxStringBytes: MAX_CELL_LENGTH, maxTotalBytes: 32 * 1024 * 1024,
  });
  rows = parsed.rows;
  columns = parsed.columns;
  if (rows.length > MAX_CSV_ROWS) throw new Error('CSV row limit exceeded.');
  if (columns.length === 0 || columns.length > 100) throw new Error('CSV column count is invalid.');
  if (new Set(columns).size !== columns.length) {
    throw new Error('CSV columns must be unique.');
  }
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function serializeSnapshotJsonl(snapshot: LegacySnapshotResult) {
  snapshot = clonePlainData(snapshot, 'Snapshot JSONL input', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 4 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024,
  });
  return serializeJsonLines([
    {
      recordType: 'snapshot-metadata',
      schemaVersion: 1,
      previewOnly: true,
      cutoverAuthorized: false,
      complete: snapshot.complete,
      coverage: snapshot.coverage,
    },
    ...snapshot.wallets.map((wallet) => ({ recordType: 'wallet', ...wallet })),
  ]);
}

export function serializeSnapshotCsv(snapshot: LegacySnapshotResult) {
  snapshot = clonePlainData(snapshot, 'Snapshot CSV input', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 4 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024,
  });
  const rows = snapshot.wallets.map((wallet) => ({
    network: wallet.network,
    wallet: wallet.wallet,
    userId: wallet.userId,
    claimedRaw: wallet.claimedRaw,
    pendingRaw: wallet.pendingRaw,
    totalRaw: wallet.totalRaw,
    tokenIds: wallet.tokenIds.join('|'),
    snapshotIds: wallet.snapshotIds.join('|'),
    claimedSourceId: wallet.claimedSourceId,
    pendingSourceId: wallet.pendingSourceId,
    claimedSourceBalanceId: wallet.claimedSourceBalanceId,
    pendingSourceBalanceId: wallet.pendingSourceBalanceId,
    claimedSourceRowSha256: wallet.claimedSourceRowSha256,
    pendingSourceRowSha256: wallet.pendingSourceRowSha256,
  }));
  return serializeCsv(rows, [
    'network',
    'wallet',
    'userId',
    'claimedRaw',
    'pendingRaw',
    'totalRaw',
    'tokenIds',
    'snapshotIds',
    'claimedSourceId',
    'pendingSourceId',
    'claimedSourceBalanceId',
    'pendingSourceBalanceId',
    'claimedSourceRowSha256',
    'pendingSourceRowSha256',
  ]);
}
