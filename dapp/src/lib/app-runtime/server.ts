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
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

type RuntimeRun = {
  status?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
};

type RuntimeEvidence = {
  latest: RuntimeRun | null;
  lastSuccessAt: Date | null;
  latestErrorAt?: Date | null;
};

function dateValue(value: unknown) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
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
  };
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
  const fresh = Boolean(
    lastSuccessAt
      && lastSuccessAt.getTime() <= checkedAt.getTime()
      && checkedAt.getTime() - lastSuccessAt.getTime() <= HEALTH_FRESHNESS_MS,
  );
  const latestStatus = evidence.latest?.status;
  const latestEndedAt = dateValue(evidence.latest?.endedAt);
  const latestIsNewerError = latestStatus === 'error'
    && latestEndedAt
    && (!lastSuccessAt || latestEndedAt.getTime() > lastSuccessAt.getTime());
  const running = latestStatus === 'running';

  if (ready && !enabled) {
    return service(checkedAt, 'ready', disabledCode, lastSuccessAt);
  }
  if (ready && latestIsNewerError) {
    return service(checkedAt, 'unavailable', 'heartbeat_error', lastSuccessAt);
  }
  if (ready && fresh && !latestIsNewerError) {
    return service(checkedAt, 'ready', enabled ? readyCode : disabledCode, lastSuccessAt);
  }
  if (ready && running) {
    return service(checkedAt, 'syncing', 'heartbeat_running', lastSuccessAt);
  }
  if (ready && lastSuccessAt) {
    return service(checkedAt, 'syncing', 'heartbeat_stale', lastSuccessAt);
  }
  if (!enabled) {
    return service(checkedAt, 'disabled', disabledCode, lastSuccessAt);
  }
  return service(checkedAt, 'unavailable', unavailableCode, lastSuccessAt);
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
  const fresh = Boolean(
    evidence.latestSuccessAt
      && evidence.latestSuccessAt.getTime() <= checkedAt.getTime()
      && checkedAt.getTime() - evidence.latestSuccessAt.getTime() <= HEALTH_FRESHNESS_MS,
  );
  if (!configuredChainIsValid()) {
    return service(checkedAt, 'unavailable', 'indexer_configuration_invalid', evidence.lastSuccessAt);
  }
  if (indexerHealthy && fresh && (!evidence.latestErrorAt
    || !evidence.lastSuccessAt
    || evidence.latestErrorAt.getTime() <= evidence.lastSuccessAt.getTime())) {
    return service(checkedAt, 'ready', 'indexer_ready', evidence.lastSuccessAt);
  }
  if (evidence.latestErrorAt && (!evidence.lastSuccessAt
    || evidence.latestErrorAt.getTime() > evidence.lastSuccessAt.getTime())) {
    return service(checkedAt, 'unavailable', 'indexer_error', evidence.lastSuccessAt);
  }
  if (indexerHealthy || evidence.lastSuccessAt) {
    const code = ukiIndexerHealthy && !nftIndexerHealthy
      ? 'indexer_nft_syncing'
      : !ukiIndexerHealthy && nftIndexerHealthy
        ? 'indexer_uki_syncing'
        : 'indexer_syncing';
    return service(checkedAt, 'syncing', code, evidence.lastSuccessAt);
  }
  return service(checkedAt, 'unavailable', 'indexer_unavailable', evidence.lastSuccessAt);
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
    const watermarkEvidence = watermarks.length === 2
      && watermarks.every((watermark) => (
        (watermark.route === 'uki' || watermark.route === 'nft')
        && watermark.status === 'healthy'
        && validSourceHash(watermark.sourceHash)
        && dateValue(watermark.observedThrough)
        && dateValue(watermark.updatedAt)
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

export async function getAppRuntimeStatus(
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
