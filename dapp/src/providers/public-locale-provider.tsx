'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALE_COOKIE,
  PUBLIC_LOCALE_STORAGE_KEY,
  type PublicLocale,
  normalizePublicLocale,
} from '@/lib/public-locale';

type PublicLocaleContextValue = {
  locale: PublicLocale;
  setLocale: (locale: PublicLocale) => void;
};

const PublicLocaleContext = createContext<PublicLocaleContextValue | undefined>(undefined);

function readCookieLocale() {
  if (typeof document === 'undefined') return null;

  try {
    return document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${PUBLIC_LOCALE_COOKIE}=`))
      ?.split('=')[1];
  } catch {
    return null;
  }
}

function detectInitialLocale() {
  if (typeof window === 'undefined') return DEFAULT_PUBLIC_LOCALE;

  let searchLocale: string | null = null;
  let storedLocale: string | null = null;

  try {
    searchLocale = new URLSearchParams(window.location.search).get('lang');
  } catch {
    searchLocale = null;
  }

  try {
    storedLocale = window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY);
  } catch {
    storedLocale = null;
  }

  const cookieLocale = readCookieLocale();

  return normalizePublicLocale(searchLocale ?? storedLocale ?? cookieLocale);
}

function persistLocale(locale: PublicLocale) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Browsers can block storage in privacy modes. Locale selection should still work in-memory.
  }

  try {
    document.cookie = `${PUBLIC_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookie persistence is optional for the client-side selector.
  }

  try {
    document.documentElement.lang = locale;
  } catch {
    // Ignore DOM write failures and keep rendering with the selected React state.
  }
}

export function PublicLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<PublicLocale>(DEFAULT_PUBLIC_LOCALE);

  useEffect(() => {
    const detectedLocale = detectInitialLocale();
    setLocaleState(detectedLocale);
    persistLocale(detectedLocale);
  }, []);

  const setLocale = useCallback((nextLocale: PublicLocale) => {
    setLocaleState(nextLocale);
    persistLocale(nextLocale);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <PublicLocaleContext.Provider value={value}>{children}</PublicLocaleContext.Provider>;
}

export function usePublicLocale() {
  const context = useContext(PublicLocaleContext);

  if (!context) {
    throw new Error('usePublicLocale must be used within PublicLocaleProvider');
  }

  return context;
}
