const mockRequireAdminApiAccess = jest.fn();
const mockRequireLocalAdminApiAccess = jest.fn();
const mockRequirePrivateSecretApiAccess = jest.fn();
const mockGetTelegramUpdates = jest.fn();
const mockProcessTelegramMessage = jest.fn();
const mockCleanupOldVerificationCodes = jest.fn();
const mockReadWalletSession = jest.fn();

jest.mock('@/lib/operational-access', () => ({
  requireAdminApiAccess: (...args: unknown[]) => mockRequireAdminApiAccess(...args),
  requireLocalAdminApiAccess: (...args: unknown[]) => mockRequireLocalAdminApiAccess(...args),
  requirePrivateSecretApiAccess: (...args: unknown[]) => mockRequirePrivateSecretApiAccess(...args),
}));

jest.mock('@/lib/telegram-chat-utils', () => ({
  getTelegramUpdates: (...args: unknown[]) => mockGetTelegramUpdates(...args),
  processTelegramMessage: (...args: unknown[]) => mockProcessTelegramMessage(...args),
}));

jest.mock('@/lib/telegram-utils', () => ({
  cleanupOldVerificationCodes: (...args: unknown[]) => mockCleanupOldVerificationCodes(...args),
}));

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: (...args: unknown[]) => mockReadWalletSession(...args),
}));

import { NextRequest } from 'next/server';

import {
  GET as getAutoSync,
  POST as postAutoSync,
} from '@/app/api/telegram/auto-sync/route';
import {
  GET as getCleanupCodes,
  POST as postCleanupCodes,
} from '@/app/api/telegram/cleanup-codes/route';
import { GET as getChatId } from '@/app/api/telegram/get-chat-id/route';
import { GET as getMyId } from '@/app/api/telegram/get-my-id/route';
import { POST as getUserId } from '@/app/api/telegram/get-user-id/route';
import { GET as getGroupInvite } from '@/app/api/telegram/group-invite/route';
import { GET as getPoll, POST as postPoll } from '@/app/api/telegram/poll/route';
import { GET as getTestConfig } from '@/app/api/telegram/test-config/route';
import { POST as postTestSend } from '@/app/api/telegram/test-send/route';
import * as telegramWebhook from '@/app/api/telegram/webhook/route';

const PRIVATE_SECRET = 'telegram-private-secret-0123456789-ABCDEFGHIJ';
const originalTelegramEnvironment = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_GROUP_INVITE: process.env.TELEGRAM_GROUP_INVITE,
};

