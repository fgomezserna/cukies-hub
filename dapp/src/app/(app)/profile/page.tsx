import type { Metadata } from 'next';

import TreasureHuntProfile from '@/components/profile/treasure-hunt-profile';

export const metadata: Metadata = {
  title: 'Mi perfil | Cukies World',
  description: 'Perfil público y participación en el Torneo Preventa UKI.',
};

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <div className="max-w-3xl">
        <p className="font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-emerald-300">
          Cuenta
        </p>
        <h1 className="mt-2 font-headline text-3xl font-black tracking-tight text-white sm:text-4xl">
          Mi perfil
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
          Gestiona el alias con el que apareces en la clasificación. El resto de datos se
          muestra como información de solo lectura.
        </p>
      </div>

      <TreasureHuntProfile />
    </div>
  );
}
