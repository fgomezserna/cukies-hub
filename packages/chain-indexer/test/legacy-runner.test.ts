import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestLegacyChainsOnce, isLegacyCycleIncomplete } from '../src/legacy/cli.js';
import type { IndexerConfig } from '../src/types.js';

const config: IndexerConfig = {
  runtimeScope: 'legacy',
  mongoUrl: 'mongodb://unused',
  dbName: 'legacy-test',
  chains: ['BSC', 'TRON'],
  bscRpcUrl: 'https://bsc.invalid',
  bscRpcUrls: ['https://bsc.invalid'],
  bscExpectedChainId: 56,
  tronApiBaseUrl: 'https://tron.test/v1',
  bscStartBlock: 0,
  tronStartTimestampMs: 0,
  bscConfirmations: 12,
  maxBlockRange: 5_001,
  minBlockRange: 1,
  tronPageLimit: 200,
  tronRequestDelayMs: 0,
  pollIntervalMs: 1_000,
  projectBatchSize: 100,
  verifiedBscContracts: {},
  bscWindowsPerCycle: 3,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('legacy cycle keeps bounded BSC catch-up running while TRON is rate-limited', async () => {
  let bscRuns = 0;
  const tronStarted = deferred();
  const bscFinished = deferred();

  const result = await ingestLegacyChainsOnce({} as never, config, {
    ingestBsc: async () => {
      bscRuns += 1;
      if (bscRuns === 1) await tronStarted.promise;
      if (bscRuns === 3) bscFinished.resolve();
      return {
        outcome: 'complete' as const,
        inserted: 0,
        ranges: 1,
        errors: [],
        failedContractAliases: [],
        safeBlock: bscRuns,
        safeBlockHash: `0x${String(bscRuns).padStart(64, '0')}`,
        rpcHosts: [],
        latestBlockRpcHost: 'test',
        rpcWarnings: [{
          cursorId: `BSC:TOKEN:Transfer:${bscRuns}`,
          rpcHost: 'fallback.test',
          reason: 'transient' as const,
          error: 'reason=transient code=ECONNRESET',
          fromBlock: bscRuns,
          toBlock: bscRuns,
          range: 1,
          retries: 0,
        }],
      };
    },
    ingestTron: async () => {
      tronStarted.resolve();
      // Represents a shared Retry-After/slow page. BSC must consume all of its
      // bounded windows while this promise remains pending.
      await bscFinished.promise;
      return { inserted: 0, pages: 0, rateLimited: true, errors: [] };
    },
  });

  assert.equal(bscRuns, 3);
  assert.equal(result.bsc.ranges, 3);
  assert.equal(result.bsc.rpcWarnings?.length, 3);
  assert.equal(result.tron.rateLimited, true);
  assert.equal(isLegacyCycleIncomplete(result.bsc, result.tron), true);
});

test('legacy cycle only reports complete when neither chain is degraded', () => {
  assert.equal(isLegacyCycleIncomplete(
    { outcome: 'complete', inserted: 0, ranges: 1 },
    { inserted: 0, pages: 1, rateLimited: false, errors: [] },
  ), false);
  assert.equal(isLegacyCycleIncomplete(
    { outcome: 'complete', inserted: 0, ranges: 1 },
    { inserted: 0, pages: 0, rateLimited: true, errors: [] },
  ), true);
});
