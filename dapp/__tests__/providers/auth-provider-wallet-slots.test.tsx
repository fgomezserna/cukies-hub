import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { useTronLink } from '@/hooks/use-tronlink';
import { AuthProvider, useAuth } from '@/providers/auth-provider';

jest.mock('wagmi');
jest.mock('@/hooks/use-tronlink', () => ({ useTronLink: jest.fn() }));
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseDisconnect = useDisconnect as jest.MockedFunction<typeof useDisconnect>;
const mockUseSignMessage = useSignMessage as jest.MockedFunction<typeof useSignMessage>;
const mockUseTronLink = useTronLink as jest.MockedFunction<typeof useTronLink>;
const mockFetch = global.fetch as jest.MockedFunction<typeof global.fetch>;

const evmAddress = '0x1111111111111111111111111111111111111111';
const tronAddress = 'TQmPrimary11111111111111111111111111111';
const user = {
  id: 'user-1',
  walletAddress: evmAddress,
  username: 'wallet-user',
};

function Probe() {
  const { user: session, walletType } = useAuth();
  return (
    <>
      <span data-testid="wallet-type">{walletType ?? 'none'}</span>
      <span data-testid="wallet-address">{session?.walletAddress ?? 'none'}</span>
    </>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider wallet slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDisconnect.mockReturnValue({ disconnect: jest.fn() } as never);
    mockUseSignMessage.mockReturnValue({ signMessageAsync: jest.fn() } as never);
    mockFetch.mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      return {
        ok: true,
        json: async () => ({ ...user, walletAddress: body.walletAddress ?? user.walletAddress }),
      } as Response;
    });
    mockUseTronLink.mockReturnValue({
      address: null,
      isConnected: false,
      disconnect: jest.fn(),
    } as never);
  });

  it('restaura la sesión EVM si TronLink se hidrata primero sin sesión TRON', async () => {
    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);
    mockFetch.mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      return body.walletAddress === evmAddress
        ? { ok: true, status: 200, json: async () => user } as Response
        : { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response;
    });

    const { rerender } = renderAuth();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await act(async () => {});

    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('wallet-address')).toHaveTextContent(evmAddress));
    expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm');
    expect(mockUseSignMessage().signMessageAsync).not.toHaveBeenCalled();
  });

  it('restaura la sesión TRON si EVM se hidrata primero', async () => {
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockUseTronLink.mockReturnValue({
      address: null,
      isConnected: false,
      disconnect: jest.fn(),
    } as never);
    mockFetch.mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      if (body.walletType === 'evm' && body.requireSignedWallet) {
        return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response;
      }
      return body.walletAddress === tronAddress
        ? { ok: true, status: 200, json: async () => ({ ...user, walletAddress: tronAddress }) } as Response
        : { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response;
    });

    const { rerender } = renderAuth();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockFetch.mock.calls[0][1]?.body as string)).toEqual({
      walletAddress: evmAddress,
      walletType: 'evm',
      requireSignedWallet: true,
    });

    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent(tronAddress);
    });
    expect(mockUseSignMessage().signMessageAsync).not.toHaveBeenCalled();
  });

  it('elige la sesión TRON por identidad firmada cuando ambos slots hidratan juntos', async () => {
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);
    mockFetch.mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      if (body.walletType === 'evm' && body.requireSignedWallet) {
        return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response;
      }
      return body.walletAddress === tronAddress
        ? { ok: true, status: 200, json: async () => ({ ...user, walletAddress: tronAddress }) } as Response
        : { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response;
    });

    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent(tronAddress);
    });
    const requestBodies = mockFetch.mock.calls.map(([, init]) => (
      typeof init?.body === 'string' ? JSON.parse(init.body) : null
    ));
    expect(requestBodies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        walletAddress: evmAddress,
        walletType: 'evm',
        requireSignedWallet: true,
      }),
      expect.objectContaining({
        walletAddress: tronAddress,
        walletType: 'tron',
      }),
    ]));
  });

  it('reintenta una restauración 503 una sola vez y no entra en bucle', async () => {
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Unavailable' }),
    } as Response);

    renderAuth();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('wallet-type')).toHaveTextContent('none');
  });

  it('mantiene una sesión TRON al conectar una wallet EVM secundaria', async () => {
    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);

    const { rerender } = renderAuth();
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron'));
    expect(screen.getByTestId('wallet-address')).toHaveTextContent(tronAddress);

    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron'));
    expect(screen.getByTestId('wallet-address')).toHaveTextContent(tronAddress);
    const addresses = mockFetch.mock.calls.map(([, init]) => {
      const body = init?.body;
      return typeof body === 'string' ? JSON.parse(body).walletAddress : null;
    });
    expect(addresses).not.toContain(evmAddress);
  });

  it('mantiene una sesión EVM al conectar TronLink como wallet secundaria', async () => {
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockUseTronLink.mockReturnValue({
      address: null,
      isConnected: false,
      disconnect: jest.fn(),
    } as never);

    const { rerender } = renderAuth();
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm'));

    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm'));
    expect(screen.getByTestId('wallet-address')).toHaveTextContent(evmAddress);
    const addresses = mockFetch.mock.calls.map(([, init]) => {
      const body = init?.body;
      return typeof body === 'string' ? JSON.parse(body).walletAddress : null;
    });
    expect(addresses).not.toContain(tronAddress);
  });

  it('invalida la primaria EVM al desconectarla sin promocionar la secundaria TRON', async () => {
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockUseTronLink.mockReturnValue({
      address: null,
      isConnected: false,
      disconnect: jest.fn(),
    } as never);

    const { rerender } = renderAuth();
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm'));

    mockFetch.mockClear();
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm'));

    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent('none');
    });
    const addresses = mockFetch.mock.calls.map(([, init]) => {
      const body = init?.body;
      return typeof body === 'string' ? JSON.parse(body).walletAddress : null;
    });
    expect(addresses).not.toContain(tronAddress);
  });

  it('invalida el cambio de cuenta primaria EVM y exige login explícito para la nueva cuenta', async () => {
    const nextEvmAddress = '0x2222222222222222222222222222222222222222';
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);

    const { rerender } = renderAuth();
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm'));
    mockFetch.mockClear();

    mockUseAccount.mockReturnValue({ address: nextEvmAddress, isConnected: true } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('wallet-type')).toHaveTextContent('evm');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent('none');
    });
    const addresses = mockFetch.mock.calls.map(([, init]) => {
      const body = init?.body;
      return typeof body === 'string' ? JSON.parse(body).walletAddress : null;
    });
    expect(addresses).not.toContain(nextEvmAddress);
  });

  it('invalida la primaria TRON al desconectarla sin promocionar la secundaria EVM', async () => {
    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);

    const { rerender } = renderAuth();
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron'));

    mockFetch.mockClear();
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron'));

    mockUseTronLink.mockReturnValue({
      address: null,
      isConnected: false,
      disconnect: jest.fn(),
    } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('wallet-type')).toHaveTextContent('tron');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent('none');
    });
    const addresses = mockFetch.mock.calls.map(([, init]) => {
      const body = init?.body;
      return typeof body === 'string' ? JSON.parse(body).walletAddress : null;
    });
    expect(addresses).not.toContain(evmAddress);
  });

  it('descarta una respuesta de login tardía de la primaria después de desconectar y conectar otra wallet', async () => {
    let resolveLogin: (response: Response) => void = () => undefined;
    mockFetch.mockImplementation(() => new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    }));
    mockUseAccount.mockReturnValue({ address: evmAddress, isConnected: true } as never);
    mockUseTronLink.mockReturnValue({
      address: null,
      isConnected: false,
      disconnect: jest.fn(),
    } as never);

    const { rerender } = renderAuth();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      isConnected: true,
      disconnect: jest.fn(),
    } as never);
    rerender(<AuthProvider><Probe /></AuthProvider>);

    await act(async () => {
      resolveLogin({
        ok: true,
        json: async () => ({ ...user, walletAddress: evmAddress }),
      } as Response);
    });

    await waitFor(() => {
      expect(screen.getByTestId('wallet-type')).toHaveTextContent('none');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent('none');
    });
    expect(screen.getByTestId('wallet-address')).not.toHaveTextContent(evmAddress);
  });
});
