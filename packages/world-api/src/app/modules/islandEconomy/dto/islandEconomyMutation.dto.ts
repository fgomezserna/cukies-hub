import { ApiProperty } from '@nestjs/swagger';

export class IslandEconomyInventoryDeltaDto {
  @ApiProperty({ description: 'Inventory item id to add or remove.' })
  id: string;

  @ApiProperty({
    description: 'Positive amount adds, negative amount removes.',
  })
  amount: number;

  @ApiProperty({
    description: 'Inventory slot. Defaults to 0.',
    required: false,
  })
  slot?: number;

  @ApiProperty({
    description: 'Item durability. Defaults to 0.',
    required: false,
  })
  durability?: number;
}

export class IslandEconomyXpDeltaDto {
  @ApiProperty({ description: 'Skill to receive experience.' })
  skill: string;

  @ApiProperty({ description: 'Positive experience amount to add.' })
  exp: number;
}

export class IslandEconomyMutationDto {
  @ApiProperty({ description: 'Island server session id.' })
  sessionId: string;

  @ApiProperty({
    description: 'Signed matchmaking join token for this player.',
  })
  joinToken: string;

  @ApiProperty({ description: 'Cukie id that receives the mutation.' })
  cukiId: string;

  @ApiProperty({
    description:
      'Stable mutation id from the island server used for idempotency.',
  })
  mutationId: string;

  @ApiProperty({
    description: 'Inventory deltas to apply.',
    required: false,
    isArray: true,
    type: IslandEconomyInventoryDeltaDto,
  })
  inventoryDeltas?: IslandEconomyInventoryDeltaDto[];

  @ApiProperty({
    description: 'XP deltas to apply.',
    required: false,
    isArray: true,
    type: IslandEconomyXpDeltaDto,
  })
  xpDeltas?: IslandEconomyXpDeltaDto[];
}
