import { PartialType } from '@nestjs/swagger';
import { CreateUtilDto } from './create-util.dto';

export class UpdateUtilDto extends PartialType(CreateUtilDto) {}
