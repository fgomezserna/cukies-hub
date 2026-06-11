import Image from 'next/image';
import { ArrowRight, Zap, type LucideIcon } from 'lucide-react';
import { PresalePurchasePanel } from './presale-purchase-panel';
import { PresaleRateLabel } from './presale-status';
import { Panel } from './primitives';

export function SaleConsole() {
  return (
    <Panel id="presale-console" className="uki-sale-console" innerClassName="p-3">
      <div className="text-center">
        <p className="font-headline text-xl font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">
            Preventa UKI
        </p>
        <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">
          <PresaleRateLabel />
        </p>
      </div>

      <div className="mt-2.5 rounded-[10px] border border-[var(--uki-pink-border)] bg-[#04030a]/74 p-2.5">
        <p className="mb-2 text-center font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cream)]">
          <PresaleRateLabel />
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TokenBox label="ASM" tone="asm" image="/brand/official/asm-token-coingecko.png" />
          <span className="uki-conversion-arrow" aria-hidden="true">
            <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <TokenBox label="UKI" tone="uki" image="/brand/official/uki-token-cukies-world.png" />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 border-y border-white/10 py-2">
        <ConsoleMetric label="Precio" value="$0.01" helper="Por UKI" />
        <ConsoleMetric label="Red" value="BSC" icon={Zap} />
        <ConsoleMetric label="Listing" value="$0.012" helper="Por UKI" />
      </div>

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

function TokenBox({ label, image, tone }: { label: string; image: string; tone: 'asm' | 'uki' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[8px] bg-white/[0.045] px-2.5 py-2.5">
      <span className={`uki-token-official uki-token-official-${tone}`}>
        <Image src={image} alt={`${label} oficial`} fill sizes="40px" className="object-contain" />
      </span>
      <span className="font-headline text-xl font-black uppercase tracking-[0.04em] text-[var(--uki-cream)]">{label}</span>
    </div>
  );
}
