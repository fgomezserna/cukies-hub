import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';

export const metadata: Metadata = {
  title: 'Recuperar un Cukie | Cukies World',
  description: 'Recupera un Cukie depositado que no aparece en el Pool de Cukies.',
};

export default function RecoverPoolCukiePage() {
  return (
    <div className="uki-landing min-h-full w-full overflow-x-clip bg-transparent text-[var(--uki-cream)]">
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
            <span>Ayuda para una posición existente</span>
          </div>
          <h1 className="mt-3 max-w-3xl text-balance font-headline text-4xl font-black leading-tight tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
            Recupera un Cukie que no aparece
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
            Usa esta herramienta solo si ya depositaste el Cukie y no figura en tu pool. Si aparece en la pantalla anterior, gestiona su salida desde allí.
          </p>
        </header>

        <NftVaultRecoveryPanel kind="cukie_pool" />
      </div>
    </div>
  );
}
