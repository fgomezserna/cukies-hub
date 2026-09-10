import { WorldHealthController, gameEnv } from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { BuildingModule } from './modules/building/building.module';
import { CraftingModule } from './modules/crafting/crafting.module';
import { CukiMissionModule } from './modules/cuki-mission/cuki-mission.module';
import { CukiModule } from './modules/cuki/cuki.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { IslandEconomyModule } from './modules/islandEconomy/islandEconomy.module';
import { ItemModule } from './modules/item/item.module';
import { MapModule } from './modules/map/map.module';
import { MissionModule } from './modules/mission/mission.module';
import { MovementModule } from './modules/movements/movement.module';
import { ResourceMapModule } from './modules/resourceMap/resourceMap.module';
import { StatsModule } from './modules/stats/stats.module';
import { UserModule } from './modules/user/user.module';
import { UserMapModule } from './modules/userMap/userMap.module';
import { UtilsModule } from './modules/utils/utils.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '.env.local'],
    }),
    MongooseModule.forRoot(gameEnv.dataMongoUrl, {
      connectionName: 'cukiesDB',
      autoIndex: process.env.NODE_ENV === 'test',
      autoCreate: process.env.NODE_ENV === 'test',
    }),
    MongooseModule.forRoot(gameEnv.gameMongoUrl, {
      connectionName: 'gameDB',
      autoIndex: process.env.NODE_ENV === 'test',
      autoCreate: process.env.NODE_ENV === 'test',
    }),
    JwtModule.register({
      secret: gameEnv.sessionSecret,
    }),
    ItemModule,
    MapModule,
    ResourceMapModule,
    MissionModule,
    CukiMissionModule,
    InventoryModule,
    IslandEconomyModule,
    CraftingModule,
    BuildingModule,
    CukiModule,
    UserModule,
    UserMapModule,
    StatsModule,
    UtilsModule,
    MovementModule,
  ],
  controllers: [WorldHealthController],
  providers: [],
})
export class AppModule {
}
