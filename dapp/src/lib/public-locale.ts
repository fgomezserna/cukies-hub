export const PUBLIC_LOCALES = ['es', 'en'] as const;

export type PublicLocale = (typeof PUBLIC_LOCALES)[number];

export const DEFAULT_PUBLIC_LOCALE: PublicLocale = 'es';
export const PUBLIC_LOCALE_STORAGE_KEY = 'cukies_public_locale';
export const PUBLIC_LOCALE_COOKIE = 'cukies_public_locale';

export const TOKENOMICS_URL_BY_LOCALE: Record<PublicLocale, string> = {
  es: 'https://cukiesworld12.gitbook.io/cukies-world-whitepaper/es/4.-token-uki/tokenomics',
  en: 'https://cukiesworld12.gitbook.io/cukies-world-whitepaper/4.-uki-token/tokenomics',
};

export function normalizePublicLocale(value?: string | null): PublicLocale {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'en' || normalized?.startsWith('en-')) {
    return 'en';
  }

  return DEFAULT_PUBLIC_LOCALE;
}
