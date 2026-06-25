import {
  DEFAULT_PUBLIC_LOCALE,
  TOKENOMICS_URL_BY_LOCALE,
  normalizePublicLocale,
} from '@/lib/public-locale';

describe('public-locale', () => {
  it('mantiene español como locale publico por defecto', () => {
    expect(normalizePublicLocale()).toBe(DEFAULT_PUBLIC_LOCALE);
    expect(normalizePublicLocale('fr')).toBe(DEFAULT_PUBLIC_LOCALE);
  });

  it('normaliza variantes inglesas al locale en', () => {
    expect(normalizePublicLocale('en')).toBe('en');
    expect(normalizePublicLocale('en-US')).toBe('en');
  });

  it('expone las URLs de tokenomics por idioma', () => {
    expect(TOKENOMICS_URL_BY_LOCALE.es).toBe(
      'https://cukiesworld12.gitbook.io/cukies-world-whitepaper/es/4.-token-uki/tokenomics',
    );
    expect(TOKENOMICS_URL_BY_LOCALE.en).toBe(
      'https://cukiesworld12.gitbook.io/cukies-world-whitepaper/4.-uki-token/tokenomics',
    );
  });
});
