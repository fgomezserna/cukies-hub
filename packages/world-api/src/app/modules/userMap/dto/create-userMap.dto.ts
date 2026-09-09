import { ApiProperty } from '@nestjs/swagger';

export class CreateUserMapDto {
  @ApiProperty({
    description: 'Stable island identifier used by multiplayer sessions.',
    required: false,
  })
  islandId?: string;

  @ApiProperty({
    description: 'String that contains the ResourceMap Object Id.',
  })
  resourceMap: string;

  @ApiProperty({ description: 'String that contains the Map Object Id.' })
  baseMap: string;

  @ApiProperty({ description: 'String that contains the user of the map.' })
  user: string;

  @ApiProperty({
    description: 'String that contains the file of the map.',
    type: 'object',
    properties: {
      Resources: {
        type: 'object',
        properties: {
          mapSize: { type: 'number' },
          mapResources: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } },
          },
        },
      },
      Buildings: {
        type: 'object',
        properties: {
          mapSize: { type: 'number' },
          mapBuildings: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } },
          },
        },
      },
      HouseAppliances: {
        type: 'array',
        items: {
          type: 'object',
          properties: { type: { type: 'string' }, id: { type: 'string' } },
        },
      },
    },
  })
  data?: {
    Resources?: {
      mapSize: number;
      mapResources: unknown[][];
    };
    Buildings?: {
      mapSize: number;
      mapBuildings: unknown[][];
    };
    HouseAppliances?: unknown[];
  };

  @ApiProperty({
    description: 'Compact user-specific changes keyed by tile coordinates.',
    required: false,
  })
  overrides?: {
    Resources?: Record<string, unknown>;
    Buildings?: Record<string, unknown>;
    HouseAppliances?: unknown[];
  };
}
