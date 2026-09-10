import { PartialType } from '@nestjs/swagger';
import { CreateStatsDto } from './create-stats.dto';

export class UpdateStatsDto extends PartialType(CreateStatsDto) {
  _id?: string;
}
