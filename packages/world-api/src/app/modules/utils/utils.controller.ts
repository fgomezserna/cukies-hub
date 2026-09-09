import { Controller, Get } from '@nestjs/common';
import { Swagger } from '../../decorators/swagger.decorator';
import { UtilsService } from './utils.service';

@Controller('utils')
export class UtilsController {
  constructor(private readonly utilsService: UtilsService) {}

  @Swagger({
    tag: 'Utils',
    description: "Get server's time.",
    response: Date,
  })
  @Get('server-time')
  getServerTime(): number {
    return this.utilsService.getServerTime();
  }
}
