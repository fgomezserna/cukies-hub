import { Baby, CheckCircle2, Coins, Dna, Sparkles, Store } from 'lucide-react';

import {
  BreedingClient,
  type BreedingTab,
} from '@/components/legacy-marketplace/breeding-client';
import { CollectionWorkspaceHeader } from '@/components/legacy-marketplace/collection-workspace-header';

export function BreedingPageShell({
  initialTab = 'start',
}: {
  initialTab?: BreedingTab;
}) {
  return (
    <div className="uki-theme mx-auto min-h-full w-full max-w-[1480px] overflow-x-clip text-[var(--uki-cream)]">
      <CollectionWorkspaceHeader
        eyebrow="Haz crecer tu colección"
        title="Crea una nueva generación"
        description="Elige dos Cukies compatibles, consulta los puntos necesarios y sigue el proceso hasta conocer tu nueva cría."
        insight="Todo el proceso en un solo lugar"
        insightDescription="Consulta candidatos, crías en curso y resultados sin perder de vista la red y la wallet que estás usando."
        insightIcon={Baby}
        journey={[
          { icon: Dna, label: 'Elige dos Cukies' },
          { icon: Coins, label: 'Revisa los puntos' },
          { icon: CheckCircle2, label: 'Sigue el resultado' },
        ]}
        links={[
          { href: '/marketplace', icon: Store, label: 'Marketplace' },
          { href: '/cukiepoints', icon: Sparkles, label: 'Mis puntos', primary: true },
        ]}
      />

      <div className="pt-7">
        <BreedingClient initialTab={initialTab} />
      </div>
    </div>
  );
}
