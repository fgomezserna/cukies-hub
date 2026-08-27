jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

jest.mock('@/lib/uki-economy/internal-auth', () => {
  class InternalEconomyAuthError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
  return {
    InternalEconomyAuthError,
    createMongoInternalEconomyNonceRepository: jest.fn(() => ({})),
    loadInternalEconomyAuthConfig: jest.fn(() => ({ keyId: 'cukie-master-admin' })),
    readLimitedInternalEconomyRequestBody: jest.fn(),
    verifyAndConsumeInternalEconomyRequest: jest.fn(),
  };
});

jest.mock('@/lib/uki-economy/cukie-master', () => ({
  expandCukieMasterRouteCapacity: jest.fn(),
  proposeRequirementIncrease: jest.fn(),
}));

import { POST } from '@/app/api/economy/v1/internal/cukie-master/admin/route';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import {
  expandCukieMasterRouteCapacity,
  proposeRequirementIncrease,
} from '@/lib/uki-economy/cukie-master';
import {
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from '@/lib/uki-economy/internal-auth';

const PATH = '/api/economy/v1/internal/cukie-master/admin';
const HEADERS = {
  'x-economy-timestamp': '1783685100000',
  'x-economy-nonce': 'abcdefghijklmnopqrstuv',
  'x-economy-key-id': 'cukie-master-admin',
  'x-economy-signature': `v1=${'a'.repeat(64)}`,
};

function request() {
  return new Request(`http://localhost${PATH}`, { method: 'POST', headers: HEADERS, body: '{}' });
}

describe('Cukie Master HMAC admin endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getEconomyDb as jest.Mock).mockResolvedValue({});
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockResolvedValue(undefined);
  });

  it('authenticates and expands route capacity without accepting arbitrary fields', async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify({
      command: 'expand_capacity',
      route: 'nft',
      capacitySlots: 1_500,
      idempotencyKey: 'ops:capacity:nft:1500',
    })));
    (expandCukieMasterRouteCapacity as jest.Mock).mockResolvedValue({
      round: { route: 'nft', capacitySlots: 1_500 },
      capacity: { route: 'nft', totalSlots: 1_500 },
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(expandCukieMasterRouteCapacity).toHaveBeenCalledWith(
      'nft',
      1_500,
      expect.any(Date),
      'ops:capacity:nft:1500',
    );
    expect(verifyAndConsumeInternalEconomyRequest).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ path: PATH }),
    }));

    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify({
      command: 'expand_capacity', route: 'nft', capacitySlots: 1_600,
      idempotencyKey: 'ops:capacity:nft:1600', unsafe: true,
    })));
    expect((await POST(request())).status).toBe(400);
  });

  it('exposes a strict 48h requirement proposal result', async () => {
    const graceEndsAt = new Date('2026-07-13T00:00:00.000Z');
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify({
      command: 'propose_requirement',
      route: 'uki',
      requirement: { route: 'uki', ukiRaw: '30000000000000000000000' },
      idempotencyKey: 'ops:requirement:uki:30000',
    })));
    (proposeRequirementIncrease as jest.Mock).mockResolvedValue({
      route: 'uki',
      roundId: 'uki:v1',
      requirement: { route: 'uki', ukiRaw: '20000000000000000000000' },
      pendingRequirement: { route: 'uki', ukiRaw: '30000000000000000000000' },
      graceEndsAt,
      capacitySlots: 500,
      revision: 1,
    });

    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.round).toMatchObject({ graceHours: 48, graceEndsAt: graceEndsAt.toISOString() });
    expect(proposeRequirementIncrease).toHaveBeenCalledWith(
      'uki',
      { route: 'uki', ukiRaw: '30000000000000000000000' },
      expect.any(Date),
      'ops:requirement:uki:30000',
    );
  });
});
