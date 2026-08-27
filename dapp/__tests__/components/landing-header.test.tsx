import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { LandingHeader } from '@/components/landing/header';
import { PUBLIC_LOCALE_STORAGE_KEY } from '@/lib/public-locale';
import { PublicLocaleProvider } from '@/providers/public-locale-provider';

jest.mock('lucide-react', () => ({
  Menu: ({ className }: { className?: string }) => <div data-testid="menu-icon" className={className} />,
  X: ({ className }: { className?: string }) => <div data-testid="x-icon" className={className} />,
}));

jest.mock('@/components/landing/wallet-connect-dynamic', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { createPortal } = jest.requireActual<typeof import('react-dom')>('react-dom');
  return {
    LandingWalletConnectButton: ({ evmOnly }: { evmOnly?: boolean }) => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" data-evm-only={String(Boolean(evmOnly))} onClick={() => setOpen(true)}>Wallet</button>
          {open ? createPortal(<div role="dialog" aria-label="Selector wallet">Selector wallet</div>, document.body) : null}
        </>
      );
    },
  };
});

describe('components/landing/LandingHeader', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = 'cukies_public_locale=; path=/; max-age=0';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('permite cambiar la cabecera publica entre español e ingles', async () => {
    render(
      <PublicLocaleProvider>
        <LandingHeader />
      </PublicLocaleProvider>,
    );

    expect(screen.getAllByRole('link', { name: 'Inicio' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Jugar' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: expect.stringContaining('/games/treasure-hunt') }),
      ]),
    );
    expect(screen.getAllByRole('link', { name: 'Comprar UKI' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: expect.stringContaining('/#comprar') }),
      ]),
    );
    expect(screen.getAllByRole('link', { name: 'Staking' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: expect.stringContaining('/cukie-master') }),
      ]),
    );
    expect(screen.queryByRole('link', { name: 'Premios' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'View website in English' })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: 'Play' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: 'Buy UKI' }).length).toBeGreaterThan(0);
      expect(window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY)).toBe('en');
    });
  });

  it('mantiene el cambio de idioma aunque el navegador bloquee localStorage', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked storage');
    });

    render(
      <PublicLocaleProvider>
        <LandingHeader />
      </PublicLocaleProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'View website in English' })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
      expect(document.documentElement.lang).toBe('en');
    });
  });

  it('mantiene el menú móvil fuera del foco hasta abrirlo y permite cerrarlo con Escape', () => {
    render(
      <PublicLocaleProvider>
        <LandingHeader evmOnly />
      </PublicLocaleProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir menú' });
    const drawer = document.getElementById('uki-mobile-navigation');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(drawer).toHaveAttribute('inert');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(drawer).not.toHaveAttribute('inert');
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('dialog', { name: 'Menú' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Wallet' }).every((button) => (
      button.getAttribute('data-evm-only') === 'true'
    ))).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();
    expect(drawer).toHaveAttribute('inert');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(trigger).toHaveFocus();
  });

  it('conserva abierto el selector de wallet al cerrar el drawer móvil', () => {
    render(
      <PublicLocaleProvider>
        <LandingHeader evmOnly />
      </PublicLocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const drawer = screen.getByRole('dialog', { name: 'Menú' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Wallet' }));

    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog', { name: 'Selector wallet' })).toBeInTheDocument();
  });
});
