import { render, screen } from '@testing-library/react';

import { AppRuntimeNotice } from '@/components/layout/app-runtime-notice';
import { useAppRuntime } from '@/providers/app-runtime-provider';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('@/providers/app-runtime-provider', () => ({ useAppRuntime: jest.fn() }));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: () => <span />,
  CloudOff: () => <span />,
  Loader2: () => <span />,
  RefreshCw: () => <span />,
  ShieldAlert: () => <span />,
  Wifi: () => <span />,
}));

const mockUseAppRuntime = useAppRuntime as jest.MockedFunction<typeof useAppRuntime>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

const readyService = {
  status: 'ready' as const,
  checkedAt: '2026-09-12T10:00:00.000Z',
  lastSuccessAt: '2026-09-12T10:00:00.000Z',
  code: null,
};

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    address: '0x1111111111111111111111111111111111111111',
    authLoading: false,
    walletType: 'evm',
    statusState: 'ready',
    projectionSync: { state: 'idle', wallet: null },
    isRefreshing: false,
    refresh: jest.fn(),
    refreshAfterTransaction: jest.fn(),
    switchTo: jest.fn(),
    readiness: jest.fn(() => ({
      ready: true,
      reason: 'ready' as const,
      targetChainId: null,
      service: readyService,
    })),
    ...overrides,
  } as never;
}

describe('AppRuntimeNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/credits');
  });

  it('no hereda un estado global en problemas de otra seccion', () => {
    mockUseAppRuntime.mockReturnValue(runtime({ statusState: 'unavailable' }));

    render(<AppRuntimeNotice />);

    expect(screen.queryByTestId('app-runtime-notice')).not.toBeInTheDocument();
  });

  it('mantiene el aviso cuando la operacion actual no esta disponible', () => {
    mockUseAppRuntime.mockReturnValue(runtime({
      readiness: jest.fn(() => ({
        ready: false,
        reason: 'service_unavailable' as const,
        targetChainId: null,
        service: { ...readyService, status: 'unavailable' as const },
      })),
    }));

    render(<AppRuntimeNotice />);

    expect(screen.getByTestId('app-runtime-notice')).toHaveTextContent('Este servicio está actualizando datos');
  });
});
