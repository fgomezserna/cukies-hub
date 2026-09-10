import {
  Cukie,
  CukieSchema,
  Inventory,
  InventorySchema,
  Item,
  ItemSchema,
  Movement,
  MovementSchema,
  User,
  UserSchema,
} from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryService } from '../inventory/inventory.service';
import { ItemController } from './item.controller';
import { ItemService } from './item.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Item.name, schema: ItemSchema },
        { name: Movement.name, schema: MovementSchema },
        { name: Inventory.name, schema: InventorySchema },
      ],
      'gameDB'
    ),
    MongooseModule.forFeature(
      [
        { name: Cukie.name, schema: CukieSchema },
        { name: User.name, schema: UserSchema },
      ],
      'cukiesDB'
    ),
  ],
  controllers: [ItemController],
  providers: [ItemService, InventoryService],
})
export class ItemModule {}
