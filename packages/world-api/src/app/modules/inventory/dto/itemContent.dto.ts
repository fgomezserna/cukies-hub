import { ApiProperty } from '@nestjs/swagger';

export class ItemContentDto {
  @ApiProperty({ description: 'String that contains an item id' })
  id: string;

  @ApiProperty({ description: 'Number of quantity' })
  amount?: number;

  @ApiProperty({ description: 'Number of slot' })
  slot: number;

  @ApiProperty({ description: 'Number of durability' })
  durability?: number;
}
