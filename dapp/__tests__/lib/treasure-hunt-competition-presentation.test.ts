import {
  calculateAvailablePrizeSlots,
  competitionDeadline,
  formatCompetitionRemaining,
  TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME,
} from '@/lib/treasure-hunt-competition/presentation';

const campaign = {
  campaignId: 'uki-launch',
  eligibilityKind: 'uki_staking' as const,
  startsAt: '2026-08-27T12:00:00.000Z',
  endsAt: '2026-09-15T15:00:00.000Z',
  stakePerAttemptRaw: '2000000000000000000000',
  topAttemptsPerWallet: 10,
  pointsPerTicket: 100,
  basePrizeUkiRaw: '50000000000000000000000',
  stakePrizeBps: 1_000,
  prizePerWinnerUkiRaw: '10000000000000000000000',
  maxWinsPerWallet: 1,
  poolBps: 2_500,
  playerRewardBps: 1_000,
  sponsorRewardBps: 2_500,
  maxWinningAttemptsPerWallet: 10,
  cliffMonths: 9,
  vestingMonths: 6,
};

describe('presentación del Torneo Lanzamiento UKI', () => {
  it('mantiene el nombre público y el cálculo BigInt de ganadores', () => {
    expect(TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME).toBe('Torneo Lanzamiento UKI');
    expect(calculateAvailablePrizeSlots(
      '53999900000000000000000',
      '10000000000000000000000',
    )).toBe(BigInt(5));
  });

  it('usa el inicio al programar y el cierre durante la competición', () => {
    expect(competitionDeadline('scheduled', campaign)).toEqual({
      targetMs: new Date(campaign.startsAt).getTime(),
      prefix: 'Comienza en',
    });
    expect(competitionDeadline('active', campaign)).toEqual({
      targetMs: new Date(campaign.endsAt).getTime(),
      prefix: 'Finaliza en',
    });
  });

  it('formatea una cuenta atrás estable sin valores negativos', () => {
    const target = new Date('2026-08-28T13:02:03.000Z').getTime();
    const now = new Date('2026-08-27T12:00:00.000Z').getTime();
    expect(formatCompetitionRemaining(target, now)).toBe('1d 01h 02m 03s');
    expect(formatCompetitionRemaining(target, target + 1_000)).toBe('0d 00h 00m 00s');
  });
});
