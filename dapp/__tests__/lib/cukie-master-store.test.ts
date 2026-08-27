import { buildCukieMasterPreview } from '@/lib/uki-economy/cukie-master-store';

describe('Cukie Master compatibility preview', () => {
  it('is pure read-only preview state with no persistence path', () => {
    const preview = buildCukieMasterPreview({
      walletAddress: '0xABC',
      periodId: '2026-07-10',
      eligibleUki: 20_000,
      originalCukiePoints: 3,
      calculatedAt: new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(preview.totalSlots).toBe(2);
    expect(preview.status).toBe('calculated');
  });
});
