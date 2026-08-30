import { render, screen } from '@testing-library/react';

import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';

jest.mock('@/components/cukie-master/status-panel', () => ({
  CukieMasterStatusPanel: ({
    ukiOnly,
    onUkiRouteData,
  }: {
    ukiOnly?: boolean;
    onUkiRouteData?: (value: null) => void;
  }) => (
    <button
      type="button"
      data-uki-only={String(Boolean(ukiOnly))}
      onClick={() => onUkiRouteData?.(null)}
    >
      Estado UKI y NFT
    </button>
  ),
}));
jest.mock('@/components/cukie-master/uki-staking-panel', () => ({
  UkiStakingPanel: ({ testnetOnly }: { testnetOnly?: boolean }) => (
    <div data-testnet-only={String(Boolean(testnetOnly))}>Staking UKI</div>
  ),
}));
jest.mock('@/components/cukie-master/nft-vault-panel', () => ({
  CukieMasterNftVaultPanel: () => <div>Vault custodial de Cukies</div>,
}));
jest.mock('@/components/cukie-master/credit-panel', () => ({
  CompetitionCreditPanel: () => <div>Créditos propios y pool</div>,
}));

describe('CukieMasterWorkspace', () => {
  it('prioriza la lectura UKI y conserva staking de Cukies y créditos', () => {
    render(<CukieMasterWorkspace testnetOnly />);

    expect(screen.getByText('Estado UKI y NFT')).toHaveAttribute('data-uki-only', 'true');
    expect(screen.getByText('Staking UKI')).toHaveAttribute('data-testnet-only', 'true');
    expect(screen.getByText('Cukies Originales y créditos')).toBeInTheDocument();
    expect(screen.getByText('Vault custodial de Cukies')).toBeInTheDocument();
    expect(screen.getByText('Créditos propios y pool')).toBeInTheDocument();
  });
});
