const DEFAULT_PRESALE_START_ISO = '';
const DEFAULT_PRESALE_START_LABEL = '15 de junio de 2026';
const DEFAULT_PRESALE_START_SHORT_LABEL = '15 de junio';
const NON_PRODUCTION_LABEL_RE = /test\s*net/i;

function publicLabel(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized || NON_PRODUCTION_LABEL_RE.test(normalized)) return fallback;

  return normalized;
}

export const UKI_PRESALE_START_ISO = process.env.NEXT_PUBLIC_UKI_PRESALE_START_ISO || DEFAULT_PRESALE_START_ISO;
export const UKI_PRESALE_HAS_EXACT_START = Boolean(UKI_PRESALE_START_ISO);
export const UKI_PRESALE_START_LABEL = publicLabel(process.env.NEXT_PUBLIC_UKI_PRESALE_START_LABEL, DEFAULT_PRESALE_START_LABEL);
export const UKI_PRESALE_START_SHORT_LABEL = publicLabel(process.env.NEXT_PUBLIC_UKI_PRESALE_START_SHORT_LABEL, DEFAULT_PRESALE_START_SHORT_LABEL);
export const UKI_PRESALE_CHAIN_ID = Number(process.env.NEXT_PUBLIC_UKI_CHAIN_ID || 56);
export const UKI_PRESALE_CHAIN_LABEL = 'BNB Smart Chain';
