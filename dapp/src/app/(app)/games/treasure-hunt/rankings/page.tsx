import type { Metadata } from 'next';

import TreasureHuntRankingsView from '@/components/games/treasure-hunt-rankings-view';

export const metadata: Metadata = {
  title: 'Rankings de Treasure Hunt | Cukies World',
  description: 'Clasificaciones independientes por competición y formato de Treasure Hunt.',
};

export default function TreasureHuntRankingsPage() {
  return <TreasureHuntRankingsView />;
}
