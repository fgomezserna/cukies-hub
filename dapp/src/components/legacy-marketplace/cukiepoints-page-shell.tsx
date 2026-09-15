import { Baby, Database, Network, Sparkles, Store, Wallet } from 'lucide-react';

import { CukiePointsClient } from '@/components/legacy-marketplace/cukiepoints-client';
import { CollectionWorkspaceHeader } from '@/components/legacy-marketplace/collection-workspace-header';

export function CukiePointsPageShell() {
  return (
    <div className="uki-theme mx-auto min-h-full w-full max-w-[1480px] overflow-x-clip text-[var(--uki-cream)]">
      <CollectionWorkspaceHeader
        eyebrow="Tus recompensas"
        title="Tus Cukie Points"
        description="Consulta lo que has ganado, en qué red está y cómo cambia tu saldo con la actividad de tus Cukies."
        insight="Tu saldo no se inventa"
        insightDescription="Cuando una lectura no puede verificarse verás el dato como no disponible, nunca como un cero que pueda confundirte."
        insightIcon={Sparkles}
        journey={[
          { icon: Wallet, label: 'Consulta tus wallets' },
          { icon: Network, label: 'Compara las redes' },
          { icon: Database, label: 'Revisa tus movimientos' },
        ]}
        links={[
          { href: '/breeding', icon: Baby, label: 'Ver Crías' },
          { href: '/marketplace', icon: Store, label: 'Marketplace', primary: true },
        ]}
      />

      <div className="pt-7">
        <CukiePointsClient />
      </div>
    </div>
  );
}
