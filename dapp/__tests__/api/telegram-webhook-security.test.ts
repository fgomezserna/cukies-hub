jest.mock('@/lib/prisma', () => ({ prisma: {} }));

jest.mock('@/lib/telegram-chat-utils', () => ({
  processTelegramMessage: jest.fn(),
}));

jest.mock('@/lib/telegram-linking', () => {
  const actual = jest.requireActual('@/lib/telegram-linking');
  return {
    ...actual,
    consumeTelegramLinkChallenge: jest.fn(),
  };
});

import type { NextRequest } from 'next/server';

import { POST as telegramWebhook } from '@/app/api/telegram/webhook/route';
import { processTelegramMessage } from '@/lib/telegram-chat-utils';
import { consumeTelegramLinkChallenge } from '@/lib/telegram-linking';

const mockProcessTelegramMessage = processTelegramMessage as jest.Mock;
const mockConsumeChallenge = consumeTelegramLinkChallenge as jest.Mock;

function webhookRequest(secret: string | null, body: unknown, json = jest.fn().mockResolvedValue(body)) {
  const headers = new Headers();
  if (secret !== null) {
    headers.set('x-telegram-bot-api-secret-token', secret);
  }

  return {
    headers,
    json,
  } as unknown as NextRequest;
}

describe('POST /api/telegram/webhook security boundary', () => {
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-secret-for-tests';
    mockConsumeChallenge.mockResolvedValue({ linked: true });
    mockProcessTelegramMessage.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    } else {
      process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('fails closed before JSON parsing or handlers when the secret is not configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const json = jest.fn();
    const response = await telegramWebhook(webhookRequest('anything', {}, json));

    expect(response.status).toBe(503);
    expect(json).not.toHaveBeenCalled();
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
  });

  it.each([null, 'wrong-secret'])('rejects a missing or wrong header before parsing (%s)', async (secret) => {
    const json = jest.fn();
    const response = await telegramWebhook(webhookRequest(secret, {}, json));

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
  });

  it('accepts a valid secret and forwards ordinary messages to the chat bridge', async () => {
    const message = {
      text: 'ordinary chat message',
      from: { id: 12001 },
      chat: { id: -10099, type: 'supergroup' },
    };
    const response = await telegramWebhook(webhookRequest(
      'webhook-secret-for-tests',
      { message },
    ));

    expect(response.status).toBe(200);
    expect(mockProcessTelegramMessage).toHaveBeenCalledWith(message);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('consumes an exact private /verify command from message.from and never bridges it', async () => {
    const token = 'A'.repeat(43);
    const sender = { id: 12001, username: 'verified_sender', first_name: 'Sender' };
    const response = await telegramWebhook(webhookRequest(
      'webhook-secret-for-tests',
      {
        message: {
          text: `/verify ${token}`,
          from: sender,
          chat: { id: 12001, type: 'private' },
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockConsumeChallenge).toHaveBeenCalledWith(token, sender);
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
  });

  it('normalizes leading whitespace before consuming a private verification command', async () => {
    const token = 'W'.repeat(43);
    const sender = { id: 12001, username: 'verified_sender' };
    const response = await telegramWebhook(webhookRequest(
      'webhook-secret-for-tests',
      {
        message: {
          text: ` \t/verify ${token}`,
          from: sender,
          chat: { id: 12001, type: 'private' },
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(mockConsumeChallenge).toHaveBeenCalledWith(token, sender);
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['group spoof', { id: -10099, type: 'supergroup' }, `/verify ${'B'.repeat(43)}`],
    ['group spoof with leading whitespace', { id: -10099, type: 'supergroup' }, `  /verify ${'F'.repeat(43)}`],
    ['foreign private chat', { id: 99999, type: 'private' }, `/verify ${'C'.repeat(43)}`],
    ['malformed command', { id: 12001, type: 'private' }, `/verify ${'D'.repeat(42)}`],
    ['malformed command with bearer', { id: 12001, type: 'private' }, `/verify-${'G'.repeat(43)}`],
    ['quoted command with bearer', { id: 12001, type: 'private' }, `\`/verify ${'H'.repeat(43)}\``],
    ['bare bearer in private chat', { id: 12001, type: 'private' }, 'I'.repeat(43)],
    ['bare bearer in group chat', { id: -10099, type: 'supergroup' }, 'J'.repeat(43)],
    ['bot-qualified command', { id: 12001, type: 'private' }, `/verify@CukiesBot ${'E'.repeat(43)}`],
  ])('acknowledges %s generically without consuming or bridging', async (_name, chat, text) => {
    const response = await telegramWebhook(webhookRequest(
      'webhook-secret-for-tests',
      { message: { text, from: { id: 12001 }, chat } },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(mockProcessTelegramMessage).not.toHaveBeenCalled();
  });
});
