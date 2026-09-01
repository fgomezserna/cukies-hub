import type { Metadata } from 'next';

import TreasureHuntRulesView from '@/components/games/treasure-hunt-rules-view';

export const metadata: Metadata = {
  title: 'Reglas de Treasure Hunt | Cukies World',
  description: 'Coste por partida, uso de créditos, clasificación y reparto semanal de Treasure Hunt.',
};

export default function TreasureHuntRulesPage() {
  return <TreasureHuntRulesView />;
}
