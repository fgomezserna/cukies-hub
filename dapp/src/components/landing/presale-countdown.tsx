'use client';

import type { ReactNode } from 'react';
import { ArrowRight, Lock, Timer } from 'lucide-react';
import { usePresaleTiming } from './presale-status';

function formatCountdownValue(value: number) {
  return value.toString().padStart(2, '0');
}

export function usePresaleLock() {
  return usePresaleTiming();
}

export function PresaleCountdown() {
  const { isLocked, remaining } = usePresaleLock();
  const boxes = [
    { value: remaining.days, label: 'Días' },
    { value: remaining.hours, label: 'Horas' },
    { value: remaining.minutes, label: 'Minutos' },
    { value: remaining.seconds, label: 'Segundos' },
  ];

  if (!isLocked) return null;

  return (
    <div className="mt-2 grid grid-cols-4 gap-2" aria-live="polite">
      {boxes.map((box) => (
        <div key={box.label} className="uki-countdown-box">
          <span className="block font-headline text-xl font-black leading-none text-[var(--uki-cyan)]" suppressHydrationWarning>
            {formatCountdownValue(box.value)}
          </span>
          <span className="mt-1.5 block text-[0.55rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
            {box.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PresaleCountdownHeading() {
  const { isLocked } = usePresaleLock();

  if (isLocked) return <>Inicio de preventa</>;

  return <>Preventa abierta</>;
}

export function PresaleCountdownTitle() {
  const { isLocked, startLabel } = usePresaleLock();

  return <>{isLocked ? `La preventa empieza ${startLabel}` : 'Preventa abierta'}</>;
}

export function PresaleLockBadge({ className = '' }: { className?: string }) {
  const { isLocked, startLabel } = usePresaleLock();

  return (
    <span className={`uki-presale-lock-badge ${className}`}>
      {isLocked ? <Lock className="h-3.5 w-3.5" strokeWidth={1.8} /> : <Timer className="h-3.5 w-3.5" strokeWidth={1.8} />}
      {isLocked ? `Bloqueado hasta ${startLabel}` : 'Preventa abierta'}
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
  const { isLocked, startShortLabel } = usePresaleLock();

  return (
    <button type="button" disabled={isLocked} className={`${className} ${isLocked ? 'uki-action-locked' : ''}`}>
      {isLocked ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Lock className="h-3.5 w-3.5" strokeWidth={1.8} />
          Abre {startShortLabel}
        </span>
      ) : (
        openLabel ?? children
      )}
    </button>
  );
}

export function PresaleGateLink({
  href,
  children,
  className = '',
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { isLocked, startShortLabel } = usePresaleLock();
  const variantClass = {
    primary: 'uki-button-primary',
    secondary: 'uki-button-secondary',
    ghost: 'uki-button-ghost',
  }[variant];

  if (isLocked) {
    return (
      <span aria-disabled="true" className={`uki-button ${variantClass} uki-button-locked ${className}`}>
        <span className="inline-flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" strokeWidth={1.8} />
          Abre {startShortLabel}
        </span>
        <span className="uki-button-icon" aria-hidden="true">
          <Timer className="h-4 w-4" />
        </span>
      </span>
    );
  }

  return (
    <a href={href} className={`uki-button ${variantClass} ${className}`}>
      <span>{children}</span>
      <span className="uki-button-icon" aria-hidden="true">
        <ArrowRight className="h-4 w-4" />
      </span>
    </a>
  );
}
