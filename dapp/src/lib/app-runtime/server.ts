import 'server-only';

import type { Db } from 'mongodb';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits/public';
import { getCukieMasterWalletStatus } from '@/lib/uki-economy/cukie-master';
import { createMongoCukieMasterRepository } from '@/lib/uki-economy/cukie-master/repository';
import { publicCukieMasterRouteStatus } from '@/lib/uki-economy/cukie-master/public-view';

import type { AppRuntimeServiceStatus, AppRuntimeStatus } from './types';

const HEALTH_FRESHNESS_MS = 15 * 60_000;
const QUERY_TIMEOUT_MS = 2_000;
const DEFAULT_STATUS_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_STATUS_READS = 4;
// checkedAt is captured before the Mongo reads; allow a small completion skew.
const CLOCK_SKEW_TOLERANCE_MS = 5_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

const inFlight = new Map<string, Promise<AppRuntimeStatus>>();
let activeReads = 0;

type RuntimeRun = {
  status?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
};

type RuntimeEvidence = {
  latest: RuntimeRun | null;
  lastSuccessAt: Date | null;
  lastSuccessInvalid: boolean;
  latestErrorAt?: Date | null;
};

function dateValue(value: unknown) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

function isFutureBeyondClockSkew(value: Date | null, checkedAt: Date) {
  return Boolean(value && value.getTime() > checkedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS);
}

function isoOrNull(value: Date | null) {
  return value ? value.toISOString() : null;
}

function service(
  checkedAt: Date,
  status: AppRuntimeServiceStatus['status'],
  code: string | null,
  lastSuccessAt: Date | null = null,
): AppRuntimeServiceStatus {
  return {
    status,
    checkedAt: checkedAt.toISOString(),
    lastSuccessAt: isoOrNull(lastSuccessAt),
    code,
  };
}

function runtimeCollection(db: Db, name: string) {
  return db.collection<RuntimeRun>(name);
}

async function readRuntimeEvidence(db: Db, collectionName: string): Promise<RuntimeEvidence> {
  const collection = runtimeCollection(db, collectionName);
  const [latest, lastSuccess] = await Promise.all([
    collection.findOne(
      {},
      {
        projection: { status: 1, startedAt: 1, endedAt: 1 },
        sort: { startedAt: -1 },
        maxTimeMS: QUERY_TIMEOUT_MS,
      },
    ),
    collection.findOne(
      { status: 'success' },
      {
        projection: { endedAt: 1 },
        sort: { endedAt: -1 },
        maxTimeMS: QUERY_TIMEOUT_MS,
      },
    ),
  ]);

  return {
    latest,
    lastSuccessAt: dateValue(lastSuccess?.endedAt),
    lastSuccessInvalid: Boolean(lastSuccess && !dateValue(lastSuccess.endedAt)),
  };
}

function hasInvalidRuntimeEvidence(evidence: RuntimeEvidence) {
  const latest = evidence.latest;
  if (evidence.lastSuccessInvalid) return true;
  if (!latest) return false;
  if (latest.status !== 'running' && latest.status !== 'success' && latest.status !== 'error') {
    return true;
  }
  if ('startedAt' in latest && latest.startedAt !== undefined && !dateValue(latest.startedAt)) {
    return true;
  }
  if ('endedAt' in latest && latest.endedAt !== undefined && !dateValue(latest.endedAt)) {
    return true;
  }
  if ((latest.status === 'success' || latest.status === 'error') && !dateValue(latest.endedAt)) {
    return true;
  }
  return false;
}

