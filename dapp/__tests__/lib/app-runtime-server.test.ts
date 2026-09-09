jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
}));
jest.mock('@/lib/uki-economy/cukie-master', () => ({
  getCukieMasterWalletStatus: jest.fn(),
}));
jest.mock('@/lib/uki-economy/cukie-master/repository', () => ({
  createMongoCukieMasterRepository: jest.fn(() => ({})),
}));
jest.mock('@/lib/uki-economy/cukie-master/public-view', () => ({
  publicCukieMasterRouteStatus: jest.fn(() => ({ projectionFresh: true })),
}));
jest.mock('@/lib/uki-economy/credits/public', () => ({
  getCompetitionCreditWalletStatus: jest.fn(),
}));

import { getAppRuntimeStatus } from '@/lib/app-runtime/server';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits/public';
import { getCukieMasterWalletStatus } from '@/lib/uki-economy/cukie-master';
import { publicCukieMasterRouteStatus } from '@/lib/uki-economy/cukie-master/public-view';

const wallet = '0x1111111111111111111111111111111111111111';
const now = new Date('2026-09-09T10:00:00.000Z');
const recent = new Date('2026-09-09T09:59:00.000Z');
const hash = 'a'.repeat(64);

function runtimeCollection(run: { status: string; endedAt?: Date }) {
  return {
    findOne: jest.fn().mockImplementation((filter: Record<string, unknown>) => {
      if (filter.status === 'success') return Promise.resolve({ endedAt: run.endedAt });
      return Promise.resolve(run);
    }),
  };
}

function source(route: 'uki' | 'nft') {
  return {
    route,
    sourceHash: hash,
    ...(route === 'uki'
      ? { totalUkiRaw: '1000000000000000000', presaleLockedRaw: '0', stakedUkiRaw: '0' }
      : { originalCukiePoints: 15, nftAssetIds: [], assets: [], refs: [] }),
  };
}

function masterStatus() {
  return {
    routes: {
      uki: {
        source: source('uki'),
        sourceCompleteness: { complete: true, indexerHealth: true },
        position: null,
        slots: [],
      },
      nft: {
        source: source('nft'),
        sourceCompleteness: { complete: true, indexerHealth: true },
        position: null,
        slots: [],
      },
    },
  };
}

function fakeDb(
  masterRun = { status: 'success', endedAt: recent },
  creditRun = masterRun,
  watermarkSourceHash = hash,
  indexerRun = { status: 'success', endedAt: recent },
  watermarkDate = recent,
) {
  const indexer = runtimeCollection(indexerRun);
  return {
    collection: jest.fn((name: string) => {
      if (name === 'chain_indexer_runs') return indexer;
      if (name === 'cukie_master_runtime_runs') return runtimeCollection(masterRun);
      if (name === 'competition_credit_runtime_runs') return runtimeCollection(creditRun);
      return {
        find: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn(() => Promise.resolve([
              { _id: 'cukie-master-slots:uki', route: 'uki', status: 'healthy', sourceHash: watermarkSourceHash, observedThrough: watermarkDate, updatedAt: watermarkDate },
              { _id: 'cukie-master-slots:nft', route: 'nft', status: 'healthy', sourceHash: watermarkSourceHash, observedThrough: watermarkDate, updatedAt: watermarkDate },
            ])),
          })),
        })),
      };
    }),
  };
}

