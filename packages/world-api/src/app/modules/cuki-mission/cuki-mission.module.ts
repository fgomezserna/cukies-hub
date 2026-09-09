import {
  Cukie as Cuki,
  CukiMission,
  CukiMissionSchema,
  CukieSchema as CukiSchema,
  Inventory,
  InventorySchema,
  Item,
  ItemSchema,
  Mission,
  MissionSchema,
  User,
  UserSchema,
  Wallet,
  WalletSchema,
} from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CukiService } from '../cuki/cuki.service';
import { InventoryService } from '../inventory/inventory.service';
import { CukiMissionController } from './cuki-mission.controller';
import { CukiMissionService } from './cuki-mission.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: CukiMission.name, schema: CukiMissionSchema },
        { name: Mission.name, schema: MissionSchema },
        {
          name: Inventory.name,
          schema: InventorySchema,
        },
        {
          name: Item.name,
          schema: ItemSchema,
        },
      ],
      'gameDB'
    ),
    MongooseModule.forFeature(
      [
        {
          name: User.name,
          schema: UserSchema,
        },
        { name: Cuki.name, schema: CukiSchema },
        { name: Wallet.name, schema: WalletSchema },
      ],
      'cukiesDB'
    ),
  ],
  controllers: [CukiMissionController],
  providers: [CukiMissionService, InventoryService, CukiService],
})
export class CukiMissionModule {}
