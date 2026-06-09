const PRESALE_DISPLAY_TIME_ZONE = 'Europe/Madrid';

export function isoFromUnixSeconds(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;

  return new Date(seconds * 1000).toISOString();
}

export function formatPresaleDateLabel(
  isoOrSeconds?: string | number | null,
  options: { includeTime?: boolean; short?: boolean } = {},
) {
  if (!isoOrSeconds) return null;

  const date =
    typeof isoOrSeconds === 'number'
      ? new Date(isoOrSeconds * 1000)
      : new Date(isoOrSeconds);

  if (Number.isNaN(date.getTime())) return null;

  const dateLabel = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: options.short ? undefined : 'numeric',
    timeZone: PRESALE_DISPLAY_TIME_ZONE,
  }).format(date);

  if (options.includeTime === false) return dateLabel;

  const timeLabel = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: PRESALE_DISPLAY_TIME_ZONE,
  }).format(date);

  return `${dateLabel} a las ${timeLabel}`;
}

export function formatPresaleRateLabel(value?: string | number | null) {
  if (value === undefined || value === null || value === '') {
    return 'Ratio ASM - UKI pendiente';
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'Ratio ASM - UKI pendiente';
  }

  return `1 ASM = ${numeric.toLocaleString('en-US', { maximumFractionDigits: 4 })} UKI`;
}

export function remainingTimeUntil(iso?: string | null) {
  if (!iso) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const target = new Date(iso).getTime();
  const total = Number.isFinite(target) ? Math.max(0, target - Date.now()) : 0;
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / (1000 * 60)) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return { total, days, hours, minutes, seconds };
}
