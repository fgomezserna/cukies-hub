import { fireEvent, render, screen } from '@testing-library/react';

import TreasureHuntCompetitionsView from '@/components/games/treasure-hunt-competitions-view';
import TreasureHuntPlaySidebar from '@/components/games/treasure-hunt-play-sidebar';
import TreasureHuntRankingsView from '@/components/games/treasure-hunt-rankings-view';
import TreasureHuntRulesView from '@/components/games/treasure-hunt-rules-view';

jest.mock('lucide-react', () => ({
  ArrowRight: () => null,
  BarChart3: () => null,
  CalendarDays: () => null,
  CheckCircle2: () => null,
  CircleDollarSign: () => null,
  Clock3: () => null,
  Flag: () => null,
  Gamepad2: () => null,
  Info: () => null,
  LockKeyhole: () => null,
  Medal: () => null,
  ShoppingCart: () => null,
  Swords: () => null,
  Timer: () => null,
  Trophy: () => null,
  UserRound: () => null,
}));

jest.mock('@/components/games/treasure-hunt-competition-panel', () => ({
  __esModule: true,
  default: () => <div>Gestión real del torneo</div>,
}));

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  formatTreasureHuntCampaignWindow: () => '17 jul 2026 — 24 jul 2026',
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
        poolBps: 2_500,
        playerRewardBps: 1_000,
        sponsorRewardBps: 2_500,
        maxWinningAttemptsPerWallet: 5,
        cliffMonths: 9,
        vestingMonths: 6,
      },
    },
    leaderboard: [],
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

describe('vistas UX de Treasure Hunt', () => {
  it('separa el torneo activo de tres competiciones inactivas', () => {
    render(<TreasureHuntCompetitionsView />);

    expect(screen.getAllByText('Torneo de Preventa UKI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Liga semanal UKI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Speedrun semanal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Torneo 1v1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No disponible')).toHaveLength(3);
  });

  it('muestra el ranking propio y mantiene los demás rankings bloqueados', () => {
    render(<TreasureHuntRankingsView />);

    expect(screen.getByText('Rankings de Treasure Hunt')).toBeInTheDocument();
    expect(screen.getByText('TÚ · Sin clasificar')).toBeInTheDocument();
    expect(screen.getByText('Rankings disponibles')).toBeInTheDocument();
  });

  it('presenta las cuatro secciones y el resumen del reglamento aprobado', () => {
    render(<TreasureHuntRulesView />);

    expect(screen.getByText('Cómo participar')).toBeInTheDocument();
    expect(screen.getByText('Clasificación')).toBeInTheDocument();
    expect(screen.getByText('Distribución')).toBeInTheDocument();
    expect(screen.getByText('Entrega de premios')).toBeInTheDocument();
    expect(screen.getByText('Resumen del torneo')).toBeInTheDocument();
  });

  it('hace operativo el CTA principal de la preparación 1P', () => {
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar partida 1P' }));

    expect(onStartSinglePlayer).toHaveBeenCalledTimes(1);
  });
});
