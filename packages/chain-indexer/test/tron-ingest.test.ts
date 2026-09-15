import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestTronOnce } from '../src/chains/tron.js';
import type { ChainCursor, ContractEventConfig, IndexerConfig } from '../src/types.js';

const config: IndexerConfig = {
  mongoUrl: 'mongodb://unused',
  dbName: 'test',
  chains: ['TRON'],
  bscRpcUrl: 'https://bsc.invalid',
  bscRpcUrls: ['https://bsc.invalid'],
  bscExpectedChainId: 56,
  tronApiBaseUrl: 'https://tron.test/v1',
  bscStartBlock: 0,
  tronStartTimestampMs: 1_000,
  bscConfirmations: 12,
  maxBlockRange: 5001,
  minBlockRange: 1,
  tronPageLimit: 2,
  tronRequestDelayMs: 0,
  pollIntervalMs: 1_000,
  projectBatchSize: 100,
  contractAliases: ['REFERRALS'],
  verifiedBscContracts: {},
};

function cursorStore(options: { failCursorUpdates?: number } = {}) {
  const cursors = new Map<string, ChainCursor>();
  const updates: Array<{ config: ContractEventConfig; update: Partial<ChainCursor> }> = [];
  const events: unknown[][] = [];
  let remainingCursorFailures = options.failCursorUpdates ?? 0;
  const store = {
    getCursor: async (event: ContractEventConfig) => cursors.get(
      `${event.contractAlias}:${event.eventName}`,
    ) ?? null,
    updateCursor: async (event: ContractEventConfig, update: Partial<ChainCursor>) => {
      if (remainingCursorFailures > 0) {
        remainingCursorFailures -= 1;
        throw new Error('cursor update failed');
      }
      updates.push({ config: event, update });
      const id = `${event.contractAlias}:${event.eventName}`;
      cursors.set(id, {
        _id: id,
        chain: event.chain,
        contractAlias: event.contractAlias,
        contractAddress: event.contractAddress,
        eventName: event.eventName,
        updatedAt: new Date(),
        ...update,
      });
    },
    upsertEvents: async (batch: unknown[]) => {
      events.push(batch);
      return { inserted: batch.length };
    },
  };
  return { store, cursors, updates, events };
}

function event(transactionId: string, timestamp: number) {
  return {
    block_number: 10,
    block_timestamp: timestamp,
    contract_address: 'TZ4QM9RF1pxfoxnPY8UGAQEEwq5SDoZXk4',
    event_name: 'OwnershipRenounced',
    transaction_id: transactionId,
    event_index: 0,
    result: {},
  };
}

test('retries TronGrid 429 with Retry-After and only advances the cursor after success', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = cursorStore();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return new Response('', {
      status: 429,
      headers: { 'Retry-After': '0' },
    });
    return new Response(JSON.stringify({ data: [], meta: { fingerprint: 'next-page' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await ingestTronOnce(fixture.store as never, config);
    assert.equal(result.rateLimited, false);
    assert.equal(result.errors.length, 0);
    assert.equal(calls, 3); // one retry, then the second configured event
    assert.equal(fixture.updates[0]?.update.fingerprint, 'next-page');
    assert.equal(fixture.updates[0]?.update.nextTimestampMs, 1_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resumes a durable TronGrid fingerprint on the next invocation', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = cursorStore();
  const urls: string[] = [];
  let invocation = 0;
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    const firstPage = invocation === 0;
    return new Response(JSON.stringify({
      data: firstPage ? [] : [event('tx-page-2', 2_000)],
      meta: firstPage ? { fingerprint: 'page-2' } : {},
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await ingestTronOnce(fixture.store as never, config);
    invocation = 1;
    const result = await ingestTronOnce(fixture.store as never, config);
    assert.equal(result.errors.length, 0);
    assert.ok(urls.some((url) => url.includes('fingerprint=page-2')));
    assert.equal(fixture.events.at(-1)?.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the final Retry-After after exhausted 429s and reports an incomplete cursor', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = cursorStore();
  const callTimes: number[] = [];
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    callTimes.push(Date.now());
    if (calls <= 4) return new Response('', {
      status: 429,
      headers: { 'Retry-After': calls === 4 ? '0.02' : '0' },
    });
    return new Response(JSON.stringify({ data: [], meta: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const first = await ingestTronOnce(fixture.store as never, config);
    assert.equal(first.rateLimited, true);
    assert.equal(first.errors.length, 1);
    assert.match(first.errors[0]?.error ?? '', /agotar reintentos; cursor conservado/);
    assert.equal(fixture.updates.length, 0);

    const resumedAt = Date.now();
    const second = await ingestTronOnce(fixture.store as never, config);
    assert.equal(second.rateLimited, false);
    assert.equal(second.errors.length, 0);
    assert.ok((callTimes[4] ?? 0) - resumedAt >= 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deduplicates a TronGrid page and replays it after cursor persistence fails', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = cursorStore({ failCursorUpdates: 1 });
  const page = [event('tx-b', 2_000), event('tx-a', 2_000), event('tx-a', 2_000)];
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: page, meta: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  try {
    const first = await ingestTronOnce(fixture.store as never, config);
    assert.equal(first.errors.length, 1);
    assert.match(first.errors[0]?.error ?? '', /cursor update failed/);
    assert.equal(fixture.events[0]?.length, 2);

    const second = await ingestTronOnce(fixture.store as never, config);
    assert.equal(second.errors.length, 0);
    const initialIds = fixture.events[0]?.map((item) => (item as { _id: string })._id);
    const replayIds = fixture.events[2]?.map((item) => (item as { _id: string })._id);
    assert.deepEqual(replayIds, initialIds);
    assert.equal(new Set(replayIds).size, 2);
    assert.equal(fixture.updates.at(-2)?.update.nextTimestampMs, 2_001);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('namespaces events emitted by the legacy TRON runtime', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = cursorStore();
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [event('legacy-tx', 2_000)],
    meta: {},
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  try {
    const result = await ingestTronOnce(fixture.store as never, {
      ...config,
      runtimeScope: 'legacy',
      tronApiBaseUrl: 'https://api.trongrid.io/v1',
    });
    assert.ok(result.errors.every(({ cursorId }) => cursorId.startsWith('legacy:TRON:')));
    const eventIds = fixture.events.flat().map((item) => (item as { _id: string })._id);
    assert.ok(eventIds.length > 0);
    assert.ok(eventIds.every((eventId) => eventId.startsWith('legacy:TRON:')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('restarts the same timestamp safely when TronGrid rejects a stored fingerprint', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = cursorStore();
  const urls: string[] = [];
  let calls = 0;
  globalThis.fetch = (async (input) => {
    calls += 1;
    const url = String(input);
    urls.push(url);
    if (calls === 1) {
      return new Response(JSON.stringify({ data: [], meta: { fingerprint: 'stale-page' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('fingerprint=stale-page')) return new Response('', { status: 400 });
    return new Response(JSON.stringify({ data: [event('tx-recovered', 1_000)], meta: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await ingestTronOnce(fixture.store as never, config);
    const result = await ingestTronOnce(fixture.store as never, config);
    assert.equal(result.errors.length, 0);
    assert.ok(urls.some((url) => url.includes('fingerprint=stale-page')));
    assert.ok(urls.some((url) => url.includes('min_block_timestamp=1000')
      && !url.includes('fingerprint=')));
    assert.ok(fixture.events.some((batch) => batch.some((item) =>
      (item as { txHash?: string }).txHash === 'tx-recovered')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
