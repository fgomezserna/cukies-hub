import { ApiProperty } from '@nestjs/swagger';

export class HouseAppliancesDto {
  @ApiProperty({ description: 'Tipo' })
  type: string;

  @ApiProperty({ description: 'Índice' })
  index: number;

  @ApiProperty({ description: 'Tier' })
  tier: number;

  @ApiProperty({ description: 'ID' })
  id: string;
}