function classifyHeartbeat(
  checkedAt: Date,
  evidence: RuntimeEvidence,
  enabled: boolean,
  ready: boolean,
  readyCode: string,
  disabledCode: string,
  unavailableCode: string,
) {
  const lastSuccessAt = evidence.lastSuccessAt;
  const latestStartedAt = dateValue(evidence.latest?.startedAt);
  const latestEndedAt = dateValue(evidence.latest?.endedAt);
  const invalidEvidence = hasInvalidRuntimeEvidence(evidence);
  const futureEvidence = Boolean(
    isFutureBeyondClockSkew(lastSuccessAt, checkedAt)
      || isFutureBeyondClockSkew(latestStartedAt, checkedAt)
      || isFutureBeyondClockSkew(latestEndedAt, checkedAt),
  );
  const safeLastSuccessAt = lastSuccessAt && !isFutureBeyondClockSkew(lastSuccessAt, checkedAt)
    ? lastSuccessAt
    : null;
  const fresh = Boolean(
    safeLastSuccessAt
      && checkedAt.getTime() - safeLastSuccessAt.getTime() <= HEALTH_FRESHNESS_MS,
  );
  const latestStatus = evidence.latest?.status;
  const latestIsNewerError = latestStatus === 'error'
    && latestEndedAt
    && (!lastSuccessAt || latestEndedAt.getTime() > lastSuccessAt.getTime());
  const running = latestStatus === 'running';

  if (ready && (invalidEvidence || futureEvidence)) {
    return service(checkedAt, enabled ? 'unavailable' : 'disabled', enabled ? 'heartbeat_invalid' : disabledCode, safeLastSuccessAt);
  }
  if (ready && !enabled) {
    return service(checkedAt, 'ready', disabledCode, safeLastSuccessAt);
  }
  if (ready && latestIsNewerError) {
    return service(checkedAt, 'unavailable', 'heartbeat_error', safeLastSuccessAt);
  }
  if (ready && fresh && !latestIsNewerError) {
    return service(checkedAt, 'ready', enabled ? readyCode : disabledCode, safeLastSuccessAt);
  }
  if (ready && running) {
    return service(checkedAt, 'syncing', 'heartbeat_running', safeLastSuccessAt);
  }
  if (ready && lastSuccessAt) {
    return service(checkedAt, 'syncing', 'heartbeat_stale', safeLastSuccessAt);
  }
  if (!ready && fresh && !latestIsNewerError) {
    return service(checkedAt, 'syncing', 'source_syncing', safeLastSuccessAt);
  }
  if (!ready && lastSuccessAt) {
    return service(checkedAt, 'syncing', 'source_stale', safeLastSuccessAt);
  }
  if (!enabled) {
    return service(checkedAt, 'disabled', disabledCode, safeLastSuccessAt);
  }
  return service(checkedAt, 'unavailable', unavailableCode, safeLastSuccessAt);
}

async function readIndexerEvidence(db: Db) {
  const collection = db.collection<RuntimeRun>('chain_indexer_runs');
  const [latestSuccess, latestError] = await Promise.all([
    collection.findOne(
      { type: { $in: ['loop', 'ingest-once'] } },
      {
        projection: { type: 1, endedAt: 1 },
        sort: { endedAt: -1 },
        maxTimeMS: QUERY_TIMEOUT_MS,
      },
    ),
    collection.findOne(
      { type: 'loop-error' },
      {
        projection: { type: 1, endedAt: 1 },
        sort: { endedAt: -1 },
        maxTimeMS: QUERY_TIMEOUT_MS,
      },
    ),
  ]);
  return {
    lastSuccessAt: dateValue(latestSuccess?.endedAt),
    latestSuccessAt: dateValue(latestSuccess?.endedAt),
    latestErrorAt: dateValue(latestError?.endedAt),
  };
}

function configuredChainIsValid() {
  const chainId = process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
  if (chainId !== '56' && chainId !== '97') return false;
  const environment = process.env.APP_ENV?.trim();
  return !environment || (environment === 'staging' && chainId === '97')
    || (environment === 'production' && chainId === '56');
}

function validSourceHash(value: unknown) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function statusTimeoutMs() {
  const configured = Number(process.env.APP_RUNTIME_STATUS_TIMEOUT_MS);
  return Number.isSafeInteger(configured) && configured >= 100 && configured <= DEFAULT_STATUS_TIMEOUT_MS
    ? configured
    : DEFAULT_STATUS_TIMEOUT_MS;
}

function statusConfigKey() {
  return JSON.stringify({
    appEnvironment: process.env.APP_ENV ?? '',
    chainId: process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID ?? '',
    indexerDb: process.env.CHAIN_INDEXER_DB_NAME ?? '',
    masterEnabled: process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED ?? '',
    creditsEnabled: process.env.COMPETITION_CREDITS_RUNTIME_ENABLED ?? '',
    creditsRule: process.env.COMPETITION_CREDITS_RULE_VERSION ?? '',
    timeoutMs: statusTimeoutMs(),
  });
}

function statusKey(walletAddress: string) {
  return `${walletAddress.trim().toLowerCase()}|${statusConfigKey()}`;
}

