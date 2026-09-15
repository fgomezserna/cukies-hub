jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/legacy-marketplace/bridge-status/route';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';

const getIndexerDbMock = getIndexerDb as jest.MockedFunction<typeof getIndexerDb>;

function request(query: string) {
  return new NextRequest(`http://localhost/api/legacy-marketplace/bridge-status?${query}`);
}

describe('GET /api/legacy-marketplace/bridge-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid TRON transaction id before touching Mongo', async () => {
    const response = await GET(request('sourceTxHash=short'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: 'invalid_request',
      code: 'BRIDGE_SOURCE_TX_HASH_INVALID',
    });
    expect(getIndexerDbMock).not.toHaveBeenCalled();
  });

  it('maps a relayer manual_review job without exposing internal fields', async () => {
    const findOne = jest.fn().mockResolvedValue({
      _id: 'tx:event',
      status: 'manual_review',
      destinationTxHash: '0x' + 'ab'.repeat(32),
      updatedAt: new Date('2026-09-13T18:00:00.000Z'),
      lastError: 'El tokenId BSC ya existe',
      request: {
        sourceTxHash: 'a'.repeat(64),
        sourceEventIndex: 3,
        transferId: '0x' + 'cd'.repeat(32),
      },
      privateKey: 'must-not-leak',
    });
    getIndexerDbMock.mockResolvedValue({
      collection: jest.fn(() => ({ findOne })),
    } as never);

    const sourceTxHash = 'a'.repeat(64);
    const response = await GET(request(`sourceTxHash=${sourceTxHash}&sourceEventIndex=3`));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      status: 'manual_review',
      sourceTxHash,
      sourceEventIndex: 3,
      destinationTxHash: '0x' + 'ab'.repeat(32),
      transferId: '0x' + 'cd'.repeat(32),
      updatedAt: '2026-09-13T18:00:00.000Z',
      error: 'El tokenId BSC ya existe',
    });
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(findOne).toHaveBeenCalledWith(
      {
        'request.sourceTxHash': sourceTxHash,
        'request.sourceEventIndex': 3,
      },
      expect.objectContaining({ projection: expect.any(Object) }),
    );
  });

  it('redacts provider URLs and credential markers from a public error', async () => {
    const findOne = jest.fn().mockResolvedValue({
      _id: 'tx:rpc',
      status: 'manual_review',
      updatedAt: new Date('2026-09-13T18:00:00.000Z'),
      lastError: 'HttpRequestError: https://rpc.example.test/v1?api_key=DUMMY_RPC_SECRET',
      request: { sourceTxHash: 'b'.repeat(64), sourceEventIndex: 0 },
    });
    getIndexerDbMock.mockResolvedValue({
      collection: jest.fn(() => ({ findOne })),
    } as never);

    const sourceTxHash = 'b'.repeat(64);
    const response = await GET(request(`sourceTxHash=${sourceTxHash}&sourceEventIndex=0`));
    const payload = await response.json();

    expect(payload.error).toBe('El relayer encontro un error interno; requiere revision manual.');
    expect(JSON.stringify(payload)).not.toContain('DUMMY_RPC_SECRET');
    expect(JSON.stringify(payload)).not.toContain('rpc.example.test');
  });
});
