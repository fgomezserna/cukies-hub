import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let app: TestingModule;
  let appController: AppController;
  let appService: {
    getGameIP: jest.Mock;
    getIslandGameIP: jest.Mock;
    registerIslandServer: jest.Mock;
    heartbeatIslandServer: jest.Mock;
    getRegisteredIslandServers: jest.Mock;
    unregisterIslandServer: jest.Mock;
    createMultiplayerGame: jest.Mock;
    getMultiplayerGame: jest.Mock;
    deleteMultiplayerGame: jest.Mock;
  };

  beforeEach(async () => {
    appService = {
      getGameIP: jest.fn(),
      getIslandGameIP: jest.fn(),
      registerIslandServer: jest.fn(),
      heartbeatIslandServer: jest.fn(),
      getRegisteredIslandServers: jest.fn(),
      unregisterIslandServer: jest.fn(),
      createMultiplayerGame: jest.fn(),
      getMultiplayerGame: jest.fn(),
      deleteMultiplayerGame: jest.fn(),
    };

    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('delegates legacy game-ip lookups to the service', async () => {
    appService.getGameIP.mockResolvedValue('127.0.0.1:7777');

    await expect(appController.getGameIP('singleplayer')).resolves.toBe(
      '127.0.0.1:7777'
    );
    expect(appService.getGameIP).toHaveBeenCalledWith('singleplayer');
  });

  it('delegates island game-ip lookups to the service', async () => {
    const response = {
      connectionUrl: '127.0.0.1:7777',
      ip: '127.0.0.1',
      port: 7777,
      islandId: 'island-a',
      sessionId: 'island-island-a',
      status: 'allocated',
      fleet: 'fleet-island',
      gameServerName: 'island-server-a',
    };
    appService.getIslandGameIP.mockResolvedValue(response);

    await expect(
      appController.getIslandGameIP('island-a', 'user-a', '127.0.0.1:7802')
    ).resolves.toEqual(response);
    expect(appService.getIslandGameIP).toHaveBeenCalledWith(
      'island-a',
      'user-a',
      '127.0.0.1:7802'
    );
  });

  it('delegates island server registration to the service', async () => {
    const payload = {
      serverId: 'registered-server-a',
      connectionUrl: '127.0.0.1:7802',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      joinToken: '0123456789abcdef0123456789abcdef0123456789abcdef',
      capacity: 2,
      count: 0,
      ttlSeconds: 120,
    };
    const response = {
      serverId: 'registered-server-a',
      connectionUrl: '127.0.0.1:7802',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      capacity: 2,
      count: 0,
      status: 'registered',
      fleet: 'registered-island',
      registeredAt: 1,
      expiresAt: 2,
    };
    appService.registerIslandServer.mockResolvedValue(response);

    await expect(
      appController.registerIslandServer('registration-token', payload)
    ).resolves.toEqual(response);
    expect(appService.registerIslandServer).toHaveBeenCalledWith(
      'registration-token',
      payload
    );
  });

  it('delegates island server list to the service', async () => {
    const response = [
      {
        serverId: 'registered-server-a',
        connectionUrl: '127.0.0.1:7802',
        islandId: 'island-a',
        sessionId: 'island-island-a',
        capacity: 2,
        count: 0,
        status: 'registered',
        fleet: 'registered-island',
        registeredAt: 1,
        expiresAt: 2,
      },
    ];
    appService.getRegisteredIslandServers.mockResolvedValue(response);

    await expect(
      appController.getRegisteredIslandServers('registration-token')
    ).resolves.toEqual(response);
    expect(appService.getRegisteredIslandServers).toHaveBeenCalledWith(
      'registration-token'
    );
  });

  it('delegates island server heartbeat to the service', async () => {
    const payload = {
      capacity: 2,
      count: 1,
      status: 'registered',
      ttlSeconds: 120,
    };
    const response = {
      serverId: 'registered-server-a',
      connectionUrl: '127.0.0.1:7802',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      capacity: 2,
      count: 1,
      status: 'registered',
      fleet: 'registered-island',
      registeredAt: 1,
      expiresAt: 3,
    };
    appService.heartbeatIslandServer.mockResolvedValue(response);

    await expect(
      appController.heartbeatIslandServer(
        'registration-token',
        'registered-server-a',
        payload
      )
    ).resolves.toEqual(response);
    expect(appService.heartbeatIslandServer).toHaveBeenCalledWith(
      'registration-token',
      'registered-server-a',
      payload
    );
  });

  it('delegates island server unregister to the service', async () => {
    const response = {
      serverId: 'registered-server-a',
      deleted: true,
    };
    appService.unregisterIslandServer.mockResolvedValue(response);

    await expect(
      appController.unregisterIslandServer(
        'registration-token',
        'registered-server-a'
      )
    ).resolves.toEqual(response);
    expect(appService.unregisterIslandServer).toHaveBeenCalledWith(
      'registration-token',
      'registered-server-a'
    );
  });
});