function withDeadline<T>(operation: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('APP_RUNTIME_STATUS_TIMEOUT'));
    }, timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function buildIndexerStatus(
  db: Db,
  checkedAt: Date,
  masterStatus: Awaited<ReturnType<typeof getCukieMasterWalletStatus>> | null,
) {
  let evidence: Awaited<ReturnType<typeof readIndexerEvidence>>;
  try {
    evidence = await readIndexerEvidence(db);
  } catch {
    return service(checkedAt, 'unavailable', 'indexer_read_failed');
  }
  const indexerHealthy = Boolean(masterStatus)
    && masterStatus!.routes.uki.sourceCompleteness.indexerHealth
    && masterStatus!.routes.nft.sourceCompleteness.indexerHealth;
  const ukiIndexerHealthy = Boolean(masterStatus?.routes.uki.sourceCompleteness.indexerHealth);
  const nftIndexerHealthy = Boolean(masterStatus?.routes.nft.sourceCompleteness.indexerHealth);
  const futureSuccess = isFutureBeyondClockSkew(evidence.latestSuccessAt, checkedAt);
  const futureError = isFutureBeyondClockSkew(evidence.latestErrorAt, checkedAt);
  const futureEvidence = futureSuccess || futureError;
  const lastSuccessAt = futureSuccess ? null : evidence.lastSuccessAt;
  const latestErrorAt = futureError ? null : evidence.latestErrorAt;
  const fresh = Boolean(
    lastSuccessAt
      && checkedAt.getTime() - lastSuccessAt.getTime() <= HEALTH_FRESHNESS_MS,
  );
  if (!configuredChainIsValid()) {
    return service(checkedAt, 'unavailable', 'indexer_configuration_invalid', lastSuccessAt);
  }
  if (!futureEvidence && indexerHealthy && fresh && (!latestErrorAt
    || !lastSuccessAt
    || latestErrorAt.getTime() <= lastSuccessAt.getTime())) {
    return service(checkedAt, 'ready', 'indexer_ready', lastSuccessAt);
  }
  if (latestErrorAt && (!lastSuccessAt
    || latestErrorAt.getTime() > lastSuccessAt.getTime())) {
    return service(checkedAt, 'unavailable', 'indexer_error', lastSuccessAt);
  }
  if (indexerHealthy || lastSuccessAt || futureEvidence) {
    const code = ukiIndexerHealthy && !nftIndexerHealthy
      ? 'indexer_nft_syncing'
      : !ukiIndexerHealthy && nftIndexerHealthy
        ? 'indexer_uki_syncing'
        : 'indexer_syncing';
    return service(checkedAt, 'syncing', code, lastSuccessAt);
  }
  return service(checkedAt, 'unavailable', 'indexer_unavailable', lastSuccessAt);
}

async function buildMasterStatus(
  db: Db,
  checkedAt: Date,
  masterStatus: Awaited<ReturnType<typeof getCukieMasterWalletStatus>> | null,
  indexerStatus: AppRuntimeServiceStatus,
) {
  const enabled = process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED?.trim().toLowerCase() === 'true';
  try {
    if (!masterStatus) throw new Error('MASTER_STATUS_UNAVAILABLE');
    const routes = [masterStatus.routes.uki, masterStatus.routes.nft];
    const complete = routes.every((route) => route.sourceCompleteness.complete);
    const hashesValid = routes.every((route) => validSourceHash(route.source.sourceHash));
    const projectionsFresh = routes.every((route) => publicCukieMasterRouteStatus(route).projectionFresh);
    const readable = complete && hashesValid && projectionsFresh && indexerStatus.status === 'ready';
    const evidence = await readRuntimeEvidence(db, 'cukie_master_runtime_runs');
    return classifyHeartbeat(
      checkedAt,
      evidence,
      enabled,
      readable,
      'master_ready',
      'master_scheduler_disabled',
      'master_source_unavailable',
    );
  } catch {
    return service(checkedAt, 'unavailable', 'master_read_failed');
  }
}

