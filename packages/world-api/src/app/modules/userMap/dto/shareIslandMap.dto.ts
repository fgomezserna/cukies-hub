import { ApiProperty } from '@nestjs/swagger';

export class ShareIslandMapDto {
  @ApiProperty({
    description: 'User id that should receive access to the island map.',
  })
  targetUserId: string;
}
