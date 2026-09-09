import { NextRequest } from 'next/server';

import { POST } from '@/app/api/legacy-marketplace/reconcile/route';
import { reconcileLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';

jest.mock('@/lib/legacy-marketplace/data', () => ({
  reconcileLegacyMarketplaceCuki: jest.fn(),
}));

const reconcileMock = reconcileLegacyMarketplaceCuki as jest.MockedFunction<
  typeof reconcileLegacyMarketplaceCuki
>;

function request(body: unknown) {
  return new NextRequest('https://stage.local/api/legacy-marketplace/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/legacy-marketplace/reconcile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reconcilia solo una identidad Legacy exacta', async () => {
    reconcileMock.mockResolvedValue({
      item: { tokenId: '1000000000029' } as never,
      fingerprint: 'BSC:owner:active:1',
      marketplaceListingStatus: 'active',
      changed: true,
      paused: false,
    });
    const response = await POST(request({
      source: 'legacy',
      tokenId: '1000000000029',
      network: 'BSC',
      collection: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    }));

    expect(response.status).toBe(200);
    expect(reconcileMock).toHaveBeenCalledWith('1000000000029', 'BSC');
    expect((await response.json()).data.changed).toBe(true);
  });

  it('rechaza cambiar la capitalización de una colección TRON base58', async () => {
    const response = await POST(request({
      source: 'legacy',
      tokenId: '4000000007954',
      network: 'TRON',
      collection: 'tvkqdrxqgx7zqmeexj2rbpqa93qjryqyge',
    }));

    expect(response.status).toBe(400);
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('no publica errores internos cuando Mongo o RPC no responden', async () => {
    reconcileMock.mockRejectedValue(new Error('mongodb://secret-host'));
    const response = await POST(request({
      source: 'legacy',
      tokenId: '4000000007954',
      network: 'TRON',
      collection: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: 'error',
      code: 'LEGACY_RECONCILIATION_UNAVAILABLE',
    });
  });
});
