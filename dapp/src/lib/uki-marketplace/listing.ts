import { parseUnits } from 'viem';

export const UKI_MARKETPLACE_PRICE_DECIMALS = 18;
export const UKI_MARKETPLACE_MIN_EXPIRY_SECONDS = 5 * 60;
export const UKI_MARKETPLACE_MAX_EXPIRY_SECONDS = 90 * 24 * 60 * 60;
export const UKI_MARKETPLACE_DEFAULT_EXPIRY_DAYS = 7;

const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);
const MAX_UINT64 = (BigInt(1) << BigInt(64)) - BigInt(1);

export type UkiMarketplaceListingValidation =
  | {
      valid: true;
      ukiPriceRaw: bigint;
      expiresAt: bigint;
    }
  | {
      valid: false;
      priceError: string | null;
      expiryError: string | null;
    };

function normalizedPrice(value: string) {
  return value.trim().replace(',', '.');
}

export function validateUkiMarketplaceListing(input: {
  ukiPrice: string;
  expiresAt: string;
  now?: Date;
}): UkiMarketplaceListingValidation {
  const now = input.now ?? new Date();
  const price = normalizedPrice(input.ukiPrice);
  let priceError: string | null = null;
  let expiryError: string | null = null;
  let ukiPriceRaw = BigInt(0);
  let expiresAt = BigInt(0);

  if (!/^\d+(?:\.\d{1,18})?$/.test(price)) {
    priceError = 'Introduce un precio UKI válido con un máximo de 18 decimales.';
  } else {
    try {
      ukiPriceRaw = parseUnits(price, UKI_MARKETPLACE_PRICE_DECIMALS);
      if (ukiPriceRaw <= BigInt(0) || ukiPriceRaw > MAX_UINT256) {
        priceError = 'El precio UKI debe ser mayor que cero y caber en uint256.';
      }
    } catch {
      priceError = 'El precio UKI no se puede representar en el contrato.';
    }
  }

  const expiryDate = new Date(input.expiresAt);
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs) || Number.isNaN(expiryDate.getTime())) {
    expiryError = 'Selecciona una fecha y hora de caducidad válida.';
  } else {
    const expirySeconds = Math.floor(expiryDate.getTime() / 1_000);
    const nowSeconds = Math.floor(nowMs / 1_000);
    expiresAt = BigInt(expirySeconds);
    if (expirySeconds < nowSeconds + UKI_MARKETPLACE_MIN_EXPIRY_SECONDS) {
      expiryError = 'La orden debe durar al menos 5 minutos.';
    } else if (expirySeconds > nowSeconds + UKI_MARKETPLACE_MAX_EXPIRY_SECONDS) {
      expiryError = 'La orden no puede durar más de 90 días.';
    } else if (expiresAt > MAX_UINT64) {
      expiryError = 'La caducidad no cabe en uint64.';
    }
  }

  return priceError || expiryError
    ? { valid: false, priceError, expiryError }
    : { valid: true, ukiPriceRaw, expiresAt };
}

export function defaultUkiMarketplaceExpiry(now = new Date()) {
  const date = new Date(now.getTime() + UKI_MARKETPLACE_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join('T');
}
