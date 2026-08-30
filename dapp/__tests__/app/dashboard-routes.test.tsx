import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import DashboardPage, { metadata } from '@/app/(app)/dashboard/page';
import WalletLegacyPage from '@/app/wallet/page';

const mockRedirect = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

jest.mock('@/components/launch/info-page', () => ({
  LaunchInfoPage: ({
    title,
    beforeSections,
  }: {
    title: string;
    beforeSections?: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {beforeSections}
    </main>
  ),
}));

jest.mock('@/components/wallet/dashboard-workspace', () => ({
  WalletDashboardWorkspace: () => <section>Workspace económico</section>,
}));

describe('rutas canónicas del dashboard', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('renderiza el dashboard operativo en la ruta canónica', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'Dashboard UKI' })).toBeInTheDocument();
    expect(screen.getByText('Workspace económico')).toBeInTheDocument();
    expect(metadata.title).toBe('Dashboard UKI | Cukies World');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('mantiene /wallet como alias legacy hacia /dashboard', () => {
    WalletLegacyPage();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
