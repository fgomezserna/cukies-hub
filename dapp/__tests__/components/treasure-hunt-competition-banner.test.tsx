import { fireEvent, render, screen } from '@testing-library/react';

import TreasureHuntCompetitionBanner from '@/components/games/treasure-hunt-competition-banner';

jest.mock('lucide-react', () => ({
  ArrowRight: () => null,
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

describe('TreasureHuntCompetitionBanner', () => {
  it('mantiene visible el estado esencial y abre la gestión de participación', () => {
    render(
      <TreasureHuntCompetitionBanner>
        <div>Detalle completo de la competición</div>
      </TreasureHuntCompetitionBanner>,
    );

    expect(screen.getByText('Competición activa · Torneo de Preventa UKI')).toBeInTheDocument();
    expect(screen.getByText('1P')).toBeInTheDocument();
    expect(screen.getByText('0/5')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver reglas/ })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rules',
    );
    expect(screen.queryByText('Detalle completo de la competición')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mi participación' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Detalle completo de la competición')).toBeInTheDocument();
  });
});