async function buildCreditsStatus(
  db: Db,
  checkedAt: Date,
  walletAddress: string,
) {
  const enabled = process.env.COMPETITION_CREDITS_RUNTIME_ENABLED?.trim().toLowerCase() === 'true';
  try {
    const [status, evidence] = await Promise.all([
      getCompetitionCreditWalletStatus(walletAddress, checkedAt),
      readRuntimeEvidence(db, 'competition_credit_runtime_runs'),
    ]);
    const watermarks = await db.collection<{
      _id?: string;
      route?: unknown;
      status?: unknown;
      sourceHash?: unknown;
      observedThrough?: unknown;
      updatedAt?: unknown;
    }>('competition_credit_source_watermarks').find(
      { _id: { $in: ['cukie-master-slots:uki', 'cukie-master-slots:nft'] } },
      {
        projection: { _id: 1, route: 1, status: 1, sourceHash: 1, observedThrough: 1, updatedAt: 1 },
        maxTimeMS: QUERY_TIMEOUT_MS,
      },
    ).limit(3).toArray();
    const watermarkRoutes = new Set(watermarks.map((watermark) => watermark.route));
    const watermarkDatesValid = watermarks.every((watermark) => {
      const observedThrough = dateValue(watermark.observedThrough);
      const updatedAt = dateValue(watermark.updatedAt);
      return observedThrough !== null
        && updatedAt !== null
        && !isFutureBeyondClockSkew(observedThrough, checkedAt)
        && !isFutureBeyondClockSkew(updatedAt, checkedAt);
    });
    const watermarkEvidence = watermarks.length === 2
      && watermarkRoutes.size === 2
      && watermarkRoutes.has('uki')
      && watermarkRoutes.has('nft')
      && watermarkDatesValid
      && watermarks.every((watermark) => (
        (watermark.route === 'uki' || watermark.route === 'nft')
        && watermark.status === 'healthy'
        && validSourceHash(watermark.sourceHash)
      ));
    const readable = status.grants.healthy === true && watermarkEvidence;
    return classifyHeartbeat(
      checkedAt,
      evidence,
      enabled,
      readable,
      'credits_ready',
      'credits_scheduler_disabled',
      'credits_source_unavailable',
    );
  } catch {
    return service(checkedAt, 'unavailable', 'credits_read_failed');
  }
}

async function computeAppRuntimeStatus(
  walletAddress: string,
  now = new Date(),
): Promise<AppRuntimeStatus> {
  const checkedAt = dateValue(now) ?? new Date();
  let db: Db;
  try {
    db = await getEconomyDb();
  } catch {
    const unavailable = service(checkedAt, 'unavailable', 'economy_database_unavailable');
    return {
      checkedAt: checkedAt.toISOString(),
      services: { indexer: unavailable, master: unavailable, credits: unavailable },
    };
  }

  let masterStatus: Awaited<ReturnType<typeof getCukieMasterWalletStatus>> | null = null;
  try {
    masterStatus = await getCukieMasterWalletStatus(
      walletAddress,
      checkedAt,
      createMongoCukieMasterRepository(db),
    );
  } catch {
    masterStatus = null;
  }
  const indexer = await buildIndexerStatus(db, checkedAt, masterStatus);
  const [master, credits] = await Promise.all([
    buildMasterStatus(db, checkedAt, masterStatus, indexer),
    buildCreditsStatus(db, checkedAt, walletAddress),
  ]);
  return {
    checkedAt: checkedAt.toISOString(),
    services: { indexer, master, credits },
  };
}

/**
 * Coalesces refreshes for the same wallet/configuration. A timed-out caller
 * does not release the slot: the underlying read remains tracked until its
 * promise settles, so retries cannot create unbounded orphan reads.
 */
export function getAppRuntimeStatus(
  walletAddress: string,
  now = new Date(),
): Promise<AppRuntimeStatus> {
  const key = statusKey(walletAddress);
  const existing = inFlight.get(key);
  if (existing) return existing;
  if (activeReads >= MAX_CONCURRENT_STATUS_READS) {
    return Promise.reject(new Error('APP_RUNTIME_STATUS_BUSY'));
  }

  activeReads += 1;
  const operation = computeAppRuntimeStatus(walletAddress, now);
  const result = withDeadline(operation, statusTimeoutMs());
  inFlight.set(key, result);
  void operation.then(
    () => {
      if (inFlight.get(key) === result) inFlight.delete(key);
      activeReads -= 1;
    },
    () => {
      if (inFlight.get(key) === result) inFlight.delete(key);
      activeReads -= 1;
    },
  );
  return result;
}
