import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: ({ evmOnly }: { evmOnly?: boolean }) => (
    <button type="button" data-evm-only={String(Boolean(evmOnly))}>Conectar wallet EVM</button>
  ),
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt, src }: { alt: string; src?: string | null }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src ?? undefined} />
  ),
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ArrowRight: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Clock3: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Lock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ShieldCheck: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Sparkles: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
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
    expect(screen.getByText(/Conecta una wallet EVM/i)).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText('Cupos activos')).toBeInTheDocument());
    expect(screen.getByText('1/10')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Ruta UKI/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Ruta Cukies/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso Ruta UKI' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('Cupo 1')).toBeInTheDocument();
    expect(screen.getByText('UKI que ya cuentan')).toBeInTheDocument();
    expect(screen.getByText(/45\.000 UKI = 40\.000 UKI en vesting \+ 5000 UKI en staking/i)).toBeInTheDocument();
    expect(screen.getByText('Margen tras cupos').parentElement).toHaveTextContent('5000 UKI');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/economy/v1/cukie-master?walletAddress=${walletAddress}`,
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    window.dispatchEvent(new Event('cukies:cukie-master:refresh'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ status: 'error', code: 'CUKIE_MASTER_UNAVAILABLE' }),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar estado' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    await waitFor(() => expect(screen.getByText(/No podemos verificar tu estado económico/i)).toBeInTheDocument());
    expect(screen.queryByText('Cupos activos')).not.toBeInTheDocument();
  });

  it('muestra cupos detectados sin reutilizar slots viejos y sigue consultando mientras sincroniza', async () => {
    jest.useFakeTimers();
    try {
      mockUseAuth.mockReturnValue(authValue(user));
      const syncingStatus = {
        walletNormalized: walletAddress,
        totals: { desiredSlots: 0, allocatedSlots: 0, maxPotentialSlots: 10 },
        routes: {
          uki: {
            position: null,
            projectionFresh: false,
            synchronizing: true,
            previewSlots: 1,
            currentRequirement: { route: 'uki', ukiRaw: '20000000000000000000000' },
            pendingRequirement: null,
            requirementGraceEndsAt: null,
            deficitToNextSlot: { route: 'uki', ukiRaw: '19700000000000000000000' },
            deficitToPreserveSlots: null,
            slots: [],
            source: {
              complete: true,
              status: 'available',
              route: 'uki',
              totalUkiRaw: '20300000000000000000000',
              presaleLockedRaw: '0',
              stakedUkiRaw: '20300000000000000000000',
            },
          },
          nft: {
            position: null,
            projectionFresh: false,
            synchronizing: true,
            previewSlots: 3,
            currentRequirement: { route: 'nft', nftPoints: 3 },
            pendingRequirement: null,
            requirementGraceEndsAt: null,
            deficitToNextSlot: { route: 'nft', nftPoints: 1 },
            deficitToPreserveSlots: null,
            slots: [],
            source: {
              complete: true,
              status: 'available',
              route: 'nft',
              originalCukiePoints: 11,
            },
          },
        },
        nftInventory: [],
        nftCustody: { mode: 'custodial' },
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', data: syncingStatus }),
      });

      render(<CukieMasterStatusPanel />);

      expect(await screen.findByText('1/5')).toBeInTheDocument();
      expect(screen.getByText('3/5')).toBeInTheDocument();
      expect(screen.getAllByText(/detectados · sincronizando/i)).toHaveLength(2);
      expect(screen.queryByText('Cupos conservados en gracia')).not.toBeInTheDocument();
      expect(screen.queryByText(/Elige qué Cukies usar/i)).not.toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed without showing stale slot numbers when the API is unavailable', async () => {
    mockUseAuth.mockReturnValue(authValue(user));
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', code: 'CUKIE_MASTER_UNAVAILABLE' }),
    });

    render(<CukieMasterStatusPanel />);

    await waitFor(() => expect(screen.getByText(/No podemos verificar tu estado económico/i)).toBeInTheDocument());
    expect(screen.queryByText('Cupos activos')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('shows NFT contribution separately from potential points and exposes contextual actions', async () => {
    mockUseAuth.mockReturnValue(authValue(user));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: {
          walletNormalized: walletAddress,
          totals: { desiredSlots: 1, allocatedSlots: 1, maxPotentialSlots: 10 },
          routes: {
            uki: {
              position: null,
              currentRequirement: { route: 'uki', ukiRaw: '20000000000000000000000' },
              pendingRequirement: null,
              requirementGraceEndsAt: null,
              deficitToNextSlot: { route: 'uki', ukiRaw: '20000000000000000000000' },
              deficitToPreserveSlots: null,
              slots: [],
              source: { complete: true, status: 'available', route: 'uki', totalUkiRaw: '0', presaleLockedRaw: '0', stakedUkiRaw: '0' },
            },
            nft: {
              position: { status: 'active', desiredSlots: 1, allocatedSlots: 1, protectedSlots: 0, graceEndsAt: null },
              currentRequirement: { route: 'nft', nftPoints: 3 },
              pendingRequirement: null,
              requirementGraceEndsAt: null,
              deficitToNextSlot: { route: 'nft', nftPoints: 2 },
              deficitToPreserveSlots: null,
              slots: [{
                route: 'nft', ordinal: 1, eligibilityEpoch: 1, status: 'active',
                creditEligibleFrom: '2026-07-10T00:00:00.000Z', graceEndsAt: null,
              }],
              source: { complete: true, status: 'available', route: 'nft', originalCukiePoints: 4 },
            },
          },
          nftInventory: [
            {
              assetId: 'cukies:42', tokenId: '42', imageUrl: 'https://example.com/42.png', rarity: 'rare', rarityPoints: 4,
              contributesToCukieMaster: true, contributionPoints: 4, state: 'soft_staked', blockers: [],
              lock: { lockId: 'lock-42', fencingToken: 1 }, canSoftStake: false, canUnstake: true,
            },
            {
              assetId: 'cukies:7', tokenId: '7', imageUrl: null, rarity: 'common', rarityPoints: 1,
              contributesToCukieMaster: false, contributionPoints: 0, state: 'available', blockers: [],
              lock: null, canSoftStake: true, canUnstake: false,
            },
          ],
        },
      }),
    });

    render(<CukieMasterStatusPanel />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Ruta Cukies/i })).toBeInTheDocument());
    const nftTab = screen.getByRole('tab', { name: /Ruta Cukies/i });
    fireEvent.mouseDown(nftTab, { button: 0, ctrlKey: false });
    fireEvent.click(nftTab);

    await waitFor(() => expect(screen.getByText('Aporta 4 puntos a tu ruta')).toBeInTheDocument());
    expect(screen.getByText('Puede aportar 1 punto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dejar de usar Cukie #42 para Cukie Master' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar Cukie #7 para Cukie Master' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cukie #42' })).toHaveAttribute('src', 'https://example.com/42.png');
  });
});
