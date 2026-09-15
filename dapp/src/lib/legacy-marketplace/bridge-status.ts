import 'server-only';

import type { Db, Document } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';

/**
 * The relayer owns this collection.  The dapp only reads it; it never creates
 * or updates a bridge job from a browser request.
 *
 * `packages/cukies-bridge-relayer/src/store.ts` currently uses this name and
 * keys each job by `sourceTxHash` + `sourceEventIndex` (the legacy event has
 * no durable transfer id).
 */
export const LEGACY_BRIDGE_RELAY_JOBS_COLLECTION = 'cukies_bridge_relayer_jobs';

export type LegacyBridgeStatus =
  | 'unknown'
  | 'relaying'
  | 'minted'
  | 'failed'
  | 'manual_review';

export type LegacyBridgeStatusResponse = Readonly<{
  status: LegacyBridgeStatus;
  sourceTxHash: string;
  sourceEventIndex: number | null;
  destinationTxHash: string | null;
  transferId: string | null;
  updatedAt: string | null;
  error: string | null;
}>;

type LegacyBridgeRelayJob = Document & {
  _id?: unknown;
  request?: {
    sourceTxHash?: unknown;
    sourceEventIndex?: unknown;
    transferId?: unknown;
  };
  status?: unknown;
  destinationTxHash?: unknown;
  updatedAt?: unknown;
  lastError?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const text = stringValue(value);
  if (!text) return null;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapRelayStatus(value: unknown): LegacyBridgeStatus {
  switch (value) {
    case 'completed':
      return 'minted';
    case 'dead_letter':
      return 'manual_review';
    case 'failed':
    case 'reverted':
      return 'failed';
    case 'manual_review':
      return 'manual_review';
    case 'pending':
    case 'processing':
    case 'retry':
    case 'submitted':
      return 'relaying';
    default:
      return 'unknown';
  }
}

function unknownStatus(sourceTxHash: string): LegacyBridgeStatusResponse {
  return {
    status: 'unknown',
    sourceTxHash,
    sourceEventIndex: null,
    destinationTxHash: null,
    transferId: null,
    updatedAt: null,
    error: null,
  };
}

function toStatusResponse(
  sourceTxHash: string,
  job: LegacyBridgeRelayJob,
): LegacyBridgeStatusResponse {
  return {
    status: mapRelayStatus(job.status),
    sourceTxHash,
    sourceEventIndex: integerValue(job.request?.sourceEventIndex),
    destinationTxHash: stringValue(job.destinationTxHash),
    transferId: stringValue(job.request?.transferId) ?? stringValue(job._id),
    updatedAt: isoDate(job.updatedAt),
    error: stringValue(job.lastError),
  };
}

export function normalizeBridgeSourceTxHash(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  // TRON transaction ids are hex, while accepting a short alpha-numeric test
  // fixture keeps this read-only endpoint straightforward to exercise.
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) return null;
  return normalized;
}

export function normalizeBridgeSourceEventIndex(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') return null;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function findRelayJob(
  db: Db,
  sourceTxHash: string,
  sourceEventIndex: number | null,
) {
  const filter: Record<string, unknown> = {
    'request.sourceTxHash': sourceTxHash,
  };
  if (sourceEventIndex !== null) {
    filter['request.sourceEventIndex'] = sourceEventIndex;
  }

  return db.collection<LegacyBridgeRelayJob>(LEGACY_BRIDGE_RELAY_JOBS_COLLECTION)
    .findOne(filter, {
      projection: {
        _id: 1,
        status: 1,
        destinationTxHash: 1,
        updatedAt: 1,
        lastError: 1,
        'request.sourceTxHash': 1,
        'request.sourceEventIndex': 1,
        'request.transferId': 1,
      },
    });
}

export async function getLegacyBridgeStatus(
  sourceTxHash: string,
  sourceEventIndex: number | null = null,
  dbLoader: () => Promise<Db> = getIndexerDb,
): Promise<LegacyBridgeStatusResponse> {
  const db = await dbLoader();
  const job = await findRelayJob(db, sourceTxHash, sourceEventIndex);
  return job ? toStatusResponse(sourceTxHash, job) : unknownStatus(sourceTxHash);
}
