import { fireEvent, render, screen } from '@testing-library/react';
import type { Connector } from 'wagmi';

import { HeaderWalletDialog } from '@/components/layout/header-wallet-dialog';

jest.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => (
    <span data-testid="close-icon" className={className} />
  ),
}));

const braveWallet = {
  id: 'com.brave.wallet',
  name: 'Brave Wallet',
  type: 'injected',
  rdns: 'com.brave.wallet',
} as Connector;

function renderDialog(onSelectMobileWallet = jest.fn()) {
  render(
    <HeaderWalletDialog
      open
      onOpenChange={jest.fn()}
      connectors={[braveWallet]}
      onSelectMobileWallet={onSelectMobileWallet}
      onSelectConnector={jest.fn()}
      tronLink={{
        error: null,
        isInstalled: true,
        isLoading: false,
        onSelect: jest.fn(),
      }}
    />,
  );
}

describe('components/layout/HeaderWalletDialog', () => {
  it('muestra las cuatro wallets priorizadas y las opciones nativas adicionales', () => {
    renderDialog();

    const options = screen.getByTestId('mobile-wallet-options');
    const buttons = Array.from(options.querySelectorAll('button'));

    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('SafePal'),
      expect.stringContaining('Trust Wallet'),
      expect.stringContaining('MetaMask'),
      expect.stringContaining('TokenPocket'),
    ]);
    expect(screen.getByText('Otras opciones EVM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Brave Wallet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TronLink TRON/i })).toBeInTheDocument();
  });

  it('usa un logotipo gráfico propio para cada wallet', () => {
    renderDialog();

    const logos = Array.from(
      screen.getByTestId('mobile-wallet-options').querySelectorAll('img'),
    );
    expect(logos.map((logo) => logo.getAttribute('src'))).toEqual([
      '/brand/wallets/safepal.svg',
      '/brand/wallets/trust-wallet.svg',
      '/brand/wallets/metamask.svg',
      '/brand/wallets/tokenpocket.svg',
    ]);
    expect(screen.queryByText(/^(SP|TW|MM|TP)$/)).not.toBeInTheDocument();
  });

  it('comunica la wallet seleccionada sin cambiar el contrato del diálogo', () => {
    const onSelectMobileWallet = jest.fn();
    renderDialog(onSelectMobileWallet);

    fireEvent.click(screen.getByRole('button', { name: /TokenPocket/ }));

    expect(onSelectMobileWallet).toHaveBeenCalledWith('tokenPocket');
    expect(screen.getByRole('dialog')).toHaveClass(
      'max-h-[calc(100dvh-2rem)]',
      'w-[calc(100vw-2rem)]',
      'overflow-hidden',
    );
  });
});
