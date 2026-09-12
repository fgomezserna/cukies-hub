import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSourceBalanceBindingSha256 } from './snapshot.js';
import type {
  LegacyContractArtifact,
  LegacyCutoff,
  LegacyNetworkCoverage,
  LegacySnapshotInput,
  LegacySnapshotObservation,
} from './types.js';

export const BSC_POINTS = '0x0000000000000000000000000000000000000001';
export const BSC_STAKING = '0x0000000000000000000000000000000000000002';
export const BSC_BREEDING = '0x0000000000000000000000000000000000000003';
export const BSC_OWNER = '0x0000000000000000000000000000000000000004';
export const BSC_USER = '0x0000000000000000000000000000000000000005';
export const BSC_USER_2 = '0x0000000000000000000000000000000000000006';
export const TRON_POINTS = 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe';
export const TRON_STAKING = 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA';
export const TRON_BREEDING = 'TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY';
export const TRON_OWNER = 'TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S';
export const TRON_USER = 'TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB';
export const TRON_USER_2 = 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ';
export const BSC_BLOCK_HASH = `0x${'1'.repeat(64)}`;
export const BYTECODE_HASH = `0x${'3'.repeat(64)}`;

type CoverageAmounts = {
  wallets: number;
  observed: number;
  claimedRaw: string;
  pendingRaw: string;
};

export function testCoverage(input: {
  BSC?: Partial<CoverageAmounts>;
  TRON?: Partial<CoverageAmounts>;
} = {}): LegacyNetworkCoverage[] {
  return (['BSC', 'TRON'] as const).map((network) => {
    const values = { wallets: 0, observed: 0, claimedRaw: '0', pendingRaw: '0', ...input[network] };
    const cutoffRef = `${network.toLowerCase()}-cutoff`;
    const source = (role: string, recordCount: number) => ({
      sourceId: `${network.toLowerCase()}-${role}`,
      cutoffRef,
      querySha256: 'a'.repeat(64), sourceSha256: 'b'.repeat(64),
      complete: true, recordCount,
    });
    return {
      network,
      cutoffRef,
      wallets: source('wallets', values.wallets),
      claimed: { ...source('claimed', values.observed), aggregateRaw: values.claimedRaw },
      pending: { ...source('pending', values.observed), aggregateRaw: values.pendingRaw },
    };
  });
}

export function testObservation(input: {
  network: 'BSC' | 'TRON';
  wallet: string;
  claimedRaw: string;
  pendingRaw: string;
  balanceSuffix?: string;
  snapshotId?: string;
  tokenIds?: string[];
  coverage?: LegacyNetworkCoverage[];
}): LegacySnapshotObservation {
  const coverage = input.coverage ?? testCoverage();
  const source = coverage.find((item) => item.network === input.network)!;
  const suffix = input.balanceSuffix ?? input.wallet;
  const claimedSourceBalanceId = `claimed-${suffix}`;
  const pendingSourceBalanceId = `pending-${suffix}`;
  return {
    network: input.network,
    wallet: input.wallet,
    snapshotId: input.snapshotId ?? 'final',
    claimedSourceId: source.claimed.sourceId,
    pendingSourceId: source.pending.sourceId,
    claimedSourceBalanceId,
    pendingSourceBalanceId,
    claimedSourceRowSha256: buildSourceBalanceBindingSha256({
      network: input.network, cutoffRef: source.cutoffRef, sourceId: source.claimed.sourceId,
      wallet: input.wallet, sourceBalanceId: claimedSourceBalanceId, raw: input.claimedRaw,
    }),
    pendingSourceRowSha256: buildSourceBalanceBindingSha256({
      network: input.network, cutoffRef: source.cutoffRef, sourceId: source.pending.sourceId,
      wallet: input.wallet, sourceBalanceId: pendingSourceBalanceId, raw: input.pendingRaw,
    }),
    claimedRaw: input.claimedRaw,
    pendingRaw: input.pendingRaw,
    ...(input.tokenIds ? { tokenIds: input.tokenIds } : {}),
  };
}

export function emptySnapshotInput(): LegacySnapshotInput {
  return { coverage: testCoverage(), discoveries: [], observations: [] };
}

export function stagingCutoffs(): LegacyCutoff[] {
  return [
    {
      network: 'BSC', ref: 'bsc-cutoff', chainId: 97,
      blockNumber: 12_345, blockHash: BSC_BLOCK_HASH,
    },
    {
      network: 'TRON', ref: 'tron-cutoff', tronNetwork: 'nile',
      timestampMs: 1_700_000_000_000, cursor: 'tron-cursor',
    },
  ];
}

function loadAbi(network: 'bsc' | 'tron', name: string) {
  const file = resolve(
    dirname(fileURLToPath(import.meta.url)),
    `../../../../dapp/src/lib/legacy-marketplace/abis/${network}/${name}.abi.json`,
  );
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

export function realLegacyContracts(): LegacyContractArtifact[] {
  return [
    {
      network: 'BSC', alias: 'POINTS', address: BSC_POINTS,
      abi: loadAbi('bsc', 'points'), expectedOwner: BSC_OWNER, expectedBytecodeHash: BYTECODE_HASH,
    },
    {
      network: 'BSC', alias: 'STAKING_POINTS', address: BSC_STAKING,
      abi: loadAbi('bsc', 'stakingPoints'), expectedOwner: BSC_OWNER, expectedBytecodeHash: BYTECODE_HASH,
    },
    {
      network: 'BSC', alias: 'BREEDING_POINTS', address: BSC_BREEDING,
      abi: loadAbi('bsc', 'breedingPoints'), expectedOwner: BSC_OWNER, expectedBytecodeHash: BYTECODE_HASH,
    },
    {
      network: 'TRON', alias: 'POINTS', address: TRON_POINTS,
      abi: loadAbi('tron', 'points'), expectedOwner: TRON_OWNER, expectedBytecodeHash: BYTECODE_HASH,
    },
    {
      network: 'TRON', alias: 'STAKING_POINTS', address: TRON_STAKING,
      abi: loadAbi('tron', 'stakingPoints'), expectedOwner: TRON_OWNER, expectedBytecodeHash: BYTECODE_HASH,
    },
    {
      network: 'TRON', alias: 'BREEDING_POINTS', address: TRON_BREEDING,
      abi: loadAbi('tron', 'breedingPoints'), expectedOwner: TRON_OWNER, expectedBytecodeHash: BYTECODE_HASH,
    },
  ];
}
