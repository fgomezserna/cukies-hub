import { Lock, Zap, type LucideIcon } from 'lucide-react';
import { PresaleCountdownGate } from './presale-countdown-gate';
import { PresalePurchasePanel } from './presale-purchase-panel';
import { PresaleRateLabel, PresaleStatusProvider } from './presale-status';
import { Panel, TokenCoin } from './primitives';

export function SaleConsole() {
  return (
    <PresaleStatusProvider>
      <SaleConsoleContent />
    </PresaleStatusProvider>
  );
}

function SaleConsoleContent() {
  return (
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

      <div className="mt-2 grid grid-cols-3 gap-2 border-y border-white/10 py-2">
        <ConsoleMetric label="Price" value="$0.01" helper="Per UKI" />
        <ConsoleMetric label="Network" value="BSC" icon={Zap} />
        <ConsoleMetric label="Vesting" value="9m" helper="Linear" icon={Lock} />
      </div>

      <PresaleCountdownGate />

      <PresalePurchasePanel />
    </Panel>
  );
}

function ConsoleMetric({
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
    <div className="min-w-0 text-center">
      <p className="uki-label text-[0.52rem]">{label}</p>
      <p className="mt-1 inline-flex max-w-full items-center justify-center gap-1.5 truncate font-headline text-sm font-black text-[var(--uki-cream)]">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} /> : null}
        <span className="truncate">{value}</span>
      </p>
      {helper ? <p className="mt-0.5 truncate text-[0.55rem] font-semibold uppercase tracking-[0.1em] text-[var(--uki-muted)]">{helper}</p> : null}
    </div>
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
