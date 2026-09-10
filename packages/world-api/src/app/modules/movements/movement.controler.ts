import { Output } from '@cukies/world-shared';
import { Movement } from '@cukies/world-shared';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { Swagger } from '../../decorators/swagger.decorator';
import { MovementService } from './movement.service';

@Controller('movement')
export class MovementController {
  constructor(private readonly movementService: MovementService) {}

  @Swagger({
    tag: 'Movements',
    description: 'Get all movements from user and cuki.',
    response: Movement,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken/user-movements/:cukiId')
  async getUserMovements(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ): Promise<Output> {
    console.log('cukiId', cukiId);
    return await this.movementService.getUserMovements({ userId, cukiId });
  }
}
