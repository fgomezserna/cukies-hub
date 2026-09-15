import { bsc, bscTestnet } from 'viem/chains';
import {
  createPublicClient,
  http,
  keccak256,
  type Address,
  type Hash,
} from 'viem';

import { bscEventAbis } from '../config/abis.js';
import { getContractEventConfigs } from '../config/contracts.js';
import { LEGACY_BSC_CONTRACT_ALIASES } from '../legacy/contracts.js';
import { normalizeDomainEvent } from '../normalize.js';
import type {
  ChainEvent,
  IndexerConfig,
  VerifiedBscContractIdentity,
} from '../types.js';
import { now, toJsonRecord } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

type BscClient = ReturnType<typeof createPublicClient>;
export type BscRpcClient = {
  url: string;
  host: string;
  client: BscClient;
  validatedChainId?: number;
};

export interface BscIngestDependencies {
  readonly rpcClients?: BscRpcClient[];
}

export type BscIngestError = {
  cursorId: string;
  chain: 'BSC';
  contractAlias: string;
  eventName: string;
  error: string;
};

type CanonicalBlockHeader = {
  number: bigint;
  hash: Hash | null;
  timestamp: bigint;
};

export async function findGreatestBscBlockBeforeTimestamp(input: {
  cutoffTimestampMs: number;
  safeBlockNumber: number;
  getBlock: (blockNumber: number) => Promise<CanonicalBlockHeader>;
}) {
  if (
    !Number.isSafeInteger(input.cutoffTimestampMs)
    || input.cutoffTimestampMs <= 0
    || !Number.isSafeInteger(input.safeBlockNumber)
    || input.safeBlockNumber < 1
  ) throw new Error('Parametros invalidos para resolver el bloque efectivo del cutoff.');
  const safe = await input.getBlock(input.safeBlockNumber);
  if (safe.timestamp * BigInt(1_000) < BigInt(input.cutoffTimestampMs)) {
    throw new Error('El head confirmado aun no cubre el cutoff solicitado.');
  }
  let low = 0;
  let high = input.safeBlockNumber;
  let candidate = -1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const block = middle === input.safeBlockNumber ? safe : await input.getBlock(middle);
    if (block.timestamp * BigInt(1_000) < BigInt(input.cutoffTimestampMs)) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (candidate < 0) throw new Error('No existe un bloque BSC anterior al cutoff.');
  const block = await input.getBlock(candidate);
  const successor = candidate + 1 === input.safeBlockNumber
    ? safe
    : await input.getBlock(candidate + 1);
  const timestampMs = Number(block.timestamp * BigInt(1_000));
  const successorTimestampMs = Number(successor.timestamp * BigInt(1_000));
  if (
    block.number !== BigInt(candidate)
    || successor.number !== BigInt(candidate + 1)
    || !block.hash
    || !successor.hash
    || !/^0x[0-9a-f]{64}$/i.test(block.hash)
    || !/^0x[0-9a-f]{64}$/i.test(successor.hash)
    || timestampMs >= input.cutoffTimestampMs
    || successorTimestampMs < input.cutoffTimestampMs
  ) throw new Error('El RPC no demostro un limite canonico contiguo para el cutoff.');
  return {
    blockNumber: candidate,
    blockHash: block.hash.toLowerCase(),
    blockTimestamp: new Date(timestampMs),
    successorBlockNumber: candidate + 1,
    successorBlockHash: successor.hash.toLowerCase(),
    successorBlockTimestamp: new Date(successorTimestampMs),
  };
}

function rpcHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-rpc-url';
  }
}

function createBscRpcClients(urls: string[], expectedChainId: 56 | 97) {
  return urls.map((url) => ({
    url,
    host: rpcHost(url),
    client: createPublicClient({
      chain: expectedChainId === 97 ? bscTestnet : bsc,
      transport: http(url),
    }),
  }));
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  return error.message;
}

type BscRangeAdjustmentReason =
  | 'response-too-large'
  | 'timeout'
  | 'success-hysteresis'
  | 'query-success';
type BscRangeFailureReason = 'response-too-large' | 'timeout';

type BscRpcFailure = {
  host: string;
  error: unknown;
};

type BscFallbackError = Error & {
  rpcFailures?: BscRpcFailure[];
};

function bscErrorObjects(error: unknown) {
  const objects: Record<string, unknown>[] = [];
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0 && objects.length < 8) {
    const candidate = pending.shift();
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
    seen.add(candidate);
    const record = candidate as Record<string, unknown>;
    objects.push(record);
    pending.push(record.cause, record.error, record.data, record.response);
  }
  return objects;
}

