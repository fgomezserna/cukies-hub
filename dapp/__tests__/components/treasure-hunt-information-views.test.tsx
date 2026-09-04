import { fireEvent, render, screen } from '@testing-library/react';

import TreasureHuntPlaySidebar from '@/components/games/treasure-hunt-play-sidebar';
import TreasureHuntRankingsView from '@/components/games/treasure-hunt-rankings-view';
import TreasureHuntRulesView from '@/components/games/treasure-hunt-rules-view';
import TreasureHuntProfile from '@/components/profile/treasure-hunt-profile';

let mockDisqualified = false;
let mockPhase = 'active';

const mockCreditAccess = {
  walletConnected: true,
  isLoading: false,
  isError: false,
  blocked: false,
  ready: true,
  costCredits: 10,
  availableCredits: 480,
  ownAvailableCredits: 480,
  poolAvailableCredits: 120,
  poolContributedCredits: 20,
  spentCredits: 0,
  creditSource: 'own' as 'own' | 'pool' | null,
  reservedCredits: 0,
  poolReservedCredits: 0,
  canPlay: true,
  missingCredits: 0,
  reload: jest.fn(),
};

jest.mock('lucide-react', () => ({
  Archive: () => null,
  ArrowRight: () => null,
  BarChart3: () => null,
  BookOpenText: () => null,
  CalendarClock: () => null,
  CalendarDays: () => null,
  CheckCircle2: () => null,
  CircleDollarSign: () => null,
  Coins: () => null,
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

jest.mock('@phosphor-icons/react', () => ({
  ArrowRight: () => null,
  ClockCounterClockwise: () => null,
  Coin: () => null,
  GameController: () => null,
  SpinnerGap: () => null,
  Stack: () => null,
  Trophy: () => null,
  Warning: () => null,
}));

jest.mock('@/hooks/use-treasure-hunt-credit-access', () => ({
  useTreasureHuntCreditAccess: () => mockCreditAccess,
}));

jest.mock('@/hooks/use-treasure-hunt-weekly-overview', () => ({
  useTreasureHuntWeeklyOverview: () => ({
    data: {
      period: {
        periodId: 'th-week:2026-08-31T14:00:00.000Z',
        startsAt: '2026-08-31T14:00:00.000Z',
        endsAt: '2026-09-07T14:00:00.000Z',
      },
      poolUkiRaw: '2000000000000000000',
      totalRankedWallets: 21,
      entries: [{
        rank: 1,
        alias: 'CukiePlayer',
        scoreRaw: '12500',
        achievedAt: '2026-09-01T12:00:00.000Z',
        cukieSource: 'own',
        isMe: true,
      }],
      pagination: { page: 1, pageSize: 20, totalEntries: 21, totalPages: 2 },
      participation: {
        ownCreditRuns: 1,
        poolCreditRuns: 1,
        bestPoolScoreRaw: '12500',
      },
      latestResult: null,
    },
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
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
      phase: mockPhase,
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
        disqualified: mockDisqualified,
        disqualificationEvidence: mockDisqualified ? {
          eventId: 'unstake-1',
          txHash: `0x${'a'.repeat(64)}`,
          blockNumber: 127_368_347,
          timestamp: '2026-08-26T16:36:42.000Z',
          amountRaw: '20000000000000000000000',
        } : null,
        issues: [],
        attemptsGranted: 2,
        attemptsUsed: 1,
        attemptsRemaining: mockDisqualified ? 0 : 1,
        topAttemptsCount: 1,
        totalTickets: 125,
        provisionalTickets: 125,
      },
    },
    leaderboard: mockDisqualified ? [] : [
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
  beforeEach(() => {
    mockDisqualified = false;
    mockPhase = 'active';
    Object.assign(mockCreditAccess, {
      walletConnected: true,
      isLoading: false,
      isError: false,
      blocked: false,
      ready: true,
      costCredits: 10,
      availableCredits: 480,
      ownAvailableCredits: 480,
      poolAvailableCredits: 120,
      poolContributedCredits: 20,
      spentCredits: 0,
      creditSource: 'own',
      reservedCredits: 0,
      poolReservedCredits: 0,
      canPlay: true,
      missingCredits: 0,
    });
  });

  it('muestra por defecto la competición semanal automática', () => {
    const { container } = render(<TreasureHuntRankingsView />);

    expect(screen.getByText('Rankings de Treasure Hunt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana actual' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Torneos especiales' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Mi posición')).toBeInTheDocument();
    expect(screen.getByText('2 UKI')).toBeInTheDocument();
    expect(screen.getByText('Periodo actual')).toBeInTheDocument();
    expect(screen.getByText('Bote acumulado')).toBeInTheDocument();
    expect(screen.getByText('Participantes clasificados')).toBeInTheDocument();
    expect(screen.getByText(/Al terminar el periodo se guarda la clasificación/i)).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Pos.', 'Jugador', 'Situación', 'Cukie usado', 'Mejor puntuación']);
    expect(headers).not.toContain('Partida');
    expect(headers).not.toContain('Score');
    expect(container.firstElementChild).toHaveClass('mx-auto', 'max-w-[68rem]');

    const playLink = screen.getByRole('link', { name: /^Jugar/ });
    expect(playLink).toHaveAttribute('href', '/games/treasure-hunt');
    expect(screen.getByRole('navigation', { name: 'Paginación del ranking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2' })).toBeInTheDocument();
  });

  it('presenta el reglamento semanal vigente y separa el torneo especial archivado', () => {
    const { container } = render(<TreasureHuntRulesView />);

    expect(screen.getByRole('heading', { name: 'Reglas de Treasure Hunt' })).toBeInTheDocument();
    expect(screen.getByText('Qué necesitas para jugar')).toBeInTheDocument();
    expect(screen.getByText('Créditos personales o créditos del pool')).toBeInTheDocument();
    expect(screen.getByText('Cómo se calcula la recompensa de cada partida')).toBeInTheDocument();
    expect(screen.getByText('Cómo funciona la clasificación semanal')).toBeInTheDocument();
    expect(screen.getByText('Cómo se reparte el bote semanal')).toBeInTheDocument();
    expect(screen.getByText('Abandonos, fallos y torneos especiales')).toBeInTheDocument();
    expect(screen.getAllByText('10 créditos').length).toBeGreaterThan(0);
    expect(screen.getByText(/Solo cuentan las partidas pagadas con créditos del pool/i)).toBeInTheDocument();
    expect(screen.getByText(/Cada partida válida añade 2 UKI al bote/i)).toBeInTheDocument();
    expect(screen.getByText(/Empiezas en #5/i)).toBeInTheDocument();
    expect(screen.queryByText(/Torneo Lanzamiento UKI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cada 2\.000 UKI que deposites en staking/i)).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('mx-auto', 'max-w-[72rem]');
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

  it('permite iniciar una partida por créditos cuando el torneo ha terminado', () => {
    mockPhase = 'closed';
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Jugar con 10 créditos personales' }));

    expect(onStartSinglePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('480 créditos')).toBeInTheDocument();
    expect(screen.getByText('20 aportados al pool este periodo')).toBeInTheDocument();
    expect(screen.getByText('No entra en la clasificación')).toBeInTheDocument();
    expect(screen.queryByText('Torneo Lanzamiento UKI')).not.toBeInTheDocument();
  });

  it('habilita el ranking cuando no quedan créditos personales y el pool puede pagar la partida', () => {
    mockPhase = 'closed';
    Object.assign(mockCreditAccess, {
      availableCredits: 0,
      ownAvailableCredits: 0,
      poolAvailableCredits: 120,
      creditSource: 'pool',
      canPlay: true,
      missingCredits: 0,
    });
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Competir con 10 créditos del pool' }));

    expect(onStartSinglePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sí, esta partida cuenta')).toBeInTheDocument();
    expect(screen.getByText('120 créditos disponibles en el pool compartido')).toBeInTheDocument();
  });

  it('explica cuánto falta y bloquea la partida si no hay créditos suficientes', () => {
    mockPhase = 'closed';
    Object.assign(mockCreditAccess, {
      availableCredits: 4,
      ownAvailableCredits: 4,
      poolAvailableCredits: 3,
      creditSource: null,
      canPlay: false,
      missingCredits: 6,
    });
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    expect(screen.getByRole('button', { name: 'Te faltan 6 créditos' })).toBeDisabled();
    expect(screen.getByText('4 créditos')).toBeInTheDocument();
    expect(onStartSinglePlayer).not.toHaveBeenCalled();
  });

  it('muestra intentos disponibles y bloquea el juego de una wallet descalificada', () => {
    mockDisqualified = true;
    const onStartSinglePlayer = jest.fn();
    render(<TreasureHuntPlaySidebar onStartSinglePlayer={onStartSinglePlayer} />);

    expect(screen.getByText('Intentos disponibles').parentElement).toHaveTextContent('0');
    expect(screen.getByText('Uso de intentos').parentElement).toHaveTextContent('1 usado · 2 concedidos');
    expect(screen.getByText('Estado').parentElement).toHaveTextContent('Descalificado');
    expect(screen.getByRole('button', { name: 'Wallet descalificada' })).toBeDisabled();
  });

  it('no mezcla la descalificación del torneo especial con la semana activa', () => {
    mockDisqualified = true;
    render(<TreasureHuntRankingsView />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tu mejor partida con créditos del pool' })).toBeInTheDocument();
    expect(screen.getByText('Mejor puntuación clasificada: 12.500')).toBeInTheDocument();
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
