import { ApiProperty } from '@nestjs/swagger';

export class IslandChatBlockTargetDto {
  @ApiProperty({
    description: 'Blocked player id in the island session.',
    required: false,
  })
  targetPlayerId?: number;

  @ApiProperty({ description: 'Blocked player display name.', required: false })
  targetName?: string;

  @ApiProperty({
    description: 'Stable backend user id of the blocked player.',
    required: false,
  })
  targetBackendUserId?: string;

  @ApiProperty({
    description: 'Cukie id used by the blocked player in this island session.',
    required: false,
  })
  targetCukieId?: string;

  @ApiProperty({ description: 'Unix timestamp in seconds.', required: false })
  unixTimeSeconds?: number;
}

export class IslandChatBlocksDto {
  @ApiProperty({
    description: 'Blocking player id in the island session.',
    required: false,
  })
  blockerPlayerId?: number;

  @ApiProperty({ description: 'Blocking player display name.', required: false })
  blockerName?: string;

  @ApiProperty({
    description: 'Stable backend user id of the blocking player.',
    required: false,
  })
  blockerBackendUserId?: string;

  @ApiProperty({
    description: 'Cukie id used by the blocking player in this island session.',
    required: false,
  })
  blockerCukieId?: string;

  @ApiProperty({
    description: 'Current active blocked players for this blocker.',
    required: false,
    isArray: true,
    type: IslandChatBlockTargetDto,
  })
  blocks?: IslandChatBlockTargetDto[];
}