function bscErrorSearchText(error: unknown) {
  const values: string[] = [];
  if (typeof error === 'string') values.push(error);
  for (const candidate of bscErrorObjects(error)) {
    for (const key of ['message', 'shortMessage', 'details'] as const) {
      if (typeof candidate[key] === 'string') values.push(candidate[key] as string);
    }
  }
  return values.join(' | ').toLowerCase();
}

function errorStatus(error: unknown) {
  for (const candidate of bscErrorObjects(error)) {
    for (const value of [candidate.status, candidate.statusCode]) {
      if (typeof value === 'number' && Number.isInteger(value)) return value;
      if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value);
    }
  }
  return undefined;
}

function isAuthOrForbiddenError(error: unknown) {
  const status = errorStatus(error);
  if (status === 401 || status === 403) return true;
  const message = bscErrorSearchText(error);
  return /(?:\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid api key|authentication)/i.test(message);
}

function isTransientRpcError(error: unknown) {
  const status = errorStatus(error);
  if (status === 429 || (status !== undefined && status >= 500 && status <= 599)) return true;
  const message = bscErrorSearchText(error);
  return /(?:\b429\b|too many requests|rate limit(?:ed)?|temporarily unavailable|service unavailable|bad gateway|gateway timeout|http\s+5\d\d|status(?: code)?\s+5\d\d)/i.test(message);
}

function classifyBscRangeAdjustment(error: unknown): BscRangeFailureReason | null {
  if (isAuthOrForbiddenError(error)) return null;

  const fallback = error as BscFallbackError;
  if (Array.isArray(fallback.rpcFailures) && fallback.rpcFailures.length > 0) {
    const classifications = fallback.rpcFailures.map(({ error: failure }) =>
      classifyBscRangeAdjustment(failure));
    // A fallback containing an auth/chain/data failure must stay visible and
    // must never be reclassified as a range problem. Only all-range (or
    // timeout/range mixed) failures may drive adaptive splitting.
    if (classifications.some((value) => value === null)) return null;
    const timeout = classifications.some((value) => value === 'timeout');
    const responseTooLarge = classifications.some((value) => value === 'response-too-large');
    return timeout ? 'timeout' : responseTooLarge ? 'response-too-large' : null;
  }

  const message = bscErrorSearchText(error);
  const status = errorStatus(error);
  // A provider can include generic words such as "limit" in a contract/data
  // failure. Keep those failures visible instead of shrinking a healthy
  // range. Explicit timeout text is handled below before transient statuses.
  if (/(execution reverted|reverted|abi|decode|invalid argument|invalid params|contract function)/i.test(message)) {
    return null;
  }
  const errorCodes = bscErrorObjects(error)
    .map((candidate) => candidate.code)
    .filter((value): value is string => typeof value === 'string');
  const explicitTimeout = message.includes('timeout')
    || message.includes('timed out')
    || message.includes('etimedout')
    || message.includes('request timed out')
    || errorCodes.some((code) => /^(?:ETIMEDOUT|ESOCKETTIMEDOUT|ECONNABORTED|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT)$/i.test(code))
    || (typeof (error as { name?: unknown })?.name === 'string'
      && /timeout/i.test(String((error as { name?: unknown }).name)));
  if (explicitTimeout) return 'timeout';
  // HTTP 429/5xx are transient. They can be retried by the caller, but they
  // are not evidence that this range is too large.
  if (status === 401 || status === 403 || isTransientRpcError(error)) return null;
  if (
    message.includes('limit exceeded')
    || message.includes('request exceeds defined limit')
    || message.includes('response too large')
    || message.includes('result set too large')
    || message.includes('too many results')
    || message.includes('block range too large')
    || message.includes('eth_getlogs') && message.includes('limit')
    || message.includes('exceeds the maximum')
  ) return 'response-too-large';
  return null;
}

function bscRangeBounds(config: IndexerConfig) {
  const max = config.maxBlockRange;
  const min = config.minBlockRange ?? 1;
  if (!Number.isSafeInteger(max) || max < 1 || max > 5_001) {
    throw new Error('CHAIN_INDEXER_MAX_BLOCK_RANGE debe estar entre 1 y 5001.');
  }
  if (!Number.isSafeInteger(min) || min < 1 || min > max) {
    throw new Error(
      'CHAIN_INDEXER_MIN_BLOCK_RANGE debe ser un entero positivo no mayor que CHAIN_INDEXER_MAX_BLOCK_RANGE.',
    );
  }
  return { min, max };
}

