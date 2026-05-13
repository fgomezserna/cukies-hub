import { NextResponse } from 'next/server';

import {
  legacyMarketplaceAbis,
  legacyMarketplaceContracts,
  legacyMarketplaceEndpoints,
  legacyMarketplaceOperations,
  legacyMarketplaceRoutes,
  legacyMarketplaceSource,
} from '@/lib/legacy-marketplace';

function countAbiEntries<TAbiMap extends Record<string, readonly unknown[]>>(
  abiMap: TAbiMap,
) {
  return Object.fromEntries(
    Object.entries(abiMap).map(([contractName, abi]) => [
      contractName,
      abi.length,
    ]),
  );
}

export function GET() {
  return NextResponse.json({
    source: legacyMarketplaceSource,
    endpoints: legacyMarketplaceEndpoints,
    contracts: legacyMarketplaceContracts,
    routes: legacyMarketplaceRoutes,
    operations: legacyMarketplaceOperations,
    abiEntries: {
      bsc: countAbiEntries(legacyMarketplaceAbis.bsc),
      tron: countAbiEntries(legacyMarketplaceAbis.tron),
    },
  });
}
