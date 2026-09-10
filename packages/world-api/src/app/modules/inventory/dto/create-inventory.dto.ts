import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { CreateItemDto } from '../../item/dto/create-item.dto';

export class CreateInventoryDto {
  @ApiProperty({
    description: 'Array of items',
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
  content: {
    item: string;
    amount: number;
  }[];

  @ApiProperty({
    description: 'Object that contains equipment',
    type: 'object',
    properties: {
      armour: {
        type: 'object',
        properties: {
          head: { type: 'string' },
          body: { type: 'string' },
          feet: { type: 'string' },
          hands: { type: 'string' },
          face: { type: 'string' },
          back: { type: 'string' },
        },
      },
      tool: {
        type: 'object',
        properties: {
          rightHand: { type: 'string' },
          leftHand: { type: 'string' },
        },
      },
    },
  })
  equipment: {
    armour: {
      head: string;
      body: string;
      feet: string;
      hands: string;
      face: string;
      back: string;
    };
    tool: {
      rightHand: string;
      leftHand: string;
    };
  };

  @ApiProperty({ description: 'Number of slots' })
  slots: number;

  @ApiProperty({ description: 'String that contains user' })
  user?: string;

  @ApiProperty({ description: 'String that contains cuki' })
  cuki?: string;
}
