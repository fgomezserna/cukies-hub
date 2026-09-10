import { IsArray, IsString } from 'class-validator';

export class createCukiMissionsDto {
  @IsArray()
  @IsString({ each: true })
  missionsId: string[];

  @IsString()
  cukiId: string;
}
