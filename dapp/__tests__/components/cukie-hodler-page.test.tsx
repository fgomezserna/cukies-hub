import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import CukieHodlerPage from '@/app/(app)/cukie-hodler/page';

jest.mock('@/components/cukie-pool/status-panel', () => ({
  CukiePoolStatusPanel: () => <section>Estado personal del Cukie Pool</section>,
}));

jest.mock('@/components/launch/info-page', () => ({
  LaunchInfoPage: ({
    title,
    variant,
    beforeSections,
  }: {
    title: string;
    variant?: string;
    beforeSections?: ReactNode;
  }) => (
    <div data-testid="launch-info-page" data-variant={variant}>
      <h1>{title}</h1>
      {beforeSections}
    </div>
  ),
}));

describe('CukieHodlerPage', () => {
  it('renders the personal pool panel inside the private workspace variant', () => {
    render(<CukieHodlerPage />);

    expect(screen.getByTestId('launch-info-page')).toHaveAttribute('data-variant', 'workspace');
    expect(screen.getByRole('heading', { level: 1, name: 'Cukie Hodler' })).toBeInTheDocument();
    expect(screen.getByText('Estado personal del Cukie Pool')).toBeInTheDocument();
  });
});
