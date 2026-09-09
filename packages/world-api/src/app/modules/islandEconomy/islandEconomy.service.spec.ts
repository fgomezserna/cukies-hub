import { gameEnv } from '@cukies/world-shared';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { IslandEconomyService } from './islandEconomy.service';

describe('IslandEconomyService', () => {
  let inventoryService: {
    addItemsToInventory: jest.Mock;
    removeItemsFromInventory: jest.Mock;
    getInventory: jest.Mock;
  };
  let cukiService: {
    checkCukiOwner: jest.Mock;
    addExpDeltasToCuki: jest.Mock;
  };
  let userMapModel: {
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };
  let service: IslandEconomyService;
  const joinTokenSecret = gameEnv.ISLAND_JOIN_SECRET || 'test-island-join-secret';
  const serverToken =
    gameEnv.ISLAND_SERVER_ECONOMY_TOKEN || 'test-island-economy-token';

  const createJoinToken = (overrides: Record<string, unknown> = {}) =>
    jwt.sign(
      {
        type: 'island-join',
        islandId: 'island-a',
        sessionId: 'session-a',
        userId: 'user-a',
        env: gameEnv.appEnv,
        namespace: gameEnv.namespace,
        ...overrides,
      },
      joinTokenSecret,
      { algorithm: 'HS256', issuer: gameEnv.sessionIssuer, audience: gameEnv.sessionAudience, expiresIn: '10m' }
    );

  beforeEach(() => {
    inventoryService = {
      addItemsToInventory: jest.fn().mockResolvedValue({ totalCount: 1 }),
      removeItemsFromInventory: jest.fn().mockResolvedValue({ totalCount: 1 }),
      getInventory: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ slots: 10, content: [] }],
      }),
    };
    cukiService = {
      checkCukiOwner: jest.fn().mockResolvedValue(true),
      addExpDeltasToCuki: jest.fn().mockResolvedValue({ _id: 'cuki-a' }),
    };
    userMapModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'map-a' }),
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    service = new IslandEconomyService(
      inventoryService as any,
      cukiService as any,
      userMapModel as any
    );
  });

  it('applies inventory and XP deltas with the user id from the signed join token', async () => {
    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [
            { id: 'SM_Stone', amount: 1 },
            { id: 'SM_LamaMadera', amount: -2, slot: 3 },
          ],
          xpDeltas: [{ skill: 'miner', exp: 5 }],
        },
      })
    ).resolves.toEqual({
      totalCount: 1,
      results: [
        {
          islandId: 'island-a',
          sessionId: 'session-a',
          userId: 'user-a',
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryMutationsApplied: 2,
          xpMutationsApplied: 1,
          idempotentReplay: false,
        },
      ],
    });

    expect(cukiService.checkCukiOwner).toHaveBeenCalledWith({
      userId: 'user-a',
      cukiId: 'cuki-a',
    });
    expect(inventoryService.removeItemsFromInventory).toHaveBeenCalledWith({
      userId: 'user-a',
      cukiId: 'cuki-a',
      itemContentDto: [
        {
          id: 'SM_LamaMadera',
          amount: 2,
          slot: 3,
          durability: 0,
        },
      ],
    });
    expect(inventoryService.addItemsToInventory).toHaveBeenCalledWith({
      userId: 'user-a',
      cukiId: 'cuki-a',
      itemContentDto: [
        {
          id: 'SM_Stone',
          amount: 1,
          slot: 0,
          durability: 0,
        },
      ],
    });
    expect(cukiService.addExpDeltasToCuki).toHaveBeenCalledWith({
      userId: 'user-a',
      cukiId: 'cuki-a',
      expDtos: [{ skill: 'miner', exp: 5 }],
    });
    expect(userMapModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        $and: [
          { islandId: 'island-a' },
          {
            'islandEconomyMutations.mutationId': {
              $ne: 'event-14',
            },
          },
        ],
      },
      {
        $push: {
          islandEconomyMutations: {
            $each: [
              expect.objectContaining({
                mutationId: 'event-14',
                status: 'pending',
                islandId: 'island-a',
                sessionId: 'session-a',
                userId: 'user-a',
                cukiId: 'cuki-a',
              }),
            ],
            $slice: -500,
          },
        },
      },
      { new: true }
    );
    expect(userMapModel.updateOne).toHaveBeenCalledWith(
      {
        _id: 'map-a',
        'islandEconomyMutations.mutationId': 'event-14',
      },
      {
        $set: expect.objectContaining({
          'islandEconomyMutations.$.status': 'applied',
          'islandEconomyMutations.$.inventoryMutationsApplied': 2,
          'islandEconomyMutations.$.xpMutationsApplied': 1,
        }),
      }
    );
  });

  it('places reward items without a requested slot in the first available inventory slot', async () => {
    inventoryService.getInventory.mockResolvedValueOnce({
      totalCount: 1,
      results: [
        {
          slots: 3,
          content: [{ id: 'Branch_Tier0', amount: 1, slot: 0 }],
        },
      ],
    });

    await service.applyIslandEconomyMutation({
      islandId: 'island-a',
      serverToken,
      mutationDto: {
        sessionId: 'session-a',
        joinToken: createJoinToken(),
        cukiId: 'cuki-a',
        mutationId: 'event-slot-free',
        inventoryDeltas: [{ id: 'Wood_Tier0', amount: 1 }],
      },
    });

    expect(inventoryService.addItemsToInventory).toHaveBeenCalledWith({
      userId: 'user-a',
      cukiId: 'cuki-a',
      itemContentDto: [
        {
          id: 'Wood_Tier0',
          amount: 1,
          slot: 1,
          durability: 0,
        },
      ],
    });
  });

  it('rejects mutations without the server-only economy token', async () => {
    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Invalid island economy server token',
    });

    expect(cukiService.checkCukiOwner).not.toHaveBeenCalled();
    expect(inventoryService.addItemsToInventory).not.toHaveBeenCalled();
  });

  it('rejects join tokens scoped to another island or session', async () => {
    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken({ islandId: 'island-b' }),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Island join token does not match mutation scope',
    });
  });

  it('rejects mutations without inventory or XP deltas', async () => {
    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'At least one inventory or XP delta is required',
    });
  });

  it('returns an idempotent replay without applying inventory or XP twice', async () => {
    userMapModel.findOneAndUpdate.mockResolvedValueOnce(null);
    userMapModel.findOne.mockResolvedValueOnce({
      _id: 'map-a',
      islandEconomyMutations: [
        {
          mutationId: 'event-14',
          status: 'applied',
          inventoryMutationsApplied: 2,
          xpMutationsApplied: 1,
        },
      ],
    });

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
          xpDeltas: [{ skill: 'miner', exp: 5 }],
        },
      })
    ).resolves.toEqual({
      totalCount: 1,
      results: [
        {
          islandId: 'island-a',
          sessionId: 'session-a',
          userId: 'user-a',
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryMutationsApplied: 2,
          xpMutationsApplied: 1,
          idempotentReplay: true,
        },
      ],
    });

    expect(inventoryService.addItemsToInventory).not.toHaveBeenCalled();
    expect(inventoryService.removeItemsFromInventory).not.toHaveBeenCalled();
    expect(cukiService.addExpDeltasToCuki).not.toHaveBeenCalled();
    expect(userMapModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a duplicate mutation that is still pending', async () => {
    userMapModel.findOneAndUpdate.mockResolvedValueOnce(null);
    userMapModel.findOne.mockResolvedValueOnce({
      _id: 'map-a',
      islandEconomyMutations: [
        {
          mutationId: 'event-14',
          status: 'pending',
        },
      ],
    });

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: 'Island economy mutation is already pending',
    });

    expect(inventoryService.addItemsToInventory).not.toHaveBeenCalled();
  });

  it('rejects a duplicate mutation that previously failed reconciliation', async () => {
    userMapModel.findOneAndUpdate.mockResolvedValueOnce(null);
    userMapModel.findOne.mockResolvedValueOnce({
      _id: 'map-a',
      islandEconomyMutations: [
        {
          mutationId: 'event-14',
          status: 'failed',
          failureReason: 'compensation failed',
          compensationFailed: true,
        },
      ],
    });

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: 'Island economy mutation failed and requires reconciliation',
    });

    expect(inventoryService.addItemsToInventory).not.toHaveBeenCalled();
  });

  it('rejects a mutation when the island map cannot be found', async () => {
    userMapModel.findOneAndUpdate.mockResolvedValueOnce(null);
    userMapModel.findOne.mockResolvedValueOnce(null);

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      message: 'Island map not found',
    });
  });

  it('cleans the pending reservation when applying inventory fails', async () => {
    const inventoryError = new Error('inventory failed');
    inventoryService.addItemsToInventory.mockRejectedValueOnce(inventoryError);

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
        },
      })
    ).rejects.toThrow('inventory failed');

    expect(userMapModel.updateOne).toHaveBeenCalledWith(
      { _id: 'map-a' },
      {
        $pull: {
          islandEconomyMutations: { mutationId: 'event-14' },
        },
      }
    );
  });

  it('releases the pending reservation when inventory capacity rejects a reward', async () => {
    inventoryService.addItemsToInventory.mockRejectedValueOnce(
      new HttpException('Inventory slot is occupied', HttpStatus.CONFLICT)
    );

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-15',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
          xpDeltas: [{ skill: 'miner', exp: 5 }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: 'Inventory slot is occupied',
    });

    expect(cukiService.addExpDeltasToCuki).not.toHaveBeenCalled();
    expect(userMapModel.updateOne).toHaveBeenCalledWith(
      { _id: 'map-a' },
      {
        $pull: {
          islandEconomyMutations: { mutationId: 'event-15' },
        },
      }
    );
  });

  it('compensates inventory and releases the reservation when XP fails', async () => {
    const xpError = new Error('xp failed');
    cukiService.addExpDeltasToCuki.mockRejectedValueOnce(xpError);

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [
            { id: 'SM_LamaMadera', amount: -2, slot: 3 },
            { id: 'SM_Stone', amount: 1 },
          ],
          xpDeltas: [{ skill: 'miner', exp: 5 }],
        },
      })
    ).rejects.toThrow('xp failed');

    expect(inventoryService.removeItemsFromInventory).toHaveBeenNthCalledWith(
      1,
      {
        userId: 'user-a',
        cukiId: 'cuki-a',
        itemContentDto: [
          {
            id: 'SM_LamaMadera',
            amount: 2,
            slot: 3,
            durability: 0,
          },
        ],
      }
    );
    expect(inventoryService.addItemsToInventory).toHaveBeenNthCalledWith(1, {
      userId: 'user-a',
      cukiId: 'cuki-a',
      itemContentDto: [
        {
          id: 'SM_Stone',
          amount: 1,
          slot: 0,
          durability: 0,
        },
      ],
    });
    expect(inventoryService.removeItemsFromInventory).toHaveBeenNthCalledWith(
      2,
      {
        userId: 'user-a',
        cukiId: 'cuki-a',
        itemContentDto: [
          {
            id: 'SM_Stone',
            amount: 1,
            slot: 0,
            durability: 0,
          },
        ],
      }
    );
    expect(inventoryService.addItemsToInventory).toHaveBeenNthCalledWith(2, {
      userId: 'user-a',
      cukiId: 'cuki-a',
      itemContentDto: [
        {
          id: 'SM_LamaMadera',
          amount: 2,
          slot: 3,
          durability: 0,
        },
      ],
    });
    expect(userMapModel.updateOne).toHaveBeenCalledWith(
      { _id: 'map-a' },
      {
        $pull: {
          islandEconomyMutations: { mutationId: 'event-14' },
        },
      }
    );
  });

  it('keeps the reservation when the final applied mark fails after side effects', async () => {
    const ledgerError = new Error('ledger failed');
    userMapModel.updateOne.mockRejectedValueOnce(ledgerError);

    await expect(
      service.applyIslandEconomyMutation({
        islandId: 'island-a',
        serverToken,
        mutationDto: {
          sessionId: 'session-a',
          joinToken: createJoinToken(),
          cukiId: 'cuki-a',
          mutationId: 'event-14',
          inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
          xpDeltas: [{ skill: 'miner', exp: 5 }],
        },
      })
    ).rejects.toThrow('ledger failed');

    expect(userMapModel.updateOne).toHaveBeenCalledTimes(1);
    expect(userMapModel.updateOne).not.toHaveBeenCalledWith(
      { _id: 'map-a' },
      {
        $pull: {
          islandEconomyMutations: { mutationId: 'event-14' },
        },
      }
    );
  });

  it('returns a server-only mutation ledger status', async () => {
    userMapModel.findOne.mockResolvedValueOnce({
      _id: 'map-a',
      islandEconomyMutations: [
        {
          mutationId: 'event-14',
          status: 'applied',
          islandId: 'island-a',
          sessionId: 'session-a',
          userId: 'user-a',
          cukiId: 'cuki-a',
          createdAt: '2026-07-02T04:00:00.000Z',
          appliedAt: '2026-07-02T04:00:01.000Z',
          inventoryMutationsApplied: 2,
          xpMutationsApplied: 1,
        },
      ],
    });

    await expect(
      service.getIslandEconomyMutationStatus({
        islandId: 'island-a',
        mutationId: 'event-14',
        serverToken,
      })
    ).resolves.toEqual({
      totalCount: 1,
      results: [
        {
          mutationId: 'event-14',
          status: 'applied',
          islandId: 'island-a',
          sessionId: 'session-a',
          userId: 'user-a',
          cukiId: 'cuki-a',
          createdAt: '2026-07-02T04:00:00.000Z',
          appliedAt: '2026-07-02T04:00:01.000Z',
          failedAt: undefined,
          inventoryMutationsApplied: 2,
          xpMutationsApplied: 1,
          failureReason: undefined,
          compensationFailed: false,
        },
      ],
    });
  });

  it('rejects mutation ledger status reads without the server token', async () => {
    await expect(
      service.getIslandEconomyMutationStatus({
        islandId: 'island-a',
        mutationId: 'event-14',
      })
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Invalid island economy server token',
    });
  });

  it('returns 404 when a mutation ledger status is missing', async () => {
    userMapModel.findOne.mockResolvedValueOnce(null);

    await expect(
      service.getIslandEconomyMutationStatus({
        islandId: 'island-a',
        mutationId: 'event-14',
        serverToken,
      })
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      message: 'Island economy mutation not found',
    });
  });
});
