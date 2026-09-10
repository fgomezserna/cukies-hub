import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IslandEconomyController } from './islandEconomy.controller';
import { IslandEconomyService } from './islandEconomy.service';

describe('IslandEconomyController routes', () => {
  let app: NestFastifyApplication;
  let islandEconomyService: {
    applyIslandEconomyMutation: jest.Mock;
    getIslandEconomyMutationStatus: jest.Mock;
  };

  beforeEach(async () => {
    islandEconomyService = {
      applyIslandEconomyMutation: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ mutationId: 'event-14' }],
      }),
      getIslandEconomyMutationStatus: jest.fn().mockResolvedValue({
        totalCount: 1,
        results: [{ mutationId: 'event-14', status: 'applied' }],
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [IslandEconomyController],
      providers: [
        {
          provide: IslandEconomyService,
          useValue: islandEconomyService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('routes island economy mutations to the service with the server header', async () => {
    const payload = {
      sessionId: 'session-a',
      joinToken: 'join-token-a',
      cukiId: 'cuki-a',
      mutationId: 'event-14',
      inventoryDeltas: [{ id: 'SM_Stone', amount: 1 }],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/islandEconomy/island/island-a/mutation',
      headers: {
        'x-island-economy-token': 'server-token-a',
      },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ mutationId: 'event-14' }],
    });
    expect(
      islandEconomyService.applyIslandEconomyMutation
    ).toHaveBeenCalledWith({
      islandId: 'island-a',
      mutationDto: payload,
      serverToken: 'server-token-a',
    });
  });

  it('routes island economy mutation status reads to the service with the server header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/islandEconomy/island/island-a/mutation/event-14',
      headers: {
        'x-island-economy-token': 'server-token-a',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      totalCount: 1,
      results: [{ mutationId: 'event-14', status: 'applied' }],
    });
    expect(
      islandEconomyService.getIslandEconomyMutationStatus
    ).toHaveBeenCalledWith({
      islandId: 'island-a',
      mutationId: 'event-14',
      serverToken: 'server-token-a',
    });
  });
});
