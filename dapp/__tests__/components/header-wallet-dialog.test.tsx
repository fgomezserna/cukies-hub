import { fireEvent, render, screen } from '@testing-library/react';
import type { Connector } from 'wagmi';

import { HeaderWalletDialog } from '@/components/layout/header-wallet-dialog';

jest.mock('lucide-react', () => ({
  Wallet: ({ className }: { className?: string }) => (
    <span data-testid="wallet-icon" className={className} />
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="close-icon" className={className} />
  ),
}));

const browserWallet = {
  id: 'injected',
  name: 'Injected',
  type: 'injected',
} as Connector;

const braveWallet = {
  id: 'com.brave.wallet',
  name: 'Brave Wallet',
  type: 'injected',
  rdns: 'com.brave.wallet',
} as Connector;

describe('components/layout/HeaderWalletDialog', () => {
  it('keeps long wallet descriptions inside a viewport-sized scroll area', () => {
    render(
      <HeaderWalletDialog
        open
        onOpenChange={jest.fn()}
        connectors={[browserWallet]}
        onSelectMobileWallet={jest.fn()}
        onSelectConnector={jest.fn()}
        tronLink={{
          error: null,
          isInstalled: true,
          isLoading: false,
          onSelect: jest.fn(),
        }}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveClass(
      'max-h-[calc(100dvh-2rem)]',
      'w-[calc(100vw-2rem)]',
      'overflow-hidden',
    );
    expect(screen.getByTestId('header-wallet-dialog-options')).toHaveClass(
      'min-w-0',
      'overflow-x-hidden',
      'overflow-y-auto',
    );
    expect(screen.getByRole('button', { name: /Browser wallet/i })).toHaveClass(
      'min-w-0',
      'whitespace-normal',
    );
    expect(
      screen.getByText('MetaMask, Rabby, Trust, OKX, Binance Wallet o TronLink EVM.'),
    ).toHaveClass('whitespace-normal', 'break-words');
  });

  it('selects the requested connector without changing the dialog contract', () => {
    const onSelectConnector = jest.fn();

    render(
      <HeaderWalletDialog
        open
        onOpenChange={jest.fn()}
        connectors={[browserWallet]}
        onSelectMobileWallet={jest.fn()}
        onSelectConnector={onSelectConnector}
        tronLink={{
          error: null,
          isInstalled: false,
          isLoading: false,
          onSelect: jest.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Browser wallet/i }));

    expect(onSelectConnector).toHaveBeenCalledTimes(1);
    expect(onSelectConnector).toHaveBeenCalledWith(browserWallet);
    expect(
      screen.getByRole('button', { name: /^TronLink Instala la extensión TronLink$/i }),
    ).toBeDisabled();
  });

  it('prioriza las cuatro wallets móviles solicitadas y comunica la selección', () => {
    const onSelectMobileWallet = jest.fn();

    render(
      <HeaderWalletDialog
        open
        onOpenChange={jest.fn()}
        connectors={[browserWallet]}
        onSelectMobileWallet={onSelectMobileWallet}
        onSelectConnector={jest.fn()}
        tronLink={{
          error: null,
          isInstalled: false,
          isLoading: false,
          onSelect: jest.fn(),
        }}
      />,
    );

    const mobileOptions = screen.getByTestId('mobile-wallet-options');
    const buttons = Array.from(mobileOptions.querySelectorAll('button'));

    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('SafePal'),
      expect.stringContaining('Trust Wallet'),
      expect.stringContaining('MetaMask'),
      expect.stringContaining('TokenPocket'),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /TokenPocket/ }));
    expect(onSelectMobileWallet).toHaveBeenCalledWith('tokenPocket');
  });

  it('mantiene visibles en móvil Brave y el resto de conectores compatibles', () => {
    render(
      <HeaderWalletDialog
        open
        onOpenChange={jest.fn()}
        connectors={[braveWallet, browserWallet]}
        onSelectMobileWallet={jest.fn()}
        onSelectConnector={jest.fn()}
        tronLink={{
          error: null,
          isInstalled: false,
          isLoading: false,
          onSelect: jest.fn(),
        }}
      />,
    );

    const otherOptions = screen.getByTestId('other-wallet-options');

    expect(otherOptions).toHaveClass('grid');
    expect(otherOptions).not.toHaveClass('hidden');
    expect(screen.getByRole('button', { name: /Brave Wallet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Browser wallet/i })).toBeInTheDocument();
  });
});
