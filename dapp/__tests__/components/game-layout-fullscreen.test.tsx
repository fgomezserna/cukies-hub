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

jest.mock('@phosphor-icons/react', () => ({
  ArrowsLeftRight: () => null,
  SignOut: () => null,
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
  const originalUserAgent = window.navigator.userAgent;
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalFullscreenElement = Object.getOwnPropertyDescriptor(
    document,
    'fullscreenElement',
  );
  const originalRequestFullscreen = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'requestFullscreen',
  );

  beforeEach(() => {
    mockUseMobileGameShell.mockReturnValue(true);
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
    if (originalFullscreenElement) {
      Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
    } else {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
    if (originalRequestFullscreen) {
      Object.defineProperty(
        HTMLElement.prototype,
        'requestFullscreen',
        originalRequestFullscreen,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
    }
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
    expect(screen.queryByText('Gira el móvil para jugar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar wallet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salir de pantalla completa' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salir de pantalla completa' }));
    await waitFor(() => expect(viewport).toHaveAttribute('data-game-fullscreen', 'off'));
    expect(document.body.style.overflow).toBe('');
  });

  it('permite voltear tablero y tótem manteniendo los controles a la derecha', async () => {
    render(<GameLayout {...props} mobileFocus mobileLayoutFlipEnabled />);

    const viewport = document.querySelector('[data-game-viewport]');
    const iframe = screen.getByTitle('Treasure Hunt') as HTMLIFrameElement;
    const postMessage = jest.spyOn(iframe.contentWindow as Window, 'postMessage')
      .mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla completa' }));
    await waitFor(() => expect(viewport).toHaveAttribute('data-game-fullscreen', 'fallback'));

    const flipButton = screen.getByRole('button', { name: 'Voltear tablero y tótem' });
    const controls = document.querySelector('[data-game-mobile-controls]');
    expect(screen.getByRole('button', { name: 'Salir de pantalla completa' }))
      .toBeInTheDocument();
    expect(screen.queryByText('Salir')).not.toBeInTheDocument();
    expect(screen.queryByText('Voltear')).not.toBeInTheDocument();
    expect(controls).toHaveAttribute('data-game-mobile-controls-side', 'right');
    expect(flipButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(flipButton);
    expect(viewport).toHaveAttribute('data-game-layout-flipped', 'true');
    expect(controls).toHaveAttribute('data-game-mobile-controls-side', 'right');
    expect(flipButton).toHaveAttribute('aria-pressed', 'true');
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'TREASURE_HUNT_LAYOUT_FLIP', flipped: true },
      'https://game.example',
    );

    fireEvent.click(flipButton);
    expect(viewport).toHaveAttribute('data-game-layout-flipped', 'false');
    expect(controls).toHaveAttribute('data-game-mobile-controls-side', 'right');
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'TREASURE_HUNT_LAYOUT_FLIP', flipped: false },
      'https://game.example',
    );
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

  it('rota un fullscreen nativo que SafePal mantiene en portrait y vuelve al layout nativo al girar', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 SafePal',
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = jest.fn(async function requestFullscreen(
      this: HTMLElement,
    ) {
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    render(<GameLayout {...props} mobileFocus />);

    const viewport = document.querySelector('[data-game-viewport]');
    const landscapeSurface = document.querySelector('[data-game-landscape-surface]');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla completa' }));

    await waitFor(() => {
      expect(viewport).toHaveAttribute('data-game-fullscreen', 'native');
      expect(viewport).toHaveAttribute('data-game-orientation-fallback', 'css-rotated');
    });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(viewport).not.toHaveClass('rotate-90', '!h-[100vw]', '!w-[100dvh]');
    expect(landscapeSurface).toHaveClass(
      'absolute',
      'left-1/2',
      'top-1/2',
      '!h-[100vw]',
      '!w-[100dvh]',
      '-translate-x-1/2',
      '-translate-y-1/2',
      'rotate-90',
    );
    expect(screen.queryByText('Gira el móvil para jugar')).not.toBeInTheDocument();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 390,
    });
    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(viewport).toHaveAttribute('data-game-orientation-fallback', 'off');
    });
    expect(landscapeSurface).not.toHaveClass('rotate-90', '!h-[100vw]', '!w-[100dvh]');
  });

  it('reduce el horizontal sin fullscreen a una única puerta de entrada', () => {
    render(<GameLayout {...props} mobileFocus />);

    const gate = document.querySelector('[data-game-landscape-gate]');
    expect(gate).toHaveClass('hidden', 'landscape:flex');
    expect(
      screen.getByRole('button', { name: 'Activar pantalla completa en horizontal' }),
    ).toBeInTheDocument();
  });

  it('reserves the desktop play stage for the game and moves the result below it', () => {
    mockUseMobileGameShell.mockReturnValue(false);
    render(
      <GameLayout
        {...props}
        mobileFocus
        desktopBanner={<div>Banner compacto</div>}
        desktopSidebar={<div>Preparación 1P</div>}
        desktopFooter={<div>Último resultado</div>}
        desktopGameFirst
      />,
    );

    const viewport = document.querySelector('[data-game-viewport]');
    const layout = document.querySelector('[data-game-desktop-priority]');
    const stage = document.querySelector<HTMLElement>('[data-game-desktop-stage]');
    const footer = document.querySelector<HTMLElement>('[data-game-desktop-footer]');
    expect(viewport).toHaveClass(
      'aspect-[11/8]',
      'w-full',
      'flex-none',
      'lg:h-full',
      'lg:w-auto',
      'lg:max-w-full',
      'lg:self-center',
    );
    expect(layout).toHaveAttribute('data-game-desktop-priority', 'game-first');
    expect(stage).toHaveClass('lg:h-full');
    expect(stage).not.toContainElement(footer);
    expect(stage?.compareDocumentPosition(footer as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText('Banner compacto')).toBeInTheDocument();
    expect(screen.getByText('Último resultado')).toBeInTheDocument();
  });
});
