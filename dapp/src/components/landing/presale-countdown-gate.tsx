'use client';

import { PresaleCountdown, PresaleCountdownTitle, usePresaleLock } from './presale-countdown';

export function PresaleCountdownGate() {
  const { isLocked } = usePresaleLock();

  if (!isLocked) return null;

  return (
    <div className="mt-2 rounded-[10px] border border-[var(--uki-pink-border)] bg-[#02090d]/70 p-2.5">
      <p className="text-center text-[0.65rem] font-black uppercase tracking-[0.18em] text-[var(--uki-muted)]">
        <PresaleCountdownTitle />
      </p>
      <PresaleCountdown />
    </div>
  );
}
