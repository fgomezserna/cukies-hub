import { fireEvent, render, screen } from '@testing-library/react';

import TreasureHuntPlaySidebar from '@/components/games/treasure-hunt-play-sidebar';
import TreasureHuntRankingsView from '@/components/games/treasure-hunt-rankings-view';
import TreasureHuntRulesView from '@/components/games/treasure-hunt-rules-view';
import TreasureHuntProfile from '@/components/profile/treasure-hunt-profile';

jest.mock('lucide-react', () => ({
  Archive: () => null,
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
  Loader2: () => null,
  Medal: () => null,
  Save: () => null,
  ShoppingCart: () => null,
  Swords: () => null,
  Timer: () => null,
  Trophy: () => null,
  UserRound: () => null,
  Wallet: () => null,
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      walletAddress: '0x26789b9743d187174c3e3a87729730824a4d0c13',
    },
    isLoading: false,
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

jest.mock('@/components/games/treasure-hunt-competition-panel', () => ({
  __esModule: true,
  default: () => <div>Gestión real del torneo</div>,
}));

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  formatTreasureHuntCampaignWindow: () => '17 jul 2026 — 24 jul 2026',
  formatTreasureHuntDuration: (gameTimeMs: number) => `${gameTimeMs / 1_000} s`,
  formatTreasureHuntPercentage: (bps: number) => `${bps / 100}%`,
  TREASURE_HUNT_FALLBACK_RULES: {
    eligibilityKind: 'uki_staking',
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
    maxWinningAttemptsPerWallet: 5,
    cliffMonths: 9,
    vestingMonths: 6,
  },
  useTreasureHuntCompetitionOverview: () => ({
    status: {
      phase: 'active',
      participant: {
        alias: 'CukiePlayer',
      },
      campaign: {
        eligibilityKind: 'uki_staking',
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
        maxWinningAttemptsPerWallet: 5,
        cliffMonths: 9,
        vestingMonths: 6,
      },
      eligibility: {
        ready: true,
        stakedUkiRaw: '4000000000000000000000',
        totalStakedUkiRaw: '214840000000000000000000',
        indexedThroughBlock: 123_456_789,
        indexedAt: '2026-08-26T12:00:00.000Z',
        disqualified: false,
        disqualificationEvidence: null,
        issues: [],
        attemptsGranted: 2,
        attemptsUsed: 1,
        attemptsRemaining: 1,
        topAttemptsCount: 1,
        totalTickets: 125,
        provisionalTickets: 125,
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
        tickets: 125,
        isMe: true,
        estimatedRewardUkiRaw: '0',
        rewardStatus: 'draw_pending',
      },
    ],
    leaderboardMeta: {
      calculatedAt: '2026-07-30T12:00:00.000Z',
      poolUkiRaw: '71484000000000000000000',
      playerPoolUkiRaw: '57187200000000000000000',
      allocatedPlayerUkiRaw: '1250000000000000000000',
      remainingPlayerPoolUkiRaw: '55937200000000000000000',
      totalRankedEntries: 21,
      myAttempts: 1,
      pagination: {
        page: 1,
        pageSize: 20,
        totalEntries: 21,
        totalPages: 2,
      },
    },
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

describe('vistas UX de Treasure Hunt', () => {
  it('muestra por defecto la clasificación activa con las métricas del torneo', () => {
    const { container } = render(<TreasureHuntRankingsView />);

    expect(screen.getByText('Rankings de Treasure Hunt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'En curso' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Finalizadas' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Mis partidas')).toBeInTheDocument();
    expect(screen.getByText('71.484 UKI')).toBeInTheDocument();
    expect(screen.getByText('Partidas computables')).toBeInTheDocument();
    expect(screen.getByText('Premio acumulado')).toBeInTheDocument();
    expect(screen.getByText('N.º de ganadores')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText(/validado/i)).not.toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Pos.', 'Jugador', 'Puntuación', 'Tiempo', 'Tickets']);
    expect(headers).not.toContain('Partida');
    expect(headers).not.toContain('Score');
    expect(container.firstElementChild).toHaveClass('mx-auto', 'max-w-[68rem]');

    const playLink = screen.getByRole('link', { name: /Jugar 1P/ });
    expect(playLink).toHaveClass('hidden', 'sm:inline-flex');
    expect(screen.getByText('Partidas computables').closest('dl')).toHaveClass(
      'grid-cols-2',
      'sm:grid-cols-3',
    );
    expect(screen.getByRole('navigation', { name: 'Paginación del ranking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2' })).toBeInTheDocument();
  });

  it('presenta las siete secciones del reglamento aprobado', () => {
    const { container } = render(<TreasureHuntRulesView />);

    expect(screen.getByText('Cómo participar')).toBeInTheDocument();
    expect(screen.getByText('Clasificación')).toBeInTheDocument();
    expect(screen.getByText('Mantener el staking')).toBeInTheDocument();
    expect(screen.getByText('Tickets para el sorteo')).toBeInTheDocument();
    expect(screen.getByText('Pool y premios')).toBeInTheDocument();
    expect(screen.getByText('Selección de ganadores')).toBeInTheDocument();
    expect(screen.getByText('Entrega de los Premios')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('mx-auto', 'max-w-[68rem]');
  });

  it('hace operativo el CTA principal de la preparación 1P', () => {
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar partida 1P' }));

    expect(onStartSinglePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Torneo Lanzamiento UKI').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Gestionar staking UKI/ })).toHaveAttribute('href', '/cukie-master');
    expect(screen.getByRole('link', { name: /Ver reglas/ })).toBeInTheDocument();
    expect(screen.queryByText(/Si clasificas/)).not.toBeInTheDocument();
  });

  it('reduce el perfil al alias público y la wallet', () => {
    render(<TreasureHuntProfile />);

    expect(screen.getByText('El nombre con el que aparecerás en el ranking.')).toBeInTheDocument();
    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.queryByText(/^Torneo$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Estado$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Partidas computables$/)).not.toBeInTheDocument();
  });
});
