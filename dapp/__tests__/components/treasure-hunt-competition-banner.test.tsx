import { render, screen } from '@testing-library/react';

import TreasureHuntCompetitionBanner from '@/components/games/treasure-hunt-competition-banner';

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
    status: null,
    leaderboard: [],
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
  it('mantiene visibles las tres métricas y enlaza a reglas y rankings', () => {
    render(<TreasureHuntCompetitionBanner />);

    expect(screen.getByText('Torneo Preventa UKI')).toBeInTheDocument();
    expect(screen.getByText('1P')).toBeInTheDocument();
    expect(screen.getByText('0/5')).toBeInTheDocument();
    expect(screen.getByText('71.484 UKI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver reglas/ })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rules',
    );
    expect(screen.getByRole('link', { name: /Rankings/ })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rankings',
    );
  });
});
