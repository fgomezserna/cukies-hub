jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

jest.mock('@/lib/uki-economy/internal-auth', () => {
  class InternalEconomyAuthError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    InternalEconomyAuthError,
    createMongoInternalEconomyNonceRepository: jest.fn(() => ({})),
    loadInternalEconomyAuthConfig: jest.fn(() => ({})),
    readLimitedInternalEconomyRequestBody: jest.fn(),
    verifyAndConsumeInternalEconomyRequest: jest.fn(),
  };
});

jest.mock('@/lib/uki-economy/cukie-pool/runtime', () => {
  class CukiePoolRuntimeBusyError extends Error {}
  class CukiePoolRuntimeConfigurationError extends Error {}
  return {
    CukiePoolRuntimeBusyError,
    CukiePoolRuntimeConfigurationError,
    runCukiePoolRuntimeTick: jest.fn(),
  };
});

import { POST } from '@/app/api/economy/v1/internal/cukie-pool/tick/route';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import {
  InternalEconomyAuthError,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from '@/lib/uki-economy/internal-auth';
import {
  CukiePoolRuntimeBusyError,
  runCukiePoolRuntimeTick,
} from '@/lib/uki-economy/cukie-pool/runtime';

const headers = {
  'x-economy-timestamp': '1783685100000',
  'x-economy-nonce': 'abcdefghijklmnopqrstuv',
  'x-economy-key-id': 'pool-scheduler',
  'x-economy-signature': `v1=${'a'.repeat(64)}`,
};

function request() {
  return new Request('http://localhost/api/economy/v1/internal/cukie-pool/tick', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

describe('POST /api/economy/v1/internal/cukie-pool/tick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getEconomyDb as jest.Mock).mockResolvedValue({});
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockResolvedValue(undefined);
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      Buffer.from('{"workerId":"pool-worker"}', 'utf8'),
    );
    (runCukiePoolRuntimeTick as jest.Mock).mockResolvedValue({
      gameSessionsClosed: 1,
      orphanAssignments: { scanned: 1, expired: 1, skipped: 0 },
    });
  });

  it('authenticates the exact body before running the pool worker', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ gameSessionsClosed: 1 });
    expect(verifyAndConsumeInternalEconomyRequest).toHaveBeenCalledTimes(1);
    expect(runCukiePoolRuntimeTick).toHaveBeenCalledWith({ workerId: 'pool-worker' });
  });

  it('rejects scheduler-controlled limits and unknown fields', async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      Buffer.from('{"workerId":"pool-worker","orphanExpiryLimit":1000}', 'utf8'),
    );
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 'error', code: 'INVALID_JSON' });
    expect(runCukiePoolRuntimeTick).not.toHaveBeenCalled();
  });

  it('maps auth replay and active lease without exposing internals', async () => {
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockRejectedValueOnce(
      new InternalEconomyAuthError('REPLAYED_REQUEST' as never, 'private nonce'),
    );
    const replay = await POST(request());
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ status: 'error', code: 'REPLAYED_REQUEST' });

    (runCukiePoolRuntimeTick as jest.Mock).mockRejectedValueOnce(
      new CukiePoolRuntimeBusyError(),
    );
    const busy = await POST(request());
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ status: 'busy', code: 'CUKIE_POOL_RUNTIME_BUSY' });
  });
});
