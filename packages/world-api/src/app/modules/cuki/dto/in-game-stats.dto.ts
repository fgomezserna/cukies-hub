import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsObject } from 'class-validator';

export class InGameStatsDto {
  @IsObject()
  @ApiProperty({
    type: Object,
    example: {
      miner: [0, 0],
      engineer: [0, 0],
      farmer: [0, 0],
      gatherer: [0, 0],
      scout: [0, 0],
      breeder: [0, 0],
      life: [0, 0],
      energy: [0, 0],
      generation: [0, 0],
    },
  })
  xp?: {
    miner?: number[];
    engineer?: number[];
    farmer?: number[];
    gatherer?: number[];
    scout?: number[];
    breeder?: number[];
    life?: number[];
    energy?: number[];
    generation?: number[];
  };

  @IsNumber()
  @ApiProperty({ type: Number })
  life?: number;

  @IsNumber()
  @ApiProperty({ type: Number })
  energy?: number;
}
