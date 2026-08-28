import { createPublicClient, http, type Hex } from 'viem';

import type { CompetitionConfig } from '../types';
import { CompetitionSettlementCloseError } from './settlement-close';

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

interface DrawBlockEvidence {
  readonly number: bigint;
  readonly hash: Hex | null;
  readonly timestamp: bigint;
}

export function validateCompetitionDrawBlock(input: {
  readonly endsAt: string;
  readonly configuredSeed: string;
  readonly configuredSourceBlock: bigint;
  readonly latestBlockNumber: bigint;
  readonly confirmations: number;
  readonly sourceBlock: DrawBlockEvidence;
  readonly previousBlock: DrawBlockEvidence;
}) {
  const cutoffMs = Date.parse(input.endsAt);
  if (!Number.isFinite(cutoffMs) || cutoffMs % 1_000 !== 0) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Competition end timestamp is not a whole-second UTC instant',
    );
  }
  if (!HASH_PATTERN.test(input.configuredSeed)) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Competition draw seed must be a 32-byte block hash',
    );
  }
  if (
    input.configuredSourceBlock <= BigInt(0)
    || input.sourceBlock.number !== input.configuredSourceBlock
    || input.previousBlock.number + BigInt(1) !== input.sourceBlock.number
  ) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Competition draw source blocks are not contiguous with the configured block',
    );
  }
  const confirmations = input.latestBlockNumber - input.sourceBlock.number + BigInt(1);
  if (confirmations < BigInt(input.confirmations)) {
    throw new CompetitionSettlementCloseError(
      'settlement_source_not_ready',
      `Competition draw block has only ${confirmations}/${input.confirmations} confirmations`,
    );
  }
  if (!input.sourceBlock.hash || !HASH_PATTERN.test(input.sourceBlock.hash)) {
    throw new CompetitionSettlementCloseError(
      'settlement_source_not_ready',
      'Competition draw source block has no canonical hash',
    );
  }
  const cutoffSeconds = BigInt(cutoffMs / 1_000);
  if (
    input.previousBlock.timestamp > cutoffSeconds
    || input.sourceBlock.timestamp <= cutoffSeconds
  ) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Configured draw block is not the first BSC block strictly after competition end',
    );
  }
  if (input.configuredSeed.toLowerCase() !== input.sourceBlock.hash.toLowerCase()) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Competition draw seed does not match the canonical source block hash',
    );
  }
  return input.sourceBlock.hash.toLowerCase();
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      `${name} is required for staking competition settlement`,
    );
  }
  return value;
}

export async function resolveCompetitionDrawSeed(input: {
  readonly campaign: CompetitionConfig;
  readonly environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  const chainId = input.campaign.stakingChainId;
  if (chainId !== 56 && chainId !== 97) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Staking competition draw requires BSC Mainnet or BSC Testnet',
    );
  }
  const configuredSeed = requiredEnvironment(
    environment,
    'TREASURE_HUNT_COMPETITION_DRAW_SEED',
  );
  const sourceBlockValue = requiredEnvironment(
    environment,
    'TREASURE_HUNT_COMPETITION_DRAW_SOURCE_BLOCK',
  );
  let configuredSourceBlock: bigint;
  try {
    configuredSourceBlock = BigInt(sourceBlockValue);
  } catch {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'TREASURE_HUNT_COMPETITION_DRAW_SOURCE_BLOCK must be an integer',
    );
  }
  if (configuredSourceBlock <= BigInt(0) || !HASH_PATTERN.test(configuredSeed)) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'Competition draw source block or seed has an invalid format',
    );
  }
  const confirmations = Number(environment.CHAIN_INDEXER_BSC_CONFIRMATIONS ?? '12');
  if (!Number.isSafeInteger(confirmations) || confirmations < 12 || confirmations > 10_000) {
    throw new CompetitionSettlementCloseError(
      'invalid_settlement_input',
      'CHAIN_INDEXER_BSC_CONFIRMATIONS must be an integer between 12 and 10000',
    );
  }
  const rpcUrls = (
    environment.CHAIN_INDEXER_BSC_RPC_URLS
    ?? environment.CHAIN_INDEXER_BSC_RPC_URL
    ?? environment.BSC_RPC_URL
    ?? ''
  ).split(',').map((value) => value.trim()).filter(Boolean);
  if (rpcUrls.length === 0) {
    throw new CompetitionSettlementCloseError(
      'settlement_source_not_ready',
      'No BSC RPC is configured to verify the competition draw source',
    );
  }

  let lastError: unknown = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      if (await client.getChainId() !== chainId) throw new Error('RPC chain id mismatch');
      const [latestBlockNumber, sourceBlock, previousBlock] = await Promise.all([
        client.getBlockNumber(),
        client.getBlock({ blockNumber: configuredSourceBlock }),
        client.getBlock({ blockNumber: configuredSourceBlock - BigInt(1) }),
      ]);
      return validateCompetitionDrawBlock({
        endsAt: input.campaign.endsAt,
        configuredSeed,
        configuredSourceBlock,
        latestBlockNumber,
        confirmations,
        sourceBlock,
        previousBlock,
      });
    } catch (error) {
      if (error instanceof CompetitionSettlementCloseError) throw error;
      lastError = error;
    }
  }
  throw new CompetitionSettlementCloseError(
    'settlement_source_not_ready',
    `No BSC RPC could verify the competition draw source (${lastError instanceof Error ? lastError.message : 'unknown error'})`,
  );
}
