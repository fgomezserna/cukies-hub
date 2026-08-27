import { createCukieMasterGraceJobs } from '@/lib/uki-economy/cukie-master/jobs';
import type { CukieMasterRepository } from '@/lib/uki-economy/cukie-master/repository';
import { createInitialRouteRound } from '@/lib/uki-economy/cukie-master/rules';
import type { CukieMasterPosition, CukieMasterRouteRound } from '@/lib/uki-economy/cukie-master/types';

const graceEndedAt = new Date('2026-07-10T00:00:00.000Z');
const now = new Date('2026-07-10T00:00:01.000Z');

function position(wallet: string, status: 'active' | 'waitlisted'): CukieMasterPosition {
  return {
    _id: `${wallet}:uki`,
    walletAddress: wallet,
    walletNormalized: wallet,
    route: 'uki',
    status,
    desiredSlots: 1,
    allocatedSlots: status === 'active' ? 1 : 0,
    protectedSlots: 0,
    ...(status === 'active' ? { activeFrom: graceEndedAt } : { waitlistedAt: graceEndedAt }),
    requirementSnapshot: { route: 'uki', ukiRaw: '20000000000000000000000' },
    pendingRequirementSnapshot: { route: 'uki', ukiRaw: '30000000000000000000000' },
    graceEndsAt: graceEndedAt,
    source: {
      route: 'uki', totalUkiRaw: '30000000000000000000000',
      presaleLockedRaw: '30000000000000000000000', stakedUkiRaw: '0', refs: [],
      completeness: {
        complete: true, warnings: [], presaleRaw: true, vestingRaw: true,
        stakingRaw: true, nftInventory: true, indexerHealth: true,
      },
      sourceHash: wallet,
    },
    sourceHash: wallet,
    ruleVersion: 'v1',
    roundId: 'uki:v1',
    revision: 1,
    createdAt: graceEndedAt,
    updatedAt: graceEndedAt,
  };
}

describe('Cukie Master grace close job', () => {
  it('sweeps allocated positions before waitlisted candidates with an explicit cursor', async () => {
    const round: CukieMasterRouteRound = {
      ...createInitialRouteRound('uki', graceEndedAt),
      pendingRequirement: { route: 'uki', ukiRaw: '30000000000000000000000' },
      graceEndsAt: graceEndedAt,
    };
    const allocated = [position('0xaaa', 'active')];
    const waitlisted = [position('0xbbb', 'waitlisted')];
    const recalculated: string[] = [];
    const finalized = { ...round, requirement: round.pendingRequirement! };
    delete finalized.pendingRequirement;
    delete finalized.graceEndsAt;
    const repository = {
      findActiveRound: async () => round,
      listRoutePositions: async ({ allocatedOnly }: { allocatedOnly: boolean }) => (
        allocatedOnly ? allocated : waitlisted
      ),
    } as unknown as CukieMasterRepository;
    const jobs = createCukieMasterGraceJobs({
      getRepository: async () => repository,
      recalculate: async (walletAddress) => {
        recalculated.push(walletAddress);
        return {} as never;
      },
      finalize: async () => finalized,
    });

    const first = await jobs.closeRequirementGraceBatch(
      'uki', now, 'job-1', { phase: 'allocated' }, 2,
    );
    expect(first.done).toBe(false);
    expect(first.nextCursor).toEqual({ phase: 'waitlisted' });
    const second = await jobs.closeRequirementGraceBatch(
      'uki', now, 'job-1', first.nextCursor!, 2,
    );

    expect(second.done).toBe(true);
    expect(second.finalizedRound?.requirement).toEqual(finalized.requirement);
    expect(recalculated).toEqual(['0xaaa', '0xbbb']);
  });
});
