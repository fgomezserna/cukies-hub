import { Lock, Wallet, Zap, type LucideIcon } from 'lucide-react';
import { PresaleCountdown, PresaleCountdownTitle, PresaleLockBadge } from './presale-countdown';
import { PresaleRateLabel, PresaleRuntimeStatus, PresaleStatusProvider } from './presale-status';
import { Panel, TokenCoin } from './primitives';
import { LandingWalletConnectButton, LandingWalletStateCallout, LandingWalletStatusLabel } from './wallet-connect-dynamic';

export function SaleConsole() {
  return (
    <PresaleStatusProvider>
      <Panel id="presale-console" className="uki-sale-console" innerClassName="p-3">
        <div className="text-center">
          <p className="font-headline text-xl font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">
            UKI presale
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">
            <PresaleRateLabel />
          </p>
        </div>

        <div className="mt-2.5 rounded-[10px] border border-[var(--uki-pink-border)] bg-[#02090d]/74 p-2.5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TokenBox label="ASM" tone="purple" />
            <span className="font-headline text-2xl font-black text-[var(--uki-cyan)]">-&gt;</span>
            <TokenBox label="UKI" tone="gold" />
          </div>
        </div>

        <div className="mt-2.5 divide-y divide-white/10 border-y border-white/10">
          <ConsoleRow label="Sale price" value="$0.01" helper="Per UKI" />
          <ConsoleRow label="Network" value="BNB Smart Chain" icon={Zap} />
          <ConsoleRow label="Vesting" value="9 months" helper="Linear release" icon={Lock} />
        </div>

        <div className="mt-2.5 space-y-2">
          <PresaleRuntimeStatus />
          <LandingWalletStateCallout />
        </div>

        <div className="mt-2.5 rounded-[10px] border border-[var(--uki-pink-border)] bg-[#02090d]/70 p-2.5">
          <p className="text-center text-[0.65rem] font-black uppercase tracking-[0.18em] text-[var(--uki-muted)]">
            <PresaleCountdownTitle />
          </p>
          <PresaleCountdown />
        </div>

        <div className="mt-2.5 rounded-[8px] border border-[#ef5f8f]/45 bg-[#2a0d1a]/58 p-2.5">
          <div className="flex items-center justify-between gap-4 text-xs font-black uppercase tracking-[0.12em]">
            <span className="inline-flex items-center gap-2 text-[var(--uki-cyan)]">
              <Wallet className="h-4 w-4" strokeWidth={1.8} />
              Wallet
            </span>
            <LandingWalletStatusLabel />
          </div>
          <PresaleLockBadge className="mt-2 w-full justify-center" />
        </div>

        <LandingWalletConnectButton className="mt-2.5 w-full justify-center" showCompactText={false} />
      </Panel>
    </PresaleStatusProvider>
  );
}

function TokenBox({ label, tone }: { label: string; tone: 'purple' | 'gold' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[8px] bg-white/[0.045] px-2.5 py-2.5">
      <TokenCoin label={label.slice(0, 1)} tone={tone} size="sm" />
      <span className="font-headline text-xl font-black uppercase tracking-[0.04em] text-[var(--uki-cream)]">{label}</span>
    </div>
  );
}

function ConsoleRow({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="grid grid-cols-[0.75fr_1fr] items-center gap-4 py-2">
      <span className="uki-label">{label}</span>
      <span className="flex items-center justify-end gap-2 text-right font-headline text-base font-black text-[var(--uki-cream)]">
        {Icon ? <Icon className="h-4 w-4 text-[var(--uki-gold)]" strokeWidth={1.8} /> : null}
        <span>
          {value}
          {helper ? <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--uki-muted)]">{helper}</span> : null}
        </span>
      </span>
    </div>
  );
}
