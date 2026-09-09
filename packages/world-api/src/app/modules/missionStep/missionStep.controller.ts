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
import { CreateMissionStepDto } from './dto/create-missionStep.dto';
import { UpdateMissionStepDto } from './dto/update-missionStep.dto';
import { MissionStepService } from './missionStep.service';

@Controller('missionStep')
export class MissionStepController {
  constructor(private readonly missionStepService: MissionStepService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all missionSteps with params.',
    response: CreateMissionStepDto,
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

    return this.missionStepService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one missionStep.',
    response: CreateMissionStepDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.missionStepService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one missionStep.',
    response: CreateMissionStepDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(
    @Body() createMissionStepDto: CreateMissionStepDto
  ): Promise<Output> {
    return this.missionStepService.create({ createMissionStepDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one missionStep.',
    response: UpdateMissionStepDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMissionStepDto: UpdateMissionStepDto
  ): Promise<Output> {
    return this.missionStepService.update({ id, updateMissionStepDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one missionStep.',
    response: CreateMissionStepDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.missionStepService.remove({ id });
  }
}
