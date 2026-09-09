import { PartialType } from '@nestjs/swagger';
import { CreateCraftingDto } from './create-crafting.dto';

export class UpdateCraftingDto extends PartialType(CreateCraftingDto) {}
