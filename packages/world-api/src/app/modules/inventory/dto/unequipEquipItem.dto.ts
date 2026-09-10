import { ApiProperty } from '@nestjs/swagger';
import { EquipItemDto } from './equipItem.dto';

export class UnequipEquipItemDto {
  @ApiProperty({ description: 'EquipItemDto for unequip item' })
  unequipItem: EquipItemDto;

  @ApiProperty({ description: 'EquipItemDto for equip item' })
  equipItem: EquipItemDto;
}
