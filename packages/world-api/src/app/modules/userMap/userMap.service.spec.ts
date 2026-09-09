/* eslint-disable @typescript-eslint/no-explicit-any */
import { gameEnv } from '@cukies/world-shared';
import { HttpStatus } from '@nestjs/common';
import { UserMapService } from './userMap.service';

describe('UserMapService island maps', () => {
  const userId = '664cad0495e4ec3654af5a0b';
  const targetUserId = '664cad0495e4ec3654af5a0a';
  const islandId = '664cad0495e4ec3654af5a0c';
  const slugIslandId = 'island-smoke-test';
  const serverToken = 'test-registration-token';

  const resourceMap = {
    _id: 'resource-map-id',
    data: {
      Resources: {
        mapSize: 2,
        mapResources: [
          [
            [1, 1000, 100],
            [2, 1000, 100],
          ],
          [
            [3, 1000, 100],
            [4, 1000, 100],
          ],
        ],
      },
      Buildings: {
        mapSize: 2,
        mapBuildings: [
          [
            ['0', 0, []],
            ['0', 0, []],
          ],
          [
            ['0', 0, []],
            ['0', 0, []],
          ],
        ],
      },
      HouseAppliances: [{ id: 'base-appliance', tier: 1 }],
    },
  };

  const islandMap = {
    _id: islandId,
    user: userId,
    resourceMap,
    baseMap: {
      _id: 'base-map-id',
      data: {
        Map: {
          mapSize: 2,
          mapLayers: [
            [
              [1, 0, 0],
              [1, 0, 0],
            ],
            [
              [1, 0, 0],
              [1, 0, 0],
            ],
          ],
        },
      },
    },
    overrides: {
      Resources: {
        '0_1': [9, 2000, 75],
      },
      Buildings: {
        '1_0': ['Silo_Tier0', 0, [{ item: 'Wood', amount: 2 }]],
      },
      HouseAppliances: [{ id: 'oven', tier: 2 }],
    },
    islandActionEvents: [
      {
        sequence: 1,
        eventType: 'tile-resource-change',
        sessionId: 'session-a',
      },
      {
        sequence: 2,
        eventType: 'building-change',
        sessionId: 'session-a',
      },
    ],
    islandChatMessages: [
      {
        messageKey: 'msg-1',
        sessionId: 'session-a',
        senderName: 'Alice',
        senderPlayerId: 101,
        senderBackendUserId: 'backend-user-alice',
        senderCukieId: 'cukie-alice',
        message: 'hola isla',
        channel: 'island',
        system: false,
        private: false,
        targetPlayerId: -1,
        unixTimeSeconds: 100,
      },
      {
        messageKey: 'msg-2',
        sessionId: 'session-a',
        senderName: 'Server',
        senderPlayerId: -1,
        message: 'Alice entro en la isla.',
        channel: 'system',
        system: true,
        private: false,
        targetPlayerId: -1,
        unixTimeSeconds: 200,
      },
    ],
    islandChatReports: [
      {
        sessionId: 'session-a',
        reporterPlayerId: 101,
        reporterName: 'Alice',
        targetPlayerId: 202,
        targetName: 'Bob',
        reason: 'spam',
        unixTimeSeconds: 100,
      },
      {
        sessionId: 'session-a',
        reporterPlayerId: 303,
        reporterName: 'Carol',
        reporterBackendUserId: 'backend-user-carol',
        reporterCukieId: 'cukie-carol',
        targetPlayerId: 404,
        targetName: 'Dave',
        targetBackendUserId: 'backend-user-dave',
        targetCukieId: 'cukie-dave',
        reason: 'abuse',
        unixTimeSeconds: 200,
      },
    ],
    islandChatBlocks: [
      {
        blockerKey: 'backend:backend-user-alice',
        blockerPlayerId: 101,
        blockerName: 'Alice',
        blockerBackendUserId: 'backend-user-alice',
        blockerCukieId: 'cukie-alice',
        targetKey: 'backend:backend-user-bob',
        targetPlayerId: 202,
        targetName: 'Bob',
        targetBackendUserId: 'backend-user-bob',
        targetCukieId: 'cukie-bob',
        unixTimeSeconds: 100,
      },
      {
        blockerKey: 'backend:backend-user-carol',
        blockerPlayerId: 303,
        blockerName: 'Carol',
        blockerBackendUserId: 'backend-user-carol',
        targetKey: 'backend:backend-user-dave',
        targetPlayerId: 404,
        targetName: 'Dave',
        targetBackendUserId: 'backend-user-dave',
        unixTimeSeconds: 200,
      },
    ],
  };

  function createService(options?: { user?: unknown; islandMap?: unknown }) {
    const hasIslandMap = Object.prototype.hasOwnProperty.call(
      options ?? {},
      'islandMap'
    );
    const populate = jest
      .fn()
      .mockResolvedValue(hasIslandMap ? options?.islandMap : islandMap);
    const userMapModel = {
      findOne: jest.fn().mockReturnValue({ populate }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const userModel = {
      findById: jest.fn().mockResolvedValue(
        options?.user ?? {
          _id: userId,
          maps: [islandId],
        }
      ),
    };
    const resourceMapModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(resourceMap),
      }),
    };

    const service = new UserMapService(
      {
        get: jest.fn().mockReturnValue({ updateLastChange: jest.fn() }),
      } as any,
      userMapModel as any,
      userModel as any,
      resourceMapModel as any
    );
    service.onModuleInit();

    return { service, userMapModel, userModel, populate };
  }

  function createServiceForMapCreation() {
    const createdUserMap = {
      _id: islandId,
      user: userId,
      resourceMap,
      baseMap: islandMap.baseMap,
      data: {},
      overrides: {
        Resources: {},
        Buildings: {},
        HouseAppliances: [],
      },
    };
    const skip = jest.fn().mockResolvedValue({
      ...resourceMap,
      map: islandMap.baseMap._id,
    });
    const userMapModel = {
      create: jest.fn().mockResolvedValue({ _id: islandId }),
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(createdUserMap),
        }),
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue(createdUserMap),
    };
    const userModel = {
      findById: jest.fn().mockResolvedValue({
        _id: userId,
        maps: [],
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const resourceMapModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ skip }),
      }),
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(resourceMap),
      }),
    };

    const service = new UserMapService(
      {
        get: jest.fn().mockReturnValue({ updateLastChange: jest.fn() }),
      } as any,
      userMapModel as any,
      userModel as any,
      resourceMapModel as any
    );
    service.onModuleInit();

    return { service, userMapModel, userModel };
  }

  function createServiceForSharing(options?: {
    owner?: unknown;
    targetUser?: unknown;
    islandMap?: unknown;
  }) {
    const sharedIslandMap = {
      ...islandMap,
      islandId: slugIslandId,
    };
    const hasIslandMap = Object.prototype.hasOwnProperty.call(
      options ?? {},
      'islandMap'
    );
    const hasOwner = Object.prototype.hasOwnProperty.call(
      options ?? {},
      'owner'
    );
    const hasTargetUser = Object.prototype.hasOwnProperty.call(
      options ?? {},
      'targetUser'
    );
    const userMapModel = {
      findOne: jest
        .fn()
        .mockResolvedValue(hasIslandMap ? options?.islandMap : sharedIslandMap),
    };
    const userModel = {
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === userId) {
          return Promise.resolve(
            hasOwner ? options?.owner : { _id: userId, maps: [islandId] }
          );
        }
        if (id === targetUserId) {
          return Promise.resolve(
            hasTargetUser
              ? options?.targetUser
              : { _id: targetUserId, maps: [] }
          );
        }
        return Promise.resolve(null);
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const resourceMapModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(resourceMap),
      }),
    };

    const service = new UserMapService(
      {
        get: jest.fn().mockReturnValue({ updateLastChange: jest.fn() }),
      } as any,
      userMapModel as any,
      userModel as any,
      resourceMapModel as any
    );
    service.onModuleInit();

    return { service, userMapModel, userModel, sharedIslandMap };
  }

  beforeEach(() => {
    (gameEnv as typeof gameEnv & {
      MATCHMAKING_SERVER_REGISTRATION_TOKEN: string;
    }).MATCHMAKING_SERVER_REGISTRATION_TOKEN = serverToken;
  });

  afterEach(() => {
    (gameEnv as typeof gameEnv & {
      MATCHMAKING_SERVER_REGISTRATION_TOKEN: string;
    }).MATCHMAKING_SERVER_REGISTRATION_TOKEN = '';
  });

  it('returns a materialized island map when the map is accessible', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.findIslandMapFromToken({
      userId,
      islandId,
    })) as any;
    const result = output.results[0] as any;

    expect(output.totalCount).toBe(1);
    expect(result.data.Resources.mapResources[0][1]).toEqual([9, 2000, 75]);
    expect(result.data.Buildings.mapBuildings[1][0]).toEqual([
      'Silo_Tier0',
      0,
      [{ item: 'Wood', amount: 2 }],
    ]);
    expect(result.data.HouseAppliances).toEqual([{ id: 'oven', tier: 2 }]);
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { $or: [{ _id: islandId }, { islandId }] },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
  });

  it('can resolve stable non-object island ids without exposing other maps', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.findIslandMapFromToken({
      userId,
      islandId: slugIslandId,
    })) as any;

    expect(output.results[0].data.Resources.mapResources[0][1]).toEqual([
      9, 2000, 75,
    ]);
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
  });

  it('updates an accessible island resource tile by stable island id', async () => {
    const { service, userMapModel } = createService();
    const update = jest.fn().mockResolvedValue({
      totalCount: 1,
      results: [{ _id: islandId }],
    });
    (service as any).userMapCRUD.update = update;

    const output = (await service.updateIslandMapTileFromToken({
      userId,
      islandId: slugIslandId,
      mapTileDto: {
        x: 0,
        y: 1,
        tileId: 12,
        health: 33,
      },
    })) as any;

    expect(output.results[0]._id).toBe(islandId);
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
    expect(update).toHaveBeenCalledWith(islandId, {
      $set: {
        'overrides.Resources.0_1': [
          12,
          expect.any(Number),
          null,
          null,
          33,
        ],
      },
    });
  });

  it('updates an accessible island building tile by stable island id', async () => {
    const { service, userMapModel } = createService();
    const update = jest.fn().mockResolvedValue({
      totalCount: 1,
      results: [{ _id: islandId }],
    });
    (service as any).userMapCRUD.update = update;

    const output = (await service.updateIslandMapBuildingFromToken({
      userId,
      islandId: slugIslandId,
      buildingTileDto: {
        x: 1,
        y: 0,
        tileId: ['Silo_Tier0', 2],
        buildingResources: [{ item: 'Wood', amount: 3 }],
        link: '0,1',
      },
    })) as any;

    expect(output).toEqual({ message: 'tile changed', code: 200 });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
    expect(update).toHaveBeenCalledWith(islandId, {
      $set: {
        'overrides.Buildings.1_0': [
          'Silo_Tier0',
          2,
          [{ item: 'Wood', amount: 3 }],
          '0,1',
        ],
      },
    });
  });

  it('updates an accessible island house appliance by stable island id', async () => {
    const { service, userMapModel } = createService();
    const update = jest.fn().mockResolvedValue({
      totalCount: 1,
      results: [{ _id: islandId }],
    });
    (service as any).userMapCRUD.update = update;

    const output = (await service.updateIslandHouseAppliances({
      userId,
      islandId: slugIslandId,
      houseAppliancesDto: {
        type: 'appliance',
        index: 1,
        id: 'bed',
        tier: 3,
      },
    })) as any;

    expect(output).toEqual({
      totalCount: 2,
      results: [
        { id: 'oven', tier: 2 },
        { type: 'appliance', index: 1, id: 'bed', tier: 3 },
      ],
    });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
    expect(update).toHaveBeenCalledWith(islandId, {
      $set: {
        'overrides.HouseAppliances': [
          { id: 'oven', tier: 2 },
          { type: 'appliance', index: 1, id: 'bed', tier: 3 },
        ],
      },
    });
  });

  it('returns recent persisted island action events by stable island id', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.getIslandActionEventsFromToken({
      userId,
      islandId: slugIslandId,
      limit: '1',
    })) as any;

    expect(output).toEqual({
      totalCount: 2,
      results: [
        {
          sequence: 2,
          eventType: 'building-change',
          sessionId: 'session-a',
        },
      ],
    });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
  });

  it('appends persisted island action events by stable island id', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.appendIslandActionEventsFromToken({
      userId,
      islandId: slugIslandId,
      islandActionEventsDto: {
        events: [
          {
            sequence: 3,
            eventType: 'resource-harvest',
            sessionId: 'session-a',
            playerId: 101,
            senderName: ' Alice\nPrime ',
            x: 1,
            y: 0,
            subjectId: '41',
            itemId: 'SM_LamaMadera',
            amount: 1,
            xpDelta: 5,
            totalXp: 5,
            tileRevision: 7,
          },
        ],
      },
    })) as any;

    expect(output.totalCount).toBe(1);
    expect(output.results[0]).toMatchObject({
      eventKey: 'action|session-a|3',
      sequence: 3,
      eventType: 'resource-harvest',
      sessionId: 'session-a',
      playerId: 101,
      senderName: 'Alice Prime',
      x: 1,
      y: 0,
      subjectId: '41',
      itemId: 'SM_LamaMadera',
      amount: 1,
      xpDelta: 5,
      totalXp: 5,
      tileRevision: 7,
      buildingRevision: 0,
    });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledWith(
      islandId,
      expect.any(Array),
      { new: false }
    );
    const actionPipeline = userMapModel.findByIdAndUpdate.mock.calls[0][1];
    expect(JSON.stringify(actionPipeline)).toContain('islandActionEvents');
    expect(JSON.stringify(actionPipeline)).toContain('action|session-a|3');
    expect(JSON.stringify(actionPipeline)).toContain('"$not"');
  });

  it('deduplicates retried island action events by session and sequence', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.appendIslandActionEventsFromToken({
      userId,
      islandId: slugIslandId,
      islandActionEventsDto: {
        event: {
          sequence: 2,
          eventType: 'building-change',
          sessionId: 'session-a',
        },
      },
    })) as any;

    expect(output).toEqual({ totalCount: 0, results: [] });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid persisted island action events', async () => {
    const { service, userMapModel } = createService();

    await expect(
      service.appendIslandActionEventsFromToken({
        userId,
        islandId: slugIslandId,
        islandActionEventsDto: {
          events: [{ sequence: 0, eventType: '' }],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'sequence must be positive',
    });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns recent persisted island chat messages by stable island id', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.getIslandChatMessagesFromToken({
      userId,
      islandId: slugIslandId,
      limit: '1',
    })) as any;

    expect(output).toEqual({
      totalCount: 2,
      results: [
        {
          messageKey: 'msg-2',
          sessionId: 'session-a',
          senderName: 'Server',
          senderPlayerId: -1,
          message: 'Alice entro en la isla.',
          channel: 'system',
          system: true,
          private: false,
          targetPlayerId: -1,
          unixTimeSeconds: 200,
        },
      ],
    });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
  });

  it('appends persisted island chat messages by stable island id', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.appendIslandChatMessagesFromToken({
      userId,
      islandId: slugIslandId,
      islandChatMessagesDto: {
        message: {
          messageKey: 'msg-3',
          sessionId: 'session-a',
          senderName: ' Alice\nPrime ',
          senderPlayerId: 101,
          senderBackendUserId: ' backend-user-alice\n ',
          senderCukieId: ' cukie-alice\t ',
          message: ' hola\nparty ',
          channel: 'PARTY',
          unixTimeSeconds: 123,
        },
      },
    })) as any;

    expect(output).toEqual({
      totalCount: 1,
      results: [
        {
          messageKey: 'msg-3',
          sessionId: 'session-a',
          senderName: 'Alice Prime',
          senderPlayerId: 101,
          senderBackendUserId: 'backend-user-alice',
          senderCukieId: 'cukie-alice',
          message: 'hola party',
          channel: 'party',
          system: false,
          private: false,
          targetPlayerId: -1,
          unixTimeSeconds: 123,
        },
      ],
    });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledWith(
      islandId,
      [
        {
          $set: {
            islandChatMessages: {
              $slice: [
                {
                  $concatArrays: [
                    { $ifNull: ['$islandChatMessages', []] },
                    {
                      $filter: {
                        input: { $literal: [output.results[0]] },
                        as: 'incoming',
                        cond: {
                          $not: [
                            {
                              $in: [
                                '$$incoming.messageKey',
                                {
                                  $map: {
                                    input: {
                                      $ifNull: ['$islandChatMessages', []],
                                    },
                                    as: 'existing',
                                    in: '$$existing.messageKey',
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
                -200,
              ],
            },
          },
        },
      ],
      { new: false }
    );
  });

  it('deduplicates persisted island chat messages by key', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.appendIslandChatMessagesFromToken({
      userId,
      islandId: slugIslandId,
      islandChatMessagesDto: {
        message: {
          messageKey: 'msg-2',
          sessionId: 'session-a',
          senderName: 'Server',
          senderPlayerId: -1,
          message: 'Alice entro en la isla.',
          channel: 'system',
          system: true,
        },
      },
    })) as any;

    expect(output).toEqual({
      totalCount: 0,
      results: [],
    });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('reports no insert when a concurrent writer already appended the message key', async () => {
    const { service, userMapModel } = createService();
    userMapModel.findByIdAndUpdate.mockResolvedValue({
      islandChatMessages: [
        ...islandMap.islandChatMessages,
        { messageKey: 'msg-concurrent' },
      ],
    });

    const output = await service.appendIslandChatMessagesFromToken({
      userId,
      islandId: slugIslandId,
      islandChatMessagesDto: {
        message: {
          messageKey: 'msg-concurrent',
          sessionId: 'session-a',
          senderName: 'Alice',
          senderPlayerId: 101,
          message: 'hola concurrente',
          channel: 'island',
        },
      },
    });

    expect(output).toEqual({ totalCount: 0, results: [] });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('fails the append when the atomic map update no longer has a target', async () => {
    const { service, userMapModel } = createService();
    userMapModel.findByIdAndUpdate.mockResolvedValue(null);

    await expect(
      service.appendIslandActionEventsFromToken({
        userId,
        islandId: slugIslandId,
        islandActionEventsDto: {
          event: {
            sequence: 3,
            eventType: 'resource-harvest',
            sessionId: 'session-a',
          },
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: 'Island map changed during append',
    });
  });

  it('rejects invalid persisted island chat messages', async () => {
    const { service, userMapModel } = createService();

    await expect(
      service.appendIslandChatMessagesFromToken({
        userId,
        islandId: slugIslandId,
        islandChatMessagesDto: {
          message: {
            message: 'solo para ti',
            private: true,
          },
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'private chat messages are not stored in shared history',
    });

    await expect(
      service.appendIslandChatMessagesFromToken({
        userId,
        islandId: slugIslandId,
        islandChatMessagesDto: {
          message: {
            message: 'Bearer token filtrado',
          },
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'message contains disallowed chat content',
    });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns recent persisted island chat reports by stable island id', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.getIslandChatReportsFromToken({
      userId,
      islandId: slugIslandId,
      limit: '1',
    })) as any;

    expect(output).toEqual({
      totalCount: 2,
      results: [
        {
          sessionId: 'session-a',
          reporterPlayerId: 303,
          reporterName: 'Carol',
          reporterBackendUserId: 'backend-user-carol',
          reporterCukieId: 'cukie-carol',
          targetPlayerId: 404,
          targetName: 'Dave',
          targetBackendUserId: 'backend-user-dave',
          targetCukieId: 'cukie-dave',
          reason: 'abuse',
          unixTimeSeconds: 200,
        },
      ],
    });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
  });

  it('appends persisted island chat reports by stable island id', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.appendIslandChatReportsFromToken({
      userId,
      islandId: slugIslandId,
      islandChatReportsDto: {
        report: {
          reportKey: 'report|session-a|3',
          sequence: 3,
          sessionId: 'session-a',
          reporterPlayerId: 101,
          reporterName: ' Alice\nPrime ',
          reporterBackendUserId: ' backend-user-alice\n ',
          reporterCukieId: ' cukie-alice\t ',
          targetPlayerId: 202,
          targetName: ' Bob\tMuted ',
          targetBackendUserId: ' backend-user-bob\t ',
          targetCukieId: ' cukie-bob\n ',
          reason: ' spam repetido\ncon ruido ',
          unixTimeSeconds: 123,
        },
      },
    })) as any;

    expect(output).toEqual({
      totalCount: 1,
      results: [
        {
          reportKey: 'report|session-a|3',
          sequence: 3,
          sessionId: 'session-a',
          reporterPlayerId: 101,
          reporterName: 'Alice Prime',
          reporterBackendUserId: 'backend-user-alice',
          reporterCukieId: 'cukie-alice',
          targetPlayerId: 202,
          targetName: 'Bob Muted',
          targetBackendUserId: 'backend-user-bob',
          targetCukieId: 'cukie-bob',
          reason: 'spam repetido con ruido',
          unixTimeSeconds: 123,
        },
      ],
    });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledWith(
      islandId,
      expect.any(Array),
      { new: false }
    );
    const reportPipeline = userMapModel.findByIdAndUpdate.mock.calls[0][1];
    expect(JSON.stringify(reportPipeline)).toContain('islandChatReports');
    expect(JSON.stringify(reportPipeline)).toContain('report|session-a|3');
    expect(JSON.stringify(reportPipeline)).toContain('"$not"');
  });

  it('deduplicates retried island chat reports by stable report key', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.appendIslandChatReportsFromToken({
      userId,
      islandId: slugIslandId,
      islandChatReportsDto: {
        report: {
          sessionId: 'session-a',
          reporterPlayerId: 101,
          reporterName: 'Alice',
          targetPlayerId: 202,
          targetName: 'Bob',
          reason: 'spam',
          unixTimeSeconds: 100,
        },
      },
    })) as any;

    expect(output).toEqual({ totalCount: 0, results: [] });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid persisted island chat reports', async () => {
    const { service, userMapModel } = createService();

    await expect(
      service.appendIslandChatReportsFromToken({
        userId,
        islandId: slugIslandId,
        islandChatReportsDto: {
          report: {
            reporterPlayerId: 101,
            targetPlayerId: 101,
            reason: 'self-report',
          },
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Cannot report the same player',
    });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns persisted island chat blocks by blocker identity', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.getIslandChatBlocksFromToken({
      userId,
      islandId: slugIslandId,
      blockerBackendUserId: 'backend-user-alice',
      limit: '10',
    })) as any;

    expect(output).toEqual({
      totalCount: 1,
      results: [
        {
          blockerKey: 'backend:backend-user-alice',
          blockerPlayerId: 101,
          blockerName: 'Alice',
          blockerBackendUserId: 'backend-user-alice',
          blockerCukieId: 'cukie-alice',
          targetKey: 'backend:backend-user-bob',
          targetPlayerId: 202,
          targetName: 'Bob',
          targetBackendUserId: 'backend-user-bob',
          targetCukieId: 'cukie-bob',
          unixTimeSeconds: 100,
        },
      ],
    });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [
        { islandId: slugIslandId },
        { $or: [{ user: userId }, { _id: { $in: [islandId] } }] },
      ],
    });
  });

  it('replaces persisted island chat blocks by blocker identity', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.setIslandChatBlocksFromToken({
      userId,
      islandId: slugIslandId,
      islandChatBlocksDto: {
        blockerPlayerId: 101,
        blockerName: ' Alice\nPrime ',
        blockerBackendUserId: ' backend-user-alice\n ',
        blockerCukieId: ' cukie-alice\t ',
        blocks: [
          {
            targetPlayerId: 202,
            targetName: ' Bob\tMuted ',
            targetBackendUserId: ' backend-user-bob\t ',
            targetCukieId: ' cukie-bob\n ',
            unixTimeSeconds: 123,
          },
        ],
      },
    })) as any;

    expect(output).toEqual({
      totalCount: 1,
      results: [
        {
          blockerKey: 'backend:backend-user-alice',
          blockerPlayerId: 101,
          blockerName: 'Alice Prime',
          blockerBackendUserId: 'backend-user-alice',
          blockerCukieId: 'cukie-alice',
          targetKey: 'backend:backend-user-bob',
          targetPlayerId: 202,
          targetName: 'Bob Muted',
          targetBackendUserId: 'backend-user-bob',
          targetCukieId: 'cukie-bob',
          unixTimeSeconds: 123,
        },
      ],
    });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenNthCalledWith(
      1,
      islandId,
      {
        $pull: {
          islandChatBlocks: { blockerKey: 'backend:backend-user-alice' },
        },
      }
    );
    expect(userMapModel.findByIdAndUpdate).toHaveBeenNthCalledWith(
      2,
      islandId,
      {
        $push: {
          islandChatBlocks: {
            $each: [output.results[0]],
            $slice: -500,
          },
        },
      }
    );
  });

  it('clears persisted island chat blocks by blocker identity', async () => {
    const { service, userMapModel } = createService();

    const output = (await service.setIslandChatBlocksFromToken({
      userId,
      islandId: slugIslandId,
      islandChatBlocksDto: {
        blockerBackendUserId: 'backend-user-alice',
        blocks: [],
      },
    })) as any;

    expect(output).toEqual({
      totalCount: 0,
      results: [],
    });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledWith(islandId, {
      $pull: {
        islandChatBlocks: { blockerKey: 'backend:backend-user-alice' },
      },
    });
  });

  it('rejects invalid persisted island chat blocks', async () => {
    const { service, userMapModel } = createService();

    await expect(
      service.setIslandChatBlocksFromToken({
        userId,
        islandId: slugIslandId,
        islandChatBlocksDto: {
          blockerBackendUserId: 'backend-user-alice',
          blocks: [
            {
              targetBackendUserId: 'backend-user-alice',
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Cannot block the same player',
    });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();

    await expect(
      service.setIslandChatBlocksFromToken({
        userId,
        islandId: slugIslandId,
        islandChatBlocksDto: {
          blocks: [
            {
              targetBackendUserId: 'backend-user-bob',
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'blocker identity is required',
    });
    expect(userMapModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects island tile updates that use global island aliases', async () => {
    const { service, userMapModel } = createService();
    const update = jest.fn();
    (service as any).userMapCRUD.update = update;

    await expect(
      service.updateIslandMapTileFromToken({
        userId,
        islandId: 'current',
        mapTileDto: {
          x: 0,
          y: 1,
          tileId: 12,
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'A stable islandId is required',
    });
    expect(userMapModel.findOne).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects island building updates that use global island aliases', async () => {
    const { service, userMapModel } = createService();
    const update = jest.fn();
    (service as any).userMapCRUD.update = update;

    await expect(
      service.updateIslandMapBuildingFromToken({
        userId,
        islandId: 'current',
        buildingTileDto: {
          x: 0,
          y: 1,
          tileId: ['Silo_Tier0', 2],
          buildingResources: [],
        },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'A stable islandId is required',
    });
    expect(userMapModel.findOne).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('uses the current user map for default island aliases', async () => {
    const { service, userMapModel } = createService();
    jest
      .spyOn(service, 'findAllFromToken')
      .mockResolvedValue({ totalCount: 1, results: [{ _id: 'current' }] });

    const output = (await service.findIslandMapFromToken({
      userId,
      islandId: 'current',
    })) as any;

    expect(output.results[0]).toEqual({ _id: 'current' });
    expect(userMapModel.findOne).not.toHaveBeenCalled();
  });

  it('generates a stable island id when creating a user map from token', async () => {
    const { service, userMapModel, userModel } = createServiceForMapCreation();

    const output = (await service.createFromToken({ userId })) as any;

    expect(output.results[0].islandId).toBe(islandId);
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
      $addToSet: { maps: islandId },
    });
    expect(userMapModel.findByIdAndUpdate).toHaveBeenCalledWith(islandId, {
      $set: { islandId },
    });
  });

  it('rejects unknown island slugs as not found', async () => {
    const { service } = createService({ islandMap: null });

    await expect(
      service.findIslandMapFromToken({ userId, islandId: 'not-an-object-id' })
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      message: 'Island map not found',
    });
  });

  it('rejects maps outside the authenticated user access list', async () => {
    const { service } = createService({ islandMap: null });

    await expect(
      service.findIslandMapFromToken({ userId, islandId })
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      message: 'Island map not found',
    });
  });

  it('shares an owned island map with another user', async () => {
    const { service, userMapModel, userModel } = createServiceForSharing();

    const output = (await service.shareIslandMapFromToken({
      userId,
      islandId: slugIslandId,
      targetUserId,
    })) as any;

    expect(output).toEqual({
      totalCount: 1,
      results: [
        {
          islandId: slugIslandId,
          mapId: islandId,
          ownerUserId: userId,
          targetUserId,
          shared: true,
        },
      ],
    });
    expect(userMapModel.findOne).toHaveBeenCalledWith({
      $and: [{ islandId: slugIslandId }, { user: userId }],
    });
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(targetUserId, {
      $addToSet: { maps: islandId },
    });
  });

  it('revokes island map access from another user', async () => {
    const { service, userModel } = createServiceForSharing();

    const output = (await service.unshareIslandMapFromToken({
      userId,
      islandId: slugIslandId,
      targetUserId,
    })) as any;

    expect(output.results[0]).toEqual({
      islandId: slugIslandId,
      mapId: islandId,
      ownerUserId: userId,
      targetUserId,
      shared: false,
    });
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(targetUserId, {
      $pull: { maps: islandId },
    });
  });

  it('returns server access claims for an island owner', async () => {
    const { service } = createServiceForSharing();

    const output = (await service.getIslandPlayerAccessForServer({
      islandId: slugIslandId,
      targetUserId: userId,
      serverToken,
    })) as any;

    expect(output.results[0]).toEqual({
      islandId: slugIslandId,
      mapId: islandId,
      ownerUserId: userId,
      targetUserId: userId,
      accessAllowed: true,
      islandRole: 'owner',
      islandPermissions: ['harvest', 'build', 'manage-access'],
      canHarvest: true,
      canBuild: true,
      canManageAccess: true,
    });
  });

  it('returns read-only server access claims for a shared island guest', async () => {
    const { service } = createServiceForSharing({
      targetUser: { _id: targetUserId, maps: [islandId] },
    });

    const output = (await service.getIslandPlayerAccessForServer({
      islandId: slugIslandId,
      targetUserId,
      serverToken,
    })) as any;

    expect(output.results[0]).toEqual({
      islandId: slugIslandId,
      mapId: islandId,
      ownerUserId: userId,
      targetUserId,
      accessAllowed: true,
      islandRole: 'guest',
      islandPermissions: [],
      canHarvest: false,
      canBuild: false,
      canManageAccess: false,
    });
  });

  it('returns denied server access claims after island revoke', async () => {
    const { service } = createServiceForSharing({
      targetUser: { _id: targetUserId, maps: [] },
    });

    const output = (await service.getIslandPlayerAccessForServer({
      islandId: slugIslandId,
      targetUserId,
      serverToken,
    })) as any;

    expect(output.results[0]).toMatchObject({
      islandId: slugIslandId,
      mapId: islandId,
      ownerUserId: userId,
      targetUserId,
      accessAllowed: false,
      islandRole: 'none',
      islandPermissions: [],
      canHarvest: false,
      canBuild: false,
      canManageAccess: false,
    });
  });

  it('rejects server access checks without the island server token', async () => {
    const { service } = createServiceForSharing();

    await expect(
      service.getIslandPlayerAccessForServer({
        islandId: slugIslandId,
        targetUserId,
        serverToken: 'wrong-token',
      })
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Island server access denied',
    });
  });

  it('rejects sharing global island aliases', async () => {
    const { service, userMapModel, userModel } = createServiceForSharing();

    await expect(
      service.shareIslandMapFromToken({
        userId,
        islandId: 'current',
        targetUserId,
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'A stable islandId is required',
    });
    expect(userMapModel.findOne).not.toHaveBeenCalled();
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('does not share maps not owned by the authenticated user', async () => {
    const { service, userModel } = createServiceForSharing({ islandMap: null });

    await expect(
      service.shareIslandMapFromToken({
        userId,
        islandId: slugIslandId,
        targetUserId,
      })
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      message: 'Island map not found',
    });
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
