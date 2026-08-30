import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import CukieMasterPage from '@/app/cukie-master/page';

jest.mock('lucide-react', () => ({
  ChevronDown: () => <svg aria-hidden="true" />,
}));
jest.mock('@/components/cukie-master/workspace', () => ({
  CukieMasterWorkspace: ({ testnetOnly }: { testnetOnly?: boolean }) => (
    <div data-testnet-only={String(Boolean(testnetOnly))}>Workspace personal</div>
  ),
}));
jest.mock('@/components/launch/info-page', () => ({
  LaunchInfoPage: ({
    eyebrow,
    title,
    subtitle,
    variant,
    beforeSections,
    afterSections,
    metrics,
    primaryCta,
    secondaryCta,
    sections,
    note,
  }: {
    eyebrow: string;
    title: string;
    subtitle: string;
    variant?: string;
    beforeSections?: ReactNode;
    afterSections?: ReactNode;
    metrics: Array<{ label: string; value: string; helper?: string }>;
    primaryCta: { label: string; href: string };
    secondaryCta?: { label: string; href: string };
    sections: Array<{ title: string; text?: string; bullets?: string[] }>;
    note?: string;
  }) => (
    <main data-variant={variant}>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {metrics.map((metric) => (
        <p key={metric.label}>{metric.label}: {metric.value} · {metric.helper}</p>
      ))}
      <a href={primaryCta.href}>{primaryCta.label}</a>
      {secondaryCta ? <a href={secondaryCta.href}>{secondaryCta.label}</a> : null}
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

  it('presenta UKI primero y conserva Cukies, créditos y pool en staging', () => {
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'false';
    process.env.APP_ENV = 'staging';
    const { container } = render(<CukieMasterPage />);

    expect(container.querySelector('main')).toHaveAttribute('data-variant', 'workspace');
    expect(screen.getByText('Workspace personal')).toBeInTheDocument();
    expect(screen.getByText('Workspace personal')).toHaveAttribute('data-testnet-only', 'true');
    expect(screen.getByText(/Área de pruebas · BNB Smart Chain Testnet/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Conviértete en Cukie Master' })).toBeInTheDocument();
    expect(screen.getByText(/20.000 UKI computables equivalen inicialmente a 1 Cukie Master/i)).toBeInTheDocument();
    expect(screen.getByText(/Capacidad inicial: 500/i)).toBeInTheDocument();
    expect(screen.getByText(/Capacidad máxima: 2.500/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gestionar staking UKI' })).toHaveAttribute('href', '#uki-staking');
    expect(screen.getByRole('link', { name: 'Stakear Cukies Originales' })).toHaveAttribute('href', '#cukie-master-nft-staking');
    expect(screen.getByText('Cómo funciona la ruta UKI')).toBeInTheDocument();
    expect(screen.getByText(/asignación de preventa pendiente de vesting.*staking se suman/i)).toBeInTheDocument();
    expect(screen.getByText('Créditos propios o pool')).toBeInTheDocument();
    expect(screen.getByText('La ruta con Cukies sigue disponible')).toBeInTheDocument();
    expect(screen.getByText(/3 puntos de rareza depositados conceden inicialmente 1 cupo/i)).toBeInTheDocument();
    expect(screen.getByText('¿Cuántos cupos de Cukie Master hay disponibles mediante UKI?')).toBeInTheDocument();
    expect(screen.getByText(/El requisito no sube automáticamente/i)).toBeInTheDocument();
    expect(screen.getByText(/no equivalen ni garantizan 100 UKI/i)).toBeInTheDocument();
    expect(screen.getByText(/votaciones o gobernanza todavía no está habilitada/i)).toBeInTheDocument();
    expect(container).not.toHaveTextContent('La UI debe');
  });

  it('mantiene el workspace completo independientemente del gate operativo del scheduler', () => {
    process.env.COMPETITION_CREDITS_RUNTIME_ENABLED = 'true';
    render(<CukieMasterPage />);

    expect(screen.getByText('Workspace personal')).toBeInTheDocument();
    expect(screen.getByText('Créditos propios o pool')).toBeInTheDocument();
  });
});
