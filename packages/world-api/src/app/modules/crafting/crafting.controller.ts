import { Output } from '@cukies/world-shared';
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
import { AdminGuard } from '../../auth/admin.authentication.guard';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { Swagger } from '../../decorators/swagger.decorator';
import { CraftingService } from './crafting.service';
import { CreateCraftingDto } from './dto/create-crafting.dto';
import { UpdateCraftingDto } from './dto/update-crafting.dto';

@Controller('crafting')
export class CraftingController {
  constructor(private readonly craftingService: CraftingService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all crafting with params.',
    response: CreateCraftingDto,
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

    return this.craftingService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one crafting.',
    response: CreateCraftingDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.craftingService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one crafting',
    response: CreateCraftingDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createCraftingDto: CreateCraftingDto): Promise<Output> {
    return this.craftingService.create({ createCraftingDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one crafting',
    response: UpdateCraftingDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCraftingDto: UpdateCraftingDto
  ): Promise<Output> {
    return this.craftingService.update({ id, updateCraftingDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one crafting',
    response: CreateCraftingDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.craftingService.remove({ id });
  }

  @Swagger({
    tag: 'Crafting',
    description:
      'Get the crafted item of cuki. (Only with token authentication)',
    response: CreateCraftingDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken/:cukiId')
  async CraftingFromToken(
    @Param('cukiId') cukiId: string,
    @Param('craftingId') craftingId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    /* return this.craftingService.craftItem({
      userId,
      craftingId,
      cukiId,
    });*/
    return undefined;
  }

  /* @UseGuards(AuthenticationGuard)
  @Patch('fromToken/:craftingId')
  async CraftingToCukiFromToken(
    @Param('craftingId') craftingId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.craftingService.craftItem({
      userId,
      craftingId,
      cukiId: undefined,
    });
  }*/

  @Swagger({
    tag: 'Crafting',
    description:
      'Get the crafted item of user. (Only with token authentication)',
    response: CreateCraftingDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/all/:cukiId')
  async CraftingToAllFromToken(
    @Body() crafting: CreateCraftingDto,
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.craftingService.craftItem({
      userId,
      crafting,
      cukiId,
    });
  }
}
