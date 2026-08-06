jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import type { NormalizedNftAsset } from '@/lib/nft-inventory';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { listCukiePoolWalletPositions } from '@/lib/uki-economy/cukie-pool/public';
import { createMemoryCukiePoolHarness } from '@/lib/uki-economy/cukie-pool/testing';

const OWNER = `0x${'a'.repeat(40)}`;
const NOW = new Date('2026-07-10T10:00:00.000Z');

function asset(): NormalizedNftAsset {
  return {
    assetId: 'cukies:public-health',
    tokenId: 'public-health',
    network: 'bsc',
    ownerWallet: OWNER,
    ownerNormalized: OWNER,
    rarity: 'common',
    generation: 'original',
    canonicalState: 'available',
    blockers: [],
    activeLocks: [],
    sourceRefs: [{
      source: 'cukies',
      collection: 'cukies',
      documentId: 'public-health',
      tokenId: 'public-health',
      observedAt: NOW.toISOString(),
    }],
  };
}

function cursor(values: unknown[]) {
  const result = {
    sort: () => result,
    limit: () => result,
    toArray: async () => values,
  };
  return result;
}

describe('Cukie Pool public source health', () => {
  it('returns an explicit unhealthy state when the active lock does not match', async () => {
    const harness = createMemoryCukiePoolHarness([asset()]);
    const position = await harness.service.depositCukiePoolPosition({
      walletAddress: OWNER,
      assetId: 'cukies:public-health',
      idempotencyKey: 'deposit:public-health',
      now: NOW,
    });
    const lock = harness.state.locks.get(position.lockId)!;
    const collection = jest.fn((name: string) => ({
      find: () => name === 'cukie_pool_positions'
        ? cursor([position])
        : cursor([{ ...lock, reason: 'game_assignment', sessionId: 'wrong-session' }]),
    }));
    (getEconomyDb as jest.Mock).mockResolvedValue({ collection });

    await expect(listCukiePoolWalletPositions({
      walletAddress: OWNER,
    })).resolves.toMatchObject({
      sourceHealthy: false,
      positions: [{ positionId: position.positionId, sourceHealthy: false }],
    });
  });
});
