import { ApiProperty } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ description: 'String that contains an ItemName' })
  ItemName: string;

  @ApiProperty({ description: 'String that contains an ItemDescription' })
  ItemDescription: string;

  @ApiProperty({ description: 'String that contains an ItemID' })
  ItemID: string;

  @ApiProperty({ description: 'Number that contains an ItemTier' })
  ItemTier: number;

  @ApiProperty({ description: 'Number that contains an ItemStackMax' })
  ItemStackMax: number;

  @ApiProperty({ description: 'String that contains an ItemEffectDescription' })
  ItemEffectDescription: string;

  @ApiProperty({ description: 'String that contains an ItemRarity' })
  ItemRarity: string;

  @ApiProperty({ description: 'Boolean that contains a Tradeable' })
  Tradeable: boolean;
}
