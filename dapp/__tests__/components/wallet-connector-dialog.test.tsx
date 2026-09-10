import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Connector } from 'wagmi';

import { WalletConnectorDialog } from '@/components/landing/wallet-connector-dialog';

jest.mock('lucide-react', () => ({
  Loader2: () => <span data-testid="loader" />,
  LogOut: () => <span data-testid="logout" />,
  ShieldAlert: () => <span data-testid="shield-alert" />,
  Wallet: () => <span data-testid="wallet" />,
  X: () => <span data-testid="close" />,
}));

function connector(overrides: Partial<Connector> & Pick<Connector, 'id' | 'name'>) {
  return {
    type: 'injected',
    ...overrides,
  } as Connector;
}

describe('components/landing/WalletConnectorDialog', () => {
  it('mantiene una sola MetaMask entre la tarjeta móvil y otras opciones EVM', async () => {
    const onSelectMobileWallet = jest.fn();
    const metaMask = connector({ id: 'metaMask', name: 'MetaMask' });
    const browserWallet = connector({ id: 'injected', name: 'Injected' });

    render(
      <WalletConnectorDialog
        open
        onOpenChange={jest.fn()}
        connectors={[metaMask, browserWallet]}
        onSelectConnector={jest.fn()}
        isMobile
        onSelectMobileWallet={onSelectMobileWallet}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wallet móvil' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Otras opciones EVM' })).toBeInTheDocument();
    expect(screen.getAllByText('MetaMask')).toHaveLength(1);

    fireEvent.click(screen.getByText('MetaMask').closest('button')!);
    await waitFor(() => expect(onSelectMobileWallet).toHaveBeenCalledWith('metaMask'));
  });

  it('describe las opciones de extensión sin instrucciones de dApp móvil en escritorio', () => {
    const metaMask = connector({ id: 'metaMask', name: 'MetaMask' });

    render(
      <WalletConnectorDialog
        open
        onOpenChange={jest.fn()}
        connectors={[metaMask]}
        onSelectConnector={jest.fn()}
      />,
    );

    expect(screen.getByText('Extensión de navegador para BNB Smart Chain.')).toBeInTheDocument();
    expect(screen.queryByText(/deep link oficial/i)).not.toBeInTheDocument();
  });

  it('mantiene los conectores móviles cuando no hay tarjetas móviles disponibles', () => {
    const metaMask = connector({ id: 'metaMask', name: 'MetaMask' });

    render(
      <WalletConnectorDialog
        open
        onOpenChange={jest.fn()}
        connectors={[metaMask]}
        onSelectConnector={jest.fn()}
        isMobile
      />,
    );

    expect(screen.getByRole('button', { name: /MetaMask/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wallet móvil' })).not.toBeInTheDocument();
  });
});
