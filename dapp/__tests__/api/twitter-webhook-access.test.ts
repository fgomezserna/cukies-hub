const mockRequireLocalAdminApiAccess = jest.fn();
const mockRequirePrivateSecretConfigurationApiAccess = jest.fn();
const mockRequirePrivateSecretApiAccess = jest.fn();
const mockTwitterFollowerUpsert = jest.fn();

jest.mock('@/lib/operational-access', () => ({
  requireLocalAdminApiAccess: (...args: unknown[]) => mockRequireLocalAdminApiAccess(...args),
  requirePrivateSecretConfigurationApiAccess: (...args: unknown[]) => (
    mockRequirePrivateSecretConfigurationApiAccess(...args)
  ),
  requirePrivateSecretApiAccess: (...args: unknown[]) => mockRequirePrivateSecretApiAccess(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    twitterFollower: {
      upsert: (...args: unknown[]) => mockTwitterFollowerUpsert(...args),
    },
  },
}));

import { GET, POST } from '@/app/api/webhooks/twitter-follow/route';

function denied(status: number) {
  return new Response(JSON.stringify({ error: 'Denied' }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/webhooks/twitter-follow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Twitter follow webhook access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireLocalAdminApiAccess.mockResolvedValue(null);
    mockRequirePrivateSecretConfigurationApiAccess.mockReturnValue(null);
    mockRequirePrivateSecretApiAccess.mockReturnValue(null);
    mockTwitterFollowerUpsert.mockResolvedValue({
      twitterUsername: 'alice',
      twitterName: 'Alice',
      followedAt: new Date('2026-08-08T00:00:00.000Z'),
    });
  });

  it('fails before reading the body when server secret configuration is invalid', async () => {
    mockRequirePrivateSecretConfigurationApiAccess.mockReturnValue(denied(503));
    const webhookRequest = request({ handle: 'alice', secret: 'candidate' });
    const readerSpy = jest.spyOn(webhookRequest.body!, 'getReader');

    const response = await POST(webhookRequest);

    expect(response.status).toBe(503);
    expect(mockRequirePrivateSecretConfigurationApiAccess).toHaveBeenCalledWith(
      'IFTTT_WEBHOOK_SECRET',
    );
    expect(readerSpy).not.toHaveBeenCalled();
    expect(mockRequirePrivateSecretApiAccess).not.toHaveBeenCalled();
    expect(mockTwitterFollowerUpsert).not.toHaveBeenCalled();
  });

  it('fails closed when the JSON secret is absent, before handle validation or Prisma', async () => {
    mockRequirePrivateSecretApiAccess.mockReturnValue(denied(401));

    const response = await POST(request({ handle: 'alice' }));

    expect(response.status).toBe(401);
    expect(mockRequirePrivateSecretApiAccess).toHaveBeenCalledWith(
      undefined,
      'IFTTT_WEBHOOK_SECRET',
    );
    expect(mockTwitterFollowerUpsert).not.toHaveBeenCalled();
  });

  it('rejects an oversized unauthenticated body before parsing or persistence', async () => {
    const response = await POST(request({ padding: 'x'.repeat(17 * 1024) }));

    expect(response.status).toBe(401);
    expect(mockRequirePrivateSecretApiAccess).not.toHaveBeenCalled();
    expect(mockTwitterFollowerUpsert).not.toHaveBeenCalled();
  });

  it('checks the secret before reporting malformed follower data', async () => {
    mockRequirePrivateSecretApiAccess.mockReturnValue(denied(401));

    const response = await POST(request({ displayName: 'No handle', secret: 'wrong' }));

    expect(response.status).toBe(401);
    expect(mockTwitterFollowerUpsert).not.toHaveBeenCalled();
  });

  it('writes only after the central secret guard authorizes the request', async () => {
    const response = await POST(request({
      handle: '@Alice',
      displayName: 'Alice',
      secret: 'configured-private-secret',
      source: 'ifttt',
    }));

    expect(response.status).toBe(200);
    expect(mockTwitterFollowerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { twitterUsername: 'alice' },
      create: expect.objectContaining({
        twitterUsername: 'alice',
        webhookData: { source: 'ifttt' },
      }),
    }));
  });

  it('protects the diagnostic GET with the local-admin policy', async () => {
    mockRequireLocalAdminApiAccess.mockResolvedValue(denied(404));

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mockTwitterFollowerUpsert).not.toHaveBeenCalled();
  });
});
