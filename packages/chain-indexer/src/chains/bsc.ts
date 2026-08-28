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
import { normalizeDomainEvent } from '../normalize.js';
import type {
  ChainCursor,
  ChainEvent,
  ContractEventConfig,
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

function isRpcRangeLimitError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('limit exceeded') || message.includes('request exceeds defined limit');
}

async function withBscRpcFallback<T>(
  rpcClients: BscRpcClient[],
  expectedChainId: 56 | 97,
  operation: (rpc: BscRpcClient) => Promise<T>,
) {
  const failures: string[] = [];

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
      failures.push(`${rpc.host}: ${errorMessage(error) || String(error)}`);
    }
  }

  throw new Error(`Todos los RPC BSC fallaron: ${failures.join(' | ')}`);
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
      return { receipt, bytecode };
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
  return {
    identity: input.identity,
    verifiedAt: now(),
    rpcHost: rpc.host,
  };
}

type SealedBscCursorIdentity = Pick<
  ChainCursor,
  | 'contractAddress'
  | 'bootstrapStatus'
  | 'bootstrapStartBlock'
  | 'bootstrapVerifiedAt'
  | 'verifiedChainId'
  | 'contractCodeHash'
  | 'contractDeploymentBlock'
  | 'contractDeploymentTxHash'
  | 'contractConfigHash'
>;

export function assertBscCursorBootstrapIdentity(input: {
  contractEvent: ContractEventConfig;
  cursor: SealedBscCursorIdentity | null;
  identity: VerifiedBscContractIdentity;
}) {
  if (!input.cursor || input.cursor.bootstrapStatus !== 'verified') return;

  const cursor = input.cursor;
  const identity = input.identity;
  const matches = identity.alias === input.contractEvent.contractAlias
    && identity.address.toLowerCase() === input.contractEvent.contractAddress.toLowerCase()
    && cursor.contractAddress.toLowerCase() === input.contractEvent.contractAddress.toLowerCase()
    && cursor.bootstrapStartBlock === identity.startBlock
    && cursor.bootstrapVerifiedAt instanceof Date
    && cursor.verifiedChainId === identity.chainId
    && cursor.contractCodeHash?.toLowerCase() === identity.runtimeCodeHash.toLowerCase()
    && cursor.contractDeploymentBlock === identity.deploymentBlock
    && cursor.contractDeploymentTxHash?.toLowerCase() === identity.deploymentTxHash.toLowerCase()
    && cursor.contractConfigHash?.toLowerCase() === identity.configHash.toLowerCase();

  if (!matches) {
    throw new Error(
      `Config drift en bootstrap ${input.contractEvent.contractAlias}:${input.contractEvent.eventName}; se requiere rewind/rebootstrap explicito.`,
    );
  }
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
  try {
    return await client.getLogs({
      ...params,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
  } catch (error) {
    if (!isRpcRangeLimitError(error) || fromBlock >= toBlock) throw error;

    const middleBlock = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      getLogsWithFallback(client, params, fromBlock, middleBlock),
      getLogsWithFallback(client, params, middleBlock + 1, toBlock),
    ]);

    return [...left, ...right];
  }
}

