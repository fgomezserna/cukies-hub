import { render, screen } from '@testing-library/react';

import CukieMasterPage from '@/app/(app)/cukie-master/page';

jest.mock('lucide-react', () => ({
  Check: () => <svg aria-hidden="true" />,
  ChevronDown: () => <svg aria-hidden="true" />,
}));
jest.mock('@/components/cukie-master/workspace', () => ({
  CukieMasterWorkspace: ({ testnetOnly }: { testnetOnly?: boolean }) => (
    <div data-testnet-only={String(Boolean(testnetOnly))}>Experiencia Cukie Master</div>
  ),
}));

describe('CukieMasterPage', () => {
  const previousAppEnv = process.env.APP_ENV;

  afterEach(() => {
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  });

  it('usa la experiencia propia y mantiene la seguridad de red en staging', () => {
    process.env.APP_ENV = 'staging';
    const { container } = render(<CukieMasterPage />);

    expect(screen.getByText('Experiencia Cukie Master')).toHaveAttribute('data-testnet-only', 'true');
    expect(screen.getByText('Reglas y preguntas frecuentes')).toBeInTheDocument();
    expect(screen.getByText('En cada cupo puedes consultar cuándo empieza a recibir créditos.')).toBeInTheDocument();
    expect(screen.getByText('¿Cómo funciona la vía con Cukies Originales?')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('uki-landing');
    expect(container).not.toHaveTextContent(/Stage|Staging|Testnet|chain 97/i);
  });

  it('no depende de un gate del scheduler para mostrar el recorrido completo', () => {
    process.env.APP_ENV = 'production';
    render(<CukieMasterPage />);

    expect(screen.getByText('Experiencia Cukie Master')).toHaveAttribute('data-testnet-only', 'false');
    expect(screen.getByText('Reglas y preguntas frecuentes')).toBeInTheDocument();
  });
});
