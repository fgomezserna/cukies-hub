import { fireEvent, render, screen } from '@testing-library/react';

import TreasureHuntCompetitionBanner from '@/components/games/treasure-hunt-competition-banner';

jest.mock('lucide-react', () => ({
  X: () => null,
}));

describe('TreasureHuntCompetitionBanner', () => {
  it('keeps the official competition and its essential rules visible in the game shell', () => {
    render(
      <TreasureHuntCompetitionBanner>
        <div>Detalle completo de la competición</div>
      </TreasureHuntCompetitionBanner>,
    );

    expect(screen.getByText('Competición oficial · Preventa UKI')).toBeInTheDocument();
    expect(screen.getByText('Tus partidas 1P pueden generar premios en UKI')).toBeInTheDocument();
    expect(screen.getAllByText('25%')).toHaveLength(2);
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Premios en UKI · 9 meses de cliff + 6 de vesting')).toBeInTheDocument();
    expect(screen.queryByText('Detalle completo de la competición')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver reglas, nombre y ranking' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Detalle completo de la competición')).toBeInTheDocument();
  });
});
