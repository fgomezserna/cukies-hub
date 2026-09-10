import { ApiProperty } from '@nestjs/swagger';

class Skills {
  miner?: number[];
  engineer?: number[];
  farmer?: number[];
  gatherer?: number[];
  scout?: number[];
  breeder?: number[];
  life?: number[];
  energy?: number[];
  generation?: number[];
}

export class CreateMissionDto {
  @ApiProperty({ description: 'String that contains an id' })
  id: string;

  @ApiProperty({ description: 'String that contains the title' })
  title: string;

  @ApiProperty({ description: 'String that contains the description' })
  description: string | null;

  @ApiProperty({ description: 'Number that contains the energy cost' })
  energyCost: number;

  @ApiProperty({ description: 'Date that contains the date start' })
  dateStart: Date;

  @ApiProperty({ description: 'Date that contains the date finish' })
  dateFinish: Date;

  @ApiProperty({
    description: 'Array of dates that contains the available dates',
  })
  available: Date[];

  @ApiProperty({ description: 'Boolean that contains if it is done' })
  done: boolean;

  @ApiProperty({ description: 'Array of strings that contains the steps' })
  steps: string[] | null;

  @ApiProperty({
    description: 'Object that contains the requirements',
    type: 'object',
    properties: {
      missions: {
        type: '[String]' as any,
      },
      items: {
        type: '[String]' as any,
      },
      skills: {
        type: 'object',
        properties: {
          miner: {
            type: '[Number]' as any,
          },
          engineer: {
            type: '[Number]' as any,
          },
          farmer: {
            type: '[Number]' as any,
          },
          gatherer: {
            type: '[Number]' as any,
          },
          scout: {
            type: '[Number]' as any,
          },
          breeder: {
            type: '[Number]' as any,
          },
          life: {
            type: '[Number]' as any,
          },
          energy: {
            type: '[Number]' as any,
          },
          generation: {
            type: '[Number]' as any,
          },
        },
      },
    },
  })
  requirements: {
    missions: string[];
    items: string[];
    skills: Skills;
  };

  @ApiProperty({
    description: 'Object that contains the rewards',
    type: 'object',
    properties: {
      gemd: {
        type: 'number',
      },
      skillExp: {
        type: 'number',
      },
    },
  })
  rewards: {
    gemd: number;
    skillExp: number;
  };
}
