import { CanActivate } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../../auth/admin.authentication.guard';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { UserMapDtoController } from './userMap.controller';
import { UserMapService } from './userMap.service';

describe('UserMapDtoController routes', () => {
  let app: NestFastifyApplication;
  let userMapService: {
    findAllFromToken: jest.Mock;
    findIslandMapFromToken: jest.Mock;
    updateIslandMapTileFromToken: jest.Mock;
    updateIslandMapBuildingFromToken: jest.Mock;
    getIslandActionEventsFromToken: jest.Mock;
    appendIslandActionEventsFromToken: jest.Mock;
    getIslandChatMessagesFromToken: jest.Mock;
    appendIslandChatMessagesFromToken: jest.Mock;
    getIslandChatReportsFromToken: jest.Mock;
    appendIslandChatReportsFromToken: jest.Mock;
    getIslandChatBlocksFromToken: jest.Mock;
    setIslandChatBlocksFromToken: jest.Mock;
    shareIslandMapFromToken: jest.Mock;
    unshareIslandMapFromToken: jest.Mock;
    getIslandPlayerAccessForServer: jest.Mock;
  };

  const mockGuard: CanActivate = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    userMapService = {
      findAllFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ _id: 'current-map' }],
      }),
      findIslandMapFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ _id: 'island-map' }],
      }),
      updateIslandMapTileFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ _id: 'island-map', updated: true }],
      }),
      updateIslandMapBuildingFromToken: jest.fn().mockResolvedValue({
        message: 'tile changed',
        code: 200,
      }),
      getIslandActionEventsFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ sequence: 1, eventType: 'building-change' }],
      }),
      appendIslandActionEventsFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ sequence: 2, eventType: 'tile-resource-change' }],
      }),
      getIslandChatMessagesFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ messageKey: 'msg-1', message: 'hola isla' }],
      }),
      appendIslandChatMessagesFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ messageKey: 'msg-2', message: 'hola party' }],
      }),
      getIslandChatReportsFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ reporterPlayerId: 101, targetPlayerId: 202 }],
      }),
      appendIslandChatReportsFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ reporterPlayerId: 101, targetPlayerId: 202 }],
      }),
      getIslandChatBlocksFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ blockerKey: 'backend:owner-user', targetPlayerId: 202 }],
      }),
      setIslandChatBlocksFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ blockerKey: 'backend:owner-user', targetPlayerId: 202 }],
      }),
      shareIslandMapFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ islandId: 'island-map', shared: true }],
      }),
      unshareIslandMapFromToken: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ islandId: 'island-map', shared: false }],
      }),
      getIslandPlayerAccessForServer: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ islandId: 'island-map', accessAllowed: false }],
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UserMapDtoController],
      providers: [
        {
          provide: UserMapService,
          useValue: userMapService,
        },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue(mockGuard)
      .overrideGuard(AuthenticationGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('routes island map lookups to the island service method', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/userMap/fromToken/island/664cad0495e4ec3654af5a0c?userId=664cad0495e4ec3654af5a0b',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ _id: 'island-map' }],
    });
    expect(userMapService.findIslandMapFromToken).toHaveBeenCalledWith({
      userId: '664cad0495e4ec3654af5a0b',
      islandId: '664cad0495e4ec3654af5a0c',
    });
    expect(userMapService.findAllFromToken).not.toHaveBeenCalled();
  });

  it('routes island map tile updates to the island service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/update-map-tile?userId=owner-user',
      payload: {
        x: 0,
        y: 1,
        tileId: 12,
        health: 33,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ _id: 'island-map', updated: true }],
    });
    expect(userMapService.updateIslandMapTileFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      mapTileDto: {
        x: 0,
        y: 1,
        tileId: 12,
        health: 33,
      },
    });
  });

  it('routes island building tile updates to the island service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/update-building-tile?userId=owner-user',
      payload: {
        x: 0,
        y: 1,
        tileId: ['Silo_Tier0', 2],
        buildingResources: [{ item: 'Wood', amount: 3 }],
        link: '1,0',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      message: 'tile changed',
      code: 200,
    });
    expect(
      userMapService.updateIslandMapBuildingFromToken
    ).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      buildingTileDto: {
        x: 0,
        y: 1,
        tileId: ['Silo_Tier0', 2],
        buildingResources: [{ item: 'Wood', amount: 3 }],
        link: '1,0',
      },
    });
  });

  it('routes island action event reads to the island service method', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/userMap/fromToken/island/island-map/action-events?userId=owner-user&limit=25',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ sequence: 1, eventType: 'building-change' }],
    });
    expect(userMapService.getIslandActionEventsFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      limit: '25',
    });
  });

  it('routes island action event appends to the island service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/action-events?userId=owner-user',
      payload: {
        events: [
          {
            sequence: 2,
            eventType: 'tile-resource-change',
            sessionId: 'session-a',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ sequence: 2, eventType: 'tile-resource-change' }],
    });
    expect(
      userMapService.appendIslandActionEventsFromToken
    ).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      islandActionEventsDto: {
        events: [
          {
            sequence: 2,
            eventType: 'tile-resource-change',
            sessionId: 'session-a',
          },
        ],
      },
    });
  });

  it('routes island chat message reads to the island service method', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/userMap/fromToken/island/island-map/chat-messages?userId=owner-user&limit=25',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ messageKey: 'msg-1', message: 'hola isla' }],
    });
    expect(userMapService.getIslandChatMessagesFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      limit: '25',
    });
  });

  it('routes island chat message appends to the island service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/chat-messages?userId=owner-user',
      payload: {
        message: {
          messageKey: 'msg-2',
          senderPlayerId: 101,
          senderBackendUserId: 'backend-user-alice',
          senderCukieId: 'cukie-alice',
          message: 'hola party',
          channel: 'party',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ messageKey: 'msg-2', message: 'hola party' }],
    });
    expect(
      userMapService.appendIslandChatMessagesFromToken
    ).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      islandChatMessagesDto: {
        message: {
          messageKey: 'msg-2',
          senderPlayerId: 101,
          senderBackendUserId: 'backend-user-alice',
          senderCukieId: 'cukie-alice',
          message: 'hola party',
          channel: 'party',
        },
      },
    });
  });

  it('routes island chat report reads to the island service method', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/userMap/fromToken/island/island-map/chat-reports?userId=owner-user&limit=25',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ reporterPlayerId: 101, targetPlayerId: 202 }],
    });
    expect(userMapService.getIslandChatReportsFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      limit: '25',
    });
  });

  it('routes island chat report appends to the island service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/chat-reports?userId=owner-user',
      payload: {
        report: {
          reporterPlayerId: 101,
          reporterBackendUserId: 'backend-user-alice',
          reporterCukieId: 'cukie-alice',
          targetPlayerId: 202,
          targetBackendUserId: 'backend-user-bob',
          targetCukieId: 'cukie-bob',
          reason: 'spam',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ reporterPlayerId: 101, targetPlayerId: 202 }],
    });
    expect(
      userMapService.appendIslandChatReportsFromToken
    ).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      islandChatReportsDto: {
        report: {
          reporterPlayerId: 101,
          reporterBackendUserId: 'backend-user-alice',
          reporterCukieId: 'cukie-alice',
          targetPlayerId: 202,
          targetBackendUserId: 'backend-user-bob',
          targetCukieId: 'cukie-bob',
          reason: 'spam',
        },
      },
    });
  });

  it('routes island chat block reads to the island service method', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/userMap/fromToken/island/island-map/chat-blocks?userId=owner-user&blockerBackendUserId=backend-user-a&limit=25',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ blockerKey: 'backend:owner-user', targetPlayerId: 202 }],
    });
    expect(userMapService.getIslandChatBlocksFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      blockerBackendUserId: 'backend-user-a',
      blockerCukieId: undefined,
      blockerPlayerId: undefined,
      limit: '25',
    });
  });

  it('routes island chat block state writes to the island service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/chat-blocks?userId=owner-user',
      payload: {
        blockerPlayerId: 101,
        blockerBackendUserId: 'backend-user-a',
        blockerCukieId: 'cukie-a',
        blocks: [
          {
            targetPlayerId: 202,
            targetBackendUserId: 'backend-user-b',
            targetCukieId: 'cukie-b',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ blockerKey: 'backend:owner-user', targetPlayerId: 202 }],
    });
    expect(userMapService.setIslandChatBlocksFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      islandChatBlocksDto: {
        blockerPlayerId: 101,
        blockerBackendUserId: 'backend-user-a',
        blockerCukieId: 'cukie-a',
        blocks: [
          {
            targetPlayerId: 202,
            targetBackendUserId: 'backend-user-b',
            targetCukieId: 'cukie-b',
          },
        ],
      },
    });
  });

  it('routes island share requests to the island share service method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/userMap/fromToken/island/island-map/share?userId=owner-user',
      payload: {
        targetUserId: 'target-user',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ islandId: 'island-map', shared: true }],
    });
    expect(userMapService.shareIslandMapFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      targetUserId: 'target-user',
    });
  });

  it('routes island unshare requests to the island unshare service method', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/userMap/fromToken/island/island-map/share/target-user?userId=owner-user',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ islandId: 'island-map', shared: false }],
    });
    expect(userMapService.unshareIslandMapFromToken).toHaveBeenCalledWith({
      userId: 'owner-user',
      islandId: 'island-map',
      targetUserId: 'target-user',
    });
  });

  it('routes island server access checks to the island service method', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/userMap/island/island-map/access/target-user',
      headers: {
        'x-matchmaking-registration-token': 'server-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ islandId: 'island-map', accessAllowed: false }],
    });
    expect(userMapService.getIslandPlayerAccessForServer).toHaveBeenCalledWith({
      islandId: 'island-map',
      targetUserId: 'target-user',
      serverToken: 'server-token',
    });
  });
});
