import { ApiProperty } from '@nestjs/swagger';

export class ChangeEquipItemDto {
  @ApiProperty({ description: 'String that contains an item id' })
  durability: number;

  @ApiProperty({ description: 'String that indicates the equip slot' })
  equipSlot: string;
}
