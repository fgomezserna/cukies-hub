import { render, screen } from '@testing-library/react';

import TreasureHuntLatestResult from '@/components/games/treasure-hunt-latest-result';

let rewardStatus: 'processing' | 'allocated' = 'allocated';

jest.mock('lucide-react', () => ({
  ArrowRight: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  Coins: () => null,
  Medal: () => null,
}));

jest.mock('@/hooks/use-treasure-hunt-weekly-overview', () => ({
  useTreasureHuntWeeklyOverview: () => ({
    data: {
      latestResult: {
        runId: 'run-1',
        status: 'settled',
        scoreRaw: '175',
        achievedAt: '2026-09-01T13:36:34.927Z',
        creditSource: 'own',
        cukieSource: 'pool',
        cukieAssetId: 'asset-1',
        cukieTokenId: '98000003',
        cukieGeneration: 'Original',
        cukieRarity: 'Legendario',
        leaderboardEligible: false,
        rewardEligible: true,
        jackpotEligible: false,
        reward: {
          status: rewardStatus,
          amountRaw: rewardStatus === 'allocated' ? '218750000000000000' : null,
        },
      },
    },
    isLoading: false,
  }),
}));

describe('resultado económico de Treasure Hunt', () => {
  beforeEach(() => {
    rewardStatus = 'allocated';
  });

  it('explica el score, los recursos, el ranking y la recompensa asignada', () => {
    render(<TreasureHuntLatestResult />);

    expect(screen.getByRole('heading', { name: 'Tu última partida' })).toBeInTheDocument();
    expect(screen.getByText('175')).toBeInTheDocument();
    expect(screen.getByText('Propios')).toBeInTheDocument();
    expect(screen.getByText('No cuenta')).toBeInTheDocument();
    expect(screen.getByText('Del pool')).toBeInTheDocument();
    expect(screen.getByText('0,21875 UKI')).toBeInTheDocument();
    expect(screen.getByText(/sí genera reparto directo/i)).toBeInTheDocument();
  });

  it('indica que el cálculo sigue en curso sin inventar un premio', () => {
    rewardStatus = 'processing';
    render(<TreasureHuntLatestResult />);

    expect(screen.getByText('Calculándose')).toBeInTheDocument();
    expect(screen.getByText('Se actualizará automáticamente')).toBeInTheDocument();
  });
});
