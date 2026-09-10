import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class completeCheckmarkDto {
  @ApiProperty({
    description: 'ID del cuki',
    example: '1000000000000',
  })
  @IsString()
  @IsNotEmpty()
  cukiId: string;

  @ApiProperty({
    description: 'ID de la misión',
    example: 'Mining0',
  })
  @IsString()
  @IsNotEmpty()
  missionId: string;

  @ApiProperty({
    description: 'Lista de acciones realizadas',
    example: ['Mining'],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];

  @ApiProperty({
    description: 'Estado de cada acción',
    example: [true],
  })
  @IsArray()
  @IsBoolean({ each: true })
  state: boolean[];
}
