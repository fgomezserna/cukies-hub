import { render, screen } from '@testing-library/react';

import { LandingFooter } from '@/components/landing/footer';

jest.mock('@/providers/public-locale-provider', () => ({
  usePublicLocale: () => ({ locale: 'es' }),
}));

describe('components/landing/LandingFooter', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE;
  });

  it('oculta Embajadores cuando la publicación está desactivada', () => {
    process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE = 'false';

    render(<LandingFooter />);

    expect(screen.queryByRole('link', { name: 'Embajadores' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt',
    );
  });

  it('mantiene Embajadores visible cuando staging lo habilita', () => {
    process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE = 'true';

    render(<LandingFooter />);

    expect(screen.getByRole('link', { name: 'Embajadores' })).toHaveAttribute(
      'href',
      '/embajadores',
    );
  });
});
