import { ApiProperty } from '@nestjs/swagger';

export class TradeableItem {
  @ApiProperty({ description: 'String that contains an ItemID' })
  ItemID: string;

  @ApiProperty({ description: 'String that contains an Item price' })
  price: number;
}
