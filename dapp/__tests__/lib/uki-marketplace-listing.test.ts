import {
  defaultUkiMarketplaceExpiry,
  validateUkiMarketplaceListing,
} from '@/lib/uki-marketplace/listing';

describe('validación de publicación UKI', () => {
  const now = new Date('2026-08-30T10:00:00.000Z');

  it('convierte un precio UKI y una caducidad válida a unidades del contrato', () => {
    expect(validateUkiMarketplaceListing({
      ukiPrice: '1250,5',
      expiresAt: '2026-09-06T10:00:00.000Z',
      now,
    })).toEqual({
      valid: true,
      ukiPriceRaw: BigInt('1250500000000000000000'),
      expiresAt: BigInt('1788688800'),
    });
  });

  it.each([
    ['0', 'El precio UKI debe ser mayor que cero'],
    ['1.1234567890123456789', 'máximo de 18 decimales'],
    ['1e3', 'precio UKI válido'],
  ])('rechaza el precio %s', (ukiPrice, message) => {
    const result = validateUkiMarketplaceListing({
      ukiPrice,
      expiresAt: '2026-09-06T10:00:00.000Z',
      now,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.priceError).toContain(message);
  });

  it('bloquea una caducidad demasiado próxima o superior a 90 días', () => {
    const tooSoon = validateUkiMarketplaceListing({
      ukiPrice: '1',
      expiresAt: '2026-08-30T10:04:59.000Z',
      now,
    });
    expect(tooSoon.valid).toBe(false);
    if (!tooSoon.valid) expect(tooSoon.expiryError).toContain('al menos 5 minutos');

    const tooLate = validateUkiMarketplaceListing({
      ukiPrice: '1',
      expiresAt: '2026-11-29T10:00:01.000Z',
      now,
    });
    expect(tooLate.valid).toBe(false);
    if (!tooLate.valid) expect(tooLate.expiryError).toContain('más de 90 días');
  });

  it('propone siete días sin perder la hora local del formulario', () => {
    const localNow = new Date(2026, 7, 30, 12, 34, 0, 0);
    expect(defaultUkiMarketplaceExpiry(localNow)).toBe('2026-09-06T12:34');
  });
});
