import {
  Controller,
  Get,
  Param,
  UseGuards,
  Post,
  Body,
  Query,
  Delete,
  Headers,
  Patch,
} from '@nestjs/common';

import { AppService } from './app.service';
import { AuthenticationGuard } from './auth/authentication.guard';
import { CreateMultiplayerGameDto } from './dto/create-multiplayerGame.dto';
import { IslandServerConnectionDto } from './dto/island-server-connection.dto';
import {
  HeartbeatIslandServerDto,
  RegisteredIslandServerDto,
  RegisterIslandServerDto,
  UnregisterIslandServerDto,
} from './dto/registered-island-server.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @UseGuards(AuthenticationGuard)
  @Get('game-ip/island/:islandId')
  getIslandGameIP(
    @Param('islandId') islandId: string,
    @Query('userId') userId: string,
    @Query('excludeConnectionUrl') excludeConnectionUrl?: string
  ): Promise<IslandServerConnectionDto> {
    return this.appService.getIslandGameIP(
      islandId,
      userId,
      excludeConnectionUrl
    );
  }

  @UseGuards(AuthenticationGuard)
  @Get('game-ip/:type')
  getGameIP(@Param('type') type: string): Promise<string> {
    return this.appService.getGameIP(type);
  }

  @Post('island-servers/register')
  registerIslandServer(
    @Headers('x-matchmaking-registration-token') registrationToken: string,
    @Body() registerIslandServerDto: RegisterIslandServerDto
  ): Promise<RegisteredIslandServerDto> {
    return this.appService.registerIslandServer(
      registrationToken,
      registerIslandServerDto
    );
  }

  @Get('island-servers')
  getRegisteredIslandServers(
    @Headers('x-matchmaking-registration-token') registrationToken: string
  ): Promise<RegisteredIslandServerDto[]> {
    return this.appService.getRegisteredIslandServers(registrationToken);
  }

  @Patch('island-servers/:serverId/heartbeat')
  heartbeatIslandServer(
    @Headers('x-matchmaking-registration-token') registrationToken: string,
    @Param('serverId') serverId: string,
    @Body() heartbeatIslandServerDto: HeartbeatIslandServerDto
  ): Promise<RegisteredIslandServerDto> {
    return this.appService.heartbeatIslandServer(
      registrationToken,
      serverId,
      heartbeatIslandServerDto
    );
  }

  @Delete('island-servers/:serverId')
  unregisterIslandServer(
    @Headers('x-matchmaking-registration-token') registrationToken: string,
    @Param('serverId') serverId: string
  ): Promise<UnregisterIslandServerDto> {
    return this.appService.unregisterIslandServer(
      registrationToken,
      serverId
    );
  }

  @UseGuards(AuthenticationGuard)
  @Post('multiplayer')
  async createMultiplayerGame(
    @Query('userId') userId: string,
    @Body()
    createMultiplayerGameDto: CreateMultiplayerGameDto
  ): Promise<number | null> {
    return this.appService.createMultiplayerGame(
      userId,
      createMultiplayerGameDto
    );
  }

  @UseGuards(AuthenticationGuard)
  @Get('multiplayer/:id')
  async getMultiplayerGame(@Param('id') id: string): Promise<string | null> {
    return this.appService.getMultiplayerGame(id);
  }

  @UseGuards(AuthenticationGuard)
  @Delete('multiplayer/:id')
  async deleteMultiplayerGame(@Param('id') id: string): Promise<string | null> {
    return this.appService.deleteMultiplayerGame(id);
  }
}
