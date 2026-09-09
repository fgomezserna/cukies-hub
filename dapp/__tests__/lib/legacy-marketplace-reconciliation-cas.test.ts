jest.mock('server-only', () => ({}));

jest.mock('@/lib/mongodb-cukies', () => ({
  cukiesDb: { cukies: jest.fn() },
}));
jest.mock('@/lib/legacy-marketplace/live-marketplace', () => ({
  readLegacyMarketplaceLiveState: jest.fn(),
}));

import { reconcileLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';
import { readLegacyMarketplaceLiveState } from '@/lib/legacy-marketplace/live-marketplace';
import { cukiesDb } from '@/lib/mongodb-cukies';

const readLive = readLegacyMarketplaceLiveState as jest.Mock;
const mockCollection = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
};
const mockCukies = cukiesDb.cukies as jest.Mock;
let stored: Record<string, unknown>;

function matchesSnapshot(
  document: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  return Object.entries(expected).every(([key, value]) => {
    if (value && typeof value === 'object' && '$exists' in value) {
      return (value as { $exists: boolean }).$exists
        ? document[key] !== undefined
        : document[key] === undefined;
    }
    return document[key] === value;
  });
}

async function waitForLiveReads(count: number) {
  for (let attempt = 0; attempt < 20 && readLive.mock.calls.length < count; attempt += 1) {
    await Promise.resolve();
  }
  expect(readLive).toHaveBeenCalledTimes(count);
}

describe('CAS de reconciliación Marketplace Legacy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCukies.mockResolvedValue(mockCollection);
    stored = {
      _id: '1000000000029',
      user: '0x00000000000000000000000000000000000000aa',
      network: 'BSC',
      state: 'available',
      price: 0,
      priceOriginal: '0',
      cukiNumber: 29,
      skills: {},
    };
    mockCollection.findOne.mockImplementation(async () => ({ ...stored }));
    mockCollection.updateOne.mockImplementation(async (filter, update) => {
      const [snapshot, changedFingerprint] = filter.$and as [
        Record<string, unknown>,
        { marketplaceReconciliationFingerprint: { $ne: string } },
      ];
      const matches = matchesSnapshot(stored, snapshot);
      const differs = stored.marketplaceReconciliationFingerprint
        !== changedFingerprint.marketplaceReconciliationFingerprint.$ne;
      if (!matches || !differs) return { modifiedCount: 0 };
      stored = { ...stored, ...update.$set };
      return { modifiedCount: 1 };
    });
  });

  it('impide que una observación antigua restaure available sobre un anuncio nuevo', async () => {
    let releaseOld: ((value: unknown) => void) | undefined;
    let releaseNew: ((value: unknown) => void) | undefined;
    readLive
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { releaseNew = resolve; }));

    const oldObservation = reconcileLegacyMarketplaceCuki('1000000000029', 'BSC');
    await waitForLiveReads(1);
    const newObservation = reconcileLegacyMarketplaceCuki('1000000000029', 'BSC');
    await waitForLiveReads(2);

    releaseNew?.({
      network: 'BSC',
      owner: '0x00000000000000000000000000000000000000aa',
      paused: false,
      isOnSale: true,
      price: 1950,
      priceOriginal: '195000000000000000',
    });
    await expect(newObservation).resolves.toMatchObject({ changed: true });

    releaseOld?.({
      network: 'BSC',
      owner: '0x00000000000000000000000000000000000000aa',
      paused: false,
      isOnSale: false,
      price: 0,
      priceOriginal: '0',
    });
    await expect(oldObservation).resolves.toMatchObject({ changed: false });

    expect(stored.state).toBe('onSale');
    expect(stored.priceOriginal).toBe('195000000000000000');
  });

  it('no restaura available si staking cambia el documento durante el RPC', async () => {
    let releaseOld: ((value: unknown) => void) | undefined;
    readLive.mockImplementationOnce(() => new Promise((resolve) => {
      releaseOld = resolve;
    }));

    const oldObservation = reconcileLegacyMarketplaceCuki('1000000000029', 'BSC');
    await waitForLiveReads(1);
    stored = { ...stored, state: 'staking' };
    releaseOld?.({
      network: 'BSC',
      owner: '0x00000000000000000000000000000000000000aa',
      paused: false,
      isOnSale: false,
      price: 0,
      priceOriginal: '0',
    });

    await expect(oldObservation).resolves.toMatchObject({ changed: false });
    expect(stored.state).toBe('staking');
  });
});
