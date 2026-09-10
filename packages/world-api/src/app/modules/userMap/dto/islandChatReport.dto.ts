import { ApiProperty } from '@nestjs/swagger';

export class IslandChatReportDto {
  @ApiProperty({ description: 'Stable idempotency key.', required: false })
  reportKey?: string;

  @ApiProperty({ description: 'Monotonic sequence assigned by the island server.', required: false })
  sequence?: number;

  @ApiProperty({ description: 'Island server session id.', required: false })
  sessionId?: string;

  @ApiProperty({ description: 'Player id that submitted the report.' })
  reporterPlayerId: number;

  @ApiProperty({ description: 'Display name that submitted the report.', required: false })
  reporterName?: string;

  @ApiProperty({ description: 'Stable backend user id that submitted the report.', required: false })
  reporterBackendUserId?: string;

  @ApiProperty({ description: 'Cukie id used by the reporter in this island session.', required: false })
  reporterCukieId?: string;

  @ApiProperty({ description: 'Target player id.' })
  targetPlayerId: number;

  @ApiProperty({ description: 'Target display name.', required: false })
  targetName?: string;

  @ApiProperty({ description: 'Stable backend user id of the reported player.', required: false })
  targetBackendUserId?: string;

  @ApiProperty({ description: 'Cukie id used by the reported player in this island session.', required: false })
  targetCukieId?: string;

  @ApiProperty({ description: 'Sanitized report reason.' })
  reason: string;

  @ApiProperty({ description: 'Unix timestamp in seconds.', required: false })
  unixTimeSeconds?: number;
}

export class IslandChatReportsDto {
  @ApiProperty({
    description: 'Single chat report to append when reports is omitted.',
    required: false,
    type: IslandChatReportDto,
  })
  report?: IslandChatReportDto;

  @ApiProperty({
    description: 'Chat reports to append in one request.',
    required: false,
    isArray: true,
    type: IslandChatReportDto,
  })
  reports?: IslandChatReportDto[];
}
