import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';

export const metadata: Metadata = {
  title: 'Retirar Cukie | Cukies World',
  description: 'Consulta el estado de tu Cukie y solicita su retirada cuando corresponda.',
};

export default function RecoverPoolCukiePage() {
  return (
    <div className="uki-theme min-h-full w-full overflow-x-clip text-[var(--uki-cream)]">
      <div className="mx-auto w-full max-w-[1120px] pb-10">
        <Link
          href="/cukie-hodler#mis-cukies-aportados"
          className="inline-flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a mi pool
        </Link>

        <header className="mt-6 border-b border-white/10 pb-7">
          <div className="flex items-center gap-3 text-sm font-bold text-[var(--uki-lilac)]">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            <span>Salida de Cukie</span>
          </div>
          <h1 className="mt-3 max-w-3xl text-balance font-headline text-4xl font-black leading-tight tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
            Retirar Cukie
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
            Consulta su estado y solicita la retirada cuando corresponda.
          </p>
        </header>

        <NftVaultRecoveryPanel kind="cukie_pool" />
      </div>
    </div>
  );
}