export async function ingestBscOnce(
  store: IndexerStore,
  config: IndexerConfig,
  dependencies: BscIngestDependencies = {},
) {
  if (!config.chains.includes('BSC')) return { inserted: 0, ranges: 0 };

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
    tokenV2Address: config.tokenV2Address,
    marketplaceAddress: config.marketplaceAddress,
    bridgeAddress: config.bridgeAddress,
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
  const unresolvedCutoffs = typeof store.listUnresolvedCompetitionCreditCutoffs === 'function'
    ? await store.listUnresolvedCompetitionCreditCutoffs(new Date(safeBlockTimestampMs), 32)
    : [];
  for (const cutoff of unresolvedCutoffs) {
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
  }
  const verifiedContracts = new Map<string, Awaited<
    ReturnType<typeof verifyBscContractIdentity>
  >>();
  for (const identity of Object.values(config.verifiedBscContracts)) {
    if (!identity) continue;
    const verified = await verifyBscContractIdentity({
      identity,
      rpcClients: rpcClientsWithPreferredFirst(safeHeadRpc, rpcClients),
      expectedChainId: config.bscExpectedChainId,
    });
    verifiedContracts.set(identity.alias, verified);
  }
  let inserted = 0;
  let ranges = 0;
  let allCursorsCoverSafeBlock = true;

  for (const contractEvent of contractEvents) {
    const cursor = await store.getCursor(contractEvent);
    const cursorHasCoverageOrigin =
      Number.isSafeInteger(cursor?.processedFromBlock) &&
      Number(cursor?.processedFromBlock) >= 0 &&
      Number.isSafeInteger(cursor?.processedFromTimestampMs) &&
      Number(cursor?.processedFromTimestampMs) >= 0;
    const configuredStartBlock = contractEvent.contractAlias === 'UKI_STAKING'
      ? config.ukiStakingStartBlock
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
                : contractEvent.contractAlias === 'BRIDGE'
                  ? config.bridgeStartBlock
                  : contractEvent.contractAlias === 'CUKIE_MASTER_NFT_VAULT'
                    ? config.cukieMasterNftVaultStartBlock
                    : contractEvent.contractAlias === 'CUKIE_POOL_NFT_VAULT'
                      ? config.cukiePoolNftVaultStartBlock
                      : config.bscStartBlock;
    const verified = verifiedContracts.get(contractEvent.contractAlias);
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
    if (verified) {
      assertBscCursorBootstrapIdentity({
        contractEvent,
        cursor,
        identity: verified.identity,
      });
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
        }
      : {};
    const fromBlock = cursor?.nextBlock
      ?? (configuredStartBlock !== undefined && configuredStartBlock > 0
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
      continue;
    }

    const toBlock = Math.min(fromBlock + config.maxBlockRange - 1, safeBlock);
    if (toBlock < safeBlock) allCursorsCoverSafeBlock = false;
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
    const { value: logs, rpc: logsRpc } = await withBscRpcFallback(
      rpcClients,
      config.bscExpectedChainId,
      (rpc) => getLogsWithFallback(
        rpc.client,
        {
          address: contractEvent.contractAddress as Address,
          event: bscEventAbis[contractEvent.eventName],
        },
        fromBlock,
        toBlock,
      ),
    );

    const events: ChainEvent[] = [];

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

      events.push({
        _id: `BSC:${contractEvent.contractAlias}:${contractEvent.eventName}:${log.transactionHash}:${logIndex}`,
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
      });
    }

    const result = await store.upsertEvents(events);
    inserted += result.inserted;
    ranges += 1;

    const processedThroughTimestampMs = await getBlockTimestampMs({
      blockNumber: toBlock,
      preferredRpc: logsRpc,
      rpcClients,
      expectedChainId: config.bscExpectedChainId,
      timestampCache,
    });
    await store.updateCursor(contractEvent, {
      ...verifiedCursorFields,
      nextBlock: toBlock + 1,
      safeBlock,
      processedFromBlock,
      processedFromTimestampMs,
      processedThroughBlock: toBlock,
      processedThroughTimestampMs,
    });
  }

  const verifiedStaking = verifiedContracts.get('UKI_STAKING');
  if (verifiedStaking) {
    await store.reconcileVerifiedUkiStakingBootstrap({
      identity: verifiedStaking.identity,
      safeBlockNumber: safeBlock,
      safeBlockHash,
      verifiedAt: verifiedStaking.verifiedAt,
    });
  }

  if (allCursorsCoverSafeBlock) {
    await store.upsertBscCheckpoint({
      chainId: config.bscExpectedChainId,
      safeBlockNumber: safeBlock,
      safeBlockHash,
      safeBlockTimestampMs,
      checkedAt: now(),
    });
  }

  return {
    inserted,
    ranges,
    safeBlock,
    safeBlockHash,
    rpcHosts: rpcClients.map((rpc) => rpc.host),
    latestBlockRpcHost: latestBlockRpc.host,
  };
}
