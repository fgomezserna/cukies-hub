import {
  deriveVerifiedCreditHistoryCoverage,
  PENDING_CREDIT_SOURCE_EVENT_STATUSES,
  type CreditVerifiedSlotVersion,
} from '@/lib/uki-economy/credits/history-coverage';

const BLOCK_HASH = `0x${'a'.repeat(64)}`;

function verifiedVersion(
  slotId: string,
  blockNumber: number,
): CreditVerifiedSlotVersion {
  const effectiveBlockTimestamp = new Date(
    `2026-08-17T16:${String(blockNumber % 60).padStart(2, '0')}:00.000Z`,
  );
  return {
    _id: `${slotId}:1`,
    slotId,
    route: 'nft',
    effectiveBlockNumber: blockNumber,
    effectiveBlockHash: BLOCK_HASH,
    effectiveBlockTimestamp,
    slot: {
      _id: slotId,
      route: 'nft',
      sourceBlockNumber: blockNumber,
      sourceBlockHash: BLOCK_HASH,
      sourceBlockTimestamp: effectiveBlockTimestamp,
    },
  };
}

describe('competition credit source recovery', () => {
  it('treats ignored events as terminal instead of pending projection work', () => {
    expect(PENDING_CREDIT_SOURCE_EVENT_STATUSES).toEqual([
      'ingested',
      'projecting',
      'failed',
    ]);
    expect(PENDING_CREDIT_SOURCE_EVENT_STATUSES).not.toContain('ignored');
    expect(PENDING_CREDIT_SOURCE_EVENT_STATUSES).not.toContain('projected');
  });

  it('promotes history only from the first block that covers every known slot', () => {
    const first = verifiedVersion('nft-slot-1', 125_640_870);
    const second = verifiedVersion('nft-slot-2', 125_640_878);

    expect(deriveVerifiedCreditHistoryCoverage({
      route: 'nft',
      sourceSlots: [first.slot, second.slot],
      earliestVerifiedVersions: [first, second],
    })).toEqual({
      completeFrom: second.effectiveBlockTimestamp,
      completeFromBlockNumber: 125_640_878,
      verifiedSlotCount: 2,
    });
  });

  it('fails closed when a migrated slot still lacks canonical block evidence', () => {
    const first = verifiedVersion('nft-slot-1', 125_640_870);

    expect(() => deriveVerifiedCreditHistoryCoverage({
      route: 'nft',
      sourceSlots: [first.slot, { _id: 'nft-slot-2', route: 'nft' }],
      earliestVerifiedVersions: [first],
    })).toThrow(/no acredita todos sus slots/);
  });
});
