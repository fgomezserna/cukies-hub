import { HttpStatus } from '@nestjs/common';
import { CukiService } from './cuki.service';

describe('CukiService XP mutations', () => {
  let cukiModel: {
    findById: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
  };
  let service: CukiService;

  const createCuki = () => ({
    _id: 'cuki-a',
    user: '0xowner',
    skills: {
      miner: 1,
      engineer: 1,
      farmer: 1,
      gatherer: 1,
      scout: 1,
      breeder: 1,
      life: 100,
      energy: 100,
      generation: 1,
    },
    inGameStats: {
      xp: {
        miner: [10, 0],
        engineer: [0, 0],
        farmer: [0, 0],
        gatherer: [0, 0],
        scout: [0, 0],
        breeder: [0, 0],
        life: [0, 0],
        energy: [0, 0],
        generation: [0, 0],
      },
      life: 80,
      energy: 70,
    },
    lastChanges: [
      {
        category: 'last-activity',
        timestamp: Date.now(),
      },
    ],
    save: jest.fn().mockResolvedValue(undefined),
  });

  const setUserWallets = (wallets: Array<{ address: string }>) => {
    userModel.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ wallets }),
    });
  };

  beforeEach(() => {
    cukiModel = {
      findById: jest.fn(),
    };
    userModel = {
      findById: jest.fn(),
    };

    service = new CukiService(
      cukiModel as any,
      userModel as any,
      {} as any,
      {} as any
    );
  });

  it('adds XP for a cuki controlled by the authenticated user', async () => {
    const cuki = createCuki();
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xOWNER' }]);

    await expect(
      service.addExpToCuki({
        cukiId: 'cuki-a',
        userId: 'user-a',
        expDto: { skill: 'miner', exp: 5 },
      })
    ).resolves.toBe(cuki);

    expect(cuki.inGameStats.xp.miner[0]).toBe(15);
    expect(cuki.inGameStats.xp.miner[1]).toBe(0);
    expect(cuki.save).toHaveBeenCalledTimes(1);
  });

  it('keeps direct XP gain parameter validation before ownership lookup', async () => {
    await expect(
      service.addExpToCuki({
        cukiId: '',
        userId: 'user-a',
        expDto: { skill: 'miner', exp: 5 },
      })
    ).resolves.toEqual({
      message: 'Invalid parameters',
      code: 400,
    });

    expect(userModel.findById).not.toHaveBeenCalled();
    expect(cukiModel.findById).not.toHaveBeenCalled();
  });

  it('rejects direct XP gain for a cuki not controlled by the authenticated user', async () => {
    const cuki = createCuki();
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xother' }]);

    await expect(
      service.addExpToCuki({
        cukiId: 'cuki-a',
        userId: 'user-a',
        expDto: { skill: 'miner', exp: 5 },
      })
    ).rejects.toMatchObject({
      response: 'Your are not the owner of this cuki',
      status: HttpStatus.FORBIDDEN,
    });

    expect(cuki.inGameStats.xp.miner[0]).toBe(10);
    expect(cuki.save).not.toHaveBeenCalled();
  });

  it('levels up a cuki controlled by the authenticated user', async () => {
    const cuki = createCuki();
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xowner' }]);

    await expect(
      service.levelUpCuki({
        cukiId: 'cuki-a',
        userId: 'user-a',
        levelUpDto: { skill: 'miner', cost: 6 },
      })
    ).resolves.toBe(cuki);

    expect(cuki.inGameStats.xp.miner).toEqual([10, 6]);
    expect(cuki.skills.miner).toBe(2);
    expect(cuki.save).toHaveBeenCalledTimes(1);
  });

  it('rejects direct level-up for a cuki not controlled by the authenticated user', async () => {
    const cuki = createCuki();
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xother' }]);

    await expect(
      service.levelUpCuki({
        cukiId: 'cuki-a',
        userId: 'user-a',
        levelUpDto: { skill: 'miner', cost: 6 },
      })
    ).rejects.toMatchObject({
      response: 'Your are not the owner of this cuki',
      status: HttpStatus.FORBIDDEN,
    });

    expect(cuki.inGameStats.xp.miner).toEqual([10, 0]);
    expect(cuki.skills.miner).toBe(1);
    expect(cuki.save).not.toHaveBeenCalled();
  });

  it('keeps depleted life and energy when the latest recovery timestamp is recent', async () => {
    const cuki = createCuki();
    cuki.inGameStats.life = 0;
    cuki.inGameStats.energy = 5;
    cuki.lastChanges = [
      {
        category: 'last-activity',
        timestamp: Date.now() - 60 * 1000,
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);

    await expect(
      service.checkInGameStats({ cukiId: 'cuki-a' })
    ).resolves.toBe(cuki);

    expect(cuki.inGameStats.life).toBe(0);
    expect(cuki.inGameStats.energy).toBe(5);
    expect(cuki.save).not.toHaveBeenCalled();
  });

  it('restores life and energy to max when the latest recovery timestamp is older than eight hours', async () => {
    const cuki = createCuki();
    const oldTimestamp = Date.now() - 8 * 60 * 60 * 1000 - 1;
    cuki.inGameStats.life = 0;
    cuki.inGameStats.energy = 5;
    cuki.lastChanges = [
      {
        category: 'last-bedrest',
        timestamp: oldTimestamp - 1000,
      },
      {
        category: 'last-activity',
        timestamp: oldTimestamp,
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);

    await expect(
      service.checkInGameStats({ cukiId: 'cuki-a' })
    ).resolves.toBe(cuki);

    expect(cuki.inGameStats.life).toBe(100);
    expect(cuki.inGameStats.energy).toBe(100);
    const lastActivity = cuki.lastChanges.find(
      (change) => change.category === 'last-activity'
    );
    expect(lastActivity).toBeDefined();
    expect(lastActivity?.timestamp).toBeGreaterThan(oldTimestamp);
    expect(cuki.save).toHaveBeenCalledTimes(1);
  });

  it('repairs missing current life and energy even when XP shape is valid', async () => {
    const cuki = createCuki();
    delete (cuki.inGameStats as any).life;
    delete (cuki.inGameStats as any).energy;
    cuki.lastChanges = [
      {
        category: 'last-activity',
        timestamp: Date.now() - 60 * 1000,
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);

    await expect(
      service.checkInGameStats({ cukiId: 'cuki-a' })
    ).resolves.toBe(cuki);

    expect(cuki.inGameStats.life).toBe(100);
    expect(cuki.inGameStats.energy).toBe(100);
    expect(cuki.save).toHaveBeenCalledTimes(1);
  });

  it('restores full life and energy before recording last activity', async () => {
    const cuki = createCuki();
    const oldTimestamp = Date.now() - 8 * 60 * 60 * 1000 - 1;
    cuki.inGameStats.life = 0;
    cuki.inGameStats.energy = 0;
    cuki.lastChanges = [
      {
        category: 'last-activity',
        timestamp: oldTimestamp,
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xowner' }]);

    const result = await service.updateLastActivity({
      cukiId: 'cuki-a',
      userId: 'user-a',
    });

    expect((result as any).results[0]).toBe(cuki);
    expect(cuki.inGameStats.life).toBe(100);
    expect(cuki.inGameStats.energy).toBe(100);
    expect(
      cuki.lastChanges.some((change) => change.category === 'last-full-recovery')
    ).toBe(true);
    expect(cuki.save).toHaveBeenCalledTimes(1);
  });

  it('ignores stale zero stats immediately after full recovery', async () => {
    const cuki = createCuki();
    cuki.inGameStats.life = 100;
    cuki.inGameStats.energy = 100;
    cuki.lastChanges = [
      {
        category: 'last-activity',
        timestamp: Date.now(),
      },
      {
        category: 'last-full-recovery',
        timestamp: Date.now(),
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xowner' }]);

    const result = await service.updateInGameStats({
      cukiId: 'cuki-a',
      userId: 'user-a',
      inGameStatsDto: { life: 0, energy: 0 },
    });

    expect((result as any).results[0]).toBe(cuki);
    expect(cuki.inGameStats.life).toBe(100);
    expect(cuki.inGameStats.energy).toBe(100);
    expect(cuki.save).not.toHaveBeenCalled();
  });

  it('keeps full stats when a stale zero update follows an activity recovery', async () => {
    const cuki = createCuki();
    cuki.inGameStats.life = 0;
    cuki.inGameStats.energy = 0;
    cuki.lastChanges = [
      {
        category: 'last-activity',
        timestamp: Date.now() - 8 * 60 * 60 * 1000 - 1,
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xowner' }]);

    await service.updateLastActivity({
      cukiId: 'cuki-a',
      userId: 'user-a',
    });
    expect(cuki.inGameStats.life).toBe(100);
    expect(cuki.inGameStats.energy).toBe(100);

    cuki.save.mockClear();
    await service.updateInGameStats({
      cukiId: 'cuki-a',
      userId: 'user-a',
      inGameStatsDto: { life: 0, energy: 0 },
    });

    expect(cuki.inGameStats.life).toBe(100);
    expect(cuki.inGameStats.energy).toBe(100);
    expect(cuki.save).not.toHaveBeenCalled();
  });

  it('accepts zero stats when they are not a stale post-recovery update', async () => {
    const cuki = createCuki();
    cuki.inGameStats.life = 80;
    cuki.inGameStats.energy = 70;
    cuki.lastChanges = [
      {
        category: 'last-activity',
        timestamp: Date.now(),
      },
    ];
    cukiModel.findById.mockResolvedValue(cuki);
    setUserWallets([{ address: '0xowner' }]);

    await service.updateInGameStats({
      cukiId: 'cuki-a',
      userId: 'user-a',
      inGameStatsDto: { life: 0, energy: 0 },
    });

    expect(cuki.inGameStats.life).toBe(0);
    expect(cuki.inGameStats.energy).toBe(0);
    expect(cuki.save).toHaveBeenCalledTimes(1);
  });
});
