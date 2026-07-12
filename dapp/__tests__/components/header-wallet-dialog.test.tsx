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

describe('components/layout/HeaderWalletDialog', () => {
  it('keeps long wallet descriptions inside a viewport-sized scroll area', () => {
    render(
      <HeaderWalletDialog
        open
        onOpenChange={jest.fn()}
        connectors={[browserWallet]}
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
});
