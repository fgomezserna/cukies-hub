import { Output } from '@cukies/world-shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.authentication.guard';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { Swagger } from '../../decorators/swagger.decorator';
import { BuildingTileDto } from './dto/buildingTile.dto';
import { CreateUserMapDto } from './dto/create-userMap.dto';
import { HouseAppliancesDto } from './dto/houseAppliances.dto';
import { IslandActionEventsDto } from './dto/islandActionEvent.dto';
import { IslandChatBlocksDto } from './dto/islandChatBlock.dto';
import { IslandChatMessagesDto } from './dto/islandChatMessage.dto';
import { IslandChatReportsDto } from './dto/islandChatReport.dto';
import { MapTileDto } from './dto/mapTile.dto';
import { MapTileCoordinatesDto } from './dto/mapTileCoordinates';
import { MapTileRangeDto } from './dto/mapTileRange.dto';
import { ShareIslandMapDto } from './dto/shareIslandMap.dto';
import { UpdateUserMapDto } from './dto/update-userMap.dto';
import { UserMapService } from './userMap.service';

@Controller('userMap')
export class UserMapDtoController {
  constructor(private readonly userMapService: UserMapService) {}

  // ADMINISTRATION GUARD SECTION
  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all userMaps with params.',
    response: CreateUserMapDto,
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