function restoreTelegramEnvironment() {
  for (const [name, value] of Object.entries(originalTelegramEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function denied(status = 403) {
  return new Response(JSON.stringify({ error: 'Denied' }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined
      ? headers
      : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Telegram operational routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restoreTelegramEnvironment();
    mockRequireAdminApiAccess.mockResolvedValue(null);
    mockRequireLocalAdminApiAccess.mockResolvedValue(null);
    mockRequirePrivateSecretApiAccess.mockReturnValue(null);
    mockReadWalletSession.mockResolvedValue({
      userId: 'user-1',
      signedWalletAddress: '0x1111111111111111111111111111111111111111',
    });
    (global.fetch as jest.Mock).mockReset();
  });

  afterAll(restoreTelegramEnvironment);

  it('stops every admin endpoint before fetch, Telegram processing or timers', async () => {
    mockRequireAdminApiAccess.mockImplementation(async () => denied());
    mockRequireLocalAdminApiAccess.mockImplementation(async () => denied(404));
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 1 as never);

    const responses = await Promise.all([
      postAutoSync(request('/api/telegram/auto-sync', { action: 'start', interval: 5_000 })),
      getAutoSync(request('/api/telegram/auto-sync')),
      getChatId(),
      getMyId(),
      getUserId(request('/api/telegram/get-user-id', { username: 'alice' })),
      postPoll(request('/api/telegram/poll', {})),
      getPoll(request('/api/telegram/poll')),
      getTestConfig(),
      postTestSend(request('/api/telegram/test-send', { content: 'test', topicId: 7 })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403,
      403,
      404,
      404,
      404,
      403,
      403,
      404,
      404,
    ]);
    expect(mockRequireAdminApiAccess).toHaveBeenCalledTimes(4);
    expect(mockRequireLocalAdminApiAccess).toHaveBeenCalledTimes(5);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockGetTelegramUpdates).not.toHaveBeenCalled();
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
    expect(intervalSpy).not.toHaveBeenCalled();
    intervalSpy.mockRestore();
  });

  it('validates the Telegram webhook secret before parsing or processing an update', async () => {
    mockRequirePrivateSecretApiAccess.mockReturnValue(denied(401));
    const webhookRequest = request(
      '/api/telegram/webhook',
      { update_id: 1, message: { message_id: 2, text: 'forged' } },
      { 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
    );
    const jsonSpy = jest.spyOn(webhookRequest, 'json');

    const response = await telegramWebhook.POST(webhookRequest);

    expect(response.status).toBe(401);
    expect(mockRequirePrivateSecretApiAccess).toHaveBeenCalledWith(
      'wrong-secret',
      'TELEGRAM_WEBHOOK_SECRET',
    );
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
  });

  it('accepts a correctly authorized Telegram webhook without exposing a public GET', async () => {
    mockRequirePrivateSecretApiAccess.mockReturnValue(null);
    const message = {
      message_id: 2,
      from: { id: 3 },
      chat: { id: 4, type: 'group' },
      date: 1,
      text: 'hello',
    };

    const response = await telegramWebhook.POST(request(
      '/api/telegram/webhook',
      { update_id: 1, message },
      { 'X-Telegram-Bot-Api-Secret-Token': PRIVATE_SECRET },
    ));

    expect(response.status).toBe(200);
    expect(mockProcessTelegramMessage).toHaveBeenCalledWith(message);
    expect('GET' in telegramWebhook).toBe(false);
  });

  it('checks cleanup credentials before reading the body or invoking Telegram cleanup', async () => {
    mockRequirePrivateSecretApiAccess.mockReturnValue(denied(503));
    const cleanupRequest = request(
      '/api/telegram/cleanup-codes',
      { maxAgeMinutes: 10 },
      { 'X-Cleanup-Secret': '' },
    );
    const jsonSpy = jest.spyOn(cleanupRequest, 'json');

    const response = await postCleanupCodes(cleanupRequest);

    expect(response.status).toBe(503);
    expect(mockRequirePrivateSecretApiAccess).toHaveBeenCalledWith(
      '',
      'TELEGRAM_CLEANUP_SECRET',
    );
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(mockCleanupOldVerificationCodes).not.toHaveBeenCalled();
  });

  it('protects the cleanup diagnostic GET with the local-admin policy', async () => {
    mockRequireLocalAdminApiAccess.mockResolvedValue(denied(404));

    const response = await getCleanupCodes();

    expect(response.status).toBe(404);
    expect(mockCleanupOldVerificationCodes).not.toHaveBeenCalled();
  });

  it('requires a wallet session and returns only the configured group invite', async () => {
    process.env.TELEGRAM_GROUP_INVITE = 'https://t.me/+configuredInvite';
    process.env.TELEGRAM_BOT_TOKEN = 'must-not-be-used';
    process.env.TELEGRAM_CHAT_ID = 'must-not-be-used';

    mockReadWalletSession.mockResolvedValueOnce(null);
    expect((await getGroupInvite()).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();

    mockReadWalletSession.mockResolvedValueOnce({
      userId: 'user-1',
      signedWalletAddress: '0x1111111111111111111111111111111111111111',
    });
    const response = await getGroupInvite();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      inviteLink: 'https://t.me/+configuredInvite',
      fallbackLink: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends tests only to configured chat and an explicit topic', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'configured-bot-token';
    process.env.TELEGRAM_CHAT_ID = '-100000000001';
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({ ok: true }),
    });

    const response = await postTestSend(request(
      '/api/telegram/test-send',
      { content: 'hello', topicId: 42 },
    ));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botconfigured-bot-token/sendMessage',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: '-100000000001',
          text: '🤖 Test Bot: hello',
          message_thread_id: 42,
        }),
      }),
    );
  });
});