function logBscRangeAdjustment(input: {
  cursorId: string;
  fromBlock: number;
  toBlock: number;
  range: number;
  reason: BscRangeAdjustmentReason;
  adjustment: string;
  retries: number;
  nextCursor?: number;
}) {
  console.log('[chain-indexer] bsc adaptive range', {
    cursor: input.cursorId,
    from: input.fromBlock,
    to: input.toBlock,
    range: input.range,
    reason: input.reason,
    adjustment: input.adjustment,
    retries: input.retries,
    ...(input.nextCursor !== undefined ? { nextCursor: input.nextCursor } : {}),
  });
}

async function withBscRpcFallback<T>(
  rpcClients: BscRpcClient[],
  expectedChainId: 56 | 97,
  operation: (rpc: BscRpcClient) => Promise<T>,
) {
  const failures: BscRpcFailure[] = [];

  for (const rpc of rpcClients) {
    try {
      if (rpc.validatedChainId !== expectedChainId) {
        const actualChainId = await rpc.client.getChainId();
        if (actualChainId !== expectedChainId) {
          throw new Error(
            `chainId inesperado: esperado ${expectedChainId}, recibido ${actualChainId}`,
          );
        }
        rpc.validatedChainId = actualChainId;
      }

      return {
        value: await operation(rpc),
        rpc,
      };
    } catch (error) {
      failures.push({ host: rpc.host, error });
    }
  }

  const aggregate = new Error(
    `Todos los RPC BSC fallaron: ${failures
      .map(({ host, error }) => `${host}: ${errorMessage(error) || String(error)}`)
      .join(' | ')}`,
  ) as BscFallbackError;
  aggregate.rpcFailures = failures;
  throw aggregate;
}

function rpcClientsWithPreferredFirst(
  preferred: BscRpcClient,
  rpcClients: BscRpcClient[],
) {
  return [preferred, ...rpcClients.filter((rpc) => rpc !== preferred)];
}

