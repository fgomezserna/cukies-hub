const mockRequireWalletSession = jest.fn();
const mockFindQuests = jest.fn();
const mockFindQuest = jest.fn();
const mockFindStarterQuest = jest.fn();
const mockFindUser = jest.fn();
const mockFindCompletedTasks = jest.fn();
const mockFindUserQuest = jest.fn();

jest.mock('@/lib/wallet-auth', () => ({
  requireWalletSession: (...args: unknown[]) => mockRequireWalletSession(...args),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    quest: {
      findMany: (...args: unknown[]) => mockFindQuests(...args),
      findUnique: (...args: unknown[]) => mockFindQuest(...args),
      findFirst: (...args: unknown[]) => mockFindStarterQuest(...args),
    },
    user: { findUnique: (...args: unknown[]) => mockFindUser(...args) },
    userCompletedTask: {
      findMany: (...args: unknown[]) => mockFindCompletedTasks(...args),
    },
    userQuest: { findUnique: (...args: unknown[]) => mockFindUserQuest(...args) },
  },
}));

import { GET as getQuests } from '@/app/api/quests/route';
import { GET as getQuest } from '@/app/api/quests/[id]/route';

const QUEST = {
  id: 'quest-1',
  name: 'Starter quest',
  isStarter: true,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  tasks: [{ id: 'task-1', questId: 'quest-1', name: 'Task' }],
};

describe('optional quest personalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindQuests.mockResolvedValue([QUEST]);
    mockFindQuest.mockResolvedValue(QUEST);
    mockRequireWalletSession.mockRejectedValue(new Error('Wallet session is required'));
  });

  it('returns only public list state for a wallet query not owned by the session', async () => {
    const response = await getQuests(
      new Request('http://localhost/api/quests?walletAddress=0xvictim'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'quest-1',
        isCompleted: false,
        tasks: [expect.objectContaining({ id: 'task-1', completed: false })],
      }),
    ]);
    expect(mockRequireWalletSession).toHaveBeenCalledWith('0xvictim');
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockFindCompletedTasks).not.toHaveBeenCalled();
    expect(mockFindUserQuest).not.toHaveBeenCalled();
  });

  it('returns only public detail state for a wallet query not owned by the session', async () => {
    const response = await getQuest(
      new Request('http://localhost/api/quests/quest-1?walletAddress=0xvictim'),
      { params: Promise.resolve({ id: 'quest-1' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      id: 'quest-1',
      tasks: [expect.objectContaining({ id: 'task-1', isCompleted: false })],
    }));
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockFindCompletedTasks).not.toHaveBeenCalled();
    expect(mockFindUserQuest).not.toHaveBeenCalled();
  });

  it('personalizes only after the wallet cookie proves ownership', async () => {
    mockRequireWalletSession.mockResolvedValue({ userId: 'user-1' });
    mockFindUser.mockResolvedValue({
      id: 'user-1',
      completedQuests: [{ questId: 'quest-1' }],
      completedTasks: [{ taskId: 'task-1' }],
    });

    const response = await getQuests(
      new Request('http://localhost/api/quests?walletAddress=0xowner'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'quest-1',
        isCompleted: true,
        tasks: [expect.objectContaining({ id: 'task-1', completed: true })],
      }),
    ]);
    expect(mockRequireWalletSession).toHaveBeenCalledWith('0xowner');
    expect(mockFindUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
    }));
  });
});
