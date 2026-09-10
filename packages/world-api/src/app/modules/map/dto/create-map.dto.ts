import { ApiProperty } from '@nestjs/swagger';

export class CreateMapDto {
  @ApiProperty({ description: 'String that contains the title of the map.' })
  name: string;

  @ApiProperty({ description: 'String that contains the file of the map.' })
  data: string;

  @ApiProperty({
    description: 'String that contains the resource maps of the map.',
  })
  resourceMaps: string[];
}
