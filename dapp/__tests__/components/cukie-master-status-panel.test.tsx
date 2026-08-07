import { render, screen, waitFor } from '@testing-library/react';

import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Clock3: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Lock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Unlock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const fetchMock = jest.fn();

const walletAddress = '0x1111111111111111111111111111111111111111';
const user = { walletAddress } as User;

function authValue(currentUser: User | null, isLoading = false) {
  return {
    user: currentUser,
    isLoading,
    isWaitingForApproval: false,
    walletType: null,
    fetchUser: jest.fn(),
  };
}

describe('CukieMasterStatusPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
  });

  it('does not query or estimate slots without an authenticated wallet', () => {
    mockUseAuth.mockReturnValue(authValue(null));

    render(<CukieMasterStatusPanel />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Conecta y autentica tu wallet/i)).toBeInTheDocument();
  });

  it('renders only the persisted public slot status returned by the API', async () => {
    mockUseAuth.mockReturnValue(authValue(user));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: {
          walletNormalized: walletAddress,
          totals: { desiredSlots: 3, allocatedSlots: 2, maxPotentialSlots: 10 },
          routes: {
            uki: {
              position: { status: 'active', desiredSlots: 2, allocatedSlots: 2, protectedSlots: 0, graceEndsAt: null },
              currentRequirement: { route: 'uki', ukiRaw: '20000000000000000000000' },
              pendingRequirement: null,
              requirementGraceEndsAt: null,
              deficitToNextSlot: { route: 'uki', ukiRaw: '20000000000000000000000' },
              deficitToPreserveSlots: null,
              slots: [{
                route: 'uki', ordinal: 1, eligibilityEpoch: 1, status: 'active',
                creditEligibleFrom: '2026-07-10T00:00:00.000Z', graceEndsAt: null,
              }],
              source: {
                complete: true,
                status: 'available',
                route: 'uki',
                totalUkiRaw: '45000000000000000000000',
                presaleLockedRaw: '40000000000000000000000',
                stakedUkiRaw: '5000000000000000000000',
              },
            },
            nft: {
              position: { status: 'qualifying', desiredSlots: 1, allocatedSlots: 0, protectedSlots: 0, graceEndsAt: null },
              currentRequirement: { route: 'nft', nftPoints: 3 },
              pendingRequirement: null,
              requirementGraceEndsAt: null,
              deficitToNextSlot: { route: 'nft', nftPoints: 1 },
              deficitToPreserveSlots: null,
              slots: [],
              source: { complete: true, status: 'available' },
            },
          },
          nftInventory: [],
        },
      }),
    });

    render(<CukieMasterStatusPanel />);

    await waitFor(() => expect(screen.getByText('Total activo')).toBeInTheDocument());
    expect(screen.getByText('Ruta UKI')).toBeInTheDocument();
    expect(screen.getByText('Ruta Cukies')).toBeInTheDocument();
    expect(screen.getByText('Cupo 1')).toBeInTheDocument();
    expect(screen.getByText('UKI computables')).toBeInTheDocument();
    expect(screen.getByText('Exceso tras cupos')).toBeInTheDocument();
    expect(screen.getByText('45.000 UKI')).toBeInTheDocument();
    expect(screen.getByText('Exceso tras cupos').parentElement).toHaveTextContent('5000 UKI');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/economy/v1/cukie-master?walletAddress=${walletAddress}`,
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
  });

  it('fails closed without showing stale slot numbers when the API is unavailable', async () => {
    mockUseAuth.mockReturnValue(authValue(user));
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', code: 'CUKIE_MASTER_UNAVAILABLE' }),
    });

    render(<CukieMasterStatusPanel />);

    await waitFor(() => expect(screen.getByText(/no está disponible con garantías/i)).toBeInTheDocument());
    expect(screen.queryByText('Total activo')).not.toBeInTheDocument();
    expect(screen.queryByText('cupos asignados')).not.toBeInTheDocument();
  });
});
