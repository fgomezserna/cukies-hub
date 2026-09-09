import { UserMap, UserMapSchema } from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CukiModule } from '../cuki/cuki.module';
import { InventoryModule } from '../inventory/inventory.module';
import { IslandEconomyController } from './islandEconomy.controller';
import { IslandEconomyService } from './islandEconomy.service';

@Module({
  imports: [
    InventoryModule,
    CukiModule,
    MongooseModule.forFeature(
      [{ name: UserMap.name, schema: UserMapSchema }],
      'gameDB'
    ),
  ],
  controllers: [IslandEconomyController],
  providers: [IslandEconomyService],
})
export class IslandEconomyModule {}
