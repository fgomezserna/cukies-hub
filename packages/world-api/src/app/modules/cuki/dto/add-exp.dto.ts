import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class AddExpDto {
  // skill and cost, both are mandatory
  @ApiProperty({
    description: 'String that contains a Skill',
  })
  @IsString()
  skill: string;

  @ApiProperty({
    description: 'Number that contains the exp to add to the skill',
  })
  @IsNumber()
  exp: number;
}
