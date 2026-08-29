import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import CukieMasterPage from '@/app/cukie-master/page';

jest.mock('@/components/cukie-master/workspace', () => ({
  CukieMasterWorkspace: ({ testnetOnly }: { testnetOnly?: boolean }) => (
    <div data-testnet-only={String(Boolean(testnetOnly))}>Workspace personal</div>
  ),
}));
jest.mock('@/components/launch/info-page', () => ({
  LaunchInfoPage: ({
    eyebrow,
    variant,
    beforeSections,
    afterSections,
    sections,
    note,
  }: {
    eyebrow: string;
    variant?: string;
    beforeSections?: ReactNode;
    afterSections?: ReactNode;
    sections: Array<{ title: string; text?: string; bullets?: string[] }>;
    note?: string;
  }) => (
    <main data-variant={variant}>
      <p>{eyebrow}</p>
      {beforeSections}
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>{section.text}</p>
          {section.bullets?.map((bullet) => <p key={bullet}>{bullet}</p>)}
        </section>
      ))}
      <p>{note}</p>
      {afterSections}
    </main>
  ),
}));
jest.mock('@/components/landing/sale-config', () => ({
  UKI_PRESALE_CHAIN_LABEL: 'BNB Smart Chain Testnet',
}));

describe('CukieMasterPage', () => {
  const previousFlag = process.env.COMPETITION_CREDITS_RUNTIME_ENABLED;
  const previousAppEnv = process.env.APP_ENV;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.COMPETITION_CREDITS_RUNTIME_ENABLED;
    else process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = previousFlag;
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  });

  it('presenta las dos rutas Cukie Master y las reglas de créditos en staging', () => {
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'false';
    process.env.APP_ENV = 'staging';
    const { container } = render(<CukieMasterPage />);

    expect(container.querySelector('main')).toHaveAttribute('data-variant', 'workspace');
    expect(screen.getByText('Workspace personal')).toBeInTheDocument();
    expect(screen.getByText('Workspace personal')).toHaveAttribute('data-testnet-only', 'true');
    expect(screen.getByText(/Área de pruebas · BNB Smart Chain Testnet/i)).toBeInTheDocument();
    expect(screen.getByText('Dos rutas independientes')).toBeInTheDocument();
    expect(screen.getByText(/3 puntos de rareza de Cukies Originales/i)).toBeInTheDocument();
    expect(screen.getByText(/20.000 UKI computables/i)).toBeInTheDocument();
    expect(screen.getByText('Créditos propios o pool')).toBeInTheDocument();
    expect(screen.getByText(/100 créditos en cada corte diario de las 14:00 UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/cada 2.000 UKI completos conceden una partida/i)).toBeInTheDocument();
    expect(container).not.toHaveTextContent('La UI debe');
  });

  it('mantiene el workspace completo independientemente del gate operativo del scheduler', () => {
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'true';
    render(<CukieMasterPage />);

    expect(screen.getByText('Workspace personal')).toBeInTheDocument();
    expect(screen.getByText('Créditos propios o pool')).toBeInTheDocument();
  });
});
