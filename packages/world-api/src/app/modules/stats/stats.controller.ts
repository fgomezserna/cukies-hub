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
import { Swagger } from '../../decorators/swagger.decorator';
import { CreateStatsDto } from './dto/create-stats.dto';
import { UpdateStatsDto } from './dto/update-stats.dto';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all stats with params.',
    response: CreateStatsDto,
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
    return this.statsService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one user.',
    response: CreateStatsDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.statsService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one user.',
    response: CreateStatsDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createStatsDto: CreateStatsDto): Promise<Output> {
    return this.statsService.create({ createStatsDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one user.',
    response: CreateStatsDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateStatsDto: UpdateStatsDto
  ): Promise<Output> {
    return this.statsService.update({ id, updateStatsDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Remove one user.',
    response: CreateStatsDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.statsService.remove({ id });
  }
}
