import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import GameLayout from '@/components/layout/GameLayout';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('lucide-react', () => ({
  Maximize: () => null,
  Minimize2: () => null,
  MessageCircle: () => null,
  Gamepad2: () => null,
  Heart: () => null,
  Trophy: () => null,
  Star: () => null,
  Medal: () => null,
  Crown: () => null,
  Wallet: () => null,
}));

jest.mock('@/hooks/use-mobile-game-shell', () => ({
  useMobileGameShell: jest.fn(),
}));

jest.mock('@/components/ui/GameChat', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/lib/parent-iframe-navigation', () => ({
  markParentIframeNavigation: jest.fn(),
}));

const mockUseMobileGameShell = useMobileGameShell as jest.MockedFunction<
  typeof useMobileGameShell
>;

const props = {
  gameConfig: {
    id: 'treasure-hunt',
    gameId: 'sybil-slayer',
    name: 'Treasure Hunt',
    description: 'Competición oficial',
    gameUrl: 'https://game.example',
    ranks: [],
    leaderboardTitle: 'Ranking',
    isActive: true,
    isInMaintenance: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  gameStats: {
    gameId: 'sybil-slayer',
    totalPlayers: 0,
    totalSessions: 0,
    avgScore: 0,
    topScore: 0,
    recentSessions: [],
  },
  leaderboardData: {
    leaderboard: [],
    totalCount: 0,
    hasMore: false,
  },
  loading: false,
};

describe('GameLayout fullscreen and desktop viewport', () => {
  beforeEach(() => {
    mockUseMobileGameShell.mockReturnValue(true);
  });

  it('uses a functional app-level fullscreen fallback in mobile wallet browsers', async () => {
    render(<GameLayout {...props} mobileFocus />);

    const viewport = document.querySelector('[data-game-viewport]');
    const fullscreenButton = screen.getByRole('button', { name: 'Abrir pantalla completa' });
    expect(viewport).toHaveAttribute('data-game-fullscreen', 'off');
    expect(fullscreenButton).toHaveTextContent('Pantalla completa');
    expect(viewport).not.toContainElement(fullscreenButton);
    expect(fullscreenButton.compareDocumentPosition(viewport as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole('link', { name: /Volver a juegos/ })).not.toBeInTheDocument();

    fireEvent.click(fullscreenButton);
    await waitFor(() => expect(viewport).toHaveAttribute('data-game-fullscreen', 'fallback'));
    expect(viewport).toHaveClass('fixed', 'inset-0', '!h-[100dvh]');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByText('Gira el móvil para jugar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar wallet' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salir de pantalla completa' }));
    await waitFor(() => expect(viewport).toHaveAttribute('data-game-fullscreen', 'off'));
    expect(document.body.style.overflow).toBe('');
  });

  it('mantiene el resumen del torneo sobre el juego en el shell móvil', () => {
    render(
      <GameLayout {...props} mobileFocus desktopBanner={<div>Resumen móvil del torneo</div>} />,
    );

    const banner = document.querySelector('[data-game-mobile-banner]');
    const viewport = document.querySelector('[data-game-viewport]');

    expect(banner).toHaveTextContent('Resumen móvil del torneo');
    expect(
      banner?.compareDocumentPosition(viewport as Node) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('constrains the desktop game above the fold when the competition banner is present', () => {
    mockUseMobileGameShell.mockReturnValue(false);
    render(
      <GameLayout {...props} mobileFocus desktopBanner={<div>Banner compacto</div>} />,
    );

    const viewport = document.querySelector('[data-game-viewport]');
    expect(viewport).toHaveClass('aspect-[11/8]', 'w-full', 'flex-none');
    expect(screen.getByText('Banner compacto')).toBeInTheDocument();
  });
});
