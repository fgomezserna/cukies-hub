import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { CreateItemDto } from '../../item/dto/create-item.dto';

export class CreateBuildingDto {
  @ApiProperty({
    description: 'Size of the building',
    type: 'object',
    properties: {
      x: {
        type: 'number',
      },
      y: {
        type: 'number',
      },
    },
  })
  size: { x: number; y: number };

  @ApiProperty({
    description: 'Array of numbers that contains the orientations',
    type: 'array',
    items: {
      type: 'number',
    },
  })
  orientation: number[];

  @ApiProperty({
    description: 'Tier of the building',
    type: 'number',
  })
  tier: number;

  @ApiProperty({
    description: 'Array of objects that contains the resources',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        item: {
          $ref: getSchemaPath(CreateItemDto),
        },
        amount: {
          type: 'number',
        },
      },
    },
  })
  resources: {
    item: string;
    amount: number;
  }[];

  @ApiProperty({
    description: 'Child of the building',
    type: 'string',
  })
  child?: string;
}
