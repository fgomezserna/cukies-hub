import { ApiProperty } from '@nestjs/swagger';

export class SwapSlotsDto {
  @ApiProperty({ description: 'Integer slot1' })
  slot1: number;

  @ApiProperty({ description: 'Integer slot2' })
  slot2: number;
}