describe('getAppRuntimeStatus', () => {
  beforeEach(() => {
    jest.useRealTimers();
    (getEconomyDb as jest.Mock).mockClear();
    process.env.APP_ENV = 'staging';
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '97';
    process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED = 'true';
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'true';
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb());
    (getCukieMasterWalletStatus as jest.Mock).mockResolvedValue(masterStatus());
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({ grants: { healthy: true } });
    (publicCukieMasterRouteStatus as jest.Mock).mockReturnValue({ projectionFresh: true });
  });

  it('devuelve ready solo con fuentes completas, hashes y heartbeats recientes', async () => {
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('ready');
    expect(result.services.credits.status).toBe('ready');
    expect(result.services.master.lastSuccessAt).toBe(recent.toISOString());
    expect(result.services.credits.lastSuccessAt).toBe(recent.toISOString());
  });

  it('marca heartbeat stale como syncing sin ocultar la salud del indexer', async () => {
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb(
      { status: 'success', endedAt: new Date('2026-09-09T09:00:00.000Z') },
      { status: 'success', endedAt: new Date('2026-09-09T09:00:00.000Z') },
    ));
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('syncing');
    expect(result.services.credits.status).toBe('syncing');
  });

  it('no marca ready una evidencia de heartbeat futura', async () => {
    const future = new Date(now.getTime() + 60_000);
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb(
      { status: 'success', endedAt: future },
      { status: 'success', endedAt: future },
      hash,
      { status: 'success', endedAt: future },
      future,
    ));
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).not.toBe('ready');
    expect(result.services.master.status).not.toBe('ready');
    expect(result.services.credits.status).not.toBe('ready');
    expect(result.services.indexer.lastSuccessAt).toBeNull();
    expect(result.services.master.lastSuccessAt).toBeNull();
    expect(result.services.credits.lastSuccessAt).toBeNull();
  });

  it('tolera que una lectura Mongo termine pocos milisegundos despues de checkedAt', async () => {
    const slightFuture = new Date(now.getTime() + 100);
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb(
      { status: 'success', endedAt: slightFuture },
      { status: 'success', endedAt: slightFuture },
      hash,
      { status: 'success', endedAt: slightFuture },
      slightFuture,
    ));
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('ready');
    expect(result.services.credits.status).toBe('ready');
  });

  it('no marca ready un ultimo run con estado desconocido', async () => {
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb(
      { status: 'unknown', endedAt: recent },
      { status: 'success', endedAt: recent },
    ));
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('unavailable');
    expect(result.services.master.code).toBe('heartbeat_invalid');
  });

  it('no marca ready creditos con watermarks sin hash valido', async () => {
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb(undefined, undefined, 'bad-hash'));
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('ready');
    expect(result.services.credits.status).not.toBe('ready');
  });

  it('mantiene indexer y Master disponibles ante un fallo parcial de créditos', async () => {
    (getCompetitionCreditWalletStatus as jest.Mock).mockRejectedValueOnce(
      new Error('credit ledger detail must stay private'),
    );
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('ready');
    expect(result.services.credits.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('credit ledger detail');
  });

  it('marca una proyección Master stale como syncing sin degradar el indexer sano', async () => {
    (publicCukieMasterRouteStatus as jest.Mock).mockReturnValue({ projectionFresh: false });
    const result = await getAppRuntimeStatus(wallet, now);
    expect(result.services.indexer.status).toBe('ready');
    expect(result.services.master.status).toBe('syncing');
  });

  it('coalescea vuelos simultáneos por wallet y no abandona el vuelo tras timeout', async () => {
    const uniqueWallet = '0x2222222222222222222222222222222222222222';
    process.env.APP_RUNTIME_STATUS_TIMEOUT_MS = '100';
    jest.useFakeTimers();
    let resolveDatabase!: (database: ReturnType<typeof fakeDb>) => void;
    const databasePromise = new Promise<ReturnType<typeof fakeDb>>((resolve) => {
      resolveDatabase = resolve;
    });
    (getEconomyDb as jest.Mock).mockReturnValue(databasePromise);

    const first = getAppRuntimeStatus(uniqueWallet, now);
    const second = getAppRuntimeStatus(uniqueWallet, now);
    expect(second).toBe(first);
    expect(getEconomyDb).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    await expect(first).rejects.toThrow('APP_RUNTIME_STATUS_TIMEOUT');
    const retry = getAppRuntimeStatus(uniqueWallet, now);
    expect(retry).toBe(first);
    expect(getEconomyDb).toHaveBeenCalledTimes(1);

    resolveDatabase(fakeDb());
    await Promise.resolve();
    await Promise.resolve();
    delete process.env.APP_RUNTIME_STATUS_TIMEOUT_MS;
  });
});
