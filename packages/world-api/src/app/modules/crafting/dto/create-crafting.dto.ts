import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ItemContentDto } from '../../inventory/dto/itemContent.dto';

export class CreateCraftingDto {
  @ApiProperty({
    description: 'Array of objects that contains the requirements',
    type: ItemContentDto,
    isArray: true,
  })
  requirements: ItemContentDto[];
}
