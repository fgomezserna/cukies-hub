import type { Metadata } from 'next';

import TreasureHuntProfile from '@/components/profile/treasure-hunt-profile';

export const metadata: Metadata = {
  title: 'Mi perfil de Treasure Hunt | Cukies World',
  description: 'Perfil y participación en el Torneo Preventa UKI.',
};

export default function TreasureHuntProfilePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-8">
      <div>
        <p className="font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-emerald-300">
          Identidad del torneo
        </p>
        <h2 className="mt-2 font-headline text-2xl font-black tracking-tight text-white sm:text-3xl">
          Mi perfil
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Gestiona el alias con el que apareces en la clasificación. El resto de datos se
          muestra como información de solo lectura.
        </p>
      </div>

      <TreasureHuntProfile />
    </div>
  );
}
