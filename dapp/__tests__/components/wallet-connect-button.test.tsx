import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { useTronLink } from '@/hooks/use-tronlink';
import { useAuth } from '@/providers/auth-provider';
import { WalletConnectButton } from '@/components/landing/wallet-connect-button';

jest.mock('@/hooks/use-toast');
jest.mock('@/hooks/use-tronlink');
jest.mock('@/providers/auth-provider');
jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => <div data-testid="loader-icon" className={className} />,
  LogOut: ({ className }: { className?: string }) => <div data-testid="logout-icon" className={className} />,
  ShieldAlert: ({ className }: { className?: string }) => <div data-testid="shield-alert-icon" className={className} />,
  Wallet: ({ className }: { className?: string }) => <div data-testid="wallet-icon" className={className} />,
  X: ({ className }: { className?: string }) => <div data-testid="x-icon" className={className} />,
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseConnect = useConnect as jest.MockedFunction<typeof useConnect>;
const mockUseDisconnect = useDisconnect as jest.MockedFunction<typeof useDisconnect>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseTronLink = useTronLink as jest.MockedFunction<typeof useTronLink>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('components/landing/WalletConnectButton', () => {
  const disconnect = jest.fn();
  const switchChain = jest.fn();
  const toast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAccount.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      isConnected: true,
    } as any);
    mockUseConnect.mockReturnValue({
      connectAsync: jest.fn(),
      connectors: [
        {
          id: 'metaMask',
          name: 'MetaMask',
          type: 'metaMask',
        },
      ],
      isPending: false,
    } as any);
    mockUseDisconnect.mockReturnValue({ disconnect } as any);
    mockUseSwitchChain.mockReturnValue({ isPending: false, switchChain } as any);
    mockUseToast.mockReturnValue({ toast } as any);
    mockUseTronLink.mockReturnValue({
      address: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
      error: null,
      isConnected: false,
      isInstalled: false,
      isLoading: false,
    } as any);
    mockUseAuth.mockReturnValue({
      fetchUser: jest.fn(),
      isLoading: false,
      isWaitingForApproval: false,
      user: { walletAddress: '0x1111111111111111111111111111111111111111' },
      walletType: 'evm',
    } as any);
  });

  it('opens recovery actions instead of trapping the user on a wrong EVM chain', async () => {
    render(<WalletConnectButton />);

    await waitFor(() => expect(screen.getByText('Cambiar a BSC')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cambiar a BSC'));

    expect(await screen.findByText('Desconectar wallet actual')).toBeInTheDocument();
    expect(screen.getAllByText('Cambiar a BSC').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('Desconectar wallet actual'));

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith({
        description: 'Elige otra wallet para continuar.',
        title: 'Wallet desconectada',
      });
    });
  });
});
