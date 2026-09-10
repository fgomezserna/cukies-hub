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
import { BuildingService } from './building.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

@Controller('building')
export class BuildingController {
  constructor(private readonly buildingService: BuildingService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all building with params.',
    response: CreateBuildingDto,
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

    return this.buildingService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one building.',
    response: CreateBuildingDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.buildingService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one building',
    response: CreateBuildingDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createBuildingDto: CreateBuildingDto): Promise<Output> {
    return this.buildingService.create({ createBuildingDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one building',
    response: UpdateBuildingDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateBuildingDto: UpdateBuildingDto
  ): Promise<Output> {
    return this.buildingService.update({ id, updateBuildingDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one building',
    response: CreateBuildingDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.buildingService.remove({ id });
  }

  @Swagger({
    tag: 'Building',
    description: 'Get building by id',
    response: CreateBuildingDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/:buildingId')
  async findOneFromToken(
    @Param('buildingId') buildingId: string
  ): Promise<Output> {
    return await this.buildingService.findOne({ id: buildingId });
  }
}
