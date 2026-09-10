jest.mock('@/lib/legacy-marketplace/data', () => ({
  listLegacyCukiePoints: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/cukies/points/route';
import { listLegacyCukiePoints } from '@/lib/legacy-marketplace/data';

const listMock = listLegacyCukiePoints as jest.Mock;

function request(query: string) {
  return new NextRequest(`https://stage.local/api/cukies/points?${query}`);
}

describe('GET /api/cukies/points', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listMock.mockResolvedValue({
      source: 'legacy',
      status: 'partial',
      coverage: 'legacy-historical',
      items: [],
      total: 0,
      offset: 10,
      limit: 5,
      summary: {
        totalPoints: 0,
        totalTransactions: 0,
        facets: { networks: [], types: [] },
      },
    });
  });

  it('dirige la consulta global al adapter histórico con filtros y página reales', async () => {
    const response = await GET(request(
      'wallet=0xAbCd&wallet=TaExacta&network=BSC&type=Breeding&limit=5&offset=10',
    ));

    expect(response.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({
      wallets: ['0xAbCd', 'TaExacta'],
      network: 'BSC',
      type: 'Breeding',
      limit: 5,
      offset: 10,
    });
    expect(await response.json()).toMatchObject({
      source: 'legacy',
      status: 'partial',
      coverage: 'legacy-historical',
    });
  });
});
