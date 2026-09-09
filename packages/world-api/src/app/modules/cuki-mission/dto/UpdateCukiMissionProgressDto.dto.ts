import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateCukiMissionProgressDto {
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
    description: 'Progreso de cada acción',
    example: [1],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  progress: number[];
}
