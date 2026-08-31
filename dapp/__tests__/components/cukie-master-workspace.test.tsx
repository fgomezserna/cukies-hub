import { fireEvent, render, screen } from '@testing-library/react';

import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';

const mockUseAuth = jest.fn();

jest.mock('lucide-react', () => ({
  ArrowRight: () => <svg aria-hidden="true" />,
  Coins: () => <svg aria-hidden="true" />,
  Crown: () => <svg aria-hidden="true" />,
  Gem: () => <svg aria-hidden="true" />,
  ShieldCheck: () => <svg aria-hidden="true" />,
  Sparkles: () => <svg aria-hidden="true" />,
}));
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: ({ label }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));
jest.mock('@/components/cukie-master/status-panel', () => ({
  CukieMasterStatusPanel: ({
    overview,
    ukiOnly,
    onUkiRouteData,
  }: {
    overview?: boolean;
    ukiOnly?: boolean;
    onUkiRouteData?: (value: null) => void;
  }) => (
    <button
      type="button"
      data-overview={String(Boolean(overview))}
      data-uki-only={String(Boolean(ukiOnly))}
      onClick={() => onUkiRouteData?.(null)}
    >
      Resumen personal
    </button>
  ),
}));
jest.mock('@/components/cukie-master/uki-staking-panel', () => ({
  UkiStakingPanel: ({ testnetOnly }: { testnetOnly?: boolean }) => (
    <div data-testnet-only={String(Boolean(testnetOnly))}>Herramienta UKI</div>
  ),
}));
jest.mock('@/components/cukie-master/nft-vault-panel', () => ({
  CukieMasterNftVaultPanel: () => <div>Herramienta Cukies</div>,
}));
describe('CukieMasterWorkspace', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    window.history.replaceState(null, '', '/cukie-master');
  });

  it('ofrece una sola entrada cuando la wallet todavía no está conectada', () => {
    render(<CukieMasterWorkspace testnetOnly />);

    expect(screen.getByRole('heading', { level: 1, name: 'Hazte Cukie Master' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Conectar wallet' })).toHaveLength(1);
    expect(screen.getByText('20.000 UKI por cupo')).toBeInTheDocument();
    expect(screen.getByText('3 puntos de rareza por cupo')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.queryByText('Resumen personal')).not.toBeInTheDocument();
    expect(screen.queryByText('Herramienta UKI')).not.toBeInTheDocument();
    expect(screen.queryByText('Herramienta Cukies')).not.toBeInTheDocument();
    expect(screen.queryByText('Créditos propios y pool')).not.toBeInTheDocument();
  });

  it('muestra el recorrido conectado y una sola herramienta cada vez', () => {
    mockUseAuth.mockReturnValue({
      user: { walletAddress: '0x2678a00000000000000000000000000000000c13' },
      isLoading: false,
    });

    render(<CukieMasterWorkspace testnetOnly />);

    expect(screen.getByText('Resumen personal')).toHaveAttribute('data-overview', 'true');
    expect(screen.getByText('Resumen personal')).toHaveAttribute('data-uki-only', 'false');
    expect(screen.getByText('Herramienta UKI')).toHaveAttribute('data-testnet-only', 'true');
    expect(screen.queryByText('Herramienta Cukies')).not.toBeInTheDocument();
    expect(screen.queryByText('Créditos propios y pool')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Deposita Cukies Originales/i }));

    expect(screen.queryByText('Herramienta UKI')).not.toBeInTheDocument();
    expect(screen.getByText('Herramienta Cukies')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Deposita Cukies Originales/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('prepara una única experiencia mientras se recupera la sesión', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });

    render(<CukieMasterWorkspace />);

    expect(screen.getByRole('status', { name: 'Preparando Cukie Master' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conectar wallet/i })).not.toBeInTheDocument();
  });
});
