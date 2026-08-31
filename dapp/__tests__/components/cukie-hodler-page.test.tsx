import { render, screen } from '@testing-library/react';

import CukieHodlerPage from '@/app/(app)/cukie-hodler/page';

jest.mock('@/components/cukie-pool/status-panel', () => ({
  CukiePoolStatusPanel: () => <section>Estado personal del Cukie Pool</section>,
}));

jest.mock('lucide-react', () => ({
  ChevronDown: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Layers3: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Sparkles: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

describe('CukieHodlerPage', () => {
  it('renders the personal pool as a guided private workspace', () => {
    render(<CukieHodlerPage />);

    expect(screen.getByRole('heading', { level: 1, name: /Aporta tus Cukies y participa en lo que generen/i })).toBeInTheDocument();
    expect(screen.getByText(/Dos repartos independientes/i)).toBeInTheDocument();
    expect(screen.getByText('Estado personal del Cukie Pool')).toBeInTheDocument();
  });
});
