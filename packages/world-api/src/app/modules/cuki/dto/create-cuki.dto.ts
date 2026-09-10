import { ApiProperty } from '@nestjs/swagger';
/* import {
  IInGameStats,
  ISkills,
} from '@cukies/world-shared'; */
interface IInGameStats {
  xp: {
    miner: [number, number];
    engineer: [number, number];
    farmer: [number, number];
    gatherer: [number, number];
    scout: [number, number];
    breeder: [number, number];
    life: [number, number];
    energy: [number, number];
    generation: [number, number];
  };
  life: number;
  energy: number;
}

interface ISkills {
  miner: number;
  engineer: number;
  farmer: number;
  gatherer: number;
  scout: number;
  breeder: number;
  life: number;
  energy: number;
  generation: number;
}

export class CreateCukiDto {
  @ApiProperty({ description: 'String that contains an id' })
  _id: string;

  @ApiProperty({ description: 'Number that contains a user' })
  user: string;

  @ApiProperty({ description: 'String that contains an origin' })
  origin: string;

  @ApiProperty({ description: 'String that contains a network' })
  network: string;

  @ApiProperty({ description: 'String that contains a birthNetwork' })
  birthNetwork: string;

  @ApiProperty({ description: 'Array that contains parents' })
  parents: Array<string>;

  @ApiProperty({ description: 'String that contains an img' })
  img: string;

  @ApiProperty({ description: 'Number that contains a type' })
  type: number;

  @ApiProperty({ description: 'Number that contains a cukiNumber' })
  cukiNumber: number;

  @ApiProperty({
    description: 'Object that contains skills',
    type: 'object',
    properties: {
      miner: {
        type: 'number',
      },
      engineer: {
        type: 'number',
      },
      farmer: {
        type: 'number',
      },
      gatherer: {
        type: 'number',
      },
      scout: {
        type: 'number',
      },
      breeder: {
        type: 'number',
      },
      life: {
        type: 'number',
      },
      energy: {
        type: 'number',
      },
      generation: {
        type: 'number',
      },
    },
  })
  skills: ISkills;

  @ApiProperty({
    description: 'Object that contains inGameStats',
    type: 'object',
    properties: {
      xp: {
        type: 'object',
        properties: {
          miner: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          engineer: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          farmer: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          gatherer: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          scout: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          breeder: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          life: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          energy: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
          generation: {
            type: 'array',
            items: {
              type: 'number',
            },
          },
        },
      },
      life: {
        type: 'number',
      },
      energy: {
        type: 'number',
      },
    },
  })
  inGameStats?: IInGameStats;

  @ApiProperty({ description: 'Array that contains history' })
  history: Array<string>;

  @ApiProperty({ description: 'Array that contains children' })
  children?: Array<string>;

  @ApiProperty({ description: 'Number that contains a numChildren' })
  numChildren?: number;

  @ApiProperty({ description: 'Number that contains a price' })
  price?: number;

  @ApiProperty({ description: 'String that contains a state' })
  state: string;

  @ApiProperty({ description: 'Number that contains a timeStamp' })
  timeStamp;

  @ApiProperty({
    description: 'Object that contains the type and timestamp of last change',
  })
  lastChanges?: {
    category: string;
    timeStamp: number;
  }[];
}
