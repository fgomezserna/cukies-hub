import type { Metadata } from 'next';

import ProfileBackButton from '@/components/profile/profile-back-button';
import TreasureHuntProfile from '@/components/profile/treasure-hunt-profile';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Mi perfil | Cukies World',
  description: 'Perfil público y participación en el Torneo Preventa UKI.',
};

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <div className="max-w-3xl">
        <ProfileBackButton />
        <p className="mt-4 font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-lilac-300">
          Cuenta
        </p>
        <h1 className="mt-2 font-headline text-3xl font-black tracking-tight text-white sm:text-4xl">
          Mi perfil
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
          El alias de competición identifica tu posición en Treasure Hunt. Tu nombre público,
          foto y biografía se gestionan por separado en los ajustes de perfil.
        </p>
        <Link
          href="/settings"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-semibold text-slate-200 transition-colors hover:border-lilac-300/40 hover:bg-white/5 hover:text-lilac-200"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Ajustes de perfil
        </Link>
      </div>

      <TreasureHuntProfile />
    </div>
  );
}
