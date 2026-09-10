import { PartialType } from '@nestjs/swagger';
import { CreateResourceMapDto } from './create-resourceMap.dto';

export class UpdateResourceMapDto extends PartialType(CreateResourceMapDto) {}
