import { fireEvent, render, screen } from '@testing-library/react';

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

jest.mock('@/hooks/use-treasure-hunt-prize-pool', () => ({
  useTreasureHuntPrizePool: () => ({
    value: 71_484,
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock('@/components/games/treasure-hunt-competition-panel', () => ({
  __esModule: true,
  default: () => <div>Gestión real del torneo</div>,
}));

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  formatTreasureHuntCampaignWindow: () => '17 jul 2026 — 24 jul 2026',
  formatTreasureHuntDuration: (gameTimeMs: number) => `${gameTimeMs / 1_000} s`,
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
    leaderboard: [
      {
        rank: 1,
        walletRank: 1,
        attemptId: 'attempt-1',
        alias: 'CukiePlayer',
        score: 12_500,
        gameTimeMs: 42_000,
        finishedAt: '2026-07-23T18:00:00.000Z',
        reviewStatus: 'approved',
        isMe: true,
      },
    ],
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

describe('vistas UX de Treasure Hunt', () => {
  it('muestra una única clasificación con las métricas del torneo', () => {
    render(<TreasureHuntRankingsView />);

    expect(screen.getByText('Rankings de Treasure Hunt')).toBeInTheDocument();
    expect(screen.getByText('Mis partidas')).toBeInTheDocument();
    expect(screen.getByText('71.484 UKI')).toBeInTheDocument();
    expect(screen.queryByText(/validado/i)).not.toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Pos.', 'Jugador', 'Puntuación', 'Tiempo']);
    expect(headers).not.toContain('Partida');
    expect(headers).not.toContain('Score');
  });

  it('presenta las siete secciones del reglamento aprobado', () => {
    render(<TreasureHuntRulesView />);

    expect(screen.getByText('Cómo participar')).toBeInTheDocument();
    expect(screen.getByText('Clasificación')).toBeInTheDocument();
    expect(screen.getByText('Pool de Premios')).toBeInTheDocument();
    expect(screen.getByText('¿Cuánto puedes ganar?')).toBeInTheDocument();
    expect(screen.getByText('¿Cómo se eligen los ganadores?')).toBeInTheDocument();
    expect(screen.getByText('Reparto del Pool')).toBeInTheDocument();
    expect(screen.getByText('Entrega de los Premios')).toBeInTheDocument();
  });

  it('hace operativo el CTA principal de la preparación 1P', () => {
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar partida 1P' }));

    expect(onStartSinglePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Torneo Preventa UKI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver reglas/ })).toBeInTheDocument();
    expect(screen.queryByText(/Si clasificas/)).not.toBeInTheDocument();
  });
});
