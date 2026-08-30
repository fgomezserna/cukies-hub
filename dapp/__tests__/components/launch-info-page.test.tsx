import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { LaunchInfoPage } from '@/components/launch/info-page';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

jest.mock('lucide-react', () => ({
  ArrowRight: () => null,
  CheckCircle2: () => null,
  ChevronDown: () => null,
}));

jest.mock('@/components/landing/header', () => ({
  LandingHeader: () => <header>Cabecera pública</header>,
}));

jest.mock('@/components/landing/primitives', () => ({
  LandingButton: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const defaultProps = {
  eyebrow: 'Área',
  title: 'Título',
  subtitle: 'Descripción',
  heroImage: '/test.png',
  heroAlt: 'Imagen de prueba',
  metrics: [{ label: 'Métrica', value: '100' }],
  sections: [{ title: 'Reglas', bullets: ['Primera regla'] }],
  primaryCta: { label: 'Acción', href: '#accion' },
};

describe('LaunchInfoPage shell', () => {
  it('owns the public header and main landmark in the standard variant', () => {
    const { container } = render(<LaunchInfoPage {...defaultProps} />);

    expect(screen.getByText('Cabecera pública')).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('does not duplicate the private shell header or main landmark in workspace mode', () => {
    const { container } = render(<LaunchInfoPage {...defaultProps} variant="workspace" />);

    expect(screen.queryByText('Cabecera pública')).not.toBeInTheDocument();
    expect(container.querySelector('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Título' })).toBeInTheDocument();
  });
});
