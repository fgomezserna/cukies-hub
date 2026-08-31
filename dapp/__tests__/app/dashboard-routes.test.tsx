import { render, screen } from '@testing-library/react';
import DashboardPage, { metadata } from '@/app/(app)/dashboard/page';
import WalletLegacyPage from '@/app/wallet/page';

const mockRedirect = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
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

    expect(screen.getByRole('heading', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByText(/Consulta tus créditos, Cukies y premios/)).toBeInTheDocument();
    expect(screen.getByText('Workspace económico')).toBeInTheDocument();
    expect(metadata.title).toBe('Mi cuenta | Cukies World');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('mantiene /wallet como alias legacy hacia /dashboard', () => {
    WalletLegacyPage();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
