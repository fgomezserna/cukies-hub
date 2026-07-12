jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import {
  consumeTelegramLinkChallenge,
  hashTelegramVerificationToken,
} from '@/lib/telegram-linking';

const mockTransaction = prisma.$transaction as jest.Mock;
const mockFindChallenge = jest.fn();
const mockClaimChallenge = jest.fn();
const mockFindAccountLink = jest.fn();
const mockUpsertAccountLink = jest.fn();
const mockUpdateUser = jest.fn();
const tx = {
  telegramLinkChallenge: {
    findUnique: mockFindChallenge,
    updateMany: mockClaimChallenge,
  },
  telegramAccountLink: {
    findUnique: mockFindAccountLink,
    upsert: mockUpsertAccountLink,
  },
  user: {
    update: mockUpdateUser,
  },
};

const TOKEN = 'V'.repeat(43);
const NOW = new Date('2026-07-12T10:00:00.000Z');
const SENDER = {
  id: 123456789,
  username: 'telegram_user',
  first_name: 'Telegram',
  last_name: 'User',
};

function membershipResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({
      ok: true,
      result: {
        status: 'member',
        user: { id: SENDER.id },
        ...overrides,
      },
    }),
  };
}

describe('Telegram link challenge consumption', () => {
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const previousFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token-for-tests';
    process.env.TELEGRAM_CHAT_ID = '-100123';
    global.fetch = fetchMock as typeof fetch;
    fetchMock.mockResolvedValue(membershipResponse());
    mockTransaction.mockImplementation(async (callback) => callback(tx));
    mockFindChallenge.mockResolvedValue({
      id: 'challenge-id',
      userId: '507f1f77bcf86cd799439011',
      expiresAt: new Date(NOW.getTime() + 60_000),
      consumedAt: null,
    });
    mockFindAccountLink.mockResolvedValue(null);
    mockClaimChallenge.mockResolvedValue({ count: 1 });
    mockUpsertAccountLink.mockResolvedValue({ id: 'link-id' });
    mockUpdateUser.mockResolvedValue({ id: '507f1f77bcf86cd799439011' });
  });

  afterAll(() => {
    global.fetch = previousFetch;
    if (originalBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
  });

  it('uses only the Telegram sender ID, verifies group membership, and links inside one transaction', async () => {
    const result = await consumeTelegramLinkChallenge(TOKEN, SENDER, NOW);

    expect(result).toEqual({ linked: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token-for-tests/getChatMember',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '-100123', user_id: String(SENDER.id) }),
      }),
    );
    expect(mockFindChallenge).toHaveBeenCalledWith({
      where: { tokenHash: hashTelegramVerificationToken(TOKEN) },
      select: { id: true, userId: true, expiresAt: true, consumedAt: true },
    });
    expect(mockClaimChallenge).toHaveBeenCalledWith({
      where: {
        id: 'challenge-id',
        tokenHash: hashTelegramVerificationToken(TOKEN),
        consumedAt: null,
        expiresAt: { gt: NOW },
      },
      data: {
        consumedAt: NOW,
        consumedTelegramUserId: String(SENDER.id),
        consumedTelegramUsername: 'telegram_user',
        consumedTelegramDisplay: 'Telegram User',
      },
    });
    expect(mockUpsertAccountLink).toHaveBeenCalledWith({
      where: { userId: '507f1f77bcf86cd799439011' },
      create: {
        userId: '507f1f77bcf86cd799439011',
        telegramUserId: String(SENDER.id),
        username: 'telegram_user',
        displayName: 'Telegram User',
      },
      update: { username: 'telegram_user', displayName: 'Telegram User' },
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({
      where: { id: '507f1f77bcf86cd799439011' },
      data: { telegramUsername: 'telegram_user' },
    });
  });

  it('rejects an expired challenge before claiming it', async () => {
    mockFindChallenge.mockResolvedValue({
      id: 'challenge-id',
      userId: '507f1f77bcf86cd799439011',
      expiresAt: NOW,
      consumedAt: null,
    });

    await expect(consumeTelegramLinkChallenge(TOKEN, SENDER, NOW))
      .resolves.toEqual({ linked: false });
    expect(mockClaimChallenge).not.toHaveBeenCalled();
    expect(mockUpsertAccountLink).not.toHaveBeenCalled();
  });

  it('rejects replay and races when the atomic claim updates zero rows', async () => {
    mockClaimChallenge.mockResolvedValue({ count: 0 });

    await expect(consumeTelegramLinkChallenge(TOKEN, SENDER, NOW))
      .resolves.toEqual({ linked: false });
    expect(mockUpsertAccountLink).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('rejects a Telegram ID already linked to another user', async () => {
    mockFindAccountLink.mockResolvedValueOnce({ userId: 'another-user-id' });

    await expect(consumeTelegramLinkChallenge(TOKEN, SENDER, NOW))
      .resolves.toEqual({ linked: false });
    expect(mockClaimChallenge).not.toHaveBeenCalled();
    expect(mockUpsertAccountLink).not.toHaveBeenCalled();
  });

  it('rejects membership responses for a different Telegram sender', async () => {
    fetchMock.mockResolvedValue(membershipResponse({ user: { id: 999999 } }));

    await expect(consumeTelegramLinkChallenge(TOKEN, SENDER, NOW))
      .resolves.toEqual({ linked: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('keeps challenge claim and link creation in a rolled-back P2002 transaction', async () => {
    let rolledBack = false;
    mockUpsertAccountLink.mockRejectedValue({ code: 'P2002' });
    mockTransaction.mockImplementation(async (callback) => {
      try {
        return await callback(tx);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });

    await expect(consumeTelegramLinkChallenge(TOKEN, SENDER, NOW))
      .resolves.toEqual({ linked: false });
    expect(mockClaimChallenge).toHaveBeenCalled();
    expect(rolledBack).toBe(true);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
