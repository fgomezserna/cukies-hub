import { render, screen } from '@testing-library/react';

import TreasureHuntExperienceShell from '@/components/games/treasure-hunt-experience-shell';

const mockUsePathname = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('lucide-react', () => ({
  ArrowLeft: () => <span aria-hidden="true" />,
  BookOpenText: () => <span aria-hidden="true" />,
  Gamepad2: () => <span aria-hidden="true" />,
  Medal: () => <span aria-hidden="true" />,
  Swords: () => <span aria-hidden="true" />,
}));

describe('TreasureHuntExperienceShell', () => {
  it('keeps the game as the parent and marks the active information tab', () => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings');

    render(
      <TreasureHuntExperienceShell>
        <p>Contenido del ranking</p>
      </TreasureHuntExperienceShell>,
    );

    expect(screen.getByText('Treasure Hunt')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Secciones de Treasure Hunt' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute('href', '/games/treasure-hunt');
    expect(screen.getByRole('link', { name: 'Competiciones' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/competitions',
    );
    expect(screen.getByRole('link', { name: 'Rankings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Reglas' })).not.toHaveAttribute('aria-current');
    expect(document.querySelector('[data-treasure-hunt-view]')).toHaveAttribute(
      'data-treasure-hunt-view',
      'information',
    );
  });

  it('uses the dedicated non-scrolling play viewport on the canonical game route', () => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt');

    render(
      <TreasureHuntExperienceShell>
        <p>Iframe del juego</p>
      </TreasureHuntExperienceShell>,
    );

    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-treasure-hunt-view]')).toHaveAttribute(
      'data-treasure-hunt-view',
      'play',
    );
  });

  it('resets desktop and mobile content scroll when the active tab changes', () => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rules');
    const { rerender } = render(
      <main data-app-main>
        <TreasureHuntExperienceShell>
          <p>Reglas</p>
        </TreasureHuntExperienceShell>
      </main>,
    );

    const appMain = document.querySelector<HTMLElement>('[data-app-main]');
    const content = document.querySelector<HTMLElement>('[data-treasure-hunt-content]');
    if (!appMain || !content) throw new Error('Missing scroll containers');
    appMain.scrollTop = 300;
    content.scrollTop = 180;

    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    rerender(
      <main data-app-main>
        <TreasureHuntExperienceShell>
          <p>Juego</p>
        </TreasureHuntExperienceShell>
      </main>,
    );

    expect(appMain.scrollTop).toBe(0);
    expect(content.scrollTop).toBe(0);
  });
});
