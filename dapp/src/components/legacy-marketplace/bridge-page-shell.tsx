import 'server-only';

import {
  ArrowRightLeft,
  CheckCircle2,
  Cookie,
  Network,
  Store,
  Wallet,
} from 'lucide-react';

import { BridgeClient } from '@/components/legacy-marketplace/bridge-client';
import { CollectionWorkspaceHeader } from '@/components/legacy-marketplace/collection-workspace-header';
import { buildCukiesBridgeRuntimeConfig } from '@/lib/legacy-marketplace/bridge-runtime';

export function BridgePageShell() {
  const config = buildCukiesBridgeRuntimeConfig({
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_UKI_CHAIN_ID: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID:
      process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID,
    NEXT_PUBLIC_CUKIES_BRIDGE_MODE: process.env.NEXT_PUBLIC_CUKIES_BRIDGE_MODE,
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID,
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS,
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS:
      process.env.NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS,
  });

  return (
    <div className="uki-theme mx-auto min-h-full w-full max-w-[1480px] overflow-x-clip text-[var(--uki-cream)]">
      <CollectionWorkspaceHeader
        eyebrow="Mueve tus Cukies"
        title="De TRON a BNB Smart Chain"
        description="Elige el Cukie que quieres mover, confirma la wallet de destino y revisa el coste antes de firmar. El proceso solo puede hacerse en esta dirección."
        insight="Una operación, dos confirmaciones"
        insightDescription="Primero se confirma la salida en TRON y después la llegada a BNB Smart Chain. Podrás seguir ambos pasos aquí."
        insightIcon={ArrowRightLeft}
        journey={[
          { icon: Network, label: 'Conecta la wallet de origen' },
          { icon: Wallet, label: 'Confirma el destino' },
          { icon: CheckCircle2, label: 'Revisa y firma' },
        ]}
        links={[
          { href: '/cukies', icon: Cookie, label: 'Mis Cukies' },
          { href: '/marketplace', icon: Store, label: 'Marketplace', primary: true },
        ]}
      />

      <div className="pt-7">
        <BridgeClient config={config} />
      </div>
    </div>
  );
}
