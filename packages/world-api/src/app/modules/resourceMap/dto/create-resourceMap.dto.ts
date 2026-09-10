import { ApiProperty } from '@nestjs/swagger';

export class CreateResourceMapDto {
  @ApiProperty({ description: 'Name of the resourceMap' })
  name?: string;

  @ApiProperty({ description: 'String that contains Map Object Id.' })
  map: string;

  @ApiProperty({ description: 'String that contains the file of the map.' })
  data: string;
}
