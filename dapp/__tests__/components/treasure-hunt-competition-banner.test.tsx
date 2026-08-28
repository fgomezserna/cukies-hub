import { render, screen } from '@testing-library/react';

import TreasureHuntCompetitionBanner from '@/components/games/treasure-hunt-competition-banner';

let mockDisqualified = false;

jest.mock('lucide-react', () => ({
  ArrowRight: () => null,
  BookOpenText: () => null,
  CalendarDays: () => null,
  Medal: () => null,
  Trophy: () => null,
  X: () => null,
}));

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  formatTreasureHuntPercentage: (bps: number) => `${bps / 100}%`,
  TREASURE_HUNT_FALLBACK_RULES: {
    poolBps: 2_500,
    playerRewardBps: 1_000,
    sponsorRewardBps: 2_500,
    maxWinningAttemptsPerWallet: 5,
    cliffMonths: 9,
    vestingMonths: 6,
  },
  useTreasureHuntCompetitionOverview: () => ({
    status: {
      phase: 'active',
      campaign: {
        startsAt: '2026-08-27T00:00:00.000Z',
        endsAt: '2026-09-15T15:00:00.000Z',
        topAttemptsPerWallet: 10,
        prizePerWinnerUkiRaw: '10000000000000000000000',
      },
      eligibility: {
        attemptsRemaining: mockDisqualified ? 0 : 3,
        topAttemptsCount: 4,
        provisionalTickets: 125,
        disqualified: mockDisqualified,
        disqualificationEvidence: mockDisqualified ? {
          eventId: 'unstake-1',
          txHash: `0x${'a'.repeat(64)}`,
          blockNumber: 127_368_347,
          timestamp: '2026-08-26T16:36:42.000Z',
          amountRaw: '20000000000000000000000',
        } : null,
      },
    },
    leaderboard: [],
    leaderboardMeta: { poolUkiRaw: '71484000000000000000000' },
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-treasure-hunt-prize-pool', () => ({
  useTreasureHuntPrizePool: () => ({
    value: 71_484,
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

describe('TreasureHuntCompetitionBanner', () => {
  beforeEach(() => {
    mockDisqualified = false;
  });

  it('separa intentos disponibles de resultados que cuentan y enlaza a reglas y rankings', () => {
    render(<TreasureHuntCompetitionBanner />);

    expect(screen.getByText('Torneo Lanzamiento UKI')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4/10')).toBeInTheDocument();
    expect(screen.getByText('Intentos disponibles')).toBeInTheDocument();
    expect(screen.getByText('Resultados que cuentan')).toBeInTheDocument();
    expect(screen.getByText('71.484 UKI')).toBeInTheDocument();
    expect(screen.queryByText('N.º de ganadores')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver reglas/ })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rules',
    );
    expect(screen.getByRole('link', { name: /Rankings/ })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rankings',
    );

    const title = document.querySelector('[data-competition-title]');
    const metrics = document.querySelector('[data-competition-metrics]');
    const actions = document.querySelector('[data-competition-actions]');
    expect(title?.compareDocumentPosition(metrics as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(metrics?.compareDocumentPosition(actions as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(actions).toHaveClass('hidden', 'sm:flex');
    expect(metrics).toHaveClass('grid-cols-3');
  });

  it('bloquea los resultados y explica la retirada cuando la wallet está descalificada', () => {
    mockDisqualified = true;
    render(<TreasureHuntCompetitionBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent('Wallet descalificada');
    expect(screen.getByRole('alert')).toHaveTextContent('20.000 UKI');
    expect(screen.getByText('0/10')).toBeInTheDocument();
  });
});
