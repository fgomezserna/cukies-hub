import { cleanup, render, screen } from '@testing-library/react';

import { CukiesLanding } from '@/components/landing/sections';
import {
  PANCAKESWAP_UKI_URL,
  UKI_MAINNET_ADDRESSES,
} from '@/components/landing/data';

let mockLocale: 'es' | 'en' = 'es';
let mockCompetitionError: string | null = null;

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowRight: Icon,
    BarChart3: Icon,
    Check: Icon,
    CircleAlert: Icon,
    Coins: Icon,
    Crown: Icon,
    ExternalLink: Icon,
    Gamepad2: Icon,
    Lock: Icon,
    LockKeyhole: Icon,
    ShieldCheck: Icon,
    Trophy: Icon,
    Users: Icon,
    WalletCards: Icon,
  };
});
jest.mock('@/components/landing/header', () => ({
  LandingHeader: () => <nav aria-label="Cabecera de prueba" />,
}));
jest.mock('@/components/landing/footer', () => ({
  LandingFooter: () => <footer>Footer</footer>,
}));
jest.mock('@/components/landing/hero-background-video', () => ({
  HeroBackgroundVideo: () => null,
}));
jest.mock('@/components/landing/scroll-reveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/providers/public-locale-provider', () => ({
  usePublicLocale: () => ({ locale: mockLocale, setLocale: jest.fn() }),
}));
jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  useTreasureHuntCompetitionOverview: () => ({
    status: {
      success: true,
      configured: true,
      enabled: true,
      phase: 'active',
      participant: { alias: 'CukiePlayer' },
      campaign: {
        campaignId: 'uki-launch-mainnet',
        eligibilityKind: 'uki_staking',
        startsAt: '2026-08-27T15:00:00.000Z',
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
      },
      eligibility: {
        ready: true,
        stakedUkiRaw: '20000000000000000000000',
        totalStakedUkiRaw: '520000000000000000000000',
        indexedThroughBlock: 123,
        indexedAt: '2026-08-27T15:00:00.000Z',
        disqualified: false,
        disqualificationEvidence: null,
        issues: [],
        attemptsGranted: 10,
        attemptsUsed: 1,
        attemptsRemaining: 9,
        topAttemptsCount: 1,
        totalTickets: 4,
        provisionalTickets: 4,
      },
    },
    leaderboard: [],
    leaderboardMeta: {
      poolUkiRaw: '52000000000000000000000',
      playerPoolUkiRaw: '52000000000000000000000',
      allocatedPlayerUkiRaw: '0',
      remainingPlayerPoolUkiRaw: '52000000000000000000000',
      totalRankedEntries: 1,
      myAttempts: 1,
      pagination: { page: 1, pageSize: 1, totalEntries: 1, totalPages: 1 },
    },
    isLoading: false,
    error: mockCompetitionError,
    reload: jest.fn(),
  }),
}));

describe('home post-listing de UKI', () => {
  beforeEach(() => {
    mockLocale = 'es';
    mockCompetitionError = null;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('presenta el recorrido operativo y elimina la preventa activa', () => {
    render(<CukiesLanding />);

    expect(screen.getByRole('heading', { level: 1, name: 'UKI ya está activo' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Entrar al torneo' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Hacer staking' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Comprar UKI con ASM' })[0]).toHaveAttribute(
      'href',
      PANCAKESWAP_UKI_URL,
    );

    expect(screen.getByRole('heading', { name: 'De UKI a la competición' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Torneo Lanzamiento UKI' })).toBeInTheDocument();
    expect(screen.getByText('52.000 UKI')).toBeInTheDocument();
    expect(screen.getByText('9', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('1/10')).toBeInTheDocument();
    expect(screen.getByText('Preventa finalizada')).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'Preventa UKI' })).not.toBeInTheDocument();
    expect(screen.queryByText('Aprobar ASM')).not.toBeInTheDocument();
    expect(screen.queryByText('Inicio de preventa')).not.toBeInTheDocument();
    expect(screen.queryByText('10 créditos')).not.toBeInTheDocument();
  });

  it('publica las direcciones oficiales y el acceso específico de participantes', () => {
    render(<CukiesLanding />);

    expect(screen.getByRole('link', { name: 'Token UKI: Abrir en BscScan' })).toHaveAttribute(
      'href',
      `https://bscscan.com/token/${UKI_MAINNET_ADDRESSES.token}`,
    );
    expect(screen.getByRole('link', { name: 'Pool ASM / UKI: Abrir en BscScan' })).toHaveAttribute(
      'href',
      `https://bscscan.com/address/${UKI_MAINNET_ADDRESSES.pair}`,
    );
    expect(screen.getByRole('link', { name: 'Staking UKI: Abrir en BscScan' })).toHaveAttribute(
      'href',
      `https://bscscan.com/address/${UKI_MAINNET_ADDRESSES.staking}`,
    );
    expect(screen.getByRole('link', { name: 'Liquidez bloqueada: Abrir en BscScan' })).toHaveAttribute(
      'href',
      `https://bscscan.com/address/${UKI_MAINNET_ADDRESSES.locker}`,
    );
    expect(screen.getByRole('link', { name: 'Consultar vesting' })).toHaveAttribute('href', '/vesting');
    expect(screen.getByRole('link', { name: 'Ver premios' })).toHaveAttribute('href', '/premios');
  });

  it('mantiene copy equivalente en inglés', () => {
    mockLocale = 'en';
    render(<CukiesLanding />);

    expect(screen.getByRole('heading', { level: 1, name: 'UKI is now live' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'From UKI to competition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'UKI Launch Tournament' })).toBeInTheDocument();
    expect(screen.getByText('Presale completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'UKI token: Open in BscScan' })).toBeInTheDocument();
  });

  it('mantiene acciones útiles cuando el estado en directo no está disponible', () => {
    mockCompetitionError = 'offline';
    render(<CukiesLanding />);

    expect(screen.getByText(/Los datos en directo se están actualizando/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jugar ahora' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt',
    );
    expect(screen.getByRole('link', { name: 'Ver rankings' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rankings',
    );
  });
});
