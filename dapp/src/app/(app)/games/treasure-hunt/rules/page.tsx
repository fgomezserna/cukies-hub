import type { Metadata } from 'next';

import TreasureHuntRulesView from '@/components/games/treasure-hunt-rules-view';

export const metadata: Metadata = {
  title: 'Reglas de Treasure Hunt | Cukies World',
  description: 'Reglas, elegibilidad y recompensas de la competición de Treasure Hunt.',
};

export default function TreasureHuntRulesPage() {
  return <TreasureHuntRulesView />;
}
