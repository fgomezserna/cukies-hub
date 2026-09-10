import { ApiProperty } from '@nestjs/swagger';

export class BuildingProgressDto {
  @ApiProperty({ description: 'Item' })
  item: string;

  @ApiProperty({ description: 'Amount' })
  amount: number;
}

export class BuildingTileDto {
  @ApiProperty({ description: 'Number that contains the x position' })
  x: number;

  @ApiProperty({ description: 'Number that contains the y position' })
  y: number;

  @ApiProperty({ description: 'Array that contains [building id, rotation]' })
  tileId: [string | number, number];

  @ApiProperty({ description: 'rotation a tile id' })
  rotation?: number;

  @ApiProperty({
    description: 'Array of progressBuilding',
    isArray: true,
    type: BuildingProgressDto,
  })
  buildingResources: BuildingProgressDto[];

  @ApiProperty({ description: 'Coordinates of a linked building' })
  link?: string | number[];
}
