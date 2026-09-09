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
import { CukiService } from './cuki.service';
import { AddExpDto } from './dto/add-exp.dto';
import { CreateCukiDto } from './dto/create-cuki.dto';
import { InGameStatsDto } from './dto/in-game-stats.dto';
import { LevelUpDto } from './dto/level-up.dto';
import { UpdateCukiDto } from './dto/update-cuki.dto';

@Controller('cukie')
export class CukiController {
  constructor(private readonly cukiService: CukiService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all cukies with params.',
    response: CreateCukiDto,
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

    return this.cukiService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one cuki.',
    response: CreateCukiDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.cukiService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create a cuki.',
    response: CreateCukiDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createCukiDto: CreateCukiDto): Promise<Output> {
    return this.cukiService.create({ createCukiDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update a cuki.',
    response: UpdateCukiDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCukiDto: UpdateCukiDto
  ): Promise<Output> {
    return this.cukiService.update({ id, updateCukiDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete a cuki.',
    response: CreateCukiDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.cukiService.remove({ id });
  }

  @Swagger({
    tag: 'Cuki',
    description: 'Get cukies (Only with token authentication)',
    response: CreateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken')
  async getCukiesFromToken(@Query('userId') userId: string) {
    return this.cukiService.getCukies({ userId });
  }

  @Swagger({
    tag: 'Cuki',
    description: 'Update cuki (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken')
  async updateFromToken(
    @Body() updateCukiDto: UpdateCukiDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.cukiService.update({
      id: updateCukiDto._id,
      updateCukiDto,
      userId,
    });
  }

  @Swagger({
    tag: 'Cuki',
    description: 'Get cuki stats (Only with token authentication)',
    response: CreateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/cuki-stats/:cukiId')
  async getCukiStatsFromToken(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.cukiService.getInGameStats({ userId, cukiId });
  }

  @Swagger({
    tag: 'Cuki',
    description: 'Update cuki stats (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken/cuki-stats/:cukiId')
  async updateCukiStatsFromToken(
    @Param('cukiId') cukiId: string,
    @Body() inGameStatsDto: InGameStatsDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.cukiService.updateInGameStats({
      cukiId,
      inGameStatsDto,
      userId,
    });
  }

  @Swagger({
    tag: 'Cuki',
    description: 'Update cuki last activity (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken/last-activity/:cukiId')
  async updateLastActivityFromToken(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.cukiService.updateLastActivity({
      cukiId,
      userId,
    });
  }
  @Swagger({
    tag: 'Cuki',
    description: 'Update cuki last bedrest (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken/last-bedrest/:cukiId')
  async updateLastBedrestFromToken(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.cukiService.updateBedrest({
      cukiId,
      userId,
    });
  }

  // add exp to a cuki
  @Swagger({
    tag: 'Cuki',
    description: 'Add exp to cuki (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/add-exp/:cukiId')
  async addExpToCuki(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string,
    @Body() expDto: AddExpDto
  ) {
    return this.cukiService.addExpToCuki({ cukiId, userId, expDto });
  }

  // level up a cuki
  @Swagger({
    tag: 'Cuki',
    description: 'Level up cuki (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/level-up/:cukiId')
  async levelUpCuki(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string,
    @Body() levelUpDto: LevelUpDto
  ) {
    return this.cukiService.levelUpCuki({
      cukiId,
      userId,
      levelUpDto,
    });
  }

  @UseGuards(AuthenticationGuard)
  @Post('cw-tutorial/:cukiId')
  async updateCwTutorial(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string,
    @Body() { cwTutorial }: { cwTutorial: number }
  ): Promise<Output> {
    return this.cukiService.updateCwTutorial({ cukiId, userId, cwTutorial });
  }

  @Swagger({
    tag: 'Cuki',
    description: 'Save skin variables (Only with token authentication)',
    response: UpdateCukiDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/set-skin-variables/:cukiId')
  async setSkinVariables(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string,
    @Body() { skinVariables }: { skinVariables: [number, number, number] }
  ): Promise<Output> {
    return this.cukiService.setSkinVariables({
      cukiId,
      userId,
      skinVariables,
    });
  }
}
