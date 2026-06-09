import {
  formatPresaleDateLabel,
  formatPresaleRateLabel,
  isoFromUnixSeconds,
} from '@/lib/presale-display';

describe('presale-display', () => {
  it('formatea fecha y hora desde timestamp de contrato', () => {
    expect(isoFromUnixSeconds(1_779_275_658)).toBe('2026-05-20T11:14:18.000Z');
    expect(formatPresaleDateLabel(1_779_275_658)).toBe('20 de mayo de 2026 a las 13:14');
  });

  it('formatea el ratio ASM a UKI desde el contrato', () => {
    expect(formatPresaleRateLabel('100')).toBe('1 ASM = 100 UKI');
    expect(formatPresaleRateLabel(null)).toBe('Ratio ASM - UKI pendiente');
  });
});
