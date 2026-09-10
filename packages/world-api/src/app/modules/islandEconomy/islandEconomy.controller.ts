import { Output } from '@cukies/world-shared';
import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Swagger } from '../../decorators/swagger.decorator';
import { IslandEconomyMutationDto } from './dto/islandEconomyMutation.dto';
import { IslandEconomyService } from './islandEconomy.service';

@Controller('islandEconomy')
export class IslandEconomyController {
  constructor(private readonly islandEconomyService: IslandEconomyService) {}

  @Swagger({
    tag: 'IslandEconomy',
    description: 'Apply a server-authorized island inventory/XP mutation.',
    response: IslandEconomyMutationDto,
  })
  @Post('island/:islandId/mutation')
  async applyIslandEconomyMutation(
    @Param('islandId') islandId: string,
    @Body() mutationDto: IslandEconomyMutationDto,
    @Headers('x-island-economy-token') serverToken?: string
  ): Promise<Output> {
    return this.islandEconomyService.applyIslandEconomyMutation({
      islandId,
      mutationDto,
      serverToken,
    });
  }

  @Swagger({
    tag: 'IslandEconomy',
    description:
      'Read a server-authorized island economy mutation ledger entry.',
    response: IslandEconomyMutationDto,
  })
  @Get('island/:islandId/mutation/:mutationId')
  async getIslandEconomyMutationStatus(
    @Param('islandId') islandId: string,
    @Param('mutationId') mutationId: string,
    @Headers('x-island-economy-token') serverToken?: string
  ): Promise<Output> {
    return this.islandEconomyService.getIslandEconomyMutationStatus({
      islandId,
      mutationId,
      serverToken,
    });
  }
}
