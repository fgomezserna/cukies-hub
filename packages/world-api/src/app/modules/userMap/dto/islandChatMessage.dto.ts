import { ApiProperty } from '@nestjs/swagger';

export class IslandChatMessageDto {
  @ApiProperty({ description: 'Island server session id.', required: false })
  sessionId?: string;

  @ApiProperty({ description: 'Display name that sent the message.', required: false })
  senderName?: string;

  @ApiProperty({ description: 'Sender player id in the island session.', required: false })
  senderPlayerId?: number;

  @ApiProperty({ description: 'Stable backend user id of the sender.', required: false })
  senderBackendUserId?: string;

  @ApiProperty({ description: 'Cukie id used by the sender in this island session.', required: false })
  senderCukieId?: string;

  @ApiProperty({ description: 'Sanitized shared chat text.' })
  message: string;

  @ApiProperty({ description: 'Shared chat channel: island, party, global or system.', required: false })
  channel?: string;

  @ApiProperty({ description: 'Whether this is a system message.', required: false })
  system?: boolean;

  @ApiProperty({ description: 'Private messages are rejected by the shared history endpoint.', required: false })
  private?: boolean;

  @ApiProperty({ description: 'Target player id for private/owner notices. Shared history keeps this unset.', required: false })
  targetPlayerId?: number;

  @ApiProperty({ description: 'Unix timestamp in seconds.', required: false })
  unixTimeSeconds?: number;

  @ApiProperty({ description: 'Optional stable idempotency key.', required: false })
  messageKey?: string;
}

export class IslandChatMessagesDto {
  @ApiProperty({
    description: 'Single chat message to append when messages is omitted.',
    required: false,
    type: IslandChatMessageDto,
  })
  message?: IslandChatMessageDto;

  @ApiProperty({
    description: 'Shared chat messages to append in one request.',
    required: false,
    isArray: true,
    type: IslandChatMessageDto,
  })
  messages?: IslandChatMessageDto[];
}
