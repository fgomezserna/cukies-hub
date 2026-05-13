import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

import { CukiImage } from './cuki-image';
import {
  formatLegacyPrice,
  getCukiDisplayName,
  getStateLabel,
  getTypeLabel,
  shortWallet,
} from './format';

type CukiCardProps = {
  cuki: LegacyMarketplaceCukiItem;
};

export function CukiCard({ cuki }: CukiCardProps) {
  return (
    <Link
      href={`/marketplace/${cuki.tokenId}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-white/10 bg-black/35 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-950/20"
    >
      <div className="relative aspect-[4/5] min-h-[22rem] bg-[#071211] sm:min-h-[24rem]">
        <CukiImage
          src={cuki.imageUrl}
          alt={getCukiDisplayName(cuki)}
          sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 18rem"
          className="object-contain p-3 transition duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute left-3 top-3 rounded-full border border-black/30 bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          {cuki.network}
        </div>
        <div className="absolute right-3 top-3 rounded-full border border-cyan-300/25 bg-cyan-300/15 px-2.5 py-1 text-xs font-semibold text-cyan-100 backdrop-blur">
          {getStateLabel(cuki.state)}
        </div>
      </div>

      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-headline text-lg font-bold text-white">
              {getCukiDisplayName(cuki)}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {getTypeLabel(cuki.type)} · Gen {cuki.skills.generation ?? '-'}
            </p>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-cyan-200 opacity-70 transition group-hover:opacity-100" />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="uppercase tracking-wide text-slate-500">Price</p>
            <p className="mt-1 truncate font-semibold text-white">
              {formatLegacyPrice(cuki)}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="uppercase tracking-wide text-slate-500">Owner</p>
            <p className="mt-1 truncate font-mono font-semibold text-white">
              {shortWallet(cuki.owner)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
