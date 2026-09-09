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
import { CreateMissionDto } from './dto/create-mission.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';
import { MissionService } from './mission.service';

@Controller('mission')
export class MissionController {
  constructor(private readonly missionService: MissionService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all missions with params.',
    response: CreateMissionDto,
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
    return this.missionService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one mission.',
    response: CreateMissionDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.missionService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one mission.',
    response: CreateMissionDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createMissionDto: CreateMissionDto): Promise<Output> {
    return this.missionService.create({ createMissionDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one mission.',
    response: UpdateMissionDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMissionDto: UpdateMissionDto
  ): Promise<Output> {
    return this.missionService.update({ id, updateMissionDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one mission.',
    response: UpdateMissionDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.missionService.remove({ id });
  }
}
