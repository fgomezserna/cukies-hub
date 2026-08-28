import type { Metadata } from 'next';

import TreasureHuntProfile from '@/components/profile/treasure-hunt-profile';

export const metadata: Metadata = {
  title: 'Mi perfil de Treasure Hunt | Cukies World',
  description: 'Perfil y participación en la competición de staking UKI.',
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
      </div>

      <TreasureHuntProfile />
    </div>
  );
}
