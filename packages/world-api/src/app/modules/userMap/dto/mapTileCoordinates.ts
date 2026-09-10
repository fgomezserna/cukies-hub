import { ApiProperty } from '@nestjs/swagger';

export class MapTileCoordinatesDto {
  @ApiProperty({ description: 'Number that contains the x position' })
  x: number;

  @ApiProperty({ description: 'Number that contains the y position' })
  y: number;
}
