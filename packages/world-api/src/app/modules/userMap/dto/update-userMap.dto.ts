import { PartialType } from '@nestjs/swagger';
import { CreateUserMapDto } from './create-userMap.dto';

export class UpdateUserMapDto extends PartialType(CreateUserMapDto) {
  _id?: string;
}
