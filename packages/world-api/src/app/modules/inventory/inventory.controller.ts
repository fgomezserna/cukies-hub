import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Output } from '@cukies/world-shared';
import { AdminGuard } from '../../auth/admin.authentication.guard';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { Swagger } from '../../decorators/swagger.decorator';
import { ChangeEquipItemDto } from './dto/change-equipItem.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { EquipItemDto } from './dto/equipItem.dto';
import { ItemContentDto } from './dto/itemContent.dto';
import { SwapSlotsDto } from './dto/swapSlotsDto.dto';
import { UnequipEquipItemDto } from './dto/unequipEquipItem.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryService } from './inventory.service';

// @ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all inventories with params.',
    response: CreateInventoryDto,
  })
  @UseGuards(AdminGuard)
  @Get()
  async findAll(
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @Query('filterQuery') filterQuery: string,
    @Query('order') order: string
  ): Promise<Output> {
    const params = {
      skip: parseInt(skip),
      limit: parseInt(limit),
      filterQuery: JSON.parse(filterQuery),
      order,
    };

    return this.inventoryService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one inventory.',
    response: CreateInventoryDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.inventoryService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one inventory.',
    response: CreateInventoryDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(
    @Body() createInventoryDto: CreateInventoryDto
  ): Promise<Output> {
    return this.inventoryService.create({ createInventoryDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one inventory.',
    response: UpdateInventoryDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateInventoryDto: UpdateInventoryDto
  ): Promise<Output> {
    return this.inventoryService.update({ id, updateInventoryDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one inventory.',
    response: UpdateInventoryDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.inventoryService.remove({ id });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Update one inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken')
  async updateFromToken(
    @Body() updateInventoryDto: UpdateInventoryDto
  ): Promise<Output> {
    return this.inventoryService.update({
      id: updateInventoryDto._id,
      updateInventoryDto,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Get one inventory (Only with token authentication)',
    response: CreateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/:cukiId')
  async findOneFromToken(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.findOneFromToken({
      userId,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Add item to inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/add-item-to-inventory/:cukiId')
  async addItemToInventoryFromToken(
    @Body()
    itemContentDto: ItemContentDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.addItemToInventory({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Remove item from inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/remove-item-from-inventory/:cukiId')
  async removeItemFromInventoryFromToken(
    @Body()
    itemContentDto: ItemContentDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.removeItemFromInventory({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Remove items from inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/remove-items-from-inventory/:cukiId')
  async removeItemsFromInventoryFromToken(
    @Body()
    itemContentDto: ItemContentDto[],
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.removeItemsFromInventory({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Add items to inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/add-items-to-inventory/:cukiId')
  async addItemsToInventoryFromToken(
    @Body()
    itemContentDto: ItemContentDto[],
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    console.log('a');
    return this.inventoryService.addItemsToInventory({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Check item from inventory (Only with token authentication)',
    response: ItemContentDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/check-item-from-inventory/:cukiId')
  async checkItemFromInventoryFromToken(
    @Body()
    itemContentDto: ItemContentDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.checkItemFromInventory({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Get equipped items (Only with token authentication)',
    response: ItemContentDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/equipped-items/:cukiId')
  async getEquippedItems(
    @Query('userId') userId: string,
    @Param('cukiId') cukiId: string
  ): Promise<Output> {
    return this.inventoryService.getEquippedItems({
      userId,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Equip item to cuki (Only with token authentication)',
    response: EquipItemDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/equip-item/:cukiId')
  async equipItem(
    @Body() equipItemDto: EquipItemDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.equipItem({
      userId,
      equipItemDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Unequip item from cuki (Only with token authentication)',
    response: EquipItemDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/unequip-item/:cukiId')
  async unequipItem(
    @Body() equipItemDto: EquipItemDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.unequipItem({
      userId,
      equipItemDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description:
      'Change durability of an item (Only with token authentication)',
    response: ChangeEquipItemDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/change-durability/:cukiId')
  async changeDurability(
    @Body() changeEquipItemDto: ChangeEquipItemDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.changeDurability({
      userId,
      changeEquipItemDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Unequip and Equip Item (Only with token authentication)',
    response: ChangeEquipItemDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/unequip-and-equip/:cukiId')
  async unequipAndEquipItem(
    @Body() unequipEquipItemDto: UnequipEquipItemDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    await this.inventoryService.unequipItem({
      userId,
      equipItemDto: unequipEquipItemDto.unequipItem,
      cukiId,
    });
    return this.inventoryService.equipItem({
      userId,
      equipItemDto: unequipEquipItemDto.equipItem,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Inventory',
    description: 'Swap slots of two items in the inventory',
    response: ChangeEquipItemDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/swap-slots/:cukiId')
  async swapSlots(
    @Body() swapSlotsDto: SwapSlotsDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.inventoryService.swapSlots({
      userId,
      swapSlotsDto,
      cukiId,
    });
  }
  @Swagger({
    tag: 'Inventory',
    description: 'Swap slots of two items in the inventory user and cuki',
    response: ChangeEquipItemDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/swap-user-slots/:cukiId')
  async swapUserSlots(
    @Body() swapSlotsDto: SwapSlotsDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    console.log('a');
    return this.inventoryService.swapUserSlots({
      userId,
      swapSlotsDto,
      cukiId,
    });
  }

  @UseGuards(AuthenticationGuard)
  @Post('fromToken/chest-cuki-transfer/:cukiId')
  async chestCukiTransfer(
    @Body() itemContent: (ItemContentDto | undefined)[],
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ) {
    console.log(itemContent);
    return await this.inventoryService.swapItemswithChest({
      userId,
      itemContent,
      cukiId,
    });
  }
}
