import { ApiProperty } from '@nestjs/swagger';

export class CreateStatsDto {
  @ApiProperty({
    description: 'Object Id of the user',
    example: '5f9f9f9f9f9f9f9f9f9f9f9f',
  })
  user: string;

  @ApiProperty({
    description: 'Item history',
    example: [
      {
        item: '897798987789',
        amount: 1,
        operation: 'subtract',
        date: 2312131234,
      },
      { item: '897798987789', amount: 1, operation: 'add', date: 2312131234 },
    ],
  })
  itemHistory: {
    item: string;
    amount: number;
    operation: string;
    date: number;
  }[];
}
