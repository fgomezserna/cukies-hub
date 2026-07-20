import { fireEvent, render, screen } from '@testing-library/react';

import TreasureHuntCompetitionsView from '@/components/games/treasure-hunt-competitions-view';
import TreasureHuntRankingsView from '@/components/games/treasure-hunt-rankings-view';
import TreasureHuntRulesView from '@/components/games/treasure-hunt-rules-view';
import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';

jest.mock('lucide-react', () => {
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />;
  return {
    ArrowRight: Icon,
    BadgeCheck: Icon,
    BookOpenText: Icon,
    CalendarClock: Icon,
    CheckCircle2: Icon,
    Clock3: Icon,
    Coins: Icon,
    Crown: Icon,
    Gamepad2: Icon,
    LockKeyhole: Icon,
    Medal: Icon,
    MousePointerClick: Icon,
    ShieldCheck: Icon,
    Sparkles: Icon,
    Swords: Icon,
    UserRoundCheck: Icon,
  };
});

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => {
  const actual = jest.requireActual('@/hooks/use-treasure-hunt-competition-overview');
  return {
    ...actual,
    useTreasureHuntCompetitionOverview: jest.fn(),
  };
});

jest.mock('@/components/games/treasure-hunt-competition-panel', () => {
  return function MockTreasureHuntCompetitionPanel() {
    return <div data-testid="competition-detail-panel">Panel de participación</div>;
  };
});

const mockOverview = useTreasureHuntCompetitionOverview as jest.MockedFunction<
  typeof useTreasureHuntCompetitionOverview
>;

const campaign = {
  campaignId: 'uki-presale-2026',
  startsAt: '2026-08-01T12:00:00.000Z',
  endsAt: '2026-08-31T20:00:00.000Z',
  poolBps: 2_500,
  playerRewardBps: 1_000,
  sponsorRewardBps: 2_500,
  maxWinningAttemptsPerWallet: 5,
  cliffMonths: 9,
  vestingMonths: 6,
};

const status = {
  success: true as const,
  configured: true,
  enabled: true,
  phase: 'active' as const,
  campaign,
  participant: {
    alias: 'VaultRunner',
    canonicalAlias: 'vaultrunner',
    aliasChangedAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
  },
};

describe('Treasure Hunt information views', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps only the current presale tournament actionable', () => {
    mockOverview.mockReturnValue({
      status,
      leaderboard: [],
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });

    render(<TreasureHuntCompetitionsView />);

    expect(screen.getByRole('heading', { name: 'Torneo de Preventa UKI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Jugar ahora/i })).toHaveAttribute(
      'href',
      '/games/treasure-hunt',
    );

    const inactiveTitles = ['Temporada 1P', 'Torneo 1v1'];
    inactiveTitles.forEach((title) => {
      const heading = screen.getByRole('heading', { name: title });
      expect(heading.closest('[role="group"]')).toHaveAttribute('aria-disabled', 'true');
    });

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByTestId('competition-detail-panel')).toBeInTheDocument();
  });

  it('separates the active presale ranking from inactive future rankings', () => {
    mockOverview.mockReturnValue({
      status,
      leaderboard: [
        {
          rank: 1,
          walletRank: 1,
          attemptId: 'attempt-other',
          alias: 'CipherFox',
          score: 12_345,
          gameTimeMs: 45_600,
          finishedAt: '2026-08-05T12:30:00.000Z',
          reviewStatus: 'approved',
          isMe: false,
        },
        {
          rank: 2,
          walletRank: 1,
          attemptId: 'attempt-me',
          alias: 'VaultRunner',
          score: 9_000,
          gameTimeMs: 50_000,
          finishedAt: '2026-08-05T12:31:00.000Z',
          reviewStatus: 'pending',
          isMe: true,
        },
      ],
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });

    render(<TreasureHuntRankingsView />);

    expect(screen.getByText('Ranking de Preventa UKI')).toBeInTheDocument();
    expect(screen.getByText('Ranking semanal 1P')).toBeInTheDocument();
    expect(screen.getByText('Ranking 1v1')).toBeInTheDocument();
    expect(screen.getAllByText('CipherFox').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VaultRunner').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mis partidas' }));

    expect(screen.queryByText('CipherFox')).not.toBeInTheDocument();
    expect(screen.getAllByText('VaultRunner').length).toBeGreaterThan(0);
  });

  it('renders configured reward math and vesting without mixing future editions', () => {
    mockOverview.mockReturnValue({
      status,
      leaderboard: [],
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });

    render(<TreasureHuntRulesView />);

    expect(screen.getByText('Competición individual 1P')).toBeInTheDocument();
    expect(screen.getAllByText('25%').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText(/Cada partida premiada toma como referencia el 10%/i)).toBeInTheDocument();
    expect(screen.getByText(/9 meses de cliff y después 6 meses de vesting lineal/i)).toBeInTheDocument();
    expect(screen.getByText('Puedes jugar sin comprar UKI.')).toBeInTheDocument();
    expect(screen.getByText(/1v1 no participa en este ranking/i)).toBeInTheDocument();
  });

  it('does not fabricate dates when the competition runtime is unconfigured', () => {
    mockOverview.mockReturnValue({
      status: {
        success: true,
        configured: false,
        enabled: false,
        phase: 'unconfigured',
        campaign: null,
        participant: null,
      },
      leaderboard: [],
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });

    render(<TreasureHuntRulesView />);

    expect(screen.getByText('Pendiente de configurar')).toBeInTheDocument();
    expect(screen.getByText(/las fechas no se inventan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ventana:/)).not.toBeInTheDocument();
  });
});
