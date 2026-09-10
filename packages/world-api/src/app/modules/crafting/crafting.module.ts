import {
  Crafting,
  CraftingSchema,
  Inventory,
  InventorySchema,
  Item,
  ItemSchema,
} from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CraftingController } from './crafting.controller';
import { CraftingService } from './crafting.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: Crafting.name,
          schema: CraftingSchema,
        },
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
  ],
  controllers: [CraftingController],
  providers: [CraftingService],
})
export class CraftingModule {}
