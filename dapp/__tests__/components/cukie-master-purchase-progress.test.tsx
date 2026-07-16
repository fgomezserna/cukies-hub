import { render, screen } from '@testing-library/react';
import { parseUnits } from 'viem';

import {
  CUKIE_MASTER_PURCHASE_MAX_SLOTS,
  CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW,
  CukieMasterPurchaseProgress,
  getCukieMasterPurchaseProgress,
} from '@/components/premios/cukie-master-purchase-progress';

const uki = (value: string) => parseUnits(value, 18);

describe('getCukieMasterPurchaseProgress', () => {
  it('marca solo el primer cupo como siguiente antes de 20.000 UKI', () => {
    const progress = getCukieMasterPurchaseProgress(uki('19999.9'));

    expect(progress.achievedSlots).toBe(0);
    expect(progress.maxSlots).toBe(CUKIE_MASTER_PURCHASE_MAX_SLOTS);
    expect(progress.requirementPerSlotRaw).toBe(CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW);
    expect(progress.slots.map((slot) => slot.state)).toEqual([
      'next',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(progress.slots[0].remainingRaw).toBe(uki('0.1'));
  });

  it.each([
    ['20000', 1, ['achieved', 'next', 'locked', 'locked', 'locked']],
    ['40000', 2, ['achieved', 'achieved', 'next', 'locked', 'locked']],
    ['99999', 4, ['achieved', 'achieved', 'achieved', 'achieved', 'next']],
  ])('calcula los límites de %s UKI sin redondear', (amount, achieved, states) => {
    const progress = getCukieMasterPurchaseProgress(uki(amount));

    expect(progress.achievedSlots).toBe(achieved);
    expect(progress.slots.map((slot) => slot.state)).toEqual(states);
  });

  it('limita el progreso a cinco cupos aunque la compra supere 100.000 UKI', () => {
    const progress = getCukieMasterPurchaseProgress(uki('125000'));

    expect(progress.achievedSlots).toBe(5);
    expect(progress.slots).toHaveLength(5);
    expect(progress.slots.every((slot) => slot.state === 'achieved')).toBe(true);
  });

  it('trata un raw negativo como cero sin inventar cupos', () => {
    const progress = getCukieMasterPurchaseProgress(BigInt(-1));

    expect(progress.achievedSlots).toBe(0);
    expect(progress.slots[0]).toMatchObject({ state: 'next' });
    expect(progress.slots[0].remainingRaw).toBe(CUKIE_MASTER_PURCHASE_REQUIREMENT_RAW);
  });
});

describe('CukieMasterPurchaseProgress', () => {
  it('muestra cinco cuadros y la cantidad exacta restante en castellano', () => {
    render(<CukieMasterPurchaseProgress totalPurchasedRaw={uki('976.8')} locale="es" />);

    const slots = screen.getAllByRole('listitem');
    expect(slots).toHaveLength(5);
    expect(screen.getByText('1º rango')).toBeInTheDocument();
    expect(slots[0]).toHaveAttribute('data-state', 'next');
    expect(slots[0]).toHaveAttribute('aria-current', 'step');
    expect(slots.slice(1).every((slot) => slot.dataset.state === 'locked')).toBe(true);
    expect(screen.getByText('Te faltan 19.023,2 UKI para alcanzar el rango de Cukie Master.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('felicita el primer rango y muestra cuánto falta para el segundo', () => {
    render(<CukieMasterPurchaseProgress totalPurchasedRaw={uki('21000')} locale="es" />);

    const slots = screen.getAllByRole('listitem');
    expect(slots.map((slot) => slot.dataset.state)).toEqual([
      'achieved',
      'next',
      'locked',
      'locked',
      'locked',
    ]);
    expect(screen.getByText('¡Felicitaciones! Primer rango de Cukie Master alcanzado.')).toBeInTheDocument();
    expect(screen.getByText('Te faltan 19.000 UKI para alcanzar el 2º rango de Cukie Master.')).toBeInTheDocument();
  });

  it('distingue alcanzados, siguiente y pendientes en inglés', () => {
    render(<CukieMasterPurchaseProgress totalPurchasedRaw={uki('40000')} locale="en" />);

    const slots = screen.getAllByRole('listitem');
    expect(slots.filter((slot) => slot.dataset.state === 'achieved')).toHaveLength(2);
    expect(slots.filter((slot) => slot.dataset.state === 'next')).toHaveLength(1);
    expect(slots.filter((slot) => slot.dataset.state === 'locked')).toHaveLength(2);
    expect(screen.getByText('You need 20,000 more UKI to reach Cukie Master rank 3.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('celebra los cinco rangos sin crear un sexto cuadro', () => {
    render(<CukieMasterPurchaseProgress totalPurchasedRaw={uki('100000')} locale="es" />);

    expect(screen.getAllByText('Alcanzado')).toHaveLength(5);
    expect(screen.queryByText('6º rango')).not.toBeInTheDocument();
    expect(screen.queryByText('En progreso')).not.toBeInTheDocument();
    expect(screen.getByText('5/5 rangos')).toBeInTheDocument();
  });
});
