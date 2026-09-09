import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

class ItemDto {
  @ApiProperty({
    description: 'ID del ítem',
    example: 'Branch_Tier0',
  })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({
    description: 'Cantidad del ítem',
    example: 5,
  })
  @IsNumber()
  quantity: number;

  @ApiProperty({
    description: 'Slot del ítem',
    example: 1,
  })
  @IsNumber()
  slot: number;
}

export class CompleteMissionDto {
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
    description: 'Lista de habilidades adquiridas',
    example: ['miner', 'gathered'],
  })
  @IsArray()
  @IsString({ each: true })
  skills: string[];

  @ApiProperty({
    description: 'Experiencia ganada por cada habilidad',
    example: [100, 200],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  exp: number[];

  @ApiProperty({
    description: 'Lista de ítems obtenidos en la misión',
    type: [ItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
