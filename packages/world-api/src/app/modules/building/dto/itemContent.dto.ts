import { ApiProperty } from '@nestjs/swagger';

export class ItemContentDto {
  @ApiProperty({ description: 'String that contains an item id' })
  item: string;

  @ApiProperty({ description: 'Number of quantity' })
  amount: number;
}
