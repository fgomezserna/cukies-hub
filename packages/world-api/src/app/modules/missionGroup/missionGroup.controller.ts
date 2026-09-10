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
import { CreateMissionGroupDto } from './dto/create-missionGroup.dto';
import { UpdateMissionGroupDto } from './dto/update-missionGroup.dto';
import { MissionGroupService } from './missionGroup.service';

@Controller('missionGroup')
export class MissionGroupController {
  constructor(private readonly missionGroupService: MissionGroupService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all missionGroups with params.',
    response: CreateMissionGroupDto,
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

    return this.missionGroupService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one missionGroup.',
    response: CreateMissionGroupDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.missionGroupService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create a missionGroup.',
    response: CreateMissionGroupDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(
    @Body() createMissionGroupDto: CreateMissionGroupDto
  ): Promise<Output> {
    return this.missionGroupService.create({ createMissionGroupDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update a missionGroup.',
    response: UpdateMissionGroupDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMissionGroupDto: UpdateMissionGroupDto
  ): Promise<Output> {
    return this.missionGroupService.update({ id, updateMissionGroupDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete a missionGroup.',
    response: CreateMissionGroupDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.missionGroupService.remove({ id });
  }
}