    return this.userMapService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one userMap.',
    response: CreateUserMapDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.userMapService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one userMap.',
    response: CreateUserMapDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createUserMapDto: CreateUserMapDto): Promise<Output> {
    return this.userMapService.create({ createUserMapDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one userMap.',
    response: CreateUserMapDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserMapDto: UpdateUserMapDto
  ): Promise<Output> {
    return this.userMapService.update({ id, updateUserMapDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Delete one userMap.',
    response: CreateUserMapDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.userMapService.remove({ id });
  }

  // AUTHENTICATION GUARD SECTION
  @Swagger({
    tag: 'UserMap',
    description: 'Get all userMaps.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken')
  async findAllFromToken(@Query('userId') userId: string): Promise<Output> {
    return this.userMapService.findAllFromToken({ userId });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Get an island map by id. (Only with token authentication)',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/island/:islandId')
  async findIslandMapFromToken(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.findIslandMapFromToken({ userId, islandId });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Update one island map resource tile by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/update-map-tile')
  async updateIslandMapTileFromToken(
    @Param('islandId') islandId: string,
    @Body() mapTileDto: MapTileDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.updateIslandMapTileFromToken({
      userId,
      islandId,
      mapTileDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Update one island map building tile by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/update-building-tile')
  async updateIslandBuildingTileFromToken(
    @Param('islandId') islandId: string,
    @Body() buildingTileDto: BuildingTileDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.updateIslandMapBuildingFromToken({
      userId,
      islandId,
      buildingTileDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Update one island house appliance by island id.',
    response: HouseAppliancesDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/update-house-appliances')
  async updateIslandHouseAppliances(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string,
    @Body()
    houseAppliancesDto: HouseAppliancesDto
  ): Promise<Output> {
    return this.userMapService.updateIslandHouseAppliances({
      userId,
      islandId,
      houseAppliancesDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Get persisted island action events by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/island/:islandId/action-events')
  async getIslandActionEventsFromToken(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string
  ): Promise<Output> {
    return this.userMapService.getIslandActionEventsFromToken({
      userId,
      islandId,
      limit,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Append persisted island action events by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/action-events')
  async appendIslandActionEventsFromToken(
    @Param('islandId') islandId: string,
    @Body() islandActionEventsDto: IslandActionEventsDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.appendIslandActionEventsFromToken({
      userId,
      islandId,
      islandActionEventsDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Get persisted island chat messages by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/island/:islandId/chat-messages')
  async getIslandChatMessagesFromToken(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string
  ): Promise<Output> {
    return this.userMapService.getIslandChatMessagesFromToken({
      userId,
      islandId,
      limit,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Append persisted island chat messages by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/chat-messages')
  async appendIslandChatMessagesFromToken(
    @Param('islandId') islandId: string,
    @Body() islandChatMessagesDto: IslandChatMessagesDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.appendIslandChatMessagesFromToken({
      userId,
      islandId,
      islandChatMessagesDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Get persisted island chat reports by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/island/:islandId/chat-reports')
  async getIslandChatReportsFromToken(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string
  ): Promise<Output> {
    return this.userMapService.getIslandChatReportsFromToken({
      userId,
      islandId,
      limit,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Append persisted island chat reports by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/chat-reports')
  async appendIslandChatReportsFromToken(
    @Param('islandId') islandId: string,
    @Body() islandChatReportsDto: IslandChatReportsDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.appendIslandChatReportsFromToken({
      userId,
      islandId,
      islandChatReportsDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Get persisted island chat blocks by island id.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/island/:islandId/chat-blocks')
  async getIslandChatBlocksFromToken(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string,
    @Query('blockerBackendUserId') blockerBackendUserId?: string,
    @Query('blockerCukieId') blockerCukieId?: string,
    @Query('blockerPlayerId') blockerPlayerId?: string,
    @Query('limit') limit?: string
  ): Promise<Output> {
    return this.userMapService.getIslandChatBlocksFromToken({
      userId,
      islandId,
      blockerBackendUserId,
      blockerCukieId,
      blockerPlayerId,
      limit,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Replace active persisted island chat blocks for one blocker.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/chat-blocks')
  async setIslandChatBlocksFromToken(
    @Param('islandId') islandId: string,
    @Body() islandChatBlocksDto: IslandChatBlocksDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.setIslandChatBlocksFromToken({
      userId,
      islandId,
      islandChatBlocksDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Share an owned island map with another user.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/island/:islandId/share')
  async shareIslandMapFromToken(
    @Param('islandId') islandId: string,
    @Body() shareIslandMapDto: ShareIslandMapDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.shareIslandMapFromToken({
      userId,
      islandId,
      targetUserId: shareIslandMapDto?.targetUserId,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Revoke another user access to an owned island map.',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Delete('fromToken/island/:islandId/share/:targetUserId')
  async unshareIslandMapFromToken(
    @Param('islandId') islandId: string,
    @Param('targetUserId') targetUserId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.unshareIslandMapFromToken({
      userId,
      islandId,
      targetUserId,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description:
      'Read one island access record for a connected player from an island server.',
    response: CreateUserMapDto,
  })
  @Get('island/:islandId/access/:targetUserId')
  async getIslandPlayerAccessForServer(
    @Param('islandId') islandId: string,
    @Param('targetUserId') targetUserId: string,
    @Headers('x-matchmaking-registration-token') serverToken?: string
  ): Promise<Output> {
    return this.userMapService.getIslandPlayerAccessForServer({
      islandId,
      targetUserId,
      serverToken,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Create one userMap. (Only with token authentication)',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken')
  async createFromToken(@Query('userId') userId: string): Promise<Output> {
    return this.userMapService.createFromToken({ userId });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Update one userMap. (Only with token authentication)',
    response: UpdateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken')
  async updateFromToken(
    @Body() updateUserMapDto: UpdateUserMapDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.updateFromToken({
      updateUserMapDto,
      userId,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Remove one userMap. (Only with token authentication)',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Delete('fromToken/:id')
  async removeFromToken(
    @Param('id') id: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.removeFromToken({ userId, mapId: id });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Update one map tile. (Only with token authentication)',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/update-map-tile')
  async updateMapTileFromToken(
    @Body() mapTileDto: MapTileDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.updateMapTileFromToken({ userId, mapTileDto });
  }

  @Swagger({
    tag: 'UserMap',
    description: 'Update one building tile. (Only with token authentication)',
    response: CreateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/update-building-tile')
  async updateBuildingTileFromToken(
    @Body() buildingTileDto: BuildingTileDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userMapService.updateMapBuildingFromToken({
      userId,
      buildingTileDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description:
      'Update a range of map tiles. (Only with token authentication)',
    response: UpdateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/update-map-tile-range')
  async UpdateMapTileRange(
    @Query('userId') userId: string,
    @Body()
    mapTilesDto: MapTileRangeDto
  ): Promise<Output> {
    return this.userMapService.UpdateMapTileRange({ userId, mapTilesDto });
  }

  @Swagger({
    tag: 'UserMap',
    description: "Water one tile (Only with token authentication')",
    response: UpdateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/water-tile')
  async waterTile(
    @Query('userId') userId: string,
    @Body()
    mapTileCoordinatesDto: MapTileCoordinatesDto
  ): Promise<Output> {
    return this.userMapService.waterMapTileFromToken({
      userId,
      mapTileCoordinatesDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: "Water array of tiles (Only with token authentication')",
    response: { message: 'All tiles watered', code: 200 },
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/water-tiles')
  async waterTiles(
    @Query('userId') userId: string,
    @Body()
    {
      mapTilesCoordinatesDto,
    }: { mapTilesCoordinatesDto: MapTileCoordinatesDto[] }
  ): Promise<Output> {
    return this.userMapService.waterMapTilesFromToken({
      userId,
      mapTilesCoordinatesDto,
    });
  }

  @Swagger({
    tag: 'UserMap',
    description: "Fertilise one tile (Only with token authentication')",
    response: UpdateUserMapDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/fertilise-tile')
  async fertiliseTile(
    @Query('userId') userId: string,
    @Body()
    mapTileCoordinatesDto: MapTileCoordinatesDto
  ): Promise<Output> {
    return this.userMapService.fertiliseMapTileFromToken({
      userId,
      mapTileCoordinatesDto,
    });
  }
  @Swagger({
    tag: 'UserMap',
    description:
      "Actualizar los electrodomésticos de la casa (Solo con autenticación de token')",
    response: HouseAppliancesDto,
  })
  @UseGuards(AuthenticationGuard)
  @Post('fromToken/update-house-appliances')
  async updateHouseAppliances(
    @Query('userId') userId: string,
    @Body()
    houseAppliancesDto: HouseAppliancesDto
  ): Promise<Output> {
    return this.userMapService.updateHouseAppliances({
      userId,
      houseAppliancesDto,
    });
  }
}
