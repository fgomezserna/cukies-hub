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
import { ItemContentDto } from '../inventory/dto/itemContent.dto';
import { UpdateInventoryDto } from '../inventory/dto/update-inventory.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { TradeableItem } from './dto/tradeable-item';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemService } from './item.service';

@Controller('item')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all items with params.',
    response: CreateItemDto,
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
    return this.itemService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one item.',
    response: CreateItemDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.itemService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one item.',
    response: CreateItemDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createItemDto: CreateItemDto): Promise<Output> {
    return this.itemService.create({ createItemDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one item.',
    response: UpdateItemDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto
  ): Promise<Output> {
    return this.itemService.update({ id, updateItemDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Remove one item.',
    response: UpdateItemDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.itemService.remove({ id });
  }

  @Swagger({
    tag: 'Item',
    description: 'Get all items with prices (Only with token authentication)',
    response: [TradeableItem],
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/get-items-price')
  async getItemsPrice(): Promise<Output> {
    return this.itemService.getItemsWithPrices();
  }

  @Swagger({
    tag: 'Items',
    description:
      'Buy item and add to inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/buy-item/:cukiId')
  async buyItemFromToken(
    @Body()
    itemContentDto: ItemContentDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.itemService.buyItem({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Item',
    description:
      'Sell item and remove from  inventory (Only with token authentication)',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/sell-item/:cukiId')
  async sellItemFromToken(
    @Body()
    itemContentDto: ItemContentDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.itemService.sellItem({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Item',
    description: 'Buy items and add to inventory',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/buy-items/:cukiId')
  async buyItemsFromToken(
    @Body()
    itemContentDto: ItemContentDto[],
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.itemService.buyItems({
      userId,
      itemContentDto,
      cukiId,
    });
  }

  @Swagger({
    tag: 'Item',
    description: 'Sell items and remove from inventory',
    response: UpdateInventoryDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/sell-items/:cukiId')
  async sellItemsFromToken(
    @Body()
    itemContentDto: ItemContentDto[],
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.itemService.sellItems({
      userId,
      itemContentDto,
      cukiId,
    });
  }
}
