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
import { CreateResourceMapDto } from './dto/create-resourceMap.dto';
import { UpdateResourceMapDto } from './dto/update-resourceMap.dto';
import { ResourceMapService } from './resourceMap.service';

@Controller('resourceMap')
export class ResourceMapDtoController {
  constructor(private readonly resourceMapService: ResourceMapService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all resourceMaps with params.',
    response: CreateResourceMapDto,
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

    return this.resourceMapService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one resourceMap.',
    response: CreateResourceMapDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.resourceMapService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one resourceMap.',
    response: CreateResourceMapDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(
    @Body() createResourceMapDto: CreateResourceMapDto
  ): Promise<Output> {
    return this.resourceMapService.create({ createResourceMapDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one resourceMap.',
    response: UpdateResourceMapDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateResourceMapDto: UpdateResourceMapDto
  ): Promise<Output> {
    return this.resourceMapService.update({ id, updateResourceMapDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one resourceMap.',
    response: CreateResourceMapDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.resourceMapService.remove({ id });
  }
}
