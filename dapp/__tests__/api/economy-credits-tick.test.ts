jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
}));

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

jest.mock('@/lib/uki-economy/credits/runtime', () => {
  class CompetitionCreditRuntimeBusyError extends Error {}
  class CompetitionCreditRuntimeConfigurationError extends Error {}
  return {
    CompetitionCreditRuntimeBusyError,
    CompetitionCreditRuntimeConfigurationError,
    runCompetitionCreditRuntimeTick: jest.fn(),
  };
});

import { POST } from '@/app/api/economy/v1/internal/credits/tick/route';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import {
  InternalEconomyAuthError,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from '@/lib/uki-economy/internal-auth';
import {
  CompetitionCreditRuntimeBusyError,
  runCompetitionCreditRuntimeTick,
} from '@/lib/uki-economy/credits/runtime';

const headers = {
  'x-economy-timestamp': '1783685100000',
  'x-economy-nonce': 'abcdefghijklmnopqrstuv',
  'x-economy-key-id': 'credits-scheduler',
  'x-economy-signature': `v1=${'a'.repeat(64)}`,
};

function request() {
  return new Request('http://localhost/api/economy/v1/internal/credits/tick', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

describe('POST /api/economy/v1/internal/credits/tick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getEconomyDb as jest.Mock).mockResolvedValue({});
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockResolvedValue(undefined);
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      Buffer.from('{"workerId":"credit-worker"}', 'utf8'),
    );
    (runCompetitionCreditRuntimeTick as jest.Mock).mockResolvedValue({
      status: 'open',
      creditRunId: 'run-1',
    });
  });

  it('authenticates the exact body before running the bounded worker', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'open', creditRunId: 'run-1' });
    expect(verifyAndConsumeInternalEconomyRequest).toHaveBeenCalledTimes(1);
    expect(runCompetitionCreditRuntimeTick).toHaveBeenCalledWith({ workerId: 'credit-worker' });
  });

  it('rejects unknown payload fields without invoking the runtime', async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      Buffer.from('{"workerId":"credit-worker","extra":true}', 'utf8'),
    );

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 'error', code: 'INVALID_JSON' });
    expect(runCompetitionCreditRuntimeTick).not.toHaveBeenCalled();
  });

  it('maps replay/auth failures and an active lease without leaking details', async () => {
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockRejectedValueOnce(
      new InternalEconomyAuthError('REPLAYED_REQUEST' as never, 'nonce detail'),
    );
    const replay = await POST(request());
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ status: 'error', code: 'REPLAYED_REQUEST' });

    (runCompetitionCreditRuntimeTick as jest.Mock).mockRejectedValueOnce(
      new CompetitionCreditRuntimeBusyError(),
    );
    const busy = await POST(request());
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({
      status: 'busy',
      code: 'COMPETITION_CREDITS_RUNTIME_BUSY',
    });
  });
});
