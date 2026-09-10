import { ApiProperty } from '@nestjs/swagger';

export class MapTileRangeDto {
  @ApiProperty({ description: 'Number that contains x' })
  x: number;

  @ApiProperty({ description: 'Number that contains y' })
  y: number;

  @ApiProperty({ description: 'Number that contains sizeX' })
  sizeX: number;

  @ApiProperty({ description: 'Number that contains sizeY' })
  sizeY: number;

  @ApiProperty({ description: 'Tile id to write in the selected range' })
  tileId: string | number;
}
