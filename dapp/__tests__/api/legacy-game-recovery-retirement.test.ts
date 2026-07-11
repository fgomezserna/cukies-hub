jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    gameSession: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    gameResult: { create: jest.fn() },
    pointTransaction: { create: jest.fn() },
  },
}));

import { GET as activeSession } from '@/app/api/games/active-session/route';
import { POST as emergencyResult } from '@/app/api/games/emergency-result/route';
import { prisma } from '@/lib/prisma';

describe('retired legacy game recovery endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 410 from active-session without reading or exposing a bearer', async () => {
    const response = await activeSession();

    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      success: false,
      error: 'This endpoint has been retired',
    });
    expect(prisma.gameSession.findFirst).not.toHaveBeenCalled();
    expect(JSON.stringify(await activeSession().then((result) => result.json()))).not.toContain(
      'sessionToken',
    );
  });

  it('returns 410 from emergency-result with zero Prisma writes', async () => {
    const response = await emergencyResult();

    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      success: false,
      error: 'This endpoint has been retired',
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.gameSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.gameSession.create).not.toHaveBeenCalled();
    expect(prisma.gameSession.update).not.toHaveBeenCalled();
    expect(prisma.gameResult.create).not.toHaveBeenCalled();
    expect(prisma.pointTransaction.create).not.toHaveBeenCalled();
  });
});
