import { ApiProperty } from '@nestjs/swagger';

export class EquipItemDto {
  @ApiProperty({ description: 'String that contains an item id' })
  id: string;

  @ApiProperty({ description: 'Inventory slot number' })
  inventorySlot: number;

  @ApiProperty({ description: 'String that indicates the equip slot' })
  equipSlot: string;
}