async function getBlockTimestampMs(input: {
  blockNumber: number;
  preferredRpc: BscRpcClient;
  rpcClients: BscRpcClient[];
  expectedChainId: 56 | 97;
  timestampCache: Map<number, number>;
}) {
  const cached = input.timestampCache.get(input.blockNumber);
  if (cached !== undefined) return cached;

  const { value: block } = await withBscRpcFallback(
    rpcClientsWithPreferredFirst(input.preferredRpc, input.rpcClients),
    input.expectedChainId,
    (rpc) => rpc.client.getBlock({ blockNumber: BigInt(input.blockNumber) }),
  );
  const timestampMsBigInt = block.timestamp * BigInt(1_000);
  if (timestampMsBigInt < BigInt(0) || timestampMsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Timestamp BSC fuera de rango seguro para el bloque ${input.blockNumber}`);
  }
  const timestampMs = Number(timestampMsBigInt);
  input.timestampCache.set(input.blockNumber, timestampMs);
  return timestampMs;
}

async function verifyBscContractIdentity(input: {
  identity: VerifiedBscContractIdentity;
  rpcClients: BscRpcClient[];
  expectedChainId: 56 | 97;
}) {
  if (input.identity.chainId !== input.expectedChainId) {
    throw new Error(
      `${input.identity.alias} fue configurado para chain ${input.identity.chainId}, no ${input.expectedChainId}.`,
    );
  }
  const { value, rpc } = await withBscRpcFallback(
    input.rpcClients,
    input.expectedChainId,
    async (candidate) => {
      const [receipt, bytecode] = await Promise.all([
        candidate.client.getTransactionReceipt({
          hash: input.identity.deploymentTxHash as Hash,
        }),
        candidate.client.getBytecode({ address: input.identity.address as Address }),
      ]);
      const poolPeriodDurationSeconds = input.identity.alias === 'CUKIE_POOL_NFT_VAULT'
        ? Number(await candidate.client.readContract({
            address: input.identity.address as Address,
            abi: [{ type: 'function', name: 'PERIOD_DURATION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
            functionName: 'PERIOD_DURATION',
          }))
        : undefined;
      return { receipt, bytecode, poolPeriodDurationSeconds };
    },
  );
  const receiptAddress = value.receipt.contractAddress?.toLowerCase();
  const receiptBlock = Number(value.receipt.blockNumber);
  if (
    value.receipt.status !== 'success'
    || receiptAddress !== input.identity.address
    || receiptBlock !== input.identity.deploymentBlock
  ) {
    throw new Error(
      `${input.identity.alias} no coincide con su receipt de despliegue configurado.`,
    );
  }
  if (!value.bytecode || value.bytecode === '0x') {
    throw new Error(`${input.identity.alias} no tiene bytecode runtime.`);
  }
  const runtimeCodeHash = keccak256(value.bytecode).toLowerCase();
  if (runtimeCodeHash !== input.identity.runtimeCodeHash) {
    throw new Error(`${input.identity.alias} no coincide con el runtimeCodeHash configurado.`);
  }
  const duration = value.poolPeriodDurationSeconds;
  if (duration !== undefined && duration !== 86_400
    && !(input.expectedChainId === 97 && (duration === 1800 || duration === 3600))) {
    throw new Error('Cukie Pool tiene una duracion no permitida para esta red.');
  }
  return {
    identity: input.identity,
    poolPeriodDurationSeconds: duration,
    verifiedAt: now(),
    rpcHost: rpc.host,
  };
}

async function getLogsWithFallback(
  client: BscClient,
  params: {
    address: Address;
    event: (typeof bscEventAbis)[keyof typeof bscEventAbis];
  },
  fromBlock: number,
  toBlock: number,
): Promise<any[]> {
  return client.getLogs({
    ...params,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });
}

export async function ingestBscOnce(
  store: IndexerStore,
  config: IndexerConfig,
  dependencies: BscIngestDependencies = {},
) {
  if (!config.chains.includes('BSC')) return { inserted: 0, ranges: 0 };

  const { min: minBlockRange, max: maxBlockRange } = bscRangeBounds(config);

  const rpcClients = dependencies.rpcClients ?? createBscRpcClients(
    config.bscRpcUrls.length > 0 ? config.bscRpcUrls : [config.bscRpcUrl],
    config.bscExpectedChainId,
  );

  const { value: latestBlockValue, rpc: latestBlockRpc } = await withBscRpcFallback(
    rpcClients,
    config.bscExpectedChainId,
    (rpc) => rpc.client.getBlockNumber(),
  );
  const latestBlock = Number(latestBlockValue);
  const safeBlock = Math.max(0, latestBlock - config.bscConfirmations);
  const contractEvents = getContractEventConfigs(['BSC'], {
    tokenAddress: config.tokenAddress,
    ukiTokenAddress: config.ukiTokenAddress,
    tokenV2Address: config.tokenV2Address,
    marketplaceAddress: config.marketplaceAddress,
    ukiMarketplaceAddress: config.ukiMarketplaceAddress,
    bridgeAddress: config.bridgeAddress,
    bridgeEndpointAddress: config.bridgeEndpointAddress,
    presaleAddress: config.presaleAddress,
    ukiStakingAddress: config.ukiStakingAddress,
    vestingVaultAddress: config.vestingVaultAddress,
    rewardsDistributorAddress: config.rewardsDistributorAddress,
    cukieMasterNftVaultAddress: config.cukieMasterNftVaultAddress,
    cukiePoolNftVaultAddress: config.cukiePoolNftVaultAddress,
    contractAliases: config.contractAliases,
  });
  const timestampCache = new Map<number, number>();
  const { value: safeHead, rpc: safeHeadRpc } = await withBscRpcFallback(
    rpcClientsWithPreferredFirst(latestBlockRpc, rpcClients),
    config.bscExpectedChainId,
    (rpc) => rpc.client.getBlock({ blockNumber: BigInt(safeBlock) }),
  );
  if (!safeHead.hash || !/^0x[0-9a-f]{64}$/i.test(safeHead.hash)) {
    throw new Error(`El bloque seguro BSC ${safeBlock} no tiene hash canonico.`);
  }
  const safeBlockHash = safeHead.hash.toLowerCase();
  const safeTimestampMsBigInt = safeHead.timestamp * BigInt(1_000);
  if (
    safeTimestampMsBigInt < BigInt(0)
    || safeTimestampMsBigInt > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(`Timestamp BSC fuera de rango seguro para el bloque ${safeBlock}`);
  }
  const safeBlockTimestampMs = Number(safeTimestampMsBigInt);
  timestampCache.set(safeBlock, safeBlockTimestampMs);
  let inserted = 0;
  let ranges = 0;
  let allCursorsCoverSafeBlock = true;
  const errors: BscIngestError[] = [];
  const failedContractAliases = new Set<string>();
  const markAllConfiguredAliasesFailed = () => {
    for (const contractEvent of contractEvents) {
      failedContractAliases.add(contractEvent.contractAlias);
    }
  };
  let unresolvedCutoffs: Date[] = [];
  try {
    unresolvedCutoffs = typeof store.listUnresolvedCompetitionCreditCutoffs === 'function'
      ? await store.listUnresolvedCompetitionCreditCutoffs(new Date(safeBlockTimestampMs), 32)
      : [];
  } catch (error) {
    errors.push({
      cursorId: 'BSC:COMPETITION_CREDIT_CUTOFF:resolve',
      chain: 'BSC',
      contractAlias: 'COMPETITION_CREDIT_CUTOFF',
      eventName: 'resolve',
      error: errorMessage(error),
    });
    allCursorsCoverSafeBlock = false;
    markAllConfiguredAliasesFailed();
  }
  for (const cutoff of unresolvedCutoffs) {
    try {
      const evidence = await findGreatestBscBlockBeforeTimestamp({
        cutoffTimestampMs: cutoff.getTime(),
        safeBlockNumber: safeBlock,
        getBlock: async (blockNumber) => {
          const { value } = await withBscRpcFallback(
            rpcClientsWithPreferredFirst(safeHeadRpc, rpcClients),
            config.bscExpectedChainId,
            (rpc) => rpc.client.getBlock({ blockNumber: BigInt(blockNumber) }),
          );
          return value;
        },
      });
      await store.upsertCompetitionCreditCutoffBlock({
        cutoff,
        chainId: config.bscExpectedChainId,
        ...evidence,
        safeBlockNumber: safeBlock,
        safeBlockHash,
        resolvedAt: now(),
      });
    } catch (error) {
      errors.push({
        cursorId: `BSC:COMPETITION_CREDIT_CUTOFF:${cutoff.toISOString()}`,
        chain: 'BSC',
        contractAlias: 'COMPETITION_CREDIT_CUTOFF',
        eventName: 'resolve',
        error: errorMessage(error),
      });
      allCursorsCoverSafeBlock = false;
      markAllConfiguredAliasesFailed();
    }
  }
  const verifiedContracts = new Map<string, Awaited<
    ReturnType<typeof verifyBscContractIdentity>
  >>();
  const identityErrors = new Map<string, string>();
  const getVerifiedContract = async (alias: string) => {
    const identity = config.verifiedBscContracts[alias as keyof typeof config.verifiedBscContracts];
    if (!identity) return undefined;
    const verified = verifiedContracts.get(alias);
    if (verified) return verified;
    const previousError = identityErrors.get(alias);
    if (previousError) throw new Error(previousError);
    try {
      const result = await verifyBscContractIdentity({
        identity,
        rpcClients: rpcClientsWithPreferredFirst(safeHeadRpc, rpcClients),
        expectedChainId: config.bscExpectedChainId,
      });
      verifiedContracts.set(alias, result);
      return result;
    } catch (error) {
      const message = errorMessage(error);
      identityErrors.set(alias, message);
      throw error;
    }
  };

  for (const contractEvent of contractEvents) {
    await (async () => {
    const verified = await getVerifiedContract(contractEvent.contractAlias);
    const cursor = await store.getCursor(contractEvent);
    const cursorHasCoverageOrigin =
      Number.isSafeInteger(cursor?.processedFromBlock) &&
      Number(cursor?.processedFromBlock) >= 0 &&
      Number.isSafeInteger(cursor?.processedFromTimestampMs) &&
      Number(cursor?.processedFromTimestampMs) >= 0;
    const configuredStartBlock = config.runtimeScope === 'legacy'
      ? config.legacyStartBlocks?.[contractEvent.contractAlias]
      : contractEvent.contractAlias === 'UKI_STAKING'
      ? config.ukiStakingStartBlock
      : contractEvent.contractAlias === 'UKI_TOKEN'
        ? config.ukiTokenStartBlock ?? config.bscStartBlock
      : contractEvent.contractAlias === 'PRESALE'
          ? config.presaleStartBlock ?? config.bscStartBlock
      : contractEvent.contractAlias === 'VESTING_VAULT'
        ? config.vestingVaultStartBlock
        : contractEvent.contractAlias === 'REWARDS_DISTRIBUTOR'
          ? config.rewardsDistributorStartBlock
          : contractEvent.contractAlias === 'TOKEN'
            ? config.tokenStartBlock
            : contractEvent.contractAlias === 'TOKEN_V2'
              ? config.tokenV2StartBlock
              : contractEvent.contractAlias === 'MARKETPLACE'
                ? config.marketplaceStartBlock
                : contractEvent.contractAlias === 'UKI_MARKETPLACE'
                  ? config.ukiMarketplaceStartBlock
                : contractEvent.contractAlias === 'BRIDGE'
                  ? config.bridgeStartBlock
                  : contractEvent.contractAlias === 'BRIDGE_ENDPOINT'
                    ? config.bridgeEndpointStartBlock ?? config.bscStartBlock
                  : contractEvent.contractAlias === 'CUKIE_MASTER_NFT_VAULT'
                    ? config.cukieMasterNftVaultStartBlock
                    : contractEvent.contractAlias === 'CUKIE_POOL_NFT_VAULT'
                      ? config.cukiePoolNftVaultStartBlock
                  : config.bscStartBlock;
    if (config.runtimeScope === 'legacy') {
      if (!LEGACY_BSC_CONTRACT_ALIASES.includes(contractEvent.contractAlias as typeof LEGACY_BSC_CONTRACT_ALIASES[number])) {
        throw new Error(`${contractEvent.contractAlias} no pertenece al perímetro BSC legacy.`);
      }
      if (configuredStartBlock === undefined || !Number.isSafeInteger(configuredStartBlock) || configuredStartBlock < 0) {
        throw new Error(`${contractEvent.contractAlias} legacy exige un bloque inicial explícito no negativo.`);
      }
    }
    if (
      verified
      && cursor
      && (
        !cursorHasCoverageOrigin
        || Number(cursor.processedFromBlock) !== verified.identity.startBlock
      )
    ) {
      throw new Error(
        `${contractEvent.contractAlias}:${contractEvent.eventName} no demuestra cobertura desde el bloque de despliegue verificado.`,
      );
    }
    const verifiedCursorFields = verified
      ? {
          bootstrapStatus: 'verified' as const,
          bootstrapStartBlock: verified.identity.startBlock,
          bootstrapVerifiedAt: verified.verifiedAt,
          verifiedChainId: verified.identity.chainId,
          contractCodeHash: verified.identity.runtimeCodeHash,
          contractDeploymentBlock: verified.identity.deploymentBlock,
          contractDeploymentTxHash: verified.identity.deploymentTxHash,
          contractConfigHash: verified.identity.configHash,
          ...(verified.poolPeriodDurationSeconds !== undefined
            ? { poolPeriodDurationSeconds: verified.poolPeriodDurationSeconds } : {}),
        }
      : {};
    const fromBlock = cursor?.nextBlock
      ?? (config.runtimeScope === 'legacy'
        ? configuredStartBlock!
        : configuredStartBlock !== undefined && configuredStartBlock > 0
          ? configuredStartBlock
          : safeBlock);

    if (fromBlock > safeBlock) {
      const processedThroughTimestampMs = await getBlockTimestampMs({
        blockNumber: safeBlock,
        preferredRpc: latestBlockRpc,
        rpcClients,
        expectedChainId: config.bscExpectedChainId,
        timestampCache,
      });
      await store.updateCursor(contractEvent, {
        ...verifiedCursorFields,
        nextBlock: fromBlock,
        safeBlock,
        processedThroughBlock: safeBlock,
        processedThroughTimestampMs,
        ...(cursorHasCoverageOrigin
          ? {
              processedFromBlock: cursor?.processedFromBlock,
              processedFromTimestampMs: cursor?.processedFromTimestampMs,
            }
          : {}),
      });
      return;
    }

    // Adaptive query range state is scoped to this exact cursor (contract +
    // event). The logical window remains maxBlockRange blocks so all event
    // cursors that start together also finish together. Oversized windows are
    // consumed through contiguous smaller queries and only then committed.
    // Older cursors have no fields and start at the configured maximum.
    const adaptiveCursorEnabled = config.minBlockRange !== undefined
      || cursor?.adaptiveRange !== undefined
      || cursor?.adaptiveSuccesses !== undefined;
    const storedAdaptiveRange = Number.isSafeInteger(cursor?.adaptiveRange)
      ? Number(cursor?.adaptiveRange)
      : maxBlockRange;
    let adaptiveRange = Math.min(maxBlockRange, Math.max(minBlockRange, storedAdaptiveRange));
    let adaptiveSuccesses = Number.isSafeInteger(cursor?.adaptiveSuccesses)
      && Number(cursor?.adaptiveSuccesses) >= 0
      ? Number(cursor?.adaptiveSuccesses)
      : 0;
    const processedFromBlock = cursorHasCoverageOrigin
      ? Number(cursor?.processedFromBlock)
      : fromBlock;
    const processedFromTimestampMs = cursorHasCoverageOrigin
      ? Number(cursor?.processedFromTimestampMs)
      : await getBlockTimestampMs({
          blockNumber: processedFromBlock,
          preferredRpc: latestBlockRpc,
          rpcClients,
          expectedChainId: config.bscExpectedChainId,
          timestampCache,
        });
    const toBlock = Math.min(fromBlock + maxBlockRange - 1, safeBlock);
    if (toBlock < safeBlock) allCursorsCoverSafeBlock = false;
    const eventById = new Map<string, ChainEvent>();
    let rangeRetries = 0;
    let successfulQueries = 0;
    let queryFromBlock = fromBlock;
    let logsRpc = latestBlockRpc;

    // Query, decode and timestamp the complete logical window before touching
    // Mongo. If the provider rejects one query by size (or explicitly times
    // out), retry that exact subrange start with half the query span. A later
    // failure therefore leaves both events and cursor unchanged.
    while (queryFromBlock <= toBlock) {
      const queryToBlock = Math.min(queryFromBlock + adaptiveRange - 1, toBlock);
      try {
        const { value: logs, rpc } = await withBscRpcFallback(
          rpcClients,
          config.bscExpectedChainId,
          (candidate) => getLogsWithFallback(
            candidate.client,
            {
              address: contractEvent.contractAddress as Address,
              event: bscEventAbis[contractEvent.eventName],
            },
            queryFromBlock,
            queryToBlock,
          ),
        );
        logsRpc = rpc;

        // Some RPCs have returned the same log more than once inside one
        // response. Deduplicate before bulkWrite and sort by canonical event
        // position so retries and provider ordering cannot alter projection.
        for (const log of logs) {
          const logArgs =
            log.args && !Array.isArray(log.args) ? (log.args as Record<string, unknown>) : {};
          const blockNumber = Number(log.blockNumber);
          const timestampMs = await getBlockTimestampMs({
            blockNumber,
            preferredRpc: logsRpc,
            rpcClients,
            expectedChainId: config.bscExpectedChainId,
            timestampCache,
          });

          const args = toJsonRecord(logArgs);
          const normalized = normalizeDomainEvent(
            'BSC',
            contractEvent.eventName,
            contractEvent.contractAlias,
            logArgs,
          );
          const logIndex = Number(log.logIndex ?? 0);
          const createdAt = now();
          const event: ChainEvent = {
            _id: `BSC:${contractEvent.contractAlias}:${contractEvent.eventName}:${log.transactionHash}:${logIndex}`,
            runtimeScope: config.runtimeScope ?? 'default',
            chain: 'BSC',
            chainId: config.bscExpectedChainId,
            contractAlias: contractEvent.contractAlias,
            contractAddress: contractEvent.contractAddress,
            eventName: contractEvent.eventName,
            txHash: log.transactionHash,
            logIndex,
            blockNumber,
            blockHash: log.blockHash,
            timestampMs,
            args,
            normalized,
            raw: toJsonRecord(log),
            status: 'ingested',
            attempts: 0,
            schemaVersion: 1,
            createdAt,
            updatedAt: createdAt,
          };
          eventById.set(event._id, event);
        }
        successfulQueries += 1;
        queryFromBlock = queryToBlock + 1;
      } catch (error) {
        const reason = classifyBscRangeAdjustment(error);
        if (reason && adaptiveRange > minBlockRange) {
          const previousRange = adaptiveRange;
          adaptiveRange = Math.max(minBlockRange, Math.floor(adaptiveRange / 2));
          adaptiveSuccesses = 0;
          rangeRetries += 1;
          logBscRangeAdjustment({
            cursorId: `${contractEvent.chain}:${contractEvent.contractAlias}:${contractEvent.eventName}`,
            fromBlock: queryFromBlock,
            toBlock: queryToBlock,
            range: previousRange,
            reason,
            adjustment: `decrease:${previousRange}->${adaptiveRange}`,
            retries: rangeRetries,
          });
          continue;
        }
        throw error;
      }
    }

    const events = [...eventById.values()].sort((left, right) =>
      left.blockNumber - right.blockNumber
      || left.logIndex - right.logIndex
      || left._id.localeCompare(right._id));
    const processedThroughTimestampMs = await getBlockTimestampMs({
      blockNumber: toBlock,
      preferredRpc: logsRpc,
      rpcClients,
      expectedChainId: config.bscExpectedChainId,
      timestampCache,
    });
    const result = await store.upsertEvents(events);
    inserted += result.inserted;
    ranges += 1;

    // Grow only after three complete logical windows. A reduction resets this
    // counter, so an isolated successful subquery cannot immediately push the
    // reader back over a provider's hard response limit.
    const acceptedAdaptiveRange = adaptiveRange;
    adaptiveSuccesses += 1;
    let persistedAdaptiveRange = adaptiveRange;
    let grownRange: number | null = null;
    if (adaptiveRange < maxBlockRange && adaptiveSuccesses >= 3) {
      const candidateRange = Math.min(
        maxBlockRange,
        adaptiveRange + Math.max(1, Math.floor(adaptiveRange / 4)),
      );
      if (candidateRange > adaptiveRange) {
        grownRange = candidateRange;
        persistedAdaptiveRange = candidateRange;
        adaptiveRange = candidateRange;
      }
      adaptiveSuccesses = 0;
    }

    await store.updateCursor(contractEvent, {
      ...verifiedCursorFields,
      nextBlock: toBlock + 1,
      safeBlock,
      processedFromBlock,
      processedFromTimestampMs,
      processedThroughBlock: toBlock,
      processedThroughTimestampMs,
      ...(adaptiveCursorEnabled
        ? {
            adaptiveRange: persistedAdaptiveRange,
            adaptiveSuccesses,
          }
        : {}),
    });
    if (adaptiveCursorEnabled) {
      logBscRangeAdjustment({
        cursorId: `${contractEvent.chain}:${contractEvent.contractAlias}:${contractEvent.eventName}`,
        fromBlock,
        toBlock,
        range: acceptedAdaptiveRange,
        reason: 'query-success',
        adjustment: `accepted:${successfulQueries}-queries`,
        retries: rangeRetries,
        nextCursor: toBlock + 1,
      });
      if (grownRange !== null) {
        logBscRangeAdjustment({
          cursorId: `${contractEvent.chain}:${contractEvent.contractAlias}:${contractEvent.eventName}`,
          fromBlock,
          toBlock,
          range: acceptedAdaptiveRange,
          reason: 'success-hysteresis',
          adjustment: `increase:${acceptedAdaptiveRange}->${grownRange}`,
          retries: rangeRetries,
          nextCursor: toBlock + 1,
        });
      }
    }
    })().catch((error) => {
      errors.push({
        cursorId: `${contractEvent.chain}:${contractEvent.contractAlias}:${contractEvent.eventName}`,
        chain: 'BSC',
        contractAlias: contractEvent.contractAlias,
        eventName: contractEvent.eventName,
        error: errorMessage(error),
      });
      failedContractAliases.add(contractEvent.contractAlias);
      allCursorsCoverSafeBlock = false;
    });
  }

  const verifiedStaking = verifiedContracts.get('UKI_STAKING');
  if (verifiedStaking && !failedContractAliases.has('UKI_STAKING')) {
    try {
      await store.reconcileVerifiedUkiStakingBootstrap({
        identity: verifiedStaking.identity,
        safeBlockNumber: safeBlock,
        safeBlockHash,
        verifiedAt: verifiedStaking.verifiedAt,
      });
    } catch (error) {
      errors.push({
        cursorId: 'BSC:UKI_STAKING:bootstrap',
        chain: 'BSC',
        contractAlias: 'UKI_STAKING',
        eventName: 'bootstrap',
        error: errorMessage(error),
      });
      failedContractAliases.add('UKI_STAKING');
      allCursorsCoverSafeBlock = false;
    }
  }

  if (allCursorsCoverSafeBlock) {
    try {
      await store.upsertBscCheckpoint({
        chainId: config.bscExpectedChainId,
        safeBlockNumber: safeBlock,
        safeBlockHash,
        safeBlockTimestampMs,
        checkedAt: now(),
      });
    } catch (error) {
      errors.push({
        cursorId: 'BSC:CANONICAL_CHECKPOINT:upsert',
        chain: 'BSC',
        contractAlias: 'CANONICAL_CHECKPOINT',
        eventName: 'upsert',
        error: errorMessage(error),
      });
      markAllConfiguredAliasesFailed();
    }
  }

  return {
    outcome: errors.length > 0 ? 'incomplete' as const : 'complete' as const,
    inserted,
    ranges,
    errors,
    failedContractAliases: [...failedContractAliases],
    safeBlock,
    safeBlockHash,
    rpcHosts: rpcClients.map((rpc) => rpc.host),
    latestBlockRpcHost: latestBlockRpc.host,
  };
}
