import { render, screen } from '@testing-library/react';

import { BridgeClient } from '@/components/legacy-marketplace/bridge-client';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useReadContract: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock('lucide-react', () => ({
  ArrowRightLeft: () => <span />,
  Check: () => <span />,
  Loader2: () => <span />,
  Network: () => <span />,
  RefreshCcw: () => <span />,
  Route: () => <span />,
  ShieldAlert: () => <span />,
  Wallet: () => <span />,
}));

describe('Cukies bridge client safety', () => {
  it('no monta ninguna operacion on-chain cuando el runtime bridge esta desactivado', () => {
    render(<BridgeClient />);

    expect(screen.getByTestId('cukies-bridge-disabled')).toBeInTheDocument();
    expect(screen.getByText('Bridge Testnet desactivado de forma segura')).toBeInTheDocument();
    expect(screen.getByText(/Stage no usara los contratos legacy de mainnet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start bridge/i })).not.toBeInTheDocument();
  });
});
