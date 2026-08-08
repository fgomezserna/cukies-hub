const mockRequireAdminApiAccess = jest.fn();
const mockRequireLocalAdminApiAccess = jest.fn();
const mockConfigureTopic = jest.fn();
const mockCreateRoom = jest.fn();
const mockUpdateRoom = jest.fn();
const mockEmailCount = jest.fn();
const mockGetTelegramUpdates = jest.fn();

jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/operational-access', () => ({
  requireAdminApiAccess: (...args: unknown[]) => mockRequireAdminApiAccess(...args),
  requireLocalAdminApiAccess: (...args: unknown[]) => mockRequireLocalAdminApiAccess(...args),
}));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatRoom: {
      update: (...args: unknown[]) => mockConfigureTopic(...args),
      create: (...args: unknown[]) => mockCreateRoom(...args),
      findUnique: jest.fn(),
    },
    chatMessage: { findMany: jest.fn() },
    emailVerification: {
      count: (...args: unknown[]) => mockEmailCount(...args),
    },
  },
}));
jest.mock('@/lib/telegram-chat-utils', () => ({
  getTelegramUpdates: (...args: unknown[]) => mockGetTelegramUpdates(...args),
  processTelegramMessage: jest.fn(),
}));

import { POST as configureTopic } from '@/app/api/chat/configure-topics/route';
import { POST as createRoom } from '@/app/api/chat/rooms/route';
import { PUT as updateRoom } from '@/app/api/chat/rooms/[gameId]/route';
import { POST as synchronizeTelegram } from '@/app/api/chat/sync-telegram/route';
import { GET as getEmailStatus } from '@/app/api/email/status/route';
import { GET as getDebugEnvironment } from '@/app/api/debug/env/route';

function denied(status = 403) {
  return Response.json({ error: 'Forbidden' }, { status });
}

function unreadableRequest(url: string, method: string) {
  const request = new Request(url, { method });
  const json = jest.fn(() => Promise.reject(new Error('body must not be read')));
  Object.defineProperty(request, 'json', { value: json });
  return { request, json };
}

describe('operational route guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdminApiAccess.mockResolvedValue(denied());
    mockRequireLocalAdminApiAccess.mockResolvedValue(denied(404));
  });

  it('denies topic configuration before reading input or opening Prisma', async () => {
    const { request, json } = unreadableRequest(
      'http://localhost/api/chat/configure-topics',
      'POST',
    );

    const response = await configureTopic(request as never);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockConfigureTopic).not.toHaveBeenCalled();
  });

  it('denies room creation and update before body, params or Prisma', async () => {
    const create = unreadableRequest('http://localhost/api/chat/rooms', 'POST');
    const update = unreadableRequest('http://localhost/api/chat/rooms/game', 'PUT');
    const params = Promise.resolve({ gameId: 'game' });
    const paramsThen = jest.spyOn(params, 'then');

    const createResponse = await createRoom(create.request as never);
    const updateResponse = await updateRoom(update.request as never, { params });

    expect(createResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(create.json).not.toHaveBeenCalled();
    expect(update.json).not.toHaveBeenCalled();
    expect(paramsThen).not.toHaveBeenCalled();
    expect(mockCreateRoom).not.toHaveBeenCalled();
    expect(mockUpdateRoom).not.toHaveBeenCalled();
  });

  it('allows the administrative mutation only after the central guard succeeds', async () => {
    mockRequireAdminApiAccess.mockResolvedValue(null);
    mockCreateRoom.mockResolvedValue({ id: 'room-1', gameId: 'known-game' });
    const request = new Request('http://localhost/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: 'known-game', name: 'Known game' }),
    });

    const response = await createRoom(request as never);

    expect(response.status).toBe(201);
    expect(mockRequireAdminApiAccess).toHaveBeenCalledTimes(1);
    expect(mockCreateRoom).toHaveBeenCalledTimes(1);
  });

  it('denies Telegram sync before calling the bot integration', async () => {
    const response = await synchronizeTelegram();

    expect(response.status).toBe(403);
    expect(mockGetTelegramUpdates).not.toHaveBeenCalled();
  });

  it('denies operational email status before counting records', async () => {
    const response = await getEmailStatus();

    expect(response.status).toBe(403);
    expect(mockEmailCount).not.toHaveBeenCalled();
  });

  it('uses the local-admin policy for debug endpoints', async () => {
    const response = await getDebugEnvironment();

    expect(response.status).toBe(404);
    expect(mockRequireLocalAdminApiAccess).toHaveBeenCalledTimes(1);
    expect(mockRequireAdminApiAccess).not.toHaveBeenCalled();
  });
});
