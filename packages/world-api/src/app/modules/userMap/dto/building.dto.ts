import { ApiProperty } from '@nestjs/swagger';

export class BuildingDto {
  @ApiProperty({ description: 'Number that contains x' })
  x: number;

  @ApiProperty({ description: 'Number that contains y' })
  y: number;

  @ApiProperty({ description: 'String that contains buildingId' })
  buildingId: string;

  @ApiProperty({ description: 'Number that contains buildingSizeX' })
  buildingSizeX: number;

  @ApiProperty({ description: 'Number that contains buildingSizeY' })
  buildingSizeY: number;
}
