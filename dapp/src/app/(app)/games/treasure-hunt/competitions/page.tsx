import type { Metadata } from 'next';

import TreasureHuntCompetitionsView from '@/components/games/treasure-hunt-competitions-view';

export const metadata: Metadata = {
  title: 'Competiciones de Treasure Hunt | Cukies World',
  description: 'Torneos activos e inactivos de Treasure Hunt, con sus reglas y rankings separados.',
};

export default function TreasureHuntCompetitionsPage() {
  return <TreasureHuntCompetitionsView />;
}
