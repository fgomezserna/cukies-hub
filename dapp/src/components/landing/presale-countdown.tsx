'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Lock, Timer } from 'lucide-react';
import { UKI_PRESALE_START_ISO, UKI_PRESALE_START_LABEL } from './sale-config';

type RemainingTime = {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getRemainingTime(): RemainingTime {
  const total = Math.max(0, new Date(UKI_PRESALE_START_ISO).getTime() - Date.now());
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / (1000 * 60)) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return { total, days, hours, minutes, seconds };
}

function formatCountdownValue(value: number) {
  return value.toString().padStart(2, '0');
}

export function usePresaleLock() {
  const [remaining, setRemaining] = useState<RemainingTime>(() => getRemainingTime());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(getRemainingTime());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return useMemo(
    () => ({
      isLocked: remaining.total > 0,
      remaining,
    }),
    [remaining],
  );
}

export function PresaleCountdown() {
  const { isLocked, remaining } = usePresaleLock();
  const boxes = [
    { value: remaining.days, label: 'Days' },
    { value: remaining.hours, label: 'Hours' },
    { value: remaining.minutes, label: 'Minutes' },
    { value: remaining.seconds, label: 'Seconds' },
  ];

  return (
    <div className="mt-2 grid grid-cols-4 gap-2" aria-live="polite">
      {boxes.map((box) => (
        <div key={box.label} className="uki-countdown-box">
          <span className="block font-headline text-xl font-black leading-none text-[var(--uki-cyan)]" suppressHydrationWarning>
            {isLocked ? formatCountdownValue(box.value) : '00'}
          </span>
          <span className="mt-1.5 block text-[0.55rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
            {box.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PresaleLockBadge({ className = '' }: { className?: string }) {
  const { isLocked } = usePresaleLock();

  return (
    <span className={`uki-presale-lock-badge ${className}`}>
      {isLocked ? <Lock className="h-3.5 w-3.5" strokeWidth={1.8} /> : <Timer className="h-3.5 w-3.5" strokeWidth={1.8} />}
      {isLocked ? `Locked until ${UKI_PRESALE_START_LABEL}` : 'Presale open'}
    </span>
  );
}

export function PresaleGateAction({
  children,
  className = '',
  openLabel,
}: {
  children: ReactNode;
  className?: string;
  openLabel?: ReactNode;
}) {
  const { isLocked } = usePresaleLock();

  return (
    <button type="button" disabled={isLocked} className={`${className} ${isLocked ? 'uki-action-locked' : ''}`}>
      {isLocked ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Lock className="h-3.5 w-3.5" strokeWidth={1.8} />
          Opens Jun 10
        </span>
      ) : (
        openLabel ?? children
      )}
    </button>
  );
}
