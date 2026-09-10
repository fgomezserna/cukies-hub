import { ApiProperty } from '@nestjs/swagger';

export class ItemHistoryDto {
  @ApiProperty({ description: 'String that contains an item id' })
  item: string;

  @ApiProperty({ description: 'Number of quantity' })
  amount: number;

  @ApiProperty({ description: 'String that contains the operation' })
  operation: string;

  @ApiProperty({
    description:
      'Optional string that contains the cuki if it was made by a cuki',
  })
  cuki?: string;

  @ApiProperty({ description: 'String that contains the date' })
  date?: number;
}
