import { ApiProperty } from '@nestjs/swagger';

export class MapTileDto {
  @ApiProperty({ description: 'Number that contains the x position' })
  x: number;

  @ApiProperty({ description: 'Number that contains the y position' })
  y: number;

  @ApiProperty({ description: 'Number that contains a tile id' })
  tileId: number;

  @ApiProperty({ description: 'Number of health' })
  health?: number;
}
