import { render, screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import TreasureHuntExperienceShell from '@/components/games/treasure-hunt-experience-shell';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockPersistentGame() {
    return (
      <iframe
        src="https://game.example/treasure-hunt"
        title="persistent-treasure-hunt-game"
      />
    );
  },
}));

jest.mock('@/components/layout/header', () => ({
  __esModule: true,
  default: () => <div data-testid="treasure-wallet-controls" />,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('TreasureHuntExperienceShell', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings');
  });

  it('mantiene el hero y las pestañas fuera de un único viewport vertical desplazable', () => {
    render(
      <TreasureHuntExperienceShell>
        <div style={{ height: 1600 }}>Contenido largo</div>
      </TreasureHuntExperienceShell>,
    );

    const shell = document.querySelector('[data-treasure-hunt-shell]');
    const viewport = document.querySelector('[data-treasure-hunt-content]');

    expect(shell).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
    expect(viewport).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(screen.queryByRole('link', { name: 'Competiciones' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rankings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/profile',
    );
    expect(
      screen.getByText('Consigue la mayor puntuación antes de agotar el tiempo o perder las 3 vidas.'),
    ).not.toHaveClass('truncate');
    expect(screen.getByText('Disponible')).toHaveClass('hidden');
    expect(screen.getByText('Contenido largo')).toBeInTheDocument();
    expect(screen.getByTestId('treasure-wallet-controls')).toBeInTheDocument();
  });

  it('mantiene el iframe montado y comunica la visibilidad al cambiar de sección', async () => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    const view = render(
      <TreasureHuntExperienceShell>
        <div>Contenido secundario</div>
      </TreasureHuntExperienceShell>,
    );

    const iframe = screen.getByTitle('persistent-treasure-hunt-game') as HTMLIFrameElement;
    const postMessage = jest
      .spyOn(iframe.contentWindow as Window, 'postMessage')
      .mockImplementation(() => undefined);
    const persistentView = document.querySelector(
      '[data-treasure-hunt-persistent-game]',
    );

    expect(persistentView).not.toHaveAttribute('hidden');
    expect(screen.queryByText('Contenido secundario')).not.toBeInTheDocument();

    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings');
    view.rerender(
      <TreasureHuntExperienceShell>
        <div>Contenido secundario</div>
      </TreasureHuntExperienceShell>,
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'TREASURE_HUNT_VIEW_VISIBILITY',
          visible: false,
        },
        'https://game.example',
      );
    });
    expect(screen.getByTitle('persistent-treasure-hunt-game')).toBe(iframe);
    expect(persistentView).toHaveAttribute('hidden');
    expect(screen.getByText('Contenido secundario')).toBeInTheDocument();

    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    view.rerender(
      <TreasureHuntExperienceShell>
        <div>Contenido secundario</div>
      </TreasureHuntExperienceShell>,
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'TREASURE_HUNT_VIEW_VISIBILITY',
          visible: true,
        },
        'https://game.example',
      );
    });
    expect(screen.getByTitle('persistent-treasure-hunt-game')).toBe(iframe);
    expect(persistentView).not.toHaveAttribute('hidden');
  });
});
