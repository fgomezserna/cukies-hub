import { ApiProperty } from '@nestjs/swagger';

export class LevelUpDto {
  // skill and cost, both are mandatory
  @ApiProperty({
    description: 'String that contains a Skill',
  })
  skill: string;

  @ApiProperty({
    description: 'Number that contains the cost of the level up',
  })
  cost: number;
}
