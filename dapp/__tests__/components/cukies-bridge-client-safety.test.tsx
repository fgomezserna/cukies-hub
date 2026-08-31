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
  it('no monta operaciones cuando el bridge está desactivado', () => {
    render(<BridgeClient />);

    expect(screen.getByTestId('cukies-bridge-disabled')).toBeInTheDocument();
    expect(screen.getByText('Bridge no disponible')).toBeInTheDocument();
    expect(screen.getByText(/Las transferencias están desactivadas/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start bridge/i })).not.toBeInTheDocument();
  });
});
