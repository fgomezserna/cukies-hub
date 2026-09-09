import { ApiProperty } from '@nestjs/swagger';

export class IslandActionEventDto {
  @ApiProperty({ description: 'Stable idempotency key.', required: false })
  eventKey?: string;

  @ApiProperty({ description: 'Monotonic sequence assigned by the island server.' })
  sequence: number;

  @ApiProperty({ description: 'Action event type.' })
  eventType: string;

  @ApiProperty({ description: 'Island server session id.', required: false })
  sessionId?: string;

  @ApiProperty({ description: 'Player id associated with the action.', required: false })
  playerId?: number;

  @ApiProperty({ description: 'Display name associated with the action.', required: false })
  senderName?: string;

  @ApiProperty({ description: 'Tile X coordinate.', required: false })
  x?: number;

  @ApiProperty({ description: 'Tile Y coordinate.', required: false })
  y?: number;

  @ApiProperty({ description: 'Changed subject id.', required: false })
  subjectId?: string;

  @ApiProperty({ description: 'Reward or cost item id.', required: false })
  itemId?: string;

  @ApiProperty({ description: 'Reward or cost amount.', required: false })
  amount?: number;

  @ApiProperty({ description: 'XP delta produced by the action.', required: false })
  xpDelta?: number;

  @ApiProperty({ description: 'Total player XP after the action.', required: false })
  totalXp?: number;

  @ApiProperty({ description: 'Tile revision associated with the action.', required: false })
  tileRevision?: number;

  @ApiProperty({ description: 'Building revision associated with the action.', required: false })
  buildingRevision?: number;

  @ApiProperty({ description: 'Unix timestamp in seconds.', required: false })
  unixTimeSeconds?: number;
}

export class IslandActionEventsDto {
  @ApiProperty({
    description: 'Single event to append when events is omitted.',
    required: false,
    type: IslandActionEventDto,
  })
  event?: IslandActionEventDto;

  @ApiProperty({
    description: 'Events to append in one request.',
    required: false,
    isArray: true,
    type: IslandActionEventDto,
  })
  events?: IslandActionEventDto[];
}
