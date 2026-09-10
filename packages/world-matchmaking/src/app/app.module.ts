import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { matchmakingEnv } from '@cukies/world-shared';
import { MongooseModule } from '@nestjs/mongoose';
import {
  User,
  UserMap,
  UserMapSchema,
  UserSchema,
} from '@cukies/world-shared';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WORLD_REDIS_READINESS, WorldHealthController } from '@cukies/world-shared';

const databaseModules = [
        MongooseModule.forRoot(matchmakingEnv.dataMongoUrl, {
          connectionName: 'cukiesDB',
          autoIndex: process.env.NODE_ENV === 'test',
          autoCreate: process.env.NODE_ENV === 'test',
        }),
        MongooseModule.forRoot(matchmakingEnv.gameMongoUrl, {
          connectionName: 'gameDB',
          autoIndex: process.env.NODE_ENV === 'test',
          autoCreate: process.env.NODE_ENV === 'test',
        }),
        MongooseModule.forFeature(
          [{ name: User.name, schema: UserSchema }],
          'cukiesDB'
        ),
        MongooseModule.forFeature(
          [{ name: UserMap.name, schema: UserMapSchema }],
          'gameDB'
        ),
      ];

@Module({
  imports: [
    ConfigModule,
    ...databaseModules,
  ],
  exports: [ConfigModule],
  controllers: [AppController, WorldHealthController],
  providers: [
    AppService,
    {
      provide: WORLD_REDIS_READINESS,
      inject: [AppService],
      useFactory: (service: AppService) => ({
        ping: async () => {
          if (!(await service.ping())) {
            throw new Error('Redis ping failed');
          }
        },
      }),
    },
  ],
})
export class AppModule {}
