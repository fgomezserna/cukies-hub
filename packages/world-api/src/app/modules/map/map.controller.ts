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
import { Swagger } from '../../decorators/swagger.decorator';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';
import { MapService } from './map.service';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all maps with params.',
    response: CreateMapDto,
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

    return this.mapService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one map.',
    response: CreateMapDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.mapService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one map.',
    response: CreateMapDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createMapDto: CreateMapDto): Promise<Output> {
    return this.mapService.create({ createMapDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one map.',
    response: UpdateMapDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMapDto: UpdateMapDto
  ): Promise<Output> {
    return this.mapService.update({ id, updateMapDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Remove one map.',
    response: UpdateMapDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.mapService.remove({ id });
  }
}
