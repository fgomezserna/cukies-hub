import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import CukieMasterPage from '@/app/cukie-master/page';

jest.mock('@/components/cukie-master/workspace', () => ({
  CukieMasterWorkspace: ({ testnetOnly }: { testnetOnly?: boolean }) => (
    <div data-testnet-only={String(Boolean(testnetOnly))}>Workspace personal</div>
  ),
}));
jest.mock('@/components/cukie-master/credit-panel', () => ({
  CompetitionCreditPanel: () => <div>Panel de créditos activo</div>,
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

  it('muestra únicamente el staking y sus reglas en staging', () => {
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'false';
    process.env.APP_ENV = 'staging';
    const { container } = render(<CukieMasterPage />);

    expect(container.querySelector('main')).toHaveAttribute('data-variant', 'workspace');
    expect(screen.getByText('Workspace personal')).toBeInTheDocument();
    expect(screen.getByText('Workspace personal')).toHaveAttribute('data-testnet-only', 'true');
    expect(screen.getByText(/Área de pruebas · BNB Smart Chain Testnet/i)).toBeInTheDocument();
    expect(screen.getByText('Cómo funciona la ruta UKI')).toBeInTheDocument();
    expect(screen.getByText(/Cada 20.000 UKI computables/i)).toBeInTheDocument();
    expect(screen.getByText(/ruta UKI empieza con 500 plazas.*2.500/i)).toBeInTheDocument();
    expect(screen.getByText(/ruta NFT dispone de otras 2.500/i)).toBeInTheDocument();
    expect(screen.getByText(/cada 2.000 UKI completos en staking conceden una partida/i)).toBeInTheDocument();
    expect(screen.queryByText('Panel de créditos activo')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('La UI debe');
  });

  it('no recupera el panel legacy de créditos aunque su runtime siga habilitado', () => {
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'true';
    render(<CukieMasterPage />);

    expect(screen.getByText('Workspace personal')).toBeInTheDocument();
    expect(screen.queryByText('Panel de créditos activo')).not.toBeInTheDocument();
    expect(screen.queryByText(/La asignación de créditos está activa en este entorno/i)).not.toBeInTheDocument();
  });
});
