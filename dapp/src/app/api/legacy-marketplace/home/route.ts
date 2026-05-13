import { NextResponse } from 'next/server';

import {
  fetchLegacyMarketplaceGraphQL,
  legacyMarketplaceEndpoints,
  legacyMarketplaceQueries,
  legacyMarketplaceSource,
} from '@/lib/legacy-marketplace';

export const dynamic = 'force-dynamic';

const HOME_QUERIES = [
  ['lastMinted', legacyMarketplaceQueries.lastMinted],
  ['lastFiveBred', legacyMarketplaceQueries.lastFiveBred],
  ['lastFiveSold', legacyMarketplaceQueries.lastFiveSold],
  ['lastFiveListed', legacyMarketplaceQueries.lastFiveListed],
] as const;

type LegacyHomeQueryResult =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: string;
    };

async function runLegacyHomeQuery(
  key: string,
  query: string,
): Promise<readonly [string, LegacyHomeQueryResult]> {
  try {
    const data = await fetchLegacyMarketplaceGraphQL<Record<string, unknown>>({
      query,
      timeoutMs: 7_000,
    });

    return [
      key,
      {
        ok: true,
        data: data[key] ?? data,
      },
    ] as const;
  } catch (error) {
    return [
      key,
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    ] as const;
  }
}

export async function GET() {
  const entries = await Promise.all(
    HOME_QUERIES.map(([key, query]) => runLegacyHomeQuery(key, query)),
  );
  const results = Object.fromEntries(entries) as Record<
    string,
    LegacyHomeQueryResult
  >;
  const hasData = Object.values(results).some((result) => result.ok);

  return NextResponse.json(
    {
      source: legacyMarketplaceSource,
      endpoint: legacyMarketplaceEndpoints.graphQl,
      results,
    },
    {
      status: hasData ? 200 : 502,
    },
  );
}
