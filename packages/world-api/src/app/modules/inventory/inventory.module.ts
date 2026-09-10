import {
  Inventory,
  InventorySchema,
  Item,
  ItemSchema,
  User,
  UserSchema,
} from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
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
      ],
      'cukiesDB'
    ),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
