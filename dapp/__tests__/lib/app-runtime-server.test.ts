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

function fakeDb(masterRun = { status: 'success', endedAt: recent }, creditRun = masterRun) {
  const indexer = runtimeCollection({ status: 'success', endedAt: recent });
  return {
    collection: jest.fn((name: string) => {
      if (name === 'chain_indexer_runs') return indexer;
      if (name === 'cukie_master_runtime_runs') return runtimeCollection(masterRun);
      if (name === 'competition_credit_runtime_runs') return runtimeCollection(creditRun);
      return {
        find: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn(() => Promise.resolve([
              { _id: 'cukie-master-slots:uki', route: 'uki', status: 'healthy', sourceHash: hash, observedThrough: recent, updatedAt: recent },
              { _id: 'cukie-master-slots:nft', route: 'nft', status: 'healthy', sourceHash: hash, observedThrough: recent, updatedAt: recent },
            ])),
          })),
        })),
      };
    }),
  };
}

describe('getAppRuntimeStatus', () => {
  beforeEach(() => {
    process.env.APP_ENV = 'staging';
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '97';
    process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED = 'true';
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'true';
    (getEconomyDb as jest.Mock).mockResolvedValue(fakeDb());
    (getCukieMasterWalletStatus as jest.Mock).mockResolvedValue(masterStatus());
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({ grants: { healthy: true } });
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
});
