import React from 'react';
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRuntimeProvider } from '@/providers/app-runtime-provider';

const RUNTIME_STATUS_BODY = {
  status: 'ok',
  data: {
    checkedAt: '2026-09-09T00:00:00.000Z',
    services: {
      indexer: { status: 'ready', checkedAt: '2026-09-09T00:00:00.000Z', lastSuccessAt: null, code: null },
      master: { status: 'ready', checkedAt: '2026-09-09T00:00:00.000Z', lastSuccessAt: null, code: null },
      credits: { status: 'ready', checkedAt: '2026-09-09T00:00:00.000Z', lastSuccessAt: null, code: null },
    },
  },
};

function RuntimeTestWrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    defaultOptions: { queries: { retryDelay: 1 } },
  }));

  return (
    <QueryClientProvider client={client}>
      <AppRuntimeProvider>{children}</AppRuntimeProvider>
    </QueryClientProvider>
  );
}

export function renderWithRuntime(ui: React.ReactElement, options?: RenderOptions): RenderResult {
  const delegatedFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/api/economy/v1/runtime-status')) {
      return {
        ok: true,
        status: 200,
        json: async () => RUNTIME_STATUS_BODY,
      } as Response;
    }
    return delegatedFetch(input, init);
  }) as typeof global.fetch;

  return rtlRender(ui, { ...options, wrapper: RuntimeTestWrapper });
}
