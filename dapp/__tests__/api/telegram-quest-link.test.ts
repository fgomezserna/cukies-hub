jest.mock('@/lib/auth-utils', () => ({
  verifyWalletAuth: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    task: { findUnique: jest.fn() },
    userCompletedTask: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    telegramAccountLink: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';

import { POST as verifyQuestTask } from '@/app/api/quests/verify/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { prisma } from '@/lib/prisma';

const mockVerifyWalletAuth = verifyWalletAuth as jest.Mock;
const mockFindUser = prisma.user.findUnique as jest.Mock;
const mockFindTask = prisma.task.findUnique as jest.Mock;
const mockFindCompletion = prisma.userCompletedTask.findUnique as jest.Mock;
const mockCreateCompletion = prisma.userCompletedTask.create as jest.Mock;
const mockFindTelegramLink = prisma.telegramAccountLink.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

function request(value: unknown) {
  return new NextRequest('http://localhost/api/quests/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: '0xAuthenticatedWallet',
      taskId: '507f191e810c19729de860ea',
      type: 'telegram_join',
      value,
    }),
  });
}

describe('telegram_join quest verification', () => {
  const previousFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    mockVerifyWalletAuth.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      walletAddress: '0xAuthenticatedWallet',
    });
    mockFindUser.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      walletAddress: '0xAuthenticatedWallet',
      telegramUsername: 'display_only',
    });
    mockFindTask.mockResolvedValue({
      id: '507f191e810c19729de860ea',
      quest: { id: 'quest-id' },
    });
    mockFindCompletion.mockResolvedValue(null);
    mockCreateCompletion.mockReturnValue({ operation: 'create-completion' });
    mockFindTelegramLink.mockResolvedValue({ id: 'durable-link-id' });
    mockTransaction.mockResolvedValue([{ id: 'completion-id' }]);
  });

  afterAll(() => {
    global.fetch = previousFetch;
  });

  it('ignores the client value and completes only from the authenticated user durable link', async () => {
    const response = await verifyQuestTask(request('attacker-controlled-code'));

    expect(response.status).toBe(200);
    expect(mockFindTelegramLink).toHaveBeenCalledWith({
      where: { userId: '507f1f77bcf86cd799439011' },
      select: { id: true },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateCompletion).toHaveBeenCalledWith({
      data: {
        userId: '507f1f77bcf86cd799439011',
        taskId: '507f191e810c19729de860ea',
      },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not accept the legacy display field or a supplied code without a durable link', async () => {
    mockFindTelegramLink.mockResolvedValue(null);

    const response = await verifyQuestTask(request('plausible-but-untrusted-code'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Complete Telegram verification before checking this task.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
