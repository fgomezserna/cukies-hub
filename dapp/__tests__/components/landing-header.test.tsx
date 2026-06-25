import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LandingHeader } from '@/components/landing/header';
import { PUBLIC_LOCALE_STORAGE_KEY } from '@/lib/public-locale';
import { PublicLocaleProvider } from '@/providers/public-locale-provider';

jest.mock('lucide-react', () => ({
  Menu: ({ className }: { className?: string }) => <div data-testid="menu-icon" className={className} />,
  X: ({ className }: { className?: string }) => <div data-testid="x-icon" className={className} />,
}));

jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Wallet</button>,
}));

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

    fireEvent.click(screen.getAllByRole('button', { name: 'View website in English' })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
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
});
