import { legacyMarketplaceEndpoints } from './config';

export type LegacyMarketplaceGraphQLError = {
  message: string;
  path?: readonly (string | number)[];
  extensions?: Record<string, unknown>;
};

export type LegacyMarketplaceCuki = {
  _id: string;
  cukiNumber: number;
  img: string;
  type: string;
  network: string;
  birthNetwork?: string | null;
  price?: number | null;
  state: string;
  timeStamp?: number | null;
};

export type LegacyMarketplaceEvent = {
  _id?: string | null;
  timeStamp?: number | null;
  price?: string | null;
  user?: string | null;
  network?: string | null;
};

export class LegacyMarketplaceGraphQLErrorResponse extends Error {
  readonly errors: readonly LegacyMarketplaceGraphQLError[];

  constructor(errors: readonly LegacyMarketplaceGraphQLError[]) {
    super(errors.map((error) => error.message).join('; '));
    this.name = 'LegacyMarketplaceGraphQLErrorResponse';
    this.errors = errors;
  }
}

export const legacyMarketplaceCukiSelection = `
  _id
  cukiNumber
  img
  type
  network
  birthNetwork
  price
  state
  timeStamp
`;

export const legacyMarketplaceEventSelection = `
  _id
  timeStamp
  price
  user
  network
`;

export const legacyMarketplaceQueries = {
  lastMinted: `
    query LegacyLastMinted {
      lastMinted {
        ${legacyMarketplaceCukiSelection}
      }
    }
  `,
  lastFiveBred: `
    query LegacyLastFiveBred {
      lastFiveBred {
        ${legacyMarketplaceCukiSelection}
      }
    }
  `,
  lastFiveSold: `
    query LegacyLastFiveSold {
      lastFiveSold {
        ${legacyMarketplaceEventSelection}
      }
    }
  `,
  lastFiveListed: `
    query LegacyLastFiveListed {
      lastFiveListed {
        ${legacyMarketplaceEventSelection}
      }
    }
  `,
  getEventPrice: `
    query LegacyEventPrice($tokenId: String!) {
      getEventPrice(tokenId: $tokenId) {
        eventName
        tokenId
        price
        network
      }
    }
  `,
} as const;

type LegacyMarketplaceGraphQLPayload<TData> = {
  data?: TData;
  errors?: readonly LegacyMarketplaceGraphQLError[];
};

export async function fetchLegacyMarketplaceGraphQL<
  TData,
  TVariables extends Record<string, unknown> = Record<string, never>,
>({
  query,
  variables,
  timeoutMs = 10_000,
}: {
  query: string;
  variables?: TVariables;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(legacyMarketplaceEndpoints.graphQl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    const payload =
      (await response.json()) as LegacyMarketplaceGraphQLPayload<TData>;

    if (!response.ok) {
      throw new Error(
        `Legacy GraphQL returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    if (payload.errors?.length) {
      throw new LegacyMarketplaceGraphQLErrorResponse(payload.errors);
    }

    return payload.data as TData;
  } finally {
    clearTimeout(timeout);
  }
}
