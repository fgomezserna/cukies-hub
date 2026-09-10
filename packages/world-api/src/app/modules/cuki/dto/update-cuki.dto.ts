import { PartialType } from '@nestjs/swagger';
import { CreateCukiDto } from './create-cuki.dto';

export class UpdateCukiDto extends PartialType(CreateCukiDto) {
  _id?: string;
}
